use std::collections::HashMap;
use std::fs;
use std::io::{self, Write};
use std::path::Path;
use std::sync::{Arc, Mutex, PoisonError};
use std::time::Duration;

use codecharta_core_api::ids::ProjectId;
use serde::Serialize;
use serde::de::DeserializeOwned;
use tokio::sync::OwnedMutexGuard;

use crate::error::{CoreError, CoreResult};

pub const TEMPORARY_FILE_PREFIX: &str = ".tmp-";
const RENAME_RETRIES: u32 = 5;
const FIRST_RETRY_DELAY: Duration = Duration::from_millis(20);
#[cfg(windows)]
const WINDOWS_SHARING_VIOLATION: i32 = 32;
#[cfg(windows)]
const WINDOWS_LOCK_VIOLATION: i32 = 33;

type Rename<'rename> = &'rename dyn Fn(&Path, &Path) -> io::Result<()>;

pub fn read_json<T: DeserializeOwned>(path: &Path) -> CoreResult<T> {
    read_json_if_exists(path)?
        .ok_or_else(|| CoreError::NotFound(format!("{} does not exist.", path.display())))
}

pub fn read_json_if_exists<T: DeserializeOwned>(path: &Path) -> CoreResult<Option<T>> {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(source) => {
            return Err(CoreError::Io {
                context: format!("Could not read {}", path.display()),
                source,
            });
        }
    };
    serde_json::from_slice(&bytes)
        .map(Some)
        .map_err(|error| CoreError::Io {
            context: format!("{} is not readable JSON", path.display()),
            source: io::Error::new(io::ErrorKind::InvalidData, error),
        })
}

/// Either the old or the new content is on disk afterwards, never a partial file.
pub fn write_json_atomic<T: Serialize>(path: &Path, value: &T) -> CoreResult<()> {
    write_json_atomic_with(path, value, &|from, to| fs::rename(from, to))
}

fn write_json_atomic_with<T: Serialize>(path: &Path, value: &T, rename: Rename) -> CoreResult<()> {
    let content = to_json_bytes(path, value)?;
    let folder = path
        .parent()
        .ok_or_else(|| CoreError::Internal(format!("{} has no parent folder", path.display())))?;
    let temporary =
        write_temporary_file(folder, &content).map_err(|source| write_error(path, source))?;
    rename_with_retries(temporary.as_ref(), path, rename)
        .map_err(|source| write_error(path, source))?;
    temporary.keep().map(|_| ()).map_err(|error| CoreError::Io {
        context: format!("Could not finish writing {}", path.display()),
        source: error.error,
    })
}

fn to_json_bytes<T: Serialize>(path: &Path, value: &T) -> CoreResult<Vec<u8>> {
    let mut content = serde_json::to_vec_pretty(value).map_err(|error| {
        CoreError::Internal(format!("could not serialise {}: {error}", path.display()))
    })?;
    content.push(b'\n');
    Ok(content)
}

fn write_temporary_file(folder: &Path, content: &[u8]) -> io::Result<tempfile::TempPath> {
    let mut temporary = tempfile::Builder::new()
        .prefix(TEMPORARY_FILE_PREFIX)
        .tempfile_in(folder)?;
    temporary.write_all(content)?;
    temporary.as_file().sync_all()?;
    Ok(temporary.into_temp_path())
}

fn write_error(path: &Path, source: io::Error) -> CoreError {
    CoreError::Io {
        context: format!("Could not write {}", path.display()),
        source,
    }
}

/// Virus scanners and indexers on Windows briefly hold files open without sharing them for deletion,
/// which makes a rename over the file fail for a moment.
fn rename_with_retries(from: &Path, to: &Path, rename: Rename) -> io::Result<()> {
    let mut delay = FIRST_RETRY_DELAY;
    for _ in 0..RENAME_RETRIES {
        match rename(from, to) {
            Err(error) if is_transient(&error) => std::thread::sleep(delay),
            result => return result,
        }
        delay *= 2;
    }
    rename(from, to)
}

fn is_transient(error: &io::Error) -> bool {
    error.kind() == io::ErrorKind::PermissionDenied || is_windows_sharing_error(error)
}

#[cfg(windows)]
fn is_windows_sharing_error(error: &io::Error) -> bool {
    matches!(
        error.raw_os_error(),
        Some(WINDOWS_SHARING_VIOLATION | WINDOWS_LOCK_VIOLATION)
    )
}

#[cfg(not(windows))]
fn is_windows_sharing_error(_error: &io::Error) -> bool {
    false
}

/// One writer at a time per project, so two requests never interleave on one `project.json`.
#[derive(Debug, Default)]
pub struct ProjectLocks {
    locks: Mutex<HashMap<ProjectId, Arc<tokio::sync::Mutex<()>>>>,
}

pub type ProjectGuard = OwnedMutexGuard<()>;

impl ProjectLocks {
    pub async fn lock(&self, project: &ProjectId) -> ProjectGuard {
        let lock = {
            let mut locks = self.locks.lock().unwrap_or_else(PoisonError::into_inner);
            Arc::clone(locks.entry(project.clone()).or_default())
        };
        lock.lock_owned().await
    }
}

