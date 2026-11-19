use codecharta_core::compare::{changed_files_in_project, resolve_in_project};
use codecharta_core::snapshots::FolderResolver;
use codecharta_core::{Core, CoreResult};
use codecharta_core_api::methods::compare::{
    ChangedFilesParams, ChangedFilesResult, CompareChangedFiles, CompareResolve,
    ResolveComparisonParams, ResolvedComparison,
};
use serde_json::Value;
use tokio_util::sync::CancellationToken;

use super::dispatch::{HandlerFuture, RequestContext, domain_error, read_params, write_result};

pub fn resolve(core: &Core, context: RequestContext, params: Value) -> HandlerFuture<'_> {
    Box::pin(async move {
        let params = read_params::<CompareResolve>(params)?;
        let resolved = resolve_in_store(core, &params, &context.cancel).await;
        write_result::<CompareResolve>(resolved.map_err(domain_error)?)
    })
}

async fn resolve_in_store(
    core: &Core,
    params: &ResolveComparisonParams,
    cancel: &CancellationToken,
) -> CoreResult<ResolvedComparison> {
    let resolver = FolderResolver {
        projects: &core.projects()?,
        snapshots: &core.snapshots()?,
        git: &core.git()?,
        cache: core.resolution_cache(),
    };
    resolve_in_project(&resolver, params, cancel).await
}

pub fn changed_files(core: &Core, context: RequestContext, params: Value) -> HandlerFuture<'_> {
    Box::pin(async move {
        let params = read_params::<CompareChangedFiles>(params)?;
        let listed = changed_files_in_store(core, &params, &context.cancel).await;
        write_result::<CompareChangedFiles>(listed.map_err(domain_error)?)
    })
}

async fn changed_files_in_store(
    core: &Core,
    params: &ChangedFilesParams,
    cancel: &CancellationToken,
) -> CoreResult<ChangedFilesResult> {
    changed_files_in_project(&core.projects()?, &core.git()?, params, cancel).await
}
