use codecharta_core_api::error::ErrorCode;
use codecharta_core_api::methods::git::{
    GitBranchCreateParams, GitBranchDeleteTarget, GitBranchRenameParams, GitLocalBranch, GitRefs,
    GitRemoteBranch, GitSetUpstreamParams, GitSwitchTarget,
};
use codecharta_core_api::values::{BranchName, CommitSha, FullRefName, Revision};

use super::command::QUERY_LIMITS;
use super::error::refused;
use super::operation::Mutation;
use super::query::resolve_commit;
use crate::error::{CoreError, CoreResult};

const END_OF_OPTIONS: &str = "--end-of-options";
const SWITCH_ARGS: [&str; 3] = ["switch", "--no-guess", "--no-recurse-submodules"];
const CREATE_SWITCHING: &str = "-c";
const TRACK: &str = "--track";
const NO_TRACK: &str = "--no-track";
const BRANCH: &str = "branch";
const RENAME: &str = "-m";
const DELETE_MERGED: &str = "-d";
const DELETE_FORCED: &str = "-D";
const SET_UPSTREAM_OPTION: &str = "--set-upstream-to=";
const UNSET_UPSTREAM: &str = "--unset-upstream";
const PUSH_DELETE_ARGS: [&str; 3] = ["push", "--progress", "--delete"];
const CHECK_REF_FORMAT: &str = "check-ref-format";
const LOCAL_BRANCHES_PREFIX: &str = "refs/heads/";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BranchCreateRequest {
    pub name: BranchName,
    pub start_point: CommitSha,
    pub checkout: bool,
}

impl From<GitBranchCreateParams> for BranchCreateRequest {
    fn from(params: GitBranchCreateParams) -> Self {
        Self {
            name: params.name,
            start_point: params.start_point,
            checkout: params.checkout,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BranchRenameRequest {
    pub ref_name: FullRefName,
    pub new_name: BranchName,
}

impl From<GitBranchRenameParams> for BranchRenameRequest {
    fn from(params: GitBranchRenameParams) -> Self {
        Self {
            ref_name: params.ref_name,
            new_name: params.new_name,
        }
    }
}

/// `upstream` null removes the branch's upstream.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SetUpstreamRequest {
    pub ref_name: FullRefName,
    pub upstream: Option<FullRefName>,
}

impl From<GitSetUpstreamParams> for SetUpstreamRequest {
    fn from(params: GitSetUpstreamParams) -> Self {
        Self {
            ref_name: params.ref_name,
            upstream: params.upstream_ref_name,
        }
    }
}

/// git carries local changes over or refuses with the files it would overwrite; the core does not check
/// the working tree itself.
pub async fn switch(mutation: &Mutation<'_>, target: &GitSwitchTarget) -> CoreResult<()> {
    ensure_no_operation_in_progress(mutation)?;
    let refs = mutation.refs().await?;
    match target {
        GitSwitchTarget::Local { ref_name } => {
            let branch = usable_local_branch(&refs, ref_name)?;
            let mut args = SWITCH_ARGS.to_vec();
            args.extend([END_OF_OPTIONS, branch.name.as_str()]);
            mutation.run(&args).await.map(drop)
        }
        GitSwitchTarget::TrackRemote {
            remote_ref_name,
            local_name,
        } => {
            let remote = remote_branch(&refs, remote_ref_name)?;
            ensure_new_name(mutation, &refs, local_name).await?;
            let mut args = SWITCH_ARGS.to_vec();
            let name = local_name.as_str();
            args.extend([
                CREATE_SWITCHING,
                name,
                TRACK,
                END_OF_OPTIONS,
                &remote.ref_name,
            ]);
            mutation.run(&args).await.map(drop)
        }
    }
}

pub async fn create(mutation: &Mutation<'_>, request: &BranchCreateRequest) -> CoreResult<()> {
    let refs = mutation.refs().await?;
    ensure_new_name(mutation, &refs, &request.name).await?;
    ensure_commit(mutation, &request.start_point).await?;
    let (name, start_point) = (request.name.as_str(), request.start_point.as_str());
    let args = if request.checkout {
        ensure_no_operation_in_progress(mutation)?;
        let mut args = SWITCH_ARGS.to_vec();
        args.extend([
            CREATE_SWITCHING,
            name,
            NO_TRACK,
            END_OF_OPTIONS,
            start_point,
        ]);
        args
    } else {
        vec![BRANCH, NO_TRACK, END_OF_OPTIONS, name, start_point]
    };
    mutation.run(&args).await.map(drop)
}

/// git moves the branch's upstream configuration along with it.
pub async fn rename(mutation: &Mutation<'_>, request: &BranchRenameRequest) -> CoreResult<()> {
    let refs = mutation.refs().await?;
    let branch = local_branch(&refs, &request.ref_name)?;
    ensure_new_name(mutation, &refs, &request.new_name).await?;
    let args = [
        BRANCH,
        RENAME,
        END_OF_OPTIONS,
        &branch.name,
        request.new_name.as_str(),
    ];
    mutation.run(&args).await.map(drop)
}

pub async fn delete(mutation: &Mutation<'_>, target: &GitBranchDeleteTarget) -> CoreResult<()> {
    let refs = mutation.refs().await?;
    match target {
        GitBranchDeleteTarget::Local { ref_name, force } => {
            let branch = usable_local_branch(&refs, ref_name)?;
            if branch.is_current {
                return Err(CoreError::NotAllowed(
                    "The current branch cannot be deleted; switch to another branch first."
                        .to_string(),
                ));
            }
            let mode = if *force { DELETE_FORCED } else { DELETE_MERGED };
            let args = [BRANCH, mode, END_OF_OPTIONS, &branch.name];
            mutation.run(&args).await.map(drop)
        }
        GitBranchDeleteTarget::Remote { remote_ref_name } => {
            delete_on_remote(mutation, remote_branch(&refs, remote_ref_name)?).await
        }
    }
}

/// git also drops the remote-tracking branch once the remote deleted the branch.
async fn delete_on_remote(mutation: &Mutation<'_>, branch: &GitRemoteBranch) -> CoreResult<()> {
    let on_remote = format!("{LOCAL_BRANCHES_PREFIX}{}", branch.branch_name);
    let mut args = PUSH_DELETE_ARGS.to_vec();
    args.extend([END_OF_OPTIONS, &branch.remote, &on_remote]);
    mutation.run_network(&args).await.map(drop)
}

pub async fn set_upstream(mutation: &Mutation<'_>, request: &SetUpstreamRequest) -> CoreResult<()> {
    let refs = mutation.refs().await?;
    let branch = local_branch(&refs, &request.ref_name)?;
    let option = match &request.upstream {
        Some(upstream) => {
            let upstream = remote_branch(&refs, upstream)?;
            format!("{SET_UPSTREAM_OPTION}{}", upstream.ref_name)
        }
        None => UNSET_UPSTREAM.to_string(),
    };
    let args = [BRANCH, &option, END_OF_OPTIONS, &branch.name];
    mutation.run(&args).await.map(drop)
}

pub(super) fn local_branch<'refs>(
    refs: &'refs GitRefs,
    ref_name: &FullRefName,
) -> CoreResult<&'refs GitLocalBranch> {
    refs.local_branches
        .iter()
        .find(|branch| branch.ref_name == ref_name.as_str())
        .ok_or_else(|| CoreError::NotFound(format!("There is no local branch {ref_name}.")))
}

