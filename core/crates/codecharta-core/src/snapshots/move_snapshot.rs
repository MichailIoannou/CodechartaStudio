use std::fs;

use codecharta_core_api::ids::FolderId;
use codecharta_core_api::methods::projects::FolderRef;
use codecharta_core_api::methods::snapshots::{SnapshotRef, SnapshotSource, SnapshotSummary};
use codecharta_core_api::values::FullCommit;

use crate::error::{CoreError, CoreResult};
use crate::ids::imported_snapshot_id;
use crate::projects::folder_operations::existing_folder;
use crate::projects::record::ProjectRecord;
use crate::snapshots::record::{GitRecord, SnapshotRecord};
use crate::snapshots::repository::{SnapshotRepository, io_error, snapshot_exists};

/// Where an imported snapshot goes: another folder of the project, or its own folder to bind it later.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SnapshotMove {
    pub to_folder: FolderId,
    pub bind_to_commit: Option<FullCommit>,
}

impl SnapshotRepository<'_> {
    /// Moves an imported snapshot, binding it to a commit of the target folder or to none. The record is
    /// rewritten before its directory is renamed; opening the store repairs a crash in between.
    pub async fn move_snapshot(
        &self,
        source: &SnapshotRef,
        movement: SnapshotMove,
    ) -> CoreResult<SnapshotSummary> {
        self.store.ensure_writable()?;
        let target = FolderRef {
            project_id: source.project_id.clone(),
            folder_id: movement.to_folder,
        };
        ensure_imported(&self.record(source)?)?;
        let git = match &movement.bind_to_commit {
            Some(commit) => Some(self.bound_git(&target, commit).await?),
            None => None,
        };
        let mut moved = None;
        self.projects()
            .modify(&source.project_id, |project| {
                existing_folder(project, &target.folder_id)?;
                let record = self.relocate(source, &target, git)?;
                remember_moved(project, source, &record);
                moved = Some(record.to_summary());
                Ok(())
            })
            .await?;
        moved.ok_or_else(|| CoreError::Internal("the snapshot was not moved".to_string()))
    }

    fn relocate(
        &self,
        source: &SnapshotRef,
        target: &FolderRef,
        git: Option<GitRecord>,
    ) -> CoreResult<SnapshotRecord> {
        let mut record = self.record(source)?;
        ensure_imported(&record)?;
        let content_sha256 = record
            .content_sha256()
            .ok_or_else(|| CoreError::Internal("an imported snapshot has no hash".to_string()))?;
        let id = imported_snapshot_id(content_sha256, git.as_ref().map(|git| &git.commit))?;
        record.id = id;
        record.folder_id = target.folder_id.clone();
        record.git = git;
        let paths = self.store.paths();
        let from =
            paths.snapshot_dir(&source.project_id, &source.folder_id, &source.snapshot_id)?;
        let to = paths.snapshot_dir(&record.project_id, &record.folder_id, &record.id)?;
        if from != to && to.exists() {
            return Err(snapshot_exists(&record.id));
        }
        self.write_record_in(&from, &record)?;
        if from != to {
            let folder_dir = paths.folder_snapshots_dir(&record.project_id, &record.folder_id)?;
            fs::create_dir_all(&folder_dir)
                .map_err(|error| io_error("create", &folder_dir, error))?;
            fs::rename(&from, &to).map_err(|error| io_error("move", &from, error))?;
        }
        Ok(record)
    }
}

fn ensure_imported(record: &SnapshotRecord) -> CoreResult<()> {
    if record.source == SnapshotSource::Imported {
        return Ok(());
    }
    Err(CoreError::BadRequest(
        "Only imported snapshots can be moved or bound to a commit.".to_string(),
    ))
}

/// A folder that showed the snapshot gives that place to the folder it moved to.
fn remember_moved(project: &mut ProjectRecord, source: &SnapshotRef, moved: &SnapshotRecord) {
    let shown = &mut project.view.shown_snapshot_id_by_folder;
    if shown.get(&source.folder_id) == Some(&source.snapshot_id) {
        shown.remove(&source.folder_id);
        shown.insert(moved.folder_id.clone(), moved.id.clone());
    }
}
