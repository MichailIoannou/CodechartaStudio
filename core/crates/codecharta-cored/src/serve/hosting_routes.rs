use codecharta_core::hosting::hosting_status;
use codecharta_core::{Core, CoreResult};
use codecharta_core_api::methods::hosting::{
    HostingStatus, HostingStatusMethod, HostingStatusParams,
};
use serde_json::Value;
use tokio_util::sync::CancellationToken;

use super::dispatch::{HandlerFuture, RequestContext, domain_error, read_params, write_result};

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
