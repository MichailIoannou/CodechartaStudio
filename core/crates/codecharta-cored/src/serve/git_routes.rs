use codecharta_core::git::branch::{BranchCreateRequest, BranchRenameRequest, SetUpstreamRequest};
use codecharta_core::git::commit::CommitRequest;
use codecharta_core::git::details::ChangedFilesRequest;
use codecharta_core::git::log::LogRequest;
use codecharta_core::git::operation::OperationContext;
use codecharta_core::git::parse::progress::ProgressUpdate;
use codecharta_core::git::query::check_candidate_count;
use codecharta_core::git::sync::PushRequest;
use codecharta_core::{Core, CoreResult};
use codecharta_core_api::events::ProgressParams;
use codecharta_core_api::methods::git::{
    GitAbortOperationMethod, GitBranchCreateMethod, GitBranchDeleteMethod, GitBranchRenameMethod,
    GitBranchesMethod, GitChangedFilesMethod, GitCommitDetailsMethod, GitCommitDistances,
    GitCommitMethod, GitDiffFileMethod, GitDiscardMethod, GitFetchMethod, GitIsAncestorMethod,
    GitLogMethod, GitMeasureDistancesMethod, GitMergeBaseMethod, GitPullMethod, GitPushMethod,
    GitRefsAtMethod, GitRefsFingerprintMethod, GitRepositoryInfoMethod, GitResolveCommitMethod,
    GitRevListCountMethod, GitSetUpstreamMethod, GitStageMethod, GitStatusMethod, GitSwitchMethod,
    GitUnstageMethod, GitWorkingTreeMethod, RepositoryChanged, RepositoryChangedEvent,
};
use codecharta_core_api::registry::{Event, Method};
use serde_json::Value;
use tokio::sync::broadcast;

use super::dispatch::{
    DispatchResult, HandlerFuture, Notifier, RequestContext, domain_error, read_params,
    write_result,
};

fn answer<M: Method>(result: CoreResult<M::Result>) -> DispatchResult {
    write_result::<M>(result.map_err(domain_error)?)
}

/// A handler for a method whose params name a project folder as `repo`: the folder is resolved through
/// the store, then `$call` runs with the core's git service, the folder, the params and the request's
/// cancellation token.
macro_rules! folder_route {
    ($handler:ident, $method:ty, |$git:ident, $folder:ident, $params:ident, $cancel:ident| $call:expr) => {
        pub fn $handler(core: &Core, context: RequestContext, params: Value) -> HandlerFuture<'_> {
            Box::pin(async move {
                let $params = read_params::<$method>(params)?;
                let result = async {
                    let $folder = core.git_folder(&$params.repo)?;
                    let $git = core.git()?;
                    let $cancel = &context.cancel;
                    $call.await
                };
                answer::<$method>(result.await)
            })
        }
    };
}

folder_route!(
    repository_info,
    GitRepositoryInfoMethod,
    |git, folder, _params, cancel| git.repository_info(&folder, cancel)
);

folder_route!(status, GitStatusMethod, |git, folder, _params, cancel| git
    .status(&folder, cancel));

folder_route!(
    branches,
    GitBranchesMethod,
    |git, folder, _params, cancel| git.refs(&folder, cancel)
);

folder_route!(
    refs_fingerprint,
    GitRefsFingerprintMethod,
    |git, folder, _params, cancel| git.refs_fingerprint(&folder, cancel)
);

folder_route!(log, GitLogMethod, |git, folder, params, cancel| git.log(
    &folder,
    &LogRequest::from(params.clone()),
    cancel
));

folder_route!(
    commit_details,
    GitCommitDetailsMethod,
    |git, folder, params, cancel| git.commit_details(&folder, &params.sha, cancel)
);

folder_route!(
    resolve_commit,
    GitResolveCommitMethod,
    |git, folder, params, cancel| git.resolve_commit(&folder, &params.revision, cancel)
);

folder_route!(
    rev_list_count,
    GitRevListCountMethod,
    |git, folder, params, cancel| git.rev_list_count(&folder, &params.from, &params.to, cancel)
);

folder_route!(
    merge_base,
    GitMergeBaseMethod,
    |git, folder, params, cancel| git.merge_base(&folder, &params.left, &params.right, cancel)
);

folder_route!(
    is_ancestor,
    GitIsAncestorMethod,
    |git, folder, params, cancel| git.is_ancestor(
        &folder,
        &params.ancestor,
        &params.descendant,
        cancel
    )
);

/// Too many candidates are refused before the store is read.
pub fn measure_distances(core: &Core, context: RequestContext, params: Value) -> HandlerFuture<'_> {
    Box::pin(async move {
        let params = read_params::<GitMeasureDistancesMethod>(params)?;
        let distances = async {
            check_candidate_count(&params.candidates)?;
            let folder = core.git_folder(&params.repo)?;
            let git = core.git()?;
            let distances = git
                .measure_distances(&folder, &params.target, &params.candidates, &context.cancel)
                .await?;
            Ok(GitCommitDistances { distances })
        };
        answer::<GitMeasureDistancesMethod>(distances.await)
    })
}

