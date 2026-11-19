use std::fs;
use std::io;
use std::path::Path;

use crate::error::{CoreError, CoreResult};
use crate::store::paths::{LOCK_FILE_NAME, STORE_FILE_NAME};

/// What a new store root holds once it is prepared; the old root is never changed.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PreparedRoot {
    /// The folder already held a store, which is used as it is.
    Adopted,
    /// The current store was copied into the empty folder.
    Copied,
    /// The folder is empty and there was no usable store to copy; a new store starts there.
    Empty,
}

/// Makes `target` ready to be opened as the store: adopt a store that is there, copy the store at
/// `current` into an empty folder (without its lock), refuse anything else.
pub fn prepare_store_root(current: Option<&Path>, target: &Path) -> CoreResult<PreparedRoot> {
    ensure_absolute(target)?;
    fs::create_dir_all(target).map_err(|source| io_error("create", target, source))?;
    if target.join(STORE_FILE_NAME).is_file() {
        return Ok(PreparedRoot::Adopted);
    }
    ensure_empty(target)?;
    let Some(current) = current.filter(|current| current.join(STORE_FILE_NAME).is_file()) else {
        return Ok(PreparedRoot::Empty);
    };
    ensure_outside(current, target)?;
    copy_store(current, target).inspect_err(|_| empty_again(target))?;
    Ok(PreparedRoot::Copied)
}

fn ensure_absolute(target: &Path) -> CoreResult<()> {
    if target.is_absolute() {
        return Ok(());
    }
    Err(CoreError::BadRequest(format!(
        "The store folder must be an absolute path: {}",
        target.display()
    )))
}

fn ensure_empty(target: &Path) -> CoreResult<()> {
    let mut entries = fs::read_dir(target).map_err(|source| io_error("read", target, source))?;
    if entries.next().is_none() {
        return Ok(());
    }
    Err(CoreError::BadRequest(format!(
        "{} is not empty and holds no CodeCharta store. Choose an empty folder or an existing CodeCharta store.",
        target.display()
    )))
}

fn ensure_outside(current: &Path, target: &Path) -> CoreResult<()> {
    let canonical =
        |path: &Path| fs::canonicalize(path).map_err(|source| io_error("resolve", path, source));
    if !canonical(target)?.starts_with(canonical(current)?) {
        return Ok(());
    }
    Err(CoreError::BadRequest(format!(
        "{} lies inside the current store; choose a folder outside it.",
        target.display()
    )))
}

fn copy_store(current: &Path, target: &Path) -> CoreResult<()> {
    for entry in fs::read_dir(current).map_err(|source| io_error("read", current, source))? {
        let entry = entry.map_err(|source| io_error("read", current, source))?;
        if entry.file_name() != LOCK_FILE_NAME {
            copy_entry(&entry.path(), &target.join(entry.file_name()))?;
        }
    }
    Ok(())
}

/// Symbolic links are not followed: nothing outside the store is copied into the new folder.
fn copy_entry(source: &Path, destination: &Path) -> CoreResult<()> {
    let kind = fs::symlink_metadata(source)
        .map_err(|error| io_error("read", source, error))?
        .file_type();
    if kind.is_dir() {
        fs::create_dir(destination).map_err(|error| io_error("create", destination, error))?;
        for entry in fs::read_dir(source).map_err(|error| io_error("read", source, error))? {
            let entry = entry.map_err(|error| io_error("read", source, error))?;
            copy_entry(&entry.path(), &destination.join(entry.file_name()))?;
        }
    } else if kind.is_file() {
        fs::copy(source, destination).map_err(|error| io_error("copy", source, error))?;
    }
    Ok(())
}

fn empty_again(target: &Path) {
    let Ok(entries) = fs::read_dir(target) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let removed = if path.is_dir() {
            fs::remove_dir_all(&path)
        } else {
            fs::remove_file(&path)
        };
        if let Err(error) = removed {
            tracing::warn!(
                "could not remove {} after a failed store copy: {error}",
                path.display()
            );
        }
    }
}

