use codecharta_core_api::methods::analysis::AnalysisTarget;
use codecharta_core_api::methods::projects::{FolderKind, FolderRef, FolderStatus};
use codecharta_core_api::methods::snapshots::SnapshotResolution;
use tokio_util::sync::CancellationToken;

use super::nearest::{ResolutionCache, ResolutionFolder, ResolutionRequest, resolve_snapshot};
use super::repository::SnapshotRepository;
use crate::analysis::profile::{profile_hash, validate_profile};
use crate::error::CoreResult;
use crate::git::{GitFolder, GitService};
use crate::projects::{ProjectRepository, ResolvedFolder};

/// What resolving the snapshot of a project folder reads; the serving core and the command line build
/// it over their own store.
pub struct FolderResolver<'deps, 'core> {
    pub projects: &'deps ProjectRepository<'core>,
    pub snapshots: &'deps SnapshotRepository<'core>,
    pub git: &'deps GitService<'core>,
    pub cache: &'deps ResolutionCache,
}

impl FolderResolver<'_, '_> {
    /// `NOT_FOUND` for an unknown project or folder; a missing folder still answers from the store.
    pub async fn resolve(
        &self,
        folder: &FolderRef,
        target: &AnalysisTarget,
        cancel: &CancellationToken,
    ) -> CoreResult<SnapshotResolution> {
        let resolved = self.projects.resolve_folder(folder)?;
        let snapshots = self.snapshots.list(folder)?;
        let current_profile_hash = self.current_profile_hash(folder)?;
        let git_folder = GitFolder {
            path: resolved.path.clone(),
            repo: Some(folder.clone()),
        };
        let request = ResolutionRequest {
            folder: resolution_folder(&resolved, &git_folder),
            target,
            snapshots: &snapshots,
            current_profile_hash: current_profile_hash.as_deref(),
        };
        resolve_snapshot(self.git, self.cache, &request, cancel).await
    }

    /// `None` while the profile is invalid: then no snapshot matches it.
    fn current_profile_hash(&self, folder: &FolderRef) -> CoreResult<Option<String>> {
        let profile = self
            .projects
            .read_record(&folder.project_id)?
            .analysis_profile;
        Ok(validate_profile(&profile)
            .ok()
            .map(|valid| profile_hash(&valid)))
    }
}

fn resolution_folder<'folder>(
    resolved: &ResolvedFolder,
    git_folder: &'folder GitFolder,
) -> ResolutionFolder<'folder> {
    match (resolved.kind, resolved.status) {
        (FolderKind::Plain, _) => ResolutionFolder::Plain,
        (FolderKind::Git, FolderStatus::Missing) => ResolutionFolder::MissingGit,
        (FolderKind::Git, FolderStatus::Ok) => ResolutionFolder::Git(git_folder),
    }
}
