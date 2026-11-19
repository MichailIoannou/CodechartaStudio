use codecharta_core_api::values::CommitSha;
use tokio_util::sync::CancellationToken;

use crate::error::CoreResult;
use crate::git::worktrees::WorktreeEntry;
use crate::git::{GitFolder, GitService};

/// ccsh names its temporary worktrees `codecharta-worktree-<digits>` (`GitWorktreeManager`).
pub const WORKTREE_NAME_PREFIX: &str = "codecharta-worktree-";

/// The worktrees ccsh could have created. Clean-up runs after a cancel too, so it never takes the job's
/// cancellation token.
pub async fn list_codecharta_worktrees(
    git: &GitService<'_>,
    folder: &GitFolder,
) -> CoreResult<Vec<WorktreeEntry>> {
    let worktrees = git.worktrees(folder, &CancellationToken::new()).await?;
    Ok(worktrees
        .into_iter()
        .filter(is_codecharta_worktree)
        .collect())
}

/// Removes every ccsh worktree that is not in `before` and has the job's commit checked out, then prunes;
/// answers how many it removed. Every orphan is tried; the first failure is reported.
pub async fn remove_orphans(
    git: &GitService<'_>,
    folder: &GitFolder,
    before: &[WorktreeEntry],
    sha: &CommitSha,
) -> CoreResult<usize> {
    let orphans: Vec<WorktreeEntry> = list_codecharta_worktrees(git, folder)
        .await?
        .into_iter()
        .filter(|entry| entry.head.as_deref() == Some(sha.as_str()))
        .filter(|entry| !before.iter().any(|known| known.path == entry.path))
        .collect();
    if orphans.is_empty() {
        return Ok(0);
    }
    let cancel = CancellationToken::new();
    let mut first_failure = None;
    for orphan in &orphans {
        if let Err(error) = git.remove_worktree(folder, &orphan.path, &cancel).await {
            tracing::warn!("could not remove {}: {error}", orphan.path.display());
            first_failure.get_or_insert(error);
        }
    }
    git.prune_worktrees(folder, &cancel).await?;
    first_failure.map_or(Ok(orphans.len()), Err)
}

fn is_codecharta_worktree(entry: &WorktreeEntry) -> bool {
    entry
        .path
        .file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name.starts_with(WORKTREE_NAME_PREFIX))
}
