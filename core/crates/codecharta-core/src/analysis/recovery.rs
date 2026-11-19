use std::fs::{self, File, OpenOptions, TryLockError};
use std::io;
use std::path::{Path, PathBuf};

use codecharta_core_api::ids::{FolderId, ProjectId};
use codecharta_core_api::values::CommitSha;
use serde::{Deserialize, Serialize};

use super::janitor::remove_orphans;
use crate::error::{CoreError, CoreResult};
use crate::git::worktrees::WorktreeEntry;
use crate::git::{GitFolder, GitService};
use crate::store::atomic::{read_json_if_exists, write_json_atomic};
use crate::store::paths::{JOB_FILE_NAME, JOB_LOCK_FILE_NAME, STAGING_FOLDER_PREFIX, StorePaths};

/// What `recover` needs to undo a ccsh run whose process died: the repository and commit of a commit
/// run and the ccsh worktrees that existed before it. `pid` is only for the log.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobFile {
    pub repository_path: Option<PathBuf>,
    pub sha: Option<CommitSha>,
    pub worktrees_before: Vec<PathBuf>,
    pub pid: u32,
}

/// Written into a staging directory before ccsh starts and held until it ended: the operating system
/// releases the lock when the process dies, however it dies, so a held lock means the run is alive.
#[derive(Debug)]
pub struct JobMarker {
    lock: File,
    directory: PathBuf,
}

impl JobMarker {
    pub fn hold(directory: &Path, job: &JobFile) -> CoreResult<Self> {
        let lock_path = directory.join(JOB_LOCK_FILE_NAME);
        let lock = open_lock(&lock_path)?;
        match lock.try_lock() {
            Ok(()) => {}
            Err(TryLockError::WouldBlock) => {
                return Err(CoreError::Conflict(format!(
                    "{} is held by another analysis.",
                    lock_path.display()
                )));
            }
            Err(TryLockError::Error(source)) => return Err(lock_error(&lock_path, source)),
        }
        write_json_atomic(&directory.join(JOB_FILE_NAME), job)?;
        Ok(Self {
            lock,
            directory: directory.to_path_buf(),
        })
    }

    /// The staging directory goes on without the marker: into the store or into a failed run's log.
    pub fn release(self) {
        drop(self.lock);
        for name in [JOB_FILE_NAME, JOB_LOCK_FILE_NAME] {
            let file = self.directory.join(name);
            if let Err(error) = fs::remove_file(&file) {
                tracing::warn!("could not remove {}: {error}", file.display());
            }
        }
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Recovery {
    pub cleaned: usize,
    pub still_running: usize,
}

/// Cleans up after analyses whose process died: removes the ccsh worktrees they left in the user's
/// repository, then their staging directories. A directory whose lock is still held is left alone.
pub async fn recover(paths: &StorePaths, git: &GitService<'_>) -> CoreResult<Recovery> {
    let mut recovery = Recovery::default();
    for directory in job_directories(paths)? {
        let lock_path = directory.join(JOB_LOCK_FILE_NAME);
        let Some(lock) = claim(&lock_path)? else {
            recovery.still_running += 1;
            continue;
        };
        clean_worktrees(&directory, git).await;
        drop(lock);
        fs::remove_dir_all(&directory).map_err(|source| CoreError::Io {
            context: format!("Could not remove {}", directory.display()),
            source,
        })?;
        recovery.cleaned += 1;
    }
    Ok(recovery)
}

/// The lock of a dead run, or `None` while its process still holds it.
fn claim(lock_path: &Path) -> CoreResult<Option<File>> {
    let lock = open_lock(lock_path)?;
    match lock.try_lock() {
        Ok(()) => Ok(Some(lock)),
        Err(TryLockError::WouldBlock) => Ok(None),
        Err(TryLockError::Error(source)) => Err(lock_error(lock_path, source)),
    }
}

async fn clean_worktrees(directory: &Path, git: &GitService<'_>) {
    let job = match read_json_if_exists::<JobFile>(&directory.join(JOB_FILE_NAME)) {
        Ok(Some(job)) => job,
        Ok(None) => return,
        Err(error) => {
            tracing::warn!("an abandoned analysis left an unreadable job file: {error}");
            return;
        }
    };
    let (Some(repository), Some(sha)) = (&job.repository_path, &job.sha) else {
        return;
    };
    let before: Vec<WorktreeEntry> = job
        .worktrees_before
        .iter()
        .map(|path| WorktreeEntry {
            path: path.clone(),
            head: None,
        })
        .collect();
    tracing::info!("cleaning up after the analysis of process {}", job.pid);
    let folder = GitFolder::at(repository);
    if let Err(error) = remove_orphans(git, &folder, &before, sha).await {
        tracing::warn!("a worktree of an abandoned analysis stays behind: {error}");
    }
}

/// Staging directories of every project folder that hold a job file.
fn job_directories(paths: &StorePaths) -> CoreResult<Vec<PathBuf>> {
    let mut directories = Vec::new();
    for project in child_names(&paths.projects_dir())?
        .into_iter()
        .filter_map(|name| ProjectId::try_from(name).ok())
    {
        let project_snapshots = paths.project_snapshots_dir(&project)?;
        for folder in child_names(&project_snapshots)?
            .into_iter()
            .filter_map(|name| FolderId::try_from(name).ok())
        {
            let folder_dir = paths.folder_snapshots_dir(&project, &folder)?;
            directories.extend(
                child_names(&folder_dir)?
                    .into_iter()
                    .filter(|name| name.starts_with(STAGING_FOLDER_PREFIX))
                    .map(|name| folder_dir.join(name))
                    .filter(|directory| directory.join(JOB_FILE_NAME).is_file()),
            );
        }
    }
    Ok(directories)
}

fn child_names(folder: &Path) -> CoreResult<Vec<String>> {
    let entries = match fs::read_dir(folder) {
        Ok(entries) => entries,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(source) => return Err(read_error(folder, source)),
    };
    let mut names = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|source| read_error(folder, source))?;
        let is_dir = entry.file_type().is_ok_and(|file_type| file_type.is_dir());
        if let (true, Ok(name)) = (is_dir, entry.file_name().into_string()) {
            names.push(name);
        }
    }
    Ok(names)
}

fn open_lock(lock_path: &Path) -> CoreResult<File> {
    OpenOptions::new()
        .create(true)
        .truncate(false)
        .write(true)
        .open(lock_path)
        .map_err(|source| lock_error(lock_path, source))
}

fn lock_error(lock_path: &Path, source: io::Error) -> CoreError {
    CoreError::Io {
        context: format!("Could not lock {}", lock_path.display()),
        source,
    }
}

fn read_error(folder: &Path, source: io::Error) -> CoreError {
    CoreError::Io {
        context: format!("Could not read {}", folder.display()),
        source,
    }
}
