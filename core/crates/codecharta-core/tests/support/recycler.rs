use std::path::{Path, PathBuf};
use std::sync::Mutex;

use codecharta_core::recycle::Recycler;
use codecharta_core::{CoreError, CoreResult};
use tempfile::TempDir;

/// Moves recycled files and directories into a temporary bin and remembers them; tests never touch the real one.
pub struct RecordingRecycler {
    bin: TempDir,
    recycled: Mutex<Vec<PathBuf>>,
    fails: bool,
}

impl Default for RecordingRecycler {
    fn default() -> Self {
        Self::new()
    }
}

impl RecordingRecycler {
    pub fn new() -> Self {
        Self {
            bin: tempfile::tempdir().expect("a temporary recycle bin"),
            recycled: Mutex::new(Vec::new()),
            fails: false,
        }
    }

    /// A recycle bin that refuses everything, like one on a drive without a bin.
    pub fn failing() -> Self {
        Self {
            fails: true,
            ..Self::new()
        }
    }

    pub fn recycled(&self) -> Vec<PathBuf> {
        self.recycled.lock().expect("not poisoned").clone()
    }
}

impl Recycler for RecordingRecycler {
    fn recycle(&self, path: &Path) -> CoreResult<()> {
        if self.fails {
            return Err(CoreError::RecycleFailed {
                path: path.display().to_string(),
                reason: "the recycle bin is not available".to_string(),
            });
        }
        let mut recycled = self.recycled.lock().expect("not poisoned");
        let target = self.bin.path().join(recycled.len().to_string());
        std::fs::rename(path, target).expect("the entry can be moved into the bin");
        recycled.push(path.to_path_buf());
        Ok(())
    }
}
