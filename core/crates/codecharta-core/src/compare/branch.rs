use codecharta_core_api::error::ErrorCode;
use codecharta_core_api::methods::compare::{BaseMode, CompareIntent};
use codecharta_core_api::methods::git::GitHead;
use codecharta_core_api::values::Revision;

use super::resolve::{History, Pair, Picked, from_merge_base, tips};
use crate::error::{CoreError, CoreResult};
use crate::git::error::GitError;

const LOCAL_BRANCHES_PREFIX: &str = "refs/heads/";
const ORIGIN_BRANCHES_PREFIX: &str = "refs/remotes/origin/";
const NO_DEFAULT_BRANCH_MESSAGE: &str = "The folder has no default branch to compare with.";

/// The branch tip is the head; the base is where it left its target (merge base), or the target tip.
pub(super) async fn branch_pair(
    history: &History<'_, '_>,
    intent: &CompareIntent,
) -> CoreResult<Pair> {
    let CompareIntent::Branch {
        branch,
        target,
        base_mode,
        ..
    } = intent
    else {
        return Err(CoreError::Internal("not a branch comparison".to_string()));
    };
    let head = history.pick(branch).await?;
    let target_tip = match target {
        Some(target) => history.pick(target).await?,
        None => default_target(history, branch).await?,
    };
    let target_name = target_tip.label.name.clone();
    match base_mode {
        BaseMode::MergeBase => from_merge_base(history, target_tip, &target_name, head).await,
        BaseMode::Tip => Ok(tips(target_tip, head)),
    }
}

/// The current branch, or the default branch when the compared branch is the current one (or no branch is
/// checked out).
async fn default_target(history: &History<'_, '_>, branch: &Revision) -> CoreResult<Picked> {
    let status = history.git.status(history.folder, history.cancel).await?;
    if let GitHead::Branch { name, .. } = status.head {
        let current = local_branch(&name)?;
        if &current != branch {
            return history.pick(&current).await;
        }
    }
    default_branch_tip(history).await
}

/// The local default branch, else its `origin` remote-tracking branch.
async fn default_branch_tip(history: &History<'_, '_>) -> CoreResult<Picked> {
    let name = history.default_branch.ok_or_else(no_default_branch)?;
    for prefix in [LOCAL_BRANCHES_PREFIX, ORIGIN_BRANCHES_PREFIX] {
        let Ok(revision) = Revision::try_from(format!("{prefix}{name}")) else {
            continue;
        };
        if let Some(picked) = history.pick_if_local(&revision).await? {
            return Ok(picked);
        }
    }
    Err(no_default_branch())
}

fn local_branch(name: &str) -> CoreResult<Revision> {
    Revision::try_from(format!("{LOCAL_BRANCHES_PREFIX}{name}"))
        .map_err(|error| CoreError::Internal(format!("not a branch: {error}")))
}

fn no_default_branch() -> CoreError {
    GitError::new(ErrorCode::UnknownRevision, NO_DEFAULT_BRANCH_MESSAGE).into()
}
