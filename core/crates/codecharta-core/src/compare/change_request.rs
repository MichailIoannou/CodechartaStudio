use codecharta_core_api::error::ErrorCode;
use codecharta_core_api::methods::compare::{CompareIntent, RefLabelKind};
use codecharta_core_api::values::{BranchName, CommitSha, Revision};

use super::resolve::{History, Pair, Picked, from_merge_base, label, revision_of};
use crate::error::{CoreError, CoreResult};
use crate::git::error::{GitError, refused};
use crate::hosting::ChangeRequestRef;

const REMOTE_BRANCHES_PREFIX: &str = "refs/remotes/";

/// What the renderer knows of a pull or merge request (plan 06, 7.4); nothing here runs `gh` or `glab`.
struct ChangeRequestInput<'intent> {
    change_request: ChangeRequestRef,
    remote: &'intent str,
    base_ref_name: &'intent BranchName,
    base_commit: Option<&'intent CommitSha>,
    head_commit: Option<&'intent CommitSha>,
    merge_commit: Option<&'intent CommitSha>,
}

/// Base = the merge base of the base branch tip and the head, as a pull request page shows it.
pub(super) async fn change_request_pair(
    history: &History<'_, '_>,
    intent: &CompareIntent,
) -> CoreResult<Pair> {
    let input = input_of(intent)?;
    ensure_configured_remote(history, input.remote).await?;
    let head = pick_head(history, &input).await?;
    let tip = pick_base_tip(history, &input).await?;
    from_merge_base(history, tip, input.base_ref_name.as_str(), head).await
}

fn input_of(intent: &CompareIntent) -> CoreResult<ChangeRequestInput<'_>> {
    let CompareIntent::ChangeRequest {
        provider,
        number,
        remote,
        base_ref_name,
        base_commit,
        head_commit,
        merge_commit,
        ..
    } = intent
    else {
        return Err(CoreError::Internal("not a change request".to_string()));
    };
    Ok(ChangeRequestInput {
        change_request: ChangeRequestRef::new(*provider, *number)?,
        remote,
        base_ref_name,
        base_commit: base_commit.as_ref(),
        head_commit: head_commit.as_ref(),
        merge_commit: merge_commit.as_ref(),
    })
}

async fn ensure_configured_remote(history: &History<'_, '_>, remote: &str) -> CoreResult<()> {
    let remotes = history.git.remotes(history.folder, history.cancel).await?;
    if remotes.iter().any(|configured| configured.name == remote) {
        Ok(())
    } else {
        Err(CoreError::NotFound(format!(
            "There is no remote {remote:?}."
        )))
    }
}

/// `headCommit`, else the fetched private ref; `HEAD_NOT_LOCAL` when this clone has neither.
async fn pick_head(
    history: &History<'_, '_>,
    input: &ChangeRequestInput<'_>,
) -> CoreResult<Picked> {
    let revision = match input.head_commit {
        Some(commit) => revision_of(commit.as_str())?,
        None => input.change_request.private_revision()?,
    };
    let head = history.pick_if_local(&revision).await?;
    let mut head = head.ok_or_else(|| refused(ErrorCode::HeadNotLocal))?;
    head.label = label(RefLabelKind::PullRequest, &input.change_request.label());
    Ok(head)
}

/// The recorded base, else the first parent of the merge commit, else the remote branch tip.
async fn pick_base_tip(
    history: &History<'_, '_>,
    input: &ChangeRequestInput<'_>,
) -> CoreResult<Picked> {
    if let Some(recorded) = recorded_tip(history, input).await? {
        return Ok(recorded);
    }
    let remote_tip = remote_branch(input)?;
    history
        .pick_if_local(&remote_tip)
        .await?
        .ok_or_else(|| base_not_local(input))
}

async fn recorded_tip(
    history: &History<'_, '_>,
    input: &ChangeRequestInput<'_>,
) -> CoreResult<Option<Picked>> {
    let branch = label(RefLabelKind::Branch, input.base_ref_name.as_str());
    if let Some(recorded) = pick_commit(history, input.base_commit).await? {
        return Ok(Some(recorded.with_label(branch)));
    }
    let merge = pick_commit(history, input.merge_commit).await?;
    let Some(parent) = merge.and_then(|merge| merge.first_parent) else {
        return Ok(None);
    };
    let parent = history.pick(&revision_of(&parent)?).await?;
    Ok(Some(parent.with_label(branch)))
}

async fn pick_commit(
    history: &History<'_, '_>,
    commit: Option<&CommitSha>,
) -> CoreResult<Option<Picked>> {
    match commit {
        Some(commit) => history.pick_if_local(&revision_of(commit.as_str())?).await,
        None => Ok(None),
    }
}

fn remote_branch(input: &ChangeRequestInput<'_>) -> CoreResult<Revision> {
    let name = format!(
        "{REMOTE_BRANCHES_PREFIX}{}/{}",
        input.remote, input.base_ref_name
    );
    Revision::try_from(name)
        .map_err(|_| CoreError::BadRequest("The remote name is not a valid ref part.".to_string()))
}

fn base_not_local(input: &ChangeRequestInput<'_>) -> CoreError {
    let message = format!(
        "The base branch {}/{} is not in this clone; fetch it first.",
        input.remote, input.base_ref_name
    );
    GitError::new(ErrorCode::UnknownRevision, message).into()
}

#[cfg(test)]
mod tests {
    use super::super::resolve::label_of;
    use super::*;

    #[test]
    fn should_label_a_remote_branch_tip_by_its_remote_and_name() {
        // Arrange
        let revision = Revision::try_from("refs/remotes/origin/main").unwrap();
        let commit = CommitSha::try_from("0123456789abcdef0123456789abcdef01234567").unwrap();

        // Act
        let tip_label = label_of(&revision, &commit);

        // Assert
        assert_eq!(tip_label, label(RefLabelKind::Branch, "origin/main"));
    }
}
