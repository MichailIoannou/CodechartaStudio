use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use codecharta_core_api::ids::{FolderId, SnapshotId};
use codecharta_core_api::methods::projects::FolderRef;
use codecharta_core_api::methods::snapshots::{SnapshotRef, SnapshotSummary};
use codecharta_core_api::values::{FullCommit, MapChecksum, RootName};
use serde_json::Value;

use crate::error::{CoreError, CoreResult};
use crate::git::GitRunner;
use crate::ids::new_staging_suffix;
use crate::projects::ProjectRepository;
use crate::projects::folder_operations::existing_folder;
use crate::projects::record::ProjectRecord;
use crate::recycle::{Recycler, delete_permanently};
use crate::snapshots::record::{SNAPSHOT_SCHEMA_VERSION, SnapshotRecord};
use crate::store::Store;
use crate::store::atomic::{read_json_if_exists, write_json_atomic};
use crate::store::paths::{MAP_FILE_NAME, RUN_LOG_FILE_NAME, SNAPSHOT_FILE_NAME};

const SCHEMA_VERSION_FIELD: &str = "schemaVersion";

/// A snapshot being built in a staging directory; nobody sees it before `commit_snapshot` renames it.
#[derive(Debug)]
pub struct StagedSnapshot {
    folder: FolderRef,
    directory: PathBuf,
}

impl StagedSnapshot {
    pub fn folder(&self) -> &FolderRef {
        &self.folder
    }

    pub fn directory(&self) -> &Path {
        &self.directory
    }

    pub fn map_file(&self) -> PathBuf {
        self.directory.join(MAP_FILE_NAME)
    }

    pub fn log_file(&self) -> PathBuf {
        self.directory.join(RUN_LOG_FILE_NAME)
    }
}

/// The snapshot facts the renderer reports after it parsed a map once.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MapFacts {
    pub checksum: MapChecksum,
    pub root_name: RootName,
}

/// Snapshots of the folders of a project. Writes hold the project's lock.
pub struct SnapshotRepository<'deps> {
    pub(crate) store: &'deps Store,
    pub(crate) git: &'deps dyn GitRunner,
    pub(crate) recycler: &'deps dyn Recycler,
}

impl<'deps> SnapshotRepository<'deps> {
    pub fn new(
        store: &'deps Store,
        git: &'deps dyn GitRunner,
        recycler: &'deps dyn Recycler,
    ) -> Self {
        Self {
            store,
            git,
            recycler,
        }
    }

