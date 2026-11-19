use codecharta_core_api::error::ErrorCode;
use codecharta_core_api::methods::compare::{ResolveComparisonParams, ResolvedComparison};
use codecharta_core_api::methods::projects::{FolderKind, FolderRef};
use tokio_util::sync::CancellationToken;

use super::preflight::SizeLimits;
use super::resolve::CommitComparison;
use crate::error::CoreResult;
use crate::git::GitFolder;
use crate::git::error::{GitError, message_for};
use crate::projects::ProjectRepository;
use crate::snapshots::FolderResolver;

/// Resolves a comparison of a project folder against the snapshots of the store the resolver reads; the
/// serving core and the command line share it.
pub async fn resolve_in_project(
    resolver: &FolderResolver<'_, '_>,
    params: &ResolveComparisonParams,
    cancel: &CancellationToken,
) -> CoreResult<ResolvedComparison> {
    let folder = compared_folder(resolver.projects, params.intent.folder())?;
    let comparison = CommitComparison {
        git: resolver.git,
        sides: resolver,
        limits: SizeLimits::default(),
    };
    comparison.resolve(&folder, params, cancel).await
}

/// `NOT_FOUND` for an unknown project or folder, `NOT_A_REPOSITORY` for a folder without git and
/// `FOLDER_UNAVAILABLE` while it is missing on disk.
pub fn compared_folder(
    projects: &ProjectRepository<'_>,
    folder: &FolderRef,
) -> CoreResult<GitFolder> {
    if projects.resolve_folder(folder)?.kind == FolderKind::Plain {
        let code = ErrorCode::NotARepository;
        return Err(GitError::new(code, message_for(code)).into());
    }
    projects.git_folder(folder)
}
