use codecharta_core_api::error::ErrorCode;
use codecharta_core_api::methods::compare::{BaseMode, CompareIntent, RefInput};
use codecharta_core_api::methods::git::GitRefs;
use codecharta_core_api::values::Revision;

use super::resolve::{History, Pair, Picked, from_merge_base, is_named_ref, revision_of, tips};
use crate::error::{CoreError, CoreResult};
use crate::git::error::{GitError, message_for};

const SHORTEST_PREFIX_LENGTH: usize = 4;
const TWO_FOLDERS_MESSAGE: &str = "Both sides of a comparison must be in the same folder.";

/// The base the user chose stays the base; from a branch or tag in `mergeBase` mode, the base is where the
/// head left it.
pub(super) async fn explicit_pair(
    history: &History<'_, '_>,
    intent: &CompareIntent,
) -> CoreResult<Pair> {
    let CompareIntent::Explicit {
        base,
        head,
        base_mode,
    } = intent
    else {
        return Err(CoreError::Internal(
            "not an explicit comparison".to_string(),
        ));
    };
    if base.folder != head.folder {
        return Err(CoreError::BadRequest(TWO_FOLDERS_MESSAGE.to_string()));
    }
    let base_tip = pick_typed(history, &base.rev).await?;
    let head = pick_typed(history, &head.rev).await?;
    if *base_mode == BaseMode::MergeBase && is_named_ref(&base_tip.label) {
        let target = base_tip.label.name.clone();
        return from_merge_base(history, base_tip, &target, head).await;
    }
    Ok(tips(base_tip, head))
}

pub(super) async fn pick_typed(history: &History<'_, '_>, input: &RefInput) -> CoreResult<Picked> {
    let RefInput::Rev { name } = input;
    let revision = revision_of_typed(history, name.as_str()).await?;
    history.pick(&revision).await
}

/// A revision as it is, else a tag, branch or remote branch of that name (git's order), else the commit a
/// unique hash prefix names.
async fn revision_of_typed(history: &History<'_, '_>, name: &str) -> CoreResult<Revision> {
    if let Ok(revision) = Revision::try_from(name) {
        return Ok(revision);
    }
    let refs = history.git.refs(history.folder, history.cancel).await?;
    if let Some(ref_name) = named_ref(&refs, name) {
        return revision_of(ref_name);
    }
    if is_hash_prefix(name)
        && let Some(commit) = history
            .git
            .resolve_abbreviated(history.folder, name, history.cancel)
            .await?
    {
        return revision_of(commit.as_str());
    }
    let code = ErrorCode::UnknownRevision;
    Err(GitError::new(code, message_for(code)).into())
}

fn named_ref<'refs>(refs: &'refs GitRefs, name: &str) -> Option<&'refs str> {
    let tag = refs.tags.iter().find(|tag| tag.name == name);
    let local = refs
        .local_branches
        .iter()
        .find(|branch| branch.name == name);
    let remote = refs
        .remote_branches
        .iter()
        .find(|branch| branch.name == name);
    tag.map(|tag| tag.ref_name.as_str())
        .or_else(|| local.map(|branch| branch.ref_name.as_str()))
        .or_else(|| remote.map(|branch| branch.ref_name.as_str()))
}

fn is_hash_prefix(name: &str) -> bool {
    name.len() >= SHORTEST_PREFIX_LENGTH && name.bytes().all(|byte| byte.is_ascii_hexdigit())
}
