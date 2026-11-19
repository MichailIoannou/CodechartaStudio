use std::path::{Path, PathBuf};

use codecharta_core_api::ids::ProjectId;
use codecharta_core_api::methods::projects::{FolderKind, FolderRef, ResolvedCommit};
use codecharta_core_api::methods::snapshots::{
    CommitHint, ContainingFolder, ExistingTarget, PickedImportFile, SnapshotSource, SnapshotSummary,
};
use codecharta_core_api::values::{CommitHash, FullCommit};

use crate::error::{CoreError, CoreResult};
use crate::folders::inspector::{commit_details, resolve_commit};
use crate::ids::imported_snapshot_id;
use crate::projects::active::pick_folder;
use crate::projects::folders::{location_key, suggested_project_name};
use crate::projects::record::ProjectRecord;
use crate::projects::tokens::PickTokens;
use crate::snapshots::content::ImportFile;
use crate::snapshots::record::{
    GitRecord, ImportedRecord, MapRecord, SNAPSHOT_SCHEMA_VERSION, SnapshotRecord,
};
use crate::snapshots::repository::SnapshotRepository;
use crate::store::paths::MAP_FILE_NAME;
use crate::{path_to_wire, timestamps};

/// A file to import into a folder by path: the CLI passes an argv path, the RPC layer the path behind an
/// import token.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ImportRequest {
    pub target: FolderRef,
    pub file: PathBuf,
    pub bind_to_commit: Option<FullCommit>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ImportOutcome {
    pub snapshot: SnapshotSummary,
    pub was_already_imported: bool,
}

