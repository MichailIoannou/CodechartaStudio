use std::path::Path;

use crate::error::{CoreError, CoreResult};

/// Moves a store directory or a discarded file to the operating system's recycle bin, so a deletion can be
/// undone there. A bin that refuses answers `RECYCLE_FAILED` and leaves the path in place; nothing falls
/// back to deleting for good.
pub trait Recycler: Send + Sync {
    fn recycle(&self, path: &Path) -> CoreResult<()>;
}

#[derive(Debug, Default)]
pub struct SystemRecycler;

impl Recycler for SystemRecycler {
    fn recycle(&self, path: &Path) -> CoreResult<()> {
        if path.symlink_metadata().is_err() {
            return Err(CoreError::NotFound(format!(
                "{} does not exist.",
                path.display()
            )));
        }
        trash::delete(path).map_err(|error| CoreError::RecycleFailed {
            path: path.display().to_string(),
            reason: error.to_string(),
        })
    }
}

/// Deletes for good; still only ever called with a path built by `StorePaths`.
pub fn delete_permanently(path: &Path) -> CoreResult<()> {
    std::fs::remove_dir_all(path).map_err(|source| CoreError::Io {
        context: format!("Could not delete {}", path.display()),
        source,
    })
}
