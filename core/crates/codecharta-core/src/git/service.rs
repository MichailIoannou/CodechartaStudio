use std::path::{Path, PathBuf};

use codecharta_core_api::methods::git::GitRepositoryInfo;
use codecharta_core_api::methods::projects::FolderRef;
use tokio_util::sync::CancellationToken;

use super::locator::locate;
use super::runner::{GitCli, GitProcess};
use crate::error::CoreResult;

/// A folder git runs in. `repo` names the project folder it came from; a folder given by path alone (the
/// command line) has none.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GitFolder {
    pub path: PathBuf,
    pub repo: Option<FolderRef>,
}

impl GitFolder {
    pub fn at(path: &Path) -> Self {
        Self {
            path: path.to_path_buf(),
            repo: None,
        }
    }
}

/// The read-only git operations of the core.
pub struct GitService<'core> {
    git: GitCli<'core>,
}

impl<'core> GitService<'core> {
    pub fn new(process: &'core dyn GitProcess, data_dir: &'core Path) -> Self {
        Self {
            git: GitCli::new(process, data_dir),
        }
    }

    pub async fn repository_info(
        &self,
        folder: &GitFolder,
        cancel: &CancellationToken,
    ) -> CoreResult<GitRepositoryInfo> {
        Ok(locate(&self.git, &folder.path, cancel).await?.info)
    }
}