impl SnapshotRepository<'_> {
    /// Looks at a file the shell picked natively and hands out the token that stands for its path.
    pub async fn inspect_import_file(
        &self,
        tokens: &PickTokens,
        path: &Path,
    ) -> CoreResult<PickedImportFile> {
        if !path.is_absolute() {
            return Err(CoreError::BadRequest(format!(
                "{} is not an absolute path.",
                path.display()
            )));
        }
        let file = ImportFile::open(path)?;
        let content_sha256 = file.content_sha256()?;
        let folder_path = containing_folder_of(&file.path)?;
        let existing_target = self.existing_target(&folder_path)?;
        let duplicate_of = match &existing_target {
            Some(target) => self
                .imported_duplicate(&target.project_id, &content_sha256)?
                .map(|record| record.snapshot_ref()),
            None => None,
        };
        let containing_folder = self.containing_folder(tokens, &folder_path).await?;
        let commit_hint = file.commit_hint();
        let hint_commit = self
            .hint_commit(&containing_folder, &folder_path, commit_hint.as_ref())
            .await;
        Ok(PickedImportFile {
            import_token: tokens.issue_file(file.path.clone())?,
            file_name: file.file_name,
            size_bytes: file.size_bytes,
            file_modified_at: file.modified_at,
            commit_hint,
            containing_folder,
            hint_commit,
            existing_target,
            duplicate_of,
        })
    }

    /// Copies the file into the folder as an imported snapshot. Content already imported anywhere in the
    /// project is answered with that snapshot, and nothing is written.
    pub async fn import_file(&self, request: ImportRequest) -> CoreResult<ImportOutcome> {
        self.store.ensure_writable()?;
        let file = ImportFile::open(&request.file)?;
        let content_sha256 = file.content_sha256()?;
        self.ensure_folder_exists(&request.target)?;
        if let Some(existing) =
            self.imported_duplicate(&request.target.project_id, &content_sha256)?
        {
            return Ok(ImportOutcome {
                snapshot: existing.to_summary(),
                was_already_imported: true,
            });
        }
        let git = match &request.bind_to_commit {
            Some(commit) => Some(self.bound_git(&request.target, commit).await?),
            None => None,
        };
        let imported = imported_record(&file, content_sha256);
        let snapshot = self
            .store_import(&request.target, &file, imported, git)
            .await?;
        Ok(ImportOutcome {
            snapshot,
            was_already_imported: false,
        })
    }

    async fn store_import(
        &self,
        target: &FolderRef,
        file: &ImportFile,
        imported: ImportedRecord,
        git: Option<GitRecord>,
    ) -> CoreResult<SnapshotSummary> {
        let staged = self.begin_snapshot(target)?;
        let map_bytes = file
            .copy_as_gzip(&staged.map_file())
            .and_then(|()| map_size(&staged.map_file()));
        let map_bytes = match map_bytes {
            Ok(bytes) => bytes,
            Err(error) => {
                self.abort_snapshot(staged)?;
                return Err(error);
            }
        };
        let record = SnapshotRecord {
            schema_version: SNAPSHOT_SCHEMA_VERSION,
            id: imported_snapshot_id(
                &imported.content_sha256,
                git.as_ref().map(|git| &git.commit),
            )?,
            project_id: target.project_id.clone(),
            folder_id: target.folder_id.clone(),
            source: SnapshotSource::Imported,
            created_at: imported.at.clone(),
            git,
            hosting: None,
            analysis: None,
            imported: Some(imported),
            map: MapRecord {
                file: MAP_FILE_NAME.to_string(),
                bytes: map_bytes,
                checksum: None,
                root_name: None,
            },
        };
        self.commit_snapshot(staged, record).await
    }

    /// The commit as git knows it in the folder: `FOLDER_UNAVAILABLE` outside a git folder that is
    /// there, `NOT_A_COMMIT` when the folder has no such commit.
    pub(crate) async fn bound_git(
        &self,
        target: &FolderRef,
        commit: &FullCommit,
    ) -> CoreResult<GitRecord> {
        let projects = self.projects();
        let folder = projects.reachable_git_folder(target)?;
        let hash = CommitHash::try_from(commit.as_str())
            .map_err(|error| CoreError::Internal(error.to_string()))?;
        let details = commit_details(self.git, &folder.path, &hash)
            .await?
            .filter(|details| &details.resolved.commit == commit)
            .ok_or_else(|| CoreError::NotACommit {
                commit: commit.to_string(),
            })?;
        let remotes = projects
            .read_record(&target.project_id)?
            .folder(&target.folder_id)
            .and_then(|stored| stored.git.as_ref())
            .map(|git| git.remotes.clone())
            .unwrap_or_default();
        Ok(GitRecord {
            commit: details.resolved.commit,
            short_commit: details.resolved.short_commit,
            subject: details.resolved.subject,
            author_name: details.resolved.author_name,
            author_date: details.resolved.author_date,
            commit_date: details.commit_date,
            parents: details.parents,
            branches_at_run: Vec::new(),
            tags_at_run: Vec::new(),
            head_at_run: None,
            dirty: false,
            remotes,
            tree: None,
        })
    }

    /// An imported snapshot of any folder of the project with this content, wherever it was moved.
    pub(crate) fn imported_duplicate(
        &self,
        project: &ProjectId,
        content_sha256: &str,
    ) -> CoreResult<Option<SnapshotRecord>> {
        let record = self.projects().read_record(project)?;
        for folder in &record.folders {
            let folder_ref = FolderRef {
                project_id: project.clone(),
                folder_id: folder.id.clone(),
            };
            let duplicate = self
                .records(&folder_ref)?
                .into_iter()
                .find(|snapshot| snapshot.content_sha256() == Some(content_sha256));
            if duplicate.is_some() {
                return Ok(duplicate);
            }
        }
        Ok(None)
    }

    /// The most recently updated project that has a folder at this path.
    pub(crate) fn existing_target(&self, folder_path: &Path) -> CoreResult<Option<ExistingTarget>> {
        let key = location_key(&path_to_wire(folder_path)?);
        let projects = self.projects();
        let candidates = projects
            .project_ids()?
            .iter()
            .filter_map(|id| projects.read_record(id).ok())
            .filter_map(|record| target_in(&record, &key).map(|target| (record.updated_at, target)))
            .max_by(|(first, _), (second, _)| first.cmp(second));
        Ok(candidates.map(|(_, target)| target))
    }

    async fn containing_folder(
        &self,
        tokens: &PickTokens,
        folder_path: &Path,
    ) -> CoreResult<ContainingFolder> {
        let picked = pick_folder(self.git, tokens, folder_path).await?;
        Ok(ContainingFolder {
            pick_token: picked.pick_token,
            path: picked.path,
            suggested_name: suggested_project_name(folder_path),
            kind: picked.kind,
            git: picked.git,
        })
    }

    async fn hint_commit(
        &self,
        folder: &ContainingFolder,
        folder_path: &Path,
        hint: Option<&CommitHint>,
    ) -> Option<ResolvedCommit> {
        let hint = hint.filter(|_| folder.kind == FolderKind::Git)?;
        resolve_commit(self.git, folder_path, &hint.hash)
            .await
            .inspect_err(|error| tracing::debug!("the commit hint was not resolved: {error}"))
            .ok()
            .flatten()
    }
}

fn target_in(record: &ProjectRecord, location: &str) -> Option<ExistingTarget> {
    record
        .folders
        .iter()
        .find(|folder| location_key(&folder.path) == location)
        .map(|folder| ExistingTarget {
            project_id: record.id.clone(),
            project_name: record.name.to_string(),
            folder_id: folder.id.clone(),
        })
}

fn imported_record(file: &ImportFile, content_sha256: String) -> ImportedRecord {
    ImportedRecord {
        at: timestamps::now(),
        original_file_name: file.file_name.clone(),
        file_modified_at: file.modified_at.clone(),
        content_sha256,
    }
}

pub(crate) fn containing_folder_of(file: &Path) -> CoreResult<PathBuf> {
    file.parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| CoreError::BadRequest(format!("{} has no folder.", file.display())))
}

fn map_size(map_file: &Path) -> CoreResult<u64> {
    std::fs::metadata(map_file)
        .map(|metadata| metadata.len())
        .map_err(|source| CoreError::Io {
            context: format!("Could not read {}", map_file.display()),
            source,
        })
}
