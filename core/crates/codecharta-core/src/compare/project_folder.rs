use codecharta_core_api::error::ErrorCode;
use codecharta_core_api::methods::compare::{
    ChangedFilesParams, ChangedFilesResult, CompareIntent, ResolveComparisonParams,
    ResolvedComparison, SideInput,
};
use codecharta_core_api::methods::projects::{FolderKind, FolderRef};
use tokio_util::sync::CancellationToken;

use super::changed_files::ChangedFilesSearch;
use super::folders::SideFolders;
use super::preflight::SizeLimits;
use super::resolve::CommitComparison;
use super::snapshot_sides::SnapshotSideFolders;
use crate::error::{CoreError, CoreResult};
use crate::git::error::{GitError, message_for};
use crate::git::{GitFolder, GitService};
use crate::projects::ProjectRepository;
use crate::snapshots::FolderResolver;

const TWO_PROJECTS_MESSAGE: &str = "Both sides of a comparison must be in one project.";

/// Resolves a comparison of a project folder, of two folders of one project, or against a working-tree or
/// imported snapshot, over the snapshots of the store the resolver reads; the serving core and the command
/// line share it.
pub async fn resolve_in_project(
    resolver: &FolderResolver<'_, '_>,
    params: &ResolveComparisonParams,
    cancel: &CancellationToken,
) -> CoreResult<ResolvedComparison> {
    match explicit_sides(&params.intent)? {
        Some((base, head)) if base.rev.is_snapshot() || head.rev.is_snapshot() => {
            resolve_with_snapshots(resolver, base, head, params, cancel).await
        }
        Some((base, head)) if base.folder != head.folder => {
            let comparison = comparison_of(resolver, None);
            let base = compared_folder(resolver.projects, &base.folder)?;
            let head = compared_folder(resolver.projects, &head.folder)?;
            let folders = SideFolders {
                base: &base,
                head: &head,
            };
            comparison.resolve_across(&folders, params, cancel).await
        }
        _ => {
            let folder = compared_folder(resolver.projects, params.intent.folder())?;
            let default_branch = resolver.projects.default_branch(params.intent.folder())?;
            let comparison = comparison_of(resolver, default_branch.as_deref());
            comparison.resolve(&folder, params, cancel).await
        }
    }
}

fn comparison_of<'deps, 'core>(
    resolver: &'deps FolderResolver<'deps, 'core>,
    default_branch: Option<&'deps str>,
) -> CommitComparison<'deps, 'core, FolderResolver<'deps, 'core>> {
    CommitComparison {
        git: resolver.git,
        sides: resolver,
        limits: SizeLimits::default(),
        default_branch,
    }
}

/// A snapshot side needs its folder to exist, not to be a repository: an imported map may sit in a plain
/// folder.
async fn resolve_with_snapshots(
    resolver: &FolderResolver<'_, '_>,
    base: &SideInput,
    head: &SideInput,
    params: &ResolveComparisonParams,
    cancel: &CancellationToken,
) -> CoreResult<ResolvedComparison> {
    let base_clone = clone_of_side(resolver.projects, base)?;
    let head_clone = clone_of_side(resolver.projects, head)?;
    let folders = SnapshotSideFolders {
        base: base_clone.as_ref(),
        head: head_clone.as_ref(),
    };
    comparison_of(resolver, None)
        .resolve_with_snapshots(&folders, params, cancel)
        .await
}

fn clone_of_side(
    projects: &ProjectRepository<'_>,
    side: &SideInput,
) -> CoreResult<Option<GitFolder>> {
    if side.rev.is_snapshot() {
        projects.resolve_folder(&side.folder)?;
        return Ok(None);
    }
    compared_folder(projects, &side.folder).map(Some)
}

/// The two sides of an explicit comparison, which must be in one project.
fn explicit_sides(intent: &CompareIntent) -> CoreResult<Option<(&SideInput, &SideInput)>> {
    let CompareIntent::Explicit { base, head, .. } = intent else {
        return Ok(None);
    };
    if base.folder.project_id != head.folder.project_id {
        return Err(CoreError::BadRequest(TWO_PROJECTS_MESSAGE.to_string()));
    }
    Ok(Some((base, head)))
}

/// Lists the files between two commits in the base folder's clone, else the head folder's; every folder
/// must exist, as in `resolve_in_project`.
pub async fn changed_files_in_project(
    projects: &ProjectRepository<'_>,
    git: &GitService<'_>,
    params: &ChangedFilesParams,
    cancel: &CancellationToken,
) -> CoreResult<ChangedFilesResult> {
    let mut folders = vec![compared_folder(projects, &params.base_folder)?];
    if params.head_folder != params.base_folder {
        folders.push(compared_folder(projects, &params.head_folder)?);
    }
    let search = ChangedFilesSearch { git, cancel };
    search.list(&folders, &params.base, &params.head).await
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
