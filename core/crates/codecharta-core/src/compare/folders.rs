use codecharta_core_api::methods::compare::{
    BaseMode, CompareIntent, ComparisonOrigin, ResolveComparisonParams, ResolveStatus,
    ResolvedComparison,
};
use codecharta_core_api::methods::projects::FolderRef;
use tokio_util::sync::CancellationToken;

use super::explicit::pick_typed;
use super::preflight::preflight;
use super::resolve::{
    CommitComparison, History, Pair, Picked, compared, from_merge_base, is_named_ref, revision_of,
    tips,
};
use super::sides::SideLookup;
use crate::error::{CoreError, CoreResult};
use crate::git::GitFolder;

const NOT_EXPLICIT_MESSAGE: &str = "Only an explicit comparison can span two folders.";

/// The clones of the two sides of a comparison across two folders of one project.
pub struct SideFolders<'folders> {
    pub base: &'folders GitFolder,
    pub head: &'folders GitFolder,
}

/// The clone a merge base and a status can come from: the first folder that has both commits.
struct SharedClone<'call, 'core> {
    folder: &'call FolderRef,
    history: &'call History<'call, 'core>,
}

impl<'core, Sides: SideLookup + Sync> CommitComparison<'_, 'core, Sides> {
    /// Each side is looked up in its own folder; the base folder's clone is asked first for both commits,
    /// then the head folder's. Without a clone that has both, the comparison is tip vs tip.
    pub async fn resolve_across(
        &self,
        folders: &SideFolders<'_>,
        params: &ResolveComparisonParams,
        cancel: &CancellationToken,
    ) -> CoreResult<ResolvedComparison> {
        let CompareIntent::Explicit {
            base,
            head,
            base_mode,
        } = &params.intent
        else {
            return Err(CoreError::BadRequest(NOT_EXPLICIT_MESSAGE.to_string()));
        };
        let base_history = self.history_in(folders.base, cancel);
        let head_history = self.history_in(folders.head, cancel);
        let base_tip = pick_typed(&base_history, &base.rev).await?;
        let head_pick = pick_typed(&head_history, &head.rev).await?;
        let candidates = [
            SharedClone {
                folder: &base.folder,
                history: &base_history,
            },
            SharedClone {
                folder: &head.folder,
                history: &head_history,
            },
        ];
        let clone = shared_clone(&candidates, &base_tip, &head_pick).await?;
        let uses_merge_base = *base_mode == BaseMode::MergeBase && is_named_ref(&base_tip.label);
        let (pair, base_folder) = match clone {
            Some(clone) if uses_merge_base => {
                merge_base_pair(clone, &base.folder, base_tip, head_pick).await?
            }
            _ => (tips(base_tip, head_pick), base.folder.clone()),
        };
        let status = across_status(clone, &pair).await?;
        let base_mode = pair.base_mode();
        let base_tip = pair
            .origin
            .as_ref()
            .map(|origin| compared(&base.folder, origin.tip.clone()));
        let base = self.side(&base_folder, pair.base, cancel).await?;
        let head = self.side(&head.folder, pair.head, cancel).await?;
        let preflight = preflight(&base.status, &head.status, &self.limits);
        Ok(ResolvedComparison {
            status,
            origin: ComparisonOrigin::Folders,
            base_mode,
            base,
            head,
            base_tip,
            preflight,
        })
    }

    pub(super) fn history_in<'call>(
        &'call self,
        folder: &'call GitFolder,
        cancel: &'call CancellationToken,
    ) -> History<'call, 'core> {
        History {
            git: self.git,
            folder,
            cancel,
            default_branch: None,
        }
    }
}

async fn shared_clone<'call, 'core>(
    candidates: &'call [SharedClone<'call, 'core>],
    base: &Picked,
    head: &Picked,
) -> CoreResult<Option<&'call SharedClone<'call, 'core>>> {
    for candidate in candidates {
        if has_both(candidate.history, base, head).await? {
            return Ok(Some(candidate));
        }
    }
    Ok(None)
}

async fn has_both(history: &History<'_, '_>, base: &Picked, head: &Picked) -> CoreResult<bool> {
    for picked in [base, head] {
        let revision = revision_of(picked.commit.as_str())?;
        if history.pick_if_local(&revision).await?.is_none() {
            return Ok(false);
        }
    }
    Ok(true)
}

/// The merge base is a commit of the clone it was found in, so that folder's snapshots answer for it;
/// a merge base that is the tip itself stays in the base folder.
async fn merge_base_pair(
    clone: &SharedClone<'_, '_>,
    base_folder: &FolderRef,
    base_tip: Picked,
    head: Picked,
) -> CoreResult<(Pair, FolderRef)> {
    let target = base_tip.label.name.clone();
    let tip_commit = base_tip.commit.clone();
    let pair = from_merge_base(clone.history, base_tip, &target, head).await?;
    let folder = if pair.base.commit == tip_commit {
        base_folder.clone()
    } else {
        clone.folder.clone()
    };
    Ok((pair, folder))
}

/// The same commit in two folders is still a comparison: their analyses may differ. Without a clone that
/// has both commits nothing more can be told.
async fn across_status(
    clone: Option<&SharedClone<'_, '_>>,
    pair: &Pair,
) -> CoreResult<ResolveStatus> {
    let Some(clone) = clone else {
        return Ok(ResolveStatus::Ready);
    };
    let is_same_commit = pair
        .origin
        .as_ref()
        .map_or(&pair.base, |origin| &origin.tip)
        .commit
        == pair.head.commit;
    if is_same_commit {
        return Ok(ResolveStatus::Ready);
    }
    match &pair.origin {
        Some(origin) if !origin.shares_history => Ok(ResolveStatus::NoCommonAncestor),
        Some(origin) if pair.base.commit == pair.head.commit => Ok(ResolveStatus::AlreadyMerged {
            target: origin.target.clone(),
        }),
        Some(_) => Ok(ResolveStatus::Ready),
        None if clone.history.share_history(pair).await? => Ok(ResolveStatus::Ready),
        None => Ok(ResolveStatus::NoCommonAncestor),
    }
}
