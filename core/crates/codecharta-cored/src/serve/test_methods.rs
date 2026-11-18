#[cfg(not(feature = "test-methods"))]
pub const ROUTES: &[super::dispatch::Route] = &[];

#[cfg(feature = "test-methods")]
pub use enabled::ROUTES;

/// Methods that only the protocol tests need. They are compiled in only with the `test-methods`
/// feature, are not part of the registry, and therefore never reach the generated contract.
#[cfg(feature = "test-methods")]
mod enabled {
    use std::time::Duration;

    use codecharta_core::{Core, CoreError};
    use codecharta_core_api::events::ProgressParams;
    use serde::Deserialize;
    use serde_json::Value;

    use super::super::dispatch::{HandlerFuture, RequestContext, Route, domain_error};

    pub const ROUTES: &[Route] = &[Route {
        name: "core.sleep",
        handler: sleep,
    }];

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase", deny_unknown_fields)]
    struct SleepParams {
        milliseconds: u64,
    }

    fn sleep(_core: &Core, context: RequestContext, params: Value) -> HandlerFuture<'_> {
        Box::pin(async move {
            let params: SleepParams = serde_json::from_value(params)
                .map_err(|error| domain_error(CoreError::BadRequest(error.to_string())))?;
            context.notifier.progress(ProgressParams {
                request_id: context.id.clone(),
                message: "Sleeping".to_string(),
                done: Some(0),
                total: Some(1),
            });
            tokio::select! {
                _ = tokio::time::sleep(Duration::from_millis(params.milliseconds)) => Ok(Value::Null),
                _ = context.cancel.cancelled() => Err(domain_error(CoreError::Cancelled)),
            }
        })
    }
}