    pub(crate) fn projects(&self) -> ProjectRepository<'deps> {
        ProjectRepository::new(self.store, self.git, self.recycler)
    }

    /// Newest first by the time the snapshot entered the store.
    pub fn list(&self, folder: &FolderRef) -> CoreResult<Vec<SnapshotSummary>> {
        Ok(self
            .records(folder)?
            .iter()
            .map(SnapshotRecord::to_summary)
            .collect())
    }

    pub fn find_by_commit(
        &self,
        folder: &FolderRef,
        commit: &FullCommit,
    ) -> CoreResult<Vec<SnapshotSummary>> {
        Ok(self
            .records(folder)?
            .iter()
            .filter(|record| record.git.as_ref().is_some_and(|git| &git.commit == commit))
            .map(SnapshotRecord::to_summary)
            .collect())
    }

    pub(crate) fn records(&self, folder: &FolderRef) -> CoreResult<Vec<SnapshotRecord>> {
        self.ensure_folder_exists(folder)?;
        let folder_dir = self
            .store
            .paths()
            .folder_snapshots_dir(&folder.project_id, &folder.folder_id)?;
        let mut records: Vec<SnapshotRecord> = snapshot_ids_in(&folder_dir)?
            .into_iter()
            .filter_map(|id| self.readable_record(folder, &id))
            .collect();
        records.sort_by(|first, second| {
            (&second.created_at, &second.id).cmp(&(&first.created_at, &first.id))
        });
        Ok(records)
    }

    /// The gzip map of a snapshot; only the shell reads it, after checking it lies in the store root.
    pub fn map_location(&self, snapshot: &SnapshotRef) -> CoreResult<PathBuf> {
        self.record(snapshot)?;
        let map_file = self.store.paths().map_file(
            &snapshot.project_id,
            &snapshot.folder_id,
            &snapshot.snapshot_id,
        )?;
        if !map_file.is_file() {
            return Err(no_such_snapshot(snapshot));
        }
        Ok(map_file)
    }

    /// Sends the snapshot's directory to the recycle bin, or deletes it when `permanently`; a folder that
    /// showed it forgets it.
    pub async fn delete(&self, snapshot: &SnapshotRef, permanently: bool) -> CoreResult<()> {
        let directory = self.store.paths().snapshot_dir(
            &snapshot.project_id,
            &snapshot.folder_id,
            &snapshot.snapshot_id,
        )?;
        self.projects()
            .modify(&snapshot.project_id, |record| {
                existing_folder(record, &snapshot.folder_id)?;
                if !directory.is_dir() {
                    return Err(no_such_snapshot(snapshot));
                }
                if permanently {
                    delete_permanently(&directory)?;
                } else {
                    self.recycler.recycle(&directory)?;
                }
                forget_shown(record, &snapshot.folder_id, &snapshot.snapshot_id);
                Ok(())
            })
            .await
            .map(|_| ())
    }

    pub async fn record_map_facts(
        &self,
        snapshot: &SnapshotRef,
        facts: MapFacts,
    ) -> CoreResult<()> {
        self.store.ensure_writable()?;
        let _guard = self.store.project_locks().lock(&snapshot.project_id).await;
        let mut record = self.record(snapshot)?;
        record.map.checksum = Some(facts.checksum.to_string());
        record.map.root_name = Some(facts.root_name.to_string());
        self.write_record(&record)
    }

    /// Creates an empty staging directory in the folder's snapshot directory.
    pub fn begin_snapshot(&self, folder: &FolderRef) -> CoreResult<StagedSnapshot> {
        self.store.ensure_writable()?;
        self.ensure_folder_exists(folder)?;
        let directory = self.store.paths().staging_dir(
            &folder.project_id,
            &folder.folder_id,
            &new_staging_suffix()?,
        )?;
        fs::create_dir_all(&directory).map_err(|source| io_error("create", &directory, source))?;
        Ok(StagedSnapshot {
            folder: folder.clone(),
            directory,
        })
    }

    /// Writes `snapshot.json` and renames the staging directory to the record's id. The staging
    /// directory is removed when anything fails, so a failed commit needs no abort.
    pub async fn commit_snapshot(
        &self,
        staged: StagedSnapshot,
        record: SnapshotRecord,
    ) -> CoreResult<SnapshotSummary> {
        self.commit_staged(staged, record, Placement::New).await
    }

    /// Like `commit_snapshot`, but a snapshot with the same id is moved aside first and deleted once the
    /// new one is in place; a crash in between is repaired when the store opens.
    pub async fn commit_snapshot_replacing(
        &self,
        staged: StagedSnapshot,
        record: SnapshotRecord,
    ) -> CoreResult<SnapshotSummary> {
        self.commit_staged(staged, record, Placement::Replace).await
    }

    pub fn read(&self, snapshot: &SnapshotRef) -> CoreResult<SnapshotRecord> {
        self.record(snapshot)
    }

    /// The captured ccsh output of an analysed snapshot; `NOT_FOUND` for one without (an import).
    pub fn read_log(&self, snapshot: &SnapshotRef) -> CoreResult<String> {
        self.record(snapshot)?;
        let snapshot_dir = self.store.paths().snapshot_dir(
            &snapshot.project_id,
            &snapshot.folder_id,
            &snapshot.snapshot_id,
        )?;
        let log_file = snapshot_dir.join(RUN_LOG_FILE_NAME);
        fs::read_to_string(&log_file).map_err(|source| match source.kind() {
            io::ErrorKind::NotFound => CoreError::NotFound(format!(
                "The snapshot {} has no analysis log.",
                snapshot.snapshot_id
            )),
            _ => io_error("read", &log_file, source),
        })
    }

    async fn commit_staged(
        &self,
        staged: StagedSnapshot,
        record: SnapshotRecord,
        placement: Placement,
    ) -> CoreResult<SnapshotSummary> {
        let _guard = self
            .store
            .project_locks()
            .lock(&staged.folder.project_id)
            .await;
        let committed = self.move_into_place(&staged, &record, placement);
        if committed.is_err() {
            discard_staging(&staged.directory);
        }
        committed.map(|()| record.to_summary())
    }

    pub fn abort_snapshot(&self, staged: StagedSnapshot) -> CoreResult<()> {
        fs::remove_dir_all(&staged.directory)
            .map_err(|source| io_error("remove", &staged.directory, source))
    }

    fn move_into_place(
        &self,
        staged: &StagedSnapshot,
        record: &SnapshotRecord,
        placement: Placement,
    ) -> CoreResult<()> {
        ensure_record_matches(staged, record)?;
        self.ensure_folder_exists(&staged.folder)?;
        if !staged.map_file().is_file() {
            return Err(CoreError::Internal(
                "the staged snapshot has no map".to_string(),
            ));
        }
        let target =
            self.store
                .paths()
                .snapshot_dir(&record.project_id, &record.folder_id, &record.id)?;
        let is_replacing = target.exists();
        if is_replacing && placement == Placement::New {
            return Err(snapshot_exists(&record.id));
        }
        write_json_atomic(&staged.directory.join(SNAPSHOT_FILE_NAME), record)?;
        if is_replacing {
            return self.swap_in(&staged.directory, &target, &staged.folder);
        }
        fs::rename(&staged.directory, &target).map_err(|source| io_error("store", &target, source))
    }

    fn swap_in(&self, staged: &Path, target: &Path, folder: &FolderRef) -> CoreResult<()> {
        let replaced = self.store.paths().replaced_dir(
            &folder.project_id,
            &folder.folder_id,
            &new_staging_suffix()?,
        )?;
        fs::rename(target, &replaced).map_err(|source| io_error("move aside", target, source))?;
        if let Err(source) = fs::rename(staged, target) {
            if let Err(error) = fs::rename(&replaced, target) {
                tracing::warn!("could not restore {}: {error}", target.display());
            }
            return Err(io_error("store", target, source));
        }
        if let Err(error) = delete_permanently(&replaced) {
            tracing::warn!("the replaced snapshot stays until the next start: {error}");
        }
        Ok(())
    }

    pub(crate) fn record(&self, snapshot: &SnapshotRef) -> CoreResult<SnapshotRecord> {
        let folder = FolderRef {
            project_id: snapshot.project_id.clone(),
            folder_id: snapshot.folder_id.clone(),
        };
        self.ensure_folder_exists(&folder)?;
        self.readable_record(&folder, &snapshot.snapshot_id)
            .ok_or_else(|| no_such_snapshot(snapshot))
    }

    pub(crate) fn write_record(&self, record: &SnapshotRecord) -> CoreResult<()> {
        let file =
            self.store
                .paths()
                .snapshot_file(&record.project_id, &record.folder_id, &record.id)?;
        write_json_atomic(&file, record)
    }

    /// For a record about to move: written where its directory still is.
    pub(crate) fn write_record_in(
        &self,
        snapshot_dir: &Path,
        record: &SnapshotRecord,
    ) -> CoreResult<()> {
        write_json_atomic(&snapshot_dir.join(SNAPSHOT_FILE_NAME), record)
    }

    pub(crate) fn ensure_folder_exists(&self, folder: &FolderRef) -> CoreResult<()> {
        let project = self.projects().read_record(&folder.project_id)?;
        existing_folder(&project, &folder.folder_id).map(|_| ())
    }

    /// A record that is missing, unreadable, newer than this core or not where it says it is counts as
    /// no snapshot; opening the store for writing repairs a snapshot moved halfway.
    fn readable_record(&self, folder: &FolderRef, id: &SnapshotId) -> Option<SnapshotRecord> {
        let file = self
            .store
            .paths()
            .snapshot_file(&folder.project_id, &folder.folder_id, id)
            .ok()?;
        let content = read_json_if_exists::<Value>(&file)
            .inspect_err(|error| tracing::warn!("skipping a snapshot: {error}"))
            .ok()??;
        if is_newer_schema(&content) {
            tracing::warn!("skipping {}: written by a newer CodeCharta", file.display());
            return None;
        }
        let record: SnapshotRecord = serde_json::from_value(content)
            .inspect_err(|error| tracing::warn!("skipping {}: {error}", file.display()))
            .ok()?;
        let is_in_place = &record.id == id
            && record.folder_id == folder.folder_id
            && record.project_id == folder.project_id;
        is_in_place.then_some(record)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Placement {
    New,
    Replace,
}

pub(crate) fn forget_shown(record: &mut ProjectRecord, folder: &FolderId, snapshot: &SnapshotId) {
    let shown = &mut record.view.shown_snapshot_id_by_folder;
    if shown.get(folder) == Some(snapshot) {
        shown.remove(folder);
    }
}

fn snapshot_ids_in(folder_dir: &Path) -> CoreResult<Vec<SnapshotId>> {
    let entries = match fs::read_dir(folder_dir) {
        Ok(entries) => entries,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(source) => return Err(io_error("list", folder_dir, source)),
    };
    Ok(entries
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_ok_and(|file_type| file_type.is_dir()))
        .filter_map(|entry| {
            SnapshotId::try_from(entry.file_name().to_string_lossy().into_owned()).ok()
        })
        .collect())
}

