use std::path::PathBuf;

use codecharta_core::Core;
use codecharta_core_api::events::ProgressParams;
use codecharta_core_api::methods::tools::{ToolsClearPath, ToolsDoctor, ToolsSetPath};
use serde_json::Value;

use super::dispatch::{HandlerFuture, RequestContext, domain_error, read_params, write_result};

pub fn doctor(core: &Core, context: RequestContext, params: Value) -> HandlerFuture<'_> {
    Box::pin(async move {
        let params = read_params::<ToolsDoctor>(params)?;
        let report_progress = |done: u32, total: u32| {
            context.notifier.progress(ProgressParams {
                request_id: context.id.clone(),
                message: format!("Checked {done} of {total} tools"),
                done: Some(done),
                total: Some(total),
            });
        };
        let report = core
            .tools()
            .doctor(params.refresh, &context.cancel, &report_progress)
            .await;
        write_result::<ToolsDoctor>(report.map_err(domain_error)?)
    })
}

pub fn set_path(core: &Core, _context: RequestContext, params: Value) -> HandlerFuture<'_> {
    Box::pin(async move {
        let params = read_params::<ToolsSetPath>(params)?;
        let report = core
            .tools()
            .set_path(params.tool, PathBuf::from(params.path))
            .await;
        write_result::<ToolsSetPath>(report.map_err(domain_error)?)
    })
}

pub fn clear_path(core: &Core, _context: RequestContext, params: Value) -> HandlerFuture<'_> {
    Box::pin(async move {
        let params = read_params::<ToolsClearPath>(params)?;
        let report = core.tools().clear_path(params.tool).await;
        write_result::<ToolsClearPath>(report.map_err(domain_error)?)
    })
}