/// A local branch this worktree may switch to or delete.
fn usable_local_branch<'refs>(
    refs: &'refs GitRefs,
    ref_name: &FullRefName,
) -> CoreResult<&'refs GitLocalBranch> {
    let branch = local_branch(refs, ref_name)?;
    if branch.checked_out_in_other_worktree.is_some() {
        return Err(refused(ErrorCode::BranchCheckedOutElsewhere));
    }
    Ok(branch)
}

fn remote_branch<'refs>(
    refs: &'refs GitRefs,
    ref_name: &FullRefName,
) -> CoreResult<&'refs GitRemoteBranch> {
    refs.remote_branches
        .iter()
        .find(|branch| branch.ref_name == ref_name.as_str())
        .ok_or_else(|| CoreError::NotFound(format!("There is no remote branch {ref_name}.")))
}

pub(super) fn ensure_no_operation_in_progress(mutation: &Mutation<'_>) -> CoreResult<()> {
    match mutation.operation_in_progress() {
        Some(_) => Err(refused(ErrorCode::OperationInProgress)),
        None => Ok(()),
    }
}

/// Unused among the local branches, and accepted by git's own `check-ref-format`.
async fn ensure_new_name(
    mutation: &Mutation<'_>,
    refs: &GitRefs,
    name: &BranchName,
) -> CoreResult<()> {
    if refs
        .local_branches
        .iter()
        .any(|branch| branch.name == name.as_str())
    {
        return Err(refused(ErrorCode::BranchExists));
    }
    let full_name = format!("{LOCAL_BRANCHES_PREFIX}{name}");
    let reads = mutation.reads();
    let checked = reads
        .run_raw(&[CHECK_REF_FORMAT, &full_name], QUERY_LIMITS)
        .await?;
    if checked.exit_code != 0 {
        return Err(CoreError::BadRequest(format!(
            "git does not accept {name:?} as a branch name."
        )));
    }
    Ok(())
}

async fn ensure_commit(mutation: &Mutation<'_>, start_point: &CommitSha) -> CoreResult<()> {
    let revision = Revision::try_from(start_point.as_str())
        .map_err(|error| CoreError::Internal(error.to_string()))?;
    resolve_commit(mutation.reads(), &revision).await.map(drop)
}