fn is_newer_schema(content: &Value) -> bool {
    content
        .get(SCHEMA_VERSION_FIELD)
        .and_then(Value::as_u64)
        .is_some_and(|version| version > u64::from(SNAPSHOT_SCHEMA_VERSION))
}

fn ensure_record_matches(staged: &StagedSnapshot, record: &SnapshotRecord) -> CoreResult<()> {
    let matches = record.project_id == staged.folder.project_id
        && record.folder_id == staged.folder.folder_id;
    if matches {
        return Ok(());
    }
    Err(CoreError::Internal(format!(
        "the snapshot {} names another folder than it was staged in",
        record.id
    )))
}

fn discard_staging(directory: &Path) {
    if let Err(error) = fs::remove_dir_all(directory) {
        tracing::warn!("could not remove {}: {error}", directory.display());
    }
}

pub(crate) fn no_such_snapshot(snapshot: &SnapshotRef) -> CoreError {
    CoreError::NotFound(format!(
        "There is no snapshot {} of the folder {}.",
        snapshot.snapshot_id, snapshot.folder_id
    ))
}

pub(crate) fn snapshot_exists(id: &SnapshotId) -> CoreError {
    CoreError::Conflict(format!("The folder already has a snapshot {id}."))
}

pub(crate) fn io_error(verb: &str, path: &Path, source: io::Error) -> CoreError {
    CoreError::Io {
        context: format!("Could not {verb} {}", path.display()),
        source,
    }
}
