use codecharta_core::Core;
use codecharta_core_api::methods::store::StoreGetStatus;
use serde_json::Value;

use super::dispatch::{HandlerFuture, RequestContext, domain_error, read_params, write_result};

pub fn status(core: &Core, _context: RequestContext, params: Value) -> HandlerFuture<'_> {
    Box::pin(async move {
        read_params::<StoreGetStatus>(params)?;
        write_result::<StoreGetStatus>(core.store_status().map_err(domain_error)?)
    })
}