#[cfg(test)]
mod tests {
    use std::cell::Cell;

    use serde::ser::Error;
    use serde_json::{Value, json};

    use super::*;

    struct Unserialisable;

    impl Serialize for Unserialisable {
        fn serialize<S: serde::Serializer>(&self, _serializer: S) -> Result<S::Ok, S::Error> {
            Err(S::Error::custom("refused"))
        }
    }

    fn entries_in(folder: &Path) -> Vec<String> {
        let mut names: Vec<String> = fs::read_dir(folder)
            .unwrap()
            .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();
        names
    }

    #[test]
    fn should_replace_the_file_with_the_new_content() {
        // Arrange
        let folder = tempfile::tempdir().unwrap();
        let file = folder.path().join("project.json");
        write_json_atomic(&file, &json!({ "name": "old" })).unwrap();

        // Act
        write_json_atomic(&file, &json!({ "name": "new" })).unwrap();

        // Assert
        let content: Value = read_json(&file).unwrap();
        assert_eq!(content, json!({ "name": "new" }));
        assert_eq!(entries_in(folder.path()), vec!["project.json"]);
    }

    #[test]
    fn should_leave_the_old_file_intact_when_the_write_fails_before_rename() {
        // Arrange
        let folder = tempfile::tempdir().unwrap();
        let file = folder.path().join("project.json");
        write_json_atomic(&file, &json!({ "name": "old" })).unwrap();
        let refusing_rename: Rename = &|_, _| Err(io::Error::other("disk full"));

        // Act
        let unserialisable = write_json_atomic(&file, &Unserialisable);
        let failed_rename =
            write_json_atomic_with(&file, &json!({ "name": "new" }), refusing_rename);

        // Assert
        assert!(unserialisable.is_err());
        assert!(matches!(failed_rename, Err(CoreError::Io { .. })));
        let content: Value = read_json(&file).unwrap();
        assert_eq!(content, json!({ "name": "old" }));
        assert_eq!(entries_in(folder.path()), vec!["project.json"]);
    }

    #[test]
    fn should_retry_a_rename_that_fails_with_a_sharing_error() {
        // Arrange
        let folder = tempfile::tempdir().unwrap();
        let file = folder.path().join("project.json");
        let attempts = Cell::new(0);
        let briefly_shared: Rename = &|from, to| {
            attempts.set(attempts.get() + 1);
            if attempts.get() <= 2 {
                return Err(io::Error::from(io::ErrorKind::PermissionDenied));
            }
            fs::rename(from, to)
        };

        // Act
        write_json_atomic_with(&file, &json!({ "name": "new" }), briefly_shared).unwrap();

        // Assert
        assert_eq!(attempts.get(), 3);
        let content: Value = read_json(&file).unwrap();
        assert_eq!(content, json!({ "name": "new" }));
    }

    #[test]
    fn should_give_up_after_the_last_retry() {
        // Arrange
        let folder = tempfile::tempdir().unwrap();
        let file = folder.path().join("project.json");
        let attempts = Cell::new(0);
        let always_shared: Rename = &|_, _| {
            attempts.set(attempts.get() + 1);
            Err(io::Error::from(io::ErrorKind::PermissionDenied))
        };

        // Act
        let result = write_json_atomic_with(&file, &json!({}), always_shared);

        // Assert
        assert!(matches!(result, Err(CoreError::Io { .. })));
        assert_eq!(attempts.get(), RENAME_RETRIES + 1);
        assert!(entries_in(folder.path()).is_empty());
    }

    #[test]
    fn should_answer_none_for_a_missing_file_and_io_for_bad_json() {
        // Arrange
        let folder = tempfile::tempdir().unwrap();
        let broken = folder.path().join("broken.json");
        fs::write(&broken, "{ not json").unwrap();

        // Act
        let missing = read_json_if_exists::<Value>(&folder.path().join("missing.json")).unwrap();
        let unreadable = read_json::<Value>(&broken);

        // Assert
        assert_eq!(missing, None);
        assert!(matches!(unreadable, Err(CoreError::Io { .. })));
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn should_run_writes_of_one_project_in_order() {
        // Arrange
        let locks = Arc::new(ProjectLocks::default());
        let project = ProjectId::try_from("p-0123456789abcdef").unwrap();
        let journal = Arc::new(Mutex::new(Vec::new()));
        let writers = (0..4).map(|writer| {
            let (locks, project, journal) =
                (Arc::clone(&locks), project.clone(), Arc::clone(&journal));
            tokio::spawn(async move {
                let _guard = locks.lock(&project).await;
                journal.lock().unwrap().push(format!("start {writer}"));
                tokio::time::sleep(Duration::from_millis(10)).await;
                journal.lock().unwrap().push(format!("end {writer}"));
            })
        });

        // Act
        for writer in writers.collect::<Vec<_>>() {
            writer.await.unwrap();
        }

        // Assert
        let journal = journal.lock().unwrap();
        let interleaved = journal
            .chunks(2)
            .any(|pair| pair[0].strip_prefix("start ") != pair[1].strip_prefix("end "));
        assert!(!interleaved, "{journal:?}");
    }
}
