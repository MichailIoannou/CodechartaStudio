use codecharta_core::compare::compared_folder;
use codecharta_core::git::operation::OperationContext;
use codecharta_core::hosting::{
    fetch_change_request_head as fetch_head, hosting_status, remove_fetched_refs as remove_refs,
};
use codecharta_core::{Core, CoreResult};
use codecharta_core_api::methods::hosting::{
    FetchChangeRequestHeadParams, FetchedHead, HostingFetchChangeRequestHead,
    HostingRemoveFetchedRefs, HostingStatus, HostingStatusMethod, HostingStatusParams,
    RemoveFetchedRefsParams, RemovedRefs,
};
use serde_json::Value;
use tokio_util::sync::CancellationToken;

use super::dispatch::{HandlerFuture, RequestContext, domain_error, read_params, write_result};
use super::git_routes::progress_of;

pub fn status(core: &Core, context: RequestContext, params: Value) -> HandlerFuture<'_> {
    Box::pin(async move {
        let params = read_params::<HostingStatusMethod>(params)?;
        let status = status_in_store(core, &params, &context.cancel).await;
        write_result::<HostingStatusMethod>(status.map_err(domain_error)?)
    })
}

async fn status_in_store(
    core: &Core,
    params: &HostingStatusParams,
    cancel: &CancellationToken,
) -> CoreResult<HostingStatus> {
    hosting_status(&core.projects()?, &core.git()?, &params.folder, cancel).await
}

/// A mutating request: its credential prompts name the request and git's progress becomes
/// `core.progress`.
pub fn fetch_change_request_head(
    core: &Core,
    context: RequestContext,
    params: Value,
) -> HandlerFuture<'_> {
    Box::pin(async move {
        let params = read_params::<HostingFetchChangeRequestHead>(params)?;
        let fetched = fetch_in_store(core, &context, &params).await;
        write_result::<HostingFetchChangeRequestHead>(fetched.map_err(domain_error)?)
    })
}

async fn fetch_in_store(
    core: &Core,
    context: &RequestContext,
    params: &FetchChangeRequestHeadParams,
) -> CoreResult<FetchedHead> {
    let folder = compared_folder(&core.projects()?, &params.folder)?;
    let report = progress_of(context);
    let operation = OperationContext {
        cancel: &context.cancel,
        request_id: Some(context.id.clone()),
        progress: &report,
    };
    fetch_head(&core.git()?, &folder, params, &operation).await
}

/// A mutating request through the folder's operation queue.
pub fn remove_fetched_refs(
    core: &Core,
    context: RequestContext,
    params: Value,
) -> HandlerFuture<'_> {
    Box::pin(async move {
        let params = read_params::<HostingRemoveFetchedRefs>(params)?;
        let removed = remove_in_store(core, &context, &params).await;
        write_result::<HostingRemoveFetchedRefs>(removed.map_err(domain_error)?)
    })
}

async fn remove_in_store(
    core: &Core,
    context: &RequestContext,
    params: &RemoveFetchedRefsParams,
) -> CoreResult<RemovedRefs> {
    let folder = compared_folder(&core.projects()?, &params.folder)?;
    let report = progress_of(context);
    let operation = OperationContext {
        cancel: &context.cancel,
        request_id: Some(context.id.clone()),
        progress: &report,
    };
    remove_refs(&core.git()?, &folder, &operation).await
}
