use codecharta_core_api::error::ErrorCode;
use codecharta_core_api::methods::compare::{
    BaseMode, CompareIntent, ComparedCommit, ComparisonOrigin, RefLabel, RefLabelKind,
    ResolveComparisonParams, ResolveStatus, ResolvedComparison, ResolvedSide,
};
use codecharta_core_api::methods::projects::FolderRef;
use codecharta_core_api::values::{CommitSha, Revision, SHORTEST_COMMIT_HASH_LENGTH};
use tokio_util::sync::CancellationToken;

use super::branch::branch_pair;
use super::change_request::change_request_pair;
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
    /// The folder's default branch, such as `main`: what the current branch is compared with.
    pub default_branch: Option<&'deps str>,
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
            default_branch: self.default_branch,
        };
        let pair = pick_pair(&history, params).await?;
        let status = status_of(&history, &pair).await?;
        let origin = origin_of(&params.intent);
        let compared_folder = params.intent.folder();
        let base_mode = pair
            .origin
            .as_ref()
            .map_or(BaseMode::Tip, |_| BaseMode::MergeBase);
        let base_tip = pair
            .origin
            .map(|origin| compared(compared_folder, origin.tip));
        let base = self.side(compared_folder, pair.base, cancel).await?;
        let head = self.side(compared_folder, pair.head, cancel).await?;
        let preflight = preflight(&base.status, &head.status, &self.limits);
        Ok(ResolvedComparison {
            status,
            origin,
            base_mode,
            base,
            head,
            base_tip,
            preflight,
        })
    }

    async fn side(
        &self,
        folder: &FolderRef,
        picked: Picked,
        cancel: &CancellationToken,
    ) -> CoreResult<ResolvedSide> {
        let requested = compared(folder, picked);
        let status = self.sides.status_of(&requested, cancel).await?;
        Ok(ResolvedSide { requested, status })
    }
}

fn compared(folder: &FolderRef, picked: Picked) -> ComparedCommit {
    ComparedCommit {
        folder: folder.clone(),
        short_commit: short_commit(&picked.commit),
        commit: picked.commit,
        label: picked.label,
    }
}

/// The git queries of plan 04 a resolution asks, in one folder.
pub(super) struct History<'call, 'core> {
    pub(super) git: &'call GitService<'core>,
    pub(super) folder: &'call GitFolder,
    pub(super) cancel: &'call CancellationToken,
    pub(super) default_branch: Option<&'call str>,
}

impl History<'_, '_> {
    pub(super) async fn pick(&self, revision: &Revision) -> CoreResult<Picked> {
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

    async fn merge_base(&self, left: &CommitSha, right: &CommitSha) -> CoreResult<Option<String>> {
        self.git
            .merge_base(self.folder, left, right, self.cancel)
            .await
    }

    async fn share_history(&self, pair: &Pair) -> CoreResult<bool> {
        let merge_base = self
            .merge_base(&pair.base.commit, &pair.head.commit)
            .await?;
        Ok(merge_base.is_some())
    }

    /// `None` when this clone does not have the revision.
    pub(super) async fn pick_if_local(&self, revision: &Revision) -> CoreResult<Option<Picked>> {
        match self.pick(revision).await {
            Ok(picked) => Ok(Some(picked)),
            Err(error) if error.code() == ErrorCode::UnknownRevision => Ok(None),
            Err(error) => Err(error),
        }
    }
}

/// One side before its snapshot is looked up.
#[derive(Clone)]
pub(super) struct Picked {
    pub(super) commit: CommitSha,
    pub(super) label: RefLabel,
    committed_at: i64,
    pub(super) first_parent: Option<String>,
}

impl Picked {
    pub(super) fn with_label(self, label: RefLabel) -> Self {
        Self { label, ..self }
    }
}

pub(super) struct Pair {
    pub(super) base: Picked,
    pub(super) head: Picked,
    /// Set when the base is a merge base: the tip it came from.
    pub(super) origin: Option<MergeBaseOrigin>,
}

pub(super) struct MergeBaseOrigin {
    pub(super) tip: Picked,
    pub(super) target: String,
    pub(super) shares_history: bool,
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
            origin: None,
        }),
        CompareIntent::Branch { .. } => branch_pair(history, &params.intent).await,
        CompareIntent::ChangeRequest { .. } => change_request_pair(history, &params.intent).await,
    }
}

