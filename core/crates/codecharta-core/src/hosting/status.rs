use codecharta_core_api::methods::hosting::HostingStatus;
use codecharta_core_api::methods::projects::FolderRef;
use tokio_util::sync::CancellationToken;

use super::detect::{detect, status_of};
use crate::compare::compared_folder;
use crate::error::CoreResult;
use crate::git::GitService;
use crate::projects::ProjectRepository;

/// The hosting provider of a project folder, from its remotes as git lists them now and the override the
/// folder record keeps. Never runs `gh` or `glab`.
pub async fn hosting_status(
    projects: &ProjectRepository<'_>,
    git: &GitService<'_>,
    folder: &FolderRef,
    cancel: &CancellationToken,
) -> CoreResult<HostingStatus> {
    let git_folder = compared_folder(projects, folder)?;
    let hosting_override = projects.hosting_override(folder)?;
    let remotes = git.remotes(&git_folder, cancel).await?;
    Ok(status_of(detect(&remotes, hosting_override.as_ref())))
}