fn io_error(action: &str, path: &Path, source: io::Error) -> CoreError {
    CoreError::Io {
        context: format!("Could not {action} {}", path.display()),
        source,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::Store;
    use crate::store::paths::PROJECTS_FOLDER_NAME;

    fn store_with_a_project(root: &Path) -> Store {
        let store = Store::open(root).unwrap();
        let project = root.join(PROJECTS_FOLDER_NAME).join("p-1");
        fs::create_dir_all(&project).unwrap();
        fs::write(project.join("project.json"), "{}").unwrap();
        store
    }

    #[test]
    fn should_adopt_a_folder_that_already_holds_a_store() {
        // Arrange
        let current = tempfile::tempdir().unwrap();
        let other = tempfile::tempdir().unwrap();
        let _store = store_with_a_project(current.path());
        drop(Store::open(other.path()).unwrap());

        // Act
        let prepared = prepare_store_root(Some(current.path()), other.path()).unwrap();

        // Assert
        assert_eq!(prepared, PreparedRoot::Adopted);
        assert!(!other.path().join(PROJECTS_FOLDER_NAME).join("p-1").exists());
    }

    #[test]
    fn should_copy_the_store_into_an_empty_folder_without_the_lock_file() {
        // Arrange
        let current = tempfile::tempdir().unwrap();
        let target = tempfile::tempdir().unwrap();
        let _store = store_with_a_project(current.path());

        // Act
        let prepared = prepare_store_root(Some(current.path()), target.path()).unwrap();

        // Assert
        assert_eq!(prepared, PreparedRoot::Copied);
        assert!(target.path().join(STORE_FILE_NAME).is_file());
        assert!(
            target
                .path()
                .join(PROJECTS_FOLDER_NAME)
                .join("p-1")
                .join("project.json")
                .is_file()
        );
        assert!(!target.path().join(LOCK_FILE_NAME).exists());
    }

    #[test]
    fn should_refuse_a_non_empty_folder_without_a_store() {
        // Arrange
        let current = tempfile::tempdir().unwrap();
        let target = tempfile::tempdir().unwrap();
        let _store = store_with_a_project(current.path());
        fs::write(target.path().join("notes.txt"), "mine").unwrap();

        // Act
        let refused = prepare_store_root(Some(current.path()), target.path());

        // Assert
        assert!(matches!(refused, Err(CoreError::BadRequest(_))));
        assert_eq!(fs::read_dir(target.path()).unwrap().count(), 1);
    }

    #[test]
    fn should_leave_the_old_store_in_place() {
        // Arrange
        let current = tempfile::tempdir().unwrap();
        let target = tempfile::tempdir().unwrap();
        let _store = store_with_a_project(current.path());

        // Act
        prepare_store_root(Some(current.path()), target.path()).unwrap();

        // Assert
        assert!(current.path().join(STORE_FILE_NAME).is_file());
        assert!(current.path().join(LOCK_FILE_NAME).is_file());
        assert!(
            current
                .path()
                .join(PROJECTS_FOLDER_NAME)
                .join("p-1")
                .join("project.json")
                .is_file()
        );
    }

    #[test]
    fn should_refuse_a_folder_inside_the_current_store_and_a_relative_path() {
        // Arrange
        let current = tempfile::tempdir().unwrap();
        let _store = store_with_a_project(current.path());
        let inside = current.path().join("nested");

        // Act
        let nested = prepare_store_root(Some(current.path()), &inside);
        let relative = prepare_store_root(Some(current.path()), Path::new("store"));

        // Assert
        assert!(matches!(nested, Err(CoreError::BadRequest(_))));
        assert!(matches!(relative, Err(CoreError::BadRequest(_))));
    }

    #[test]
    fn should_start_empty_when_there_is_no_store_to_copy() {
        // Arrange
        let target = tempfile::tempdir().unwrap();
        let missing = target.path().join("not yet there");

        // Act
        let without_current = prepare_store_root(None, target.path()).unwrap();
        let created = prepare_store_root(None, &missing).unwrap();

        // Assert
        assert_eq!(without_current, PreparedRoot::Empty);
        assert_eq!(created, PreparedRoot::Empty);
        assert!(missing.is_dir());
    }
}