fn origin_of(intent: &CompareIntent) -> ComparisonOrigin {
    match intent {
        CompareIntent::Commits { .. }
        | CompareIntent::WithParent { .. }
        | CompareIntent::WithCurrent { .. } => ComparisonOrigin::Commits,
        CompareIntent::Branch { .. } => ComparisonOrigin::Branches,
        CompareIntent::ChangeRequest { .. } => ComparisonOrigin::PullRequest,
    }
}

/// The ancestor is the base; without one, the older commit by commit date.
async fn order_by_history(history: &History<'_, '_>, a: Picked, b: Picked) -> CoreResult<Pair> {
    if a.commit == b.commit || history.is_ancestor(&a.commit, &b.commit).await? {
        return Ok(tips(a, b));
    }
    if history.is_ancestor(&b.commit, &a.commit).await? || b.committed_at < a.committed_at {
        return Ok(tips(b, a));
    }
    Ok(tips(a, b))
}

pub(super) fn tips(base: Picked, head: Picked) -> Pair {
    Pair {
        base,
        head,
        origin: None,
    }
}

/// The merge base of `tip` and `head`, else the tip itself when the two share no history.
pub(super) async fn from_merge_base(
    history: &History<'_, '_>,
    origin_tip: Picked,
    target: &str,
    head: Picked,
) -> CoreResult<Pair> {
    let merge_base = history.merge_base(&origin_tip.commit, &head.commit).await?;
    let base = match &merge_base {
        Some(sha) => history.pick(&revision_of(sha)?).await?,
        None => origin_tip.clone(),
    };
    let origin = MergeBaseOrigin {
        tip: origin_tip,
        target: target.to_string(),
        shares_history: merge_base.is_some(),
    };
    Ok(Pair {
        base,
        head,
        origin: Some(origin),
    })
}

async fn with_first_parent(history: &History<'_, '_>, revision: &Revision) -> CoreResult<Pair> {
    let head = history.pick(revision).await?;
    let parent = head.first_parent.as_deref().ok_or_else(no_parent)?;
    let base = history.pick(&revision_of(parent)?).await?;
    Ok(tips(base, head))
}

fn current_revision(params: &ResolveComparisonParams) -> CoreResult<Revision> {
    let shown = params
        .shown_commit
        .as_ref()
        .map_or(HEAD, |commit| commit.as_str());
    revision_of(shown)
}

/// Decided in the plan's order: the same commit first, then whether the two share any history, then
/// whether the merge base is the head.
async fn status_of(history: &History<'_, '_>, pair: &Pair) -> CoreResult<ResolveStatus> {
    if let Some(origin) = &pair.origin {
        return Ok(merge_base_status(origin, pair));
    }
    if pair.base.commit == pair.head.commit {
        return Ok(ResolveStatus::SameCommit);
    }
    if history.share_history(pair).await? {
        Ok(ResolveStatus::Ready)
    } else {
        Ok(ResolveStatus::NoCommonAncestor)
    }
}

fn merge_base_status(origin: &MergeBaseOrigin, pair: &Pair) -> ResolveStatus {
    if origin.tip.commit == pair.head.commit {
        ResolveStatus::SameCommit
    } else if !origin.shares_history {
        ResolveStatus::NoCommonAncestor
    } else if pair.base.commit == pair.head.commit {
        ResolveStatus::AlreadyMerged {
            target: origin.target.clone(),
        }
    } else {
        ResolveStatus::Ready
    }
}

pub(super) fn label_of(revision: &Revision, commit: &CommitSha) -> RefLabel {
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

pub(super) fn label(kind: RefLabelKind, name: &str) -> RefLabel {
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

pub(super) fn revision_of(text: &str) -> CoreResult<Revision> {
    Revision::try_from(text)
        .map_err(|error| CoreError::Internal(format!("not a revision: {error}")))
}

fn no_parent() -> CoreError {
    GitError::new(ErrorCode::UnknownRevision, NO_PARENT_MESSAGE).into()
}
