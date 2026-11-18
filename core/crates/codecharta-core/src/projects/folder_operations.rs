use std::path::{Path, PathBuf};

use codecharta_core_api::ids::{FolderId, ProjectId};
use codecharta_core_api::methods::projects::{
    FolderGitFacts, FolderKind, FolderRef, FolderRole, FolderStatus, Project, ProjectView,
    ResolvedCommit,
};
use codecharta_core_api::values::{CommitHash, Label};

use crate::error::{CoreError, CoreResult};
use crate::folders::inspector::{inspect_folder, resolve_commit};
use crate::path_to_wire;
use crate::projects::derived::status_of;
use crate::projects::folders::{
    FolderToAdd, attach_folder, demote_primary, ensure_new_label, ensure_new_location,
};
use crate::projects::record::{FolderRecord, ProjectRecord};
use crate::projects::repository::{ProjectRepository, existing_directory, refresh_folder_facts};
use crate::recycle::delete_permanently;

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct FolderChanges {
    pub label: Option<Label>,
    pub role: Option<FolderRole>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Relink {
    pub path: PathBuf,
    pub accept_different_history: bool,
}

/// Where a project folder is and whether it can be used now; for the plans that run git or ccsh in it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedFolder {
    pub path: PathBuf,
    pub kind: FolderKind,
    pub status: FolderStatus,
}

impl ProjectRepository<'_> {
    pub async fn add_folder(
        &self,
        project: &ProjectId,
        folder: FolderToAdd,
    ) -> CoreResult<Project> {
        let folder = self.new_folder_record(folder).await?;
        self.modify(project, |record| attach_folder(record, folder))
            .await
    }

    pub async fn update_folder(
        &self,
        target: &FolderRef,
        changes: FolderChanges,
    ) -> CoreResult<Project> {
        self.modify(&target.project_id, |record| {
            apply_folder_changes(record, &target.folder_id, changes)
        })
        .await
    }

    /// The folder's snapshots go to the recycle bin (or are deleted) before the project forgets it.
    pub async fn remove_folder(
        &self,
        target: &FolderRef,
        permanently: bool,
    ) -> CoreResult<Project> {
        self.modify(&target.project_id, |record| {
            existing_folder(record, &target.folder_id)?;
            self.discard_snapshots(target, permanently)?;
            detach_folder(record, &target.folder_id);
            Ok(())
        })
        .await
    }

    /// Points the folder id at another place; its snapshots stay attached to the id.
    pub async fn relink_folder(&self, target: &FolderRef, relink: Relink) -> CoreResult<Project> {
        let new_path = existing_directory(&relink.path)?;
        let inspection = inspect_folder(self.git, &new_path).await;
        let path = path_to_wire(&new_path)?;
        self.modify(&target.project_id, |record| {
            ensure_new_location(record, &path, Some(&target.folder_id))?;
            let folder = existing_folder_mut(record, &target.folder_id)?;
            let is_other_history =
                has_different_history(folder.git.as_ref(), inspection.git.as_ref());
            if is_other_history && !relink.accept_different_history {
                return Err(CoreError::DifferentHistory { path });
            }
            folder.path = path;
            folder.kind = inspection.kind;
            folder.git = inspection.git;
            Ok(())
        })
        .await
    }

    pub async fn refresh_folder(&self, target: &FolderRef) -> CoreResult<Project> {
        let record = self.read_record(&target.project_id)?;
        let mut folder = existing_folder(&record, &target.folder_id)?.clone();
        ensure_present(&folder)?;
        refresh_folder_facts(self.git, &mut folder).await;
        self.modify(&target.project_id, |record| {
            let stored = existing_folder_mut(record, &target.folder_id)?;
            stored.kind = folder.kind;
            stored.git = folder.git;
            Ok(())
        })
        .await
    }

    pub fn resolve_folder(&self, target: &FolderRef) -> CoreResult<ResolvedFolder> {
        let record = self.read_record(&target.project_id)?;
        let folder = existing_folder(&record, &target.folder_id)?;
        Ok(ResolvedFolder {
            path: PathBuf::from(&folder.path),
            kind: folder.kind,
            status: status_of(folder),
        })
    }

    /// Every folder and snapshot the view names must exist in the project.
    pub async fn set_view(&self, project: &ProjectId, view: ProjectView) -> CoreResult<()> {
        self.modify(project, |record| {
            self.ensure_view_targets_exist(record, &view)?;
            record.view = view;
            Ok(())
        })
        .await
        .map(|_| ())
    }

    /// `FOLDER_UNAVAILABLE` unless the folder is a git folder that is there.
    pub async fn resolve_commit(
        &self,
        target: &FolderRef,
        hash: &CommitHash,
    ) -> CoreResult<Option<ResolvedCommit>> {
        let folder = self.resolve_folder(target)?;
        if folder.status != FolderStatus::Ok || folder.kind != FolderKind::Git {
            return Err(CoreError::FolderUnavailable(format!(
                "The folder {} is not a git folder that can be reached.",
                folder.path.display()
            )));
        }
        resolve_commit(self.git, &folder.path, hash).await
    }

    fn discard_snapshots(&self, target: &FolderRef, permanently: bool) -> CoreResult<()> {
        let directory = self
            .store
            .paths()
            .folder_snapshots_dir(&target.project_id, &target.folder_id)?;
        if !directory.exists() {
            return Ok(());
        }
        if permanently {
            delete_permanently(&directory)
        } else {
            self.recycler.recycle(&directory)
        }
    }

    fn ensure_view_targets_exist(
        &self,
        record: &ProjectRecord,
        view: &ProjectView,
    ) -> CoreResult<()> {
        if let Some(working) = &view.working_folder_id {
            existing_folder(record, working)?;
        }
        for (folder, snapshot) in &view.shown_snapshot_id_by_folder {
            existing_folder(record, folder)?;
            let snapshot_dir = self
                .store
                .paths()
                .snapshot_dir(&record.id, folder, snapshot)?;
            if !snapshot_dir.is_dir() {
                return Err(CoreError::NotFound(format!(
                    "There is no snapshot {snapshot} of the folder {folder}."
                )));
            }
        }
        Ok(())
    }
}

