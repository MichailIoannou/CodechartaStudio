use std::fs::{self, File, OpenOptions, TryLockError};
use std::path::Path;

use crate::error::{CoreError, CoreResult};
use crate::store::paths::StorePaths;

/// Held by the one process that may write the store; the operating system releases it when that
/// process ends, however it ends. Only `.lock` is locked, because a lock on Windows also keeps other
/// processes from reading the locked file.
#[derive(Debug)]
pub struct StoreLock {
    _file: File,
}

impl StoreLock {
    pub fn acquire(root: &Path) -> CoreResult<Self> {
        fs::create_dir_all(root).map_err(|source| CoreError::Io {
            context: format!("Could not create the store folder {}", root.display()),
            source,
        })?;
        let lock_file = StorePaths::new(root.to_path_buf()).lock_file();
        let file = OpenOptions::new()
            .create(true)
            .truncate(false)
            .write(true)
            .open(&lock_file)
            .map_err(|source| lock_error(&lock_file, source))?;
        match file.try_lock() {
            Ok(()) => Ok(Self { _file: file }),
            Err(TryLockError::WouldBlock) => Err(CoreError::StoreLocked {
                store_root: root.display().to_string(),
            }),
            Err(TryLockError::Error(source)) => Err(lock_error(&lock_file, source)),
        }
    }
}

fn lock_error(lock_file: &Path, source: std::io::Error) -> CoreError {
    CoreError::Io {
        context: format!("Could not lock {}", lock_file.display()),
        source,
    }
}
