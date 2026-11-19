use codecharta_core_api::error::ErrorCode;
use codecharta_core_api::methods::compare::{
    BaseMode, CompareIntent, ComparedCommit, RefLabel, RefLabelKind, ResolveComparisonParams,
    ResolveStatus, ResolvedComparison, ResolvedSide,
};
use codecharta_core_api::methods::projects::FolderRef;
use codecharta_core_api::values::{CommitSha, Revision, SHORTEST_COMMIT_HASH_LENGTH};
use tokio_util::sync::CancellationToken;

use super::preflight::{SizeLimits, preflight};
use super::sides::SideLookup;
use crate::error::{CoreError, CoreResult};
use crate::git::error::GitError;
use crate::git::{GitFolder, GitService};

const HEAD: &str = "HEAD";
const TAG_PREFIX: &str = "refs/tags/";
const BRANCH_PREFIXES: [&str; 2] = ["refs/heads/", "refs/remotes/"];
const NO_PARENT_MESSAGE: &str = "The commit has no parent to compare with.";

/// Resolves what the user pointed at in one git folder to a base and a head commit and the snapshot each
/// has (plan 06, "From user intent to base and head"). Never starts an analysis.
pub struct CommitComparison<'deps, 'core, Sides> {
    pub git: &'deps GitService<'core>,
    pub sides: &'deps Sides,
    pub limits: SizeLimits,
}

impl<Sides: SideLookup + Sync> CommitComparison<'_, '_, Sides> {
    pub async fn resolve(
        &self,
        folder: &GitFolder,
        params: &ResolveComparisonParams,
        cancel: &CancellationToken,
    ) -> CoreResult<ResolvedComparison> {
        let history = History {
            git: self.git,
            folder,
            cancel,
        };
        let pair = pick_pair(&history, params).await?;
        let status = status_of(&history, &pair).await?;
        let compared_folder = params.intent.folder();
        let base = self.side(compared_folder, pair.base, cancel).await?;
        let head = self.side(compared_folder, pair.head, cancel).await?;
        let preflight = preflight(&base.status, &head.status, &self.limits);
        Ok(ResolvedComparison {
            status,
            base_mode: BaseMode::Tip,
            base,
            head,
            preflight,
        })
    }

    async fn side(
        &self,
        folder: &FolderRef,
        picked: Picked,
        cancel: &CancellationToken,
    ) -> CoreResult<ResolvedSide> {
        let requested = ComparedCommit {
            folder: folder.clone(),
            short_commit: short_commit(&picked.commit),
            commit: picked.commit,
            label: picked.label,
        };
        let status = self.sides.status_of(&requested, cancel).await?;
        Ok(ResolvedSide { requested, status })
    }
}

/// The git queries of plan 04 a resolution asks, in one folder.
struct History<'call, 'core> {
    git: &'call GitService<'core>,
    folder: &'call GitFolder,
    cancel: &'call CancellationToken,
}

impl History<'_, '_> {
    async fn pick(&self, revision: &Revision) -> CoreResult<Picked> {
        let summary = self
            .git
            .resolve_commit(self.folder, revision, self.cancel)
            .await?;
        let commit = commit_sha(&summary.sha)?;
        Ok(Picked {
            label: label_of(revision, &commit),
            commit,
            committed_at: summary.committed_at,
            first_parent: summary.parents.into_iter().next(),
        })
    }

    async fn is_ancestor(&self, ancestor: &CommitSha, descendant: &CommitSha) -> CoreResult<bool> {
        self.git
            .is_ancestor(self.folder, ancestor, descendant, self.cancel)
            .await
    }

    async fn share_history(&self, pair: &Pair) -> CoreResult<bool> {
        let merge_base = self
            .git
            .merge_base(
                self.folder,
                &pair.base.commit,
                &pair.head.commit,
                self.cancel,
            )
            .await?;
        Ok(merge_base.is_some())
    }
}

/// One side before its snapshot is looked up.
struct Picked {
    commit: CommitSha,
    label: RefLabel,
    committed_at: i64,
    first_parent: Option<String>,
}

struct Pair {
    base: Picked,
    head: Picked,
}

async fn pick_pair(
    history: &History<'_, '_>,
    params: &ResolveComparisonParams,
) -> CoreResult<Pair> {
    match &params.intent {
        CompareIntent::Commits { a, b, .. } => {
            let (a, b) = (history.pick(a).await?, history.pick(b).await?);
            order_by_history(history, a, b).await
        }
        CompareIntent::WithParent { commit, .. } => with_first_parent(history, commit).await,
        CompareIntent::WithCurrent { commit, .. } => Ok(Pair {
            base: history.pick(commit).await?,
            head: history.pick(&current_revision(params)?).await?,
        }),
    }
}

/// The ancestor is the base; without one, the older commit by commit date.
async fn order_by_history(history: &History<'_, '_>, a: Picked, b: Picked) -> CoreResult<Pair> {
    if a.commit == b.commit || history.is_ancestor(&a.commit, &b.commit).await? {
        return Ok(Pair { base: a, head: b });
    }
    if history.is_ancestor(&b.commit, &a.commit).await? || b.committed_at < a.committed_at {
        return Ok(Pair { base: b, head: a });
    }
    Ok(Pair { base: a, head: b })
}

async fn with_first_parent(history: &History<'_, '_>, revision: &Revision) -> CoreResult<Pair> {
    let head = history.pick(revision).await?;
    let parent = head.first_parent.as_deref().ok_or_else(no_parent)?;
    let base = history.pick(&revision_of(parent)?).await?;
    Ok(Pair { base, head })
}

fn current_revision(params: &ResolveComparisonParams) -> CoreResult<Revision> {
    let shown = params
        .shown_commit
        .as_ref()
        .map_or(HEAD, |commit| commit.as_str());
    revision_of(shown)
}

/// Decided in the plan's order: the same commit first, then whether the two share any history.
async fn status_of(history: &History<'_, '_>, pair: &Pair) -> CoreResult<ResolveStatus> {
    if pair.base.commit == pair.head.commit {
        return Ok(ResolveStatus::SameCommit);
    }
    if history.share_history(pair).await? {
        Ok(ResolveStatus::Ready)
    } else {
        Ok(ResolveStatus::NoCommonAncestor)
    }
}

fn label_of(revision: &Revision, commit: &CommitSha) -> RefLabel {
    let name = revision.as_str();
    if let Some(tag) = name.strip_prefix(TAG_PREFIX) {
        return label(RefLabelKind::Tag, tag);
    }
    match BRANCH_PREFIXES
        .iter()
        .find_map(|prefix| name.strip_prefix(prefix))
    {
        Some(branch) => label(RefLabelKind::Branch, branch),
        None => label(RefLabelKind::Commit, &short_commit(commit)),
    }
}

fn label(kind: RefLabelKind, name: &str) -> RefLabel {
    RefLabel {
        kind,
        name: name.to_string(),
    }
}

fn short_commit(commit: &CommitSha) -> String {
    commit
        .as_str()
        .chars()
        .take(SHORTEST_COMMIT_HASH_LENGTH)
        .collect()
}

fn commit_sha(text: &str) -> CoreResult<CommitSha> {
    CommitSha::try_from(text)
        .map_err(|error| CoreError::Internal(format!("git answered no commit: {error}")))
}

fn revision_of(text: &str) -> CoreResult<Revision> {
    Revision::try_from(text)
        .map_err(|error| CoreError::Internal(format!("not a revision: {error}")))
}

fn no_parent() -> CoreError {
    GitError::new(ErrorCode::UnknownRevision, NO_PARENT_MESSAGE).into()
}