folder_route!(refs_at, GitRefsAtMethod, |git, folder, params, cancel| git
    .refs_at(&folder, &params.sha, cancel));

folder_route!(
    changed_files,
    GitChangedFilesMethod,
    |git, folder, params, cancel| git.changed_files(
        &folder,
        &ChangedFilesRequest {
            from: params.from.clone(),
            to: params.to.clone(),
            mode: params.mode,
        },
        cancel
    )
);

folder_route!(
    working_tree,
    GitWorkingTreeMethod,
    |git, folder, _params, cancel| git.working_tree(&folder, cancel)
);

folder_route!(
    diff_file,
    GitDiffFileMethod,
    |git, folder, params, cancel| git.diff_file(&folder, &params.path, params.kind, cancel)
);

/// git's progress as `core.progress` notifications of the request.
pub(super) fn progress_of(
    context: &RequestContext,
) -> impl Fn(ProgressUpdate) + Send + Sync + use<> {
    let notifier = context.notifier.clone();
    let request_id = context.id.clone();
    move |update: ProgressUpdate| {
        notifier.progress(ProgressParams {
            request_id: request_id.clone(),
            message: update.message,
            done: update.done,
            total: update.total,
        });
    }
}

/// A handler for a mutating method: like `folder_route`, but `$call` gets the request's operation
/// context, whose prompts name the request and whose progress becomes `core.progress`.
macro_rules! operation_route {
    ($handler:ident, $method:ty, |$git:ident, $folder:ident, $params:ident, $operation:ident| $call:expr) => {
        pub fn $handler(core: &Core, context: RequestContext, params: Value) -> HandlerFuture<'_> {
            Box::pin(async move {
                let $params = read_params::<$method>(params)?;
                let report = progress_of(&context);
                let result = async {
                    let $folder = core.git_folder(&$params.repo)?;
                    let $git = core.git()?;
                    let $operation = &OperationContext {
                        cancel: &context.cancel,
                        request_id: Some(context.id.clone()),
                        progress: &report,
                    };
                    $call.await
                };
                answer::<$method>(result.await)
            })
        }
    };
}

operation_route!(fetch, GitFetchMethod, |git, folder, params, operation| git
    .fetch(&folder, params.prune, operation));

operation_route!(switch, GitSwitchMethod, |git, folder, params, operation| {
    git.switch(&folder, &params.target, operation)
});

operation_route!(
    branch_create,
    GitBranchCreateMethod,
    |git, folder, params, operation| git.branch_create(
        &folder,
        &BranchCreateRequest::from(params.clone()),
        operation
    )
);

operation_route!(
    branch_rename,
    GitBranchRenameMethod,
    |git, folder, params, operation| git.branch_rename(
        &folder,
        &BranchRenameRequest::from(params.clone()),
        operation
    )
);

operation_route!(
    branch_delete,
    GitBranchDeleteMethod,
    |git, folder, params, operation| git.branch_delete(&folder, &params.target, operation)
);

operation_route!(
    set_upstream,
    GitSetUpstreamMethod,
    |git, folder, params, operation| git.set_upstream(
        &folder,
        &SetUpstreamRequest::from(params.clone()),
        operation
    )
);

operation_route!(stage, GitStageMethod, |git, folder, params, operation| git
    .stage(&folder, &params.target, operation));

operation_route!(
    unstage,
    GitUnstageMethod,
    |git, folder, params, operation| git.unstage(&folder, &params.paths, operation)
);

operation_route!(
    discard,
    GitDiscardMethod,
    |git, folder, params, operation| git.discard(&folder, &params.entries, operation)
);

operation_route!(commit, GitCommitMethod, |git, folder, params, operation| {
    git.commit(&folder, CommitRequest::from(params.clone()), operation)
});

operation_route!(pull, GitPullMethod, |git, folder, params, operation| git
    .pull(&folder, params.mode, operation));

operation_route!(push, GitPushMethod, |git, folder, params, operation| git
    .push(&folder, &PushRequest::from(params.clone()), operation));

operation_route!(
    abort_operation,
    GitAbortOperationMethod,
    |git, folder, params, operation| git.abort_operation(&folder, params.operation, operation)
);

/// Sends every repository change the core announces as a `repository.changed` notification.
pub async fn forward_repository_changes(
    mut changes: broadcast::Receiver<RepositoryChanged>,
    notifier: Notifier,
) {
    loop {
        match changes.recv().await {
            Ok(changed) => notifier.emit(RepositoryChangedEvent::NAME, &changed),
            Err(broadcast::error::RecvError::Lagged(missed)) => {
                tracing::warn!("missed {missed} repository change notifications");
            }
            Err(broadcast::error::RecvError::Closed) => return,
        }
    }
}