fn apply_folder_changes(
    record: &mut ProjectRecord,
    folder_id: &FolderId,
    changes: FolderChanges,
) -> CoreResult<()> {
    if let Some(label) = &changes.label {
        ensure_new_label(record, label, Some(folder_id))?;
    }
    let current_role = existing_folder(record, folder_id)?.role;
    match changes.role {
        Some(FolderRole::Primary) if current_role != FolderRole::Primary => demote_primary(record),
        Some(role) if role != FolderRole::Primary && current_role == FolderRole::Primary => {
            return Err(CoreError::BadRequest(
                "A project keeps one primary folder; make another folder primary instead."
                    .to_string(),
            ));
        }
        _ => {}
    }
    let folder = existing_folder_mut(record, folder_id)?;
    if let Some(label) = changes.label {
        folder.label = label;
    }
    if let Some(role) = changes.role {
        folder.role = role;
    }
    Ok(())
}

/// The first remaining folder becomes primary when the primary one leaves.
fn detach_folder(record: &mut ProjectRecord, folder_id: &FolderId) {
    record.folders.retain(|folder| &folder.id != folder_id);
    record.view.shown_snapshot_id_by_folder.remove(folder_id);
    if record.primary_folder().is_none()
        && let Some(first) = record.folders.first_mut()
    {
        first.role = FolderRole::Primary;
    }
    if record.view.working_folder_id.as_ref() == Some(folder_id) {
        record.view.working_folder_id = record.primary_folder().map(|folder| folder.id.clone());
    }
}

/// Only known roots count: a shallow clone or a repository without commits has none.
fn has_different_history(old: Option<&FolderGitFacts>, new: Option<&FolderGitFacts>) -> bool {
    match (old, new) {
        (Some(old), Some(new)) if !old.root_commits.is_empty() && !new.root_commits.is_empty() => {
            !old.root_commits
                .iter()
                .any(|root| new.root_commits.contains(root))
        }
        _ => false,
    }
}

fn ensure_present(folder: &FolderRecord) -> CoreResult<()> {
    if status_of(folder) == FolderStatus::Missing {
        return Err(CoreError::FolderUnavailable(format!(
            "The folder {} is missing.",
            Path::new(&folder.path).display()
        )));
    }
    Ok(())
}

pub(crate) fn existing_folder<'record>(
    record: &'record ProjectRecord,
    folder_id: &FolderId,
) -> CoreResult<&'record FolderRecord> {
    record
        .folder(folder_id)
        .ok_or_else(|| no_such_folder(folder_id))
}

fn existing_folder_mut<'record>(
    record: &'record mut ProjectRecord,
    folder_id: &FolderId,
) -> CoreResult<&'record mut FolderRecord> {
    record
        .folder_mut(folder_id)
        .ok_or_else(|| no_such_folder(folder_id))
}

fn no_such_folder(folder_id: &FolderId) -> CoreError {
    CoreError::NotFound(format!("The project has no folder {folder_id}."))
}
