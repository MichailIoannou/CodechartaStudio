use std::path::Path;

use codecharta_core::Core;
use codecharta_core_api::methods::store::{StoreChangeRoot, StoreGetStatus};
use serde_json::Value;

use super::dispatch::{HandlerFuture, RequestContext, domain_error, read_params, write_result};

pub fn status(core: &Core, _context: RequestContext, params: Value) -> HandlerFuture<'_> {
    Box::pin(async move {
        read_params::<StoreGetStatus>(params)?;
        write_result::<StoreGetStatus>(core.store_status().map_err(domain_error)?)
    })
}

pub fn change_root(core: &Core, _context: RequestContext, params: Value) -> HandlerFuture<'_> {
    Box::pin(async move {
        let params = read_params::<StoreChangeRoot>(params)?;
        let change = core.change_store_root(Path::new(&params.path)).await;
        write_result::<StoreChangeRoot>(change.map_err(domain_error)?)
    })
}
