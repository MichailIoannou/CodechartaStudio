use codecharta_core_api::methods::analysis::AnalysisTarget;
use codecharta_core_api::methods::git::{GitHead, GitStatus, StatusCounts};
use codecharta_core_api::values::{CommitHash, CommitSha, FullCommit};
use tokio_util::sync::CancellationToken;

use crate::error::{CoreError, CoreResult};
use crate::folders::inspector::{CommitDetails, commit_details};
use crate::git::{GitFolder, GitRunner, GitService};
use crate::snapshots::record::{GitRecord, HeadAtRun};

const HEAD: &str = "HEAD";

/// The two git readers a snapshot record needs: plan 04's service for status, refs, tree and remotes, and
/// plan 03's commit description, so analysed and imported records describe a commit alike.
pub struct GitReads<'reads> {
    pub service: &'reads GitService<'reads>,
    pub runner: &'reads dyn GitRunner,
}

/// The git half of a snapshot record. A working-tree target is bound to the commit HEAD names and is
/// dirty when the status lists anything; a commit target never is.
pub async fn collect_git_state(
    git: &GitReads<'_>,
    folder: &GitFolder,
    target: &AnalysisTarget,
    cancel: &CancellationToken,
) -> CoreResult<GitRecord> {
    let status = git.service.status(folder, cancel).await?;
    let sha = target_commit(target, &status.head)?;
    let (details, tree, refs, remotes) = tokio::try_join!(
        described_commit(git.runner, folder, &sha),
        git.service.tree_of(folder, &sha, cancel),
        git.service.refs_at(folder, &sha, cancel),
        git.service.remotes(folder, cancel),
    )?;
    Ok(GitRecord {
        commit: details.resolved.commit,
        short_commit: details.resolved.short_commit,
        subject: details.resolved.subject,
        author_name: details.resolved.author_name,
        author_date: details.resolved.author_date,
        commit_date: details.commit_date,
        parents: details.parents,
        branches_at_run: refs.branches,
        tags_at_run: refs.tags,
        head_at_run: head_at_run(&status),
        dirty: is_dirty(target, &status.counts),
        remotes,
        tree: Some(tree),
    })
}

/// The commit HEAD names now; `NOT_A_COMMIT` on a branch without commits.
pub fn head_commit(head: &GitHead) -> CoreResult<CommitSha> {
    let commit = match head {
        GitHead::Branch { commit, .. } => commit.as_deref(),
        GitHead::Detached { commit } => Some(commit.as_str()),
    };
    commit
        .and_then(|commit| CommitSha::try_from(commit).ok())
        .ok_or_else(|| CoreError::NotACommit {
            commit: HEAD.to_string(),
        })
}

fn target_commit(target: &AnalysisTarget, head: &GitHead) -> CoreResult<CommitSha> {
    match target {
        AnalysisTarget::Commit { sha } => Ok(sha.clone()),
        AnalysisTarget::WorkingTree => head_commit(head),
    }
}

async fn described_commit(
    runner: &dyn GitRunner,
    folder: &GitFolder,
    sha: &CommitSha,
) -> CoreResult<CommitDetails> {
    let not_a_commit = || CoreError::NotACommit {
        commit: sha.to_string(),
    };
    let hash = CommitHash::try_from(sha.as_str()).map_err(|_| not_a_commit())?;
    commit_details(runner, &folder.path, &hash)
        .await?
        .ok_or_else(not_a_commit)
}

fn head_at_run(status: &GitStatus) -> Option<HeadAtRun> {
    let commit = FullCommit::try_from(head_commit(&status.head).ok()?.as_str()).ok()?;
    let branch = match &status.head {
        GitHead::Branch { name, .. } => Some(name.clone()),
        GitHead::Detached { .. } => None,
    };
    let upstream = status.upstream.as_ref();
    Some(HeadAtRun {
        branch,
        commit,
        upstream: upstream.map(|upstream| upstream.name.clone()),
        ahead: upstream.and_then(|upstream| upstream.ahead).unwrap_or(0),
        behind: upstream.and_then(|upstream| upstream.behind).unwrap_or(0),
    })
}

fn is_dirty(target: &AnalysisTarget, counts: &StatusCounts) -> bool {
    let has_changes = counts.staged + counts.unstaged + counts.untracked + counts.conflicted > 0;
    matches!(target, AnalysisTarget::WorkingTree) && has_changes
}
