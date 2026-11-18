use std::future::Future;
use std::path::Path;
use std::pin::Pin;

use codecharta_core::{CORE_VERSION, Core, CoreError, path_to_wire};
use codecharta_core_api::PROTOCOL_VERSION;
use codecharta_core_api::error::{ErrorCode, ErrorPayload};
use codecharta_core_api::events::{CoreProgress, ProgressParams};
use codecharta_core_api::methods::core::{
    CoreHello, CorePing, CoreShutdown, HelloResult, PingResult,
};
use codecharta_core_api::methods::paths::{PathsGet, PathsResetStoreRoot, PathsSetStoreRoot};
use codecharta_core_api::methods::shell::{ResolvePathResult, ShellResolvePath};
use codecharta_core_api::methods::store::StoreGetStatus;
use codecharta_core_api::methods::tools::{ToolsClearPath, ToolsDoctor, ToolsSetPath};
use codecharta_core_api::protocol::{
    INVALID_PARAMS, METHOD_NOT_FOUND, Notification, RequestId, ResponseError,
};
use codecharta_core_api::registry::{Event, Method};
use serde::Serialize;
use serde_json::Value;
use tokio_util::sync::CancellationToken;

use super::output::OutputLines;
use super::{store_routes, tools_routes};

pub type DispatchResult = Result<Value, ResponseError>;
pub type HandlerFuture<'core> = Pin<Box<dyn Future<Output = DispatchResult> + Send + 'core>>;
pub type Handler = for<'core> fn(&'core Core, RequestContext, Value) -> HandlerFuture<'core>;

pub struct Route {
    pub name: &'static str,
    pub handler: Handler,
}

const ROUTES: &[Route] = &[
    Route {
        name: CoreHello::NAME,
        handler: hello,
    },
    Route {
        name: CorePing::NAME,
        handler: ping,
    },
    Route {
        name: CoreShutdown::NAME,
        handler: shutdown,
    },
    Route {
        name: PathsGet::NAME,
        handler: paths_get,
    },
    Route {
        name: PathsSetStoreRoot::NAME,
        handler: paths_set_store_root,
    },
    Route {
        name: PathsResetStoreRoot::NAME,
        handler: paths_reset_store_root,
    },
    Route {
        name: ToolsDoctor::NAME,
        handler: tools_routes::doctor,
    },
    Route {
        name: ToolsSetPath::NAME,
        handler: tools_routes::set_path,
    },
    Route {
        name: ToolsClearPath::NAME,
        handler: tools_routes::clear_path,
    },
    Route {
        name: ShellResolvePath::NAME,
        handler: shell_resolve_path,
    },
    Route {
        name: StoreGetStatus::NAME,
        handler: store_routes::status,
    },
];

#[derive(Clone)]
pub struct Notifier {
    output: OutputLines,
}

impl Notifier {
    pub fn new(output: OutputLines) -> Self {
        Self { output }
    }

    pub fn progress(&self, params: ProgressParams) {
        self.emit(CoreProgress::NAME, &params);
    }

    pub fn emit<Payload: Serialize>(&self, method: &'static str, payload: &Payload) {
        match serde_json::to_value(payload) {
            Ok(params) => self.output.send(&Notification::new(method, params)),
            Err(error) => tracing::error!("could not serialise the {method} notification: {error}"),
        }
    }
}

pub struct RequestContext {
    pub id: RequestId,
    pub cancel: CancellationToken,
    pub notifier: Notifier,
}

pub async fn dispatch(
    core: &Core,
    context: RequestContext,
    method: &str,
    params: Value,
) -> DispatchResult {
    match find_route(method) {
        Some(route) => (route.handler)(core, context, params).await,
        None => Err(ResponseError::framing(
            METHOD_NOT_FOUND,
            ErrorCode::NotFound,
            format!("There is no method {method}."),
        )),
    }
}

fn find_route(method: &str) -> Option<&'static Route> {
    ROUTES
        .iter()
        .chain(super::test_methods::ROUTES)
        .find(|route| route.name == method)
}

pub fn read_params<M: Method>(params: Value) -> Result<M::Params, ResponseError> {
    let params = if params.is_null() {
        Value::Object(Default::default())
    } else {
        params
    };
    serde_json::from_value(params).map_err(|error| {
        ResponseError::framing(
            INVALID_PARAMS,
            ErrorCode::BadRequest,
            format!("Invalid params for {}: {error}", M::NAME),
        )
    })
}

pub fn write_result<M: Method>(result: M::Result) -> DispatchResult {
    serde_json::to_value(result).map_err(|error| {
        domain_error(CoreError::Internal(format!(
            "could not serialise the {} result: {error}",
            M::NAME
        )))
    })
}

pub fn domain_error(error: CoreError) -> ResponseError {
    if matches!(error, CoreError::Io { .. } | CoreError::Internal(_)) {
        tracing::error!("{error}");
    }
    ResponseError::domain(error.to_payload())
}

fn hello(core: &Core, _context: RequestContext, params: Value) -> HandlerFuture<'_> {
    Box::pin(async move {
        let params = read_params::<CoreHello>(params)?;
        if params.protocol_version != PROTOCOL_VERSION {
            return Err(protocol_mismatch(params.protocol_version));
        }
        let data_dir = path_to_wire(core.data_dir()).map_err(domain_error)?;
        write_result::<CoreHello>(HelloResult {
            core_version: CORE_VERSION.to_string(),
            protocol_version: PROTOCOL_VERSION,
            platform: core.platform(),
            data_dir,
        })
    })
}

fn protocol_mismatch(client_version: u32) -> ResponseError {
    let mut payload = ErrorPayload::new(
        ErrorCode::ProtocolMismatch,
        format!("The client speaks protocol {client_version}, the core speaks {PROTOCOL_VERSION}."),
    );
    payload
        .details
        .insert("coreProtocolVersion".to_string(), PROTOCOL_VERSION.into());
    payload
        .details
        .insert("clientProtocolVersion".to_string(), client_version.into());
    ResponseError::domain(payload)
}

fn ping(_core: &Core, _context: RequestContext, params: Value) -> HandlerFuture<'_> {
    Box::pin(async move {
        read_params::<CorePing>(params)?;
        write_result::<CorePing>(PingResult {
            core_version: CORE_VERSION.to_string(),
        })
    })
}

fn shutdown(_core: &Core, _context: RequestContext, params: Value) -> HandlerFuture<'_> {
    Box::pin(async move {
        read_params::<CoreShutdown>(params)?;
        write_result::<CoreShutdown>(())
    })
}

fn paths_get(core: &Core, _context: RequestContext, params: Value) -> HandlerFuture<'_> {
    Box::pin(async move {
        read_params::<PathsGet>(params)?;
        write_result::<PathsGet>(core.paths().info().map_err(domain_error)?)
    })
}

fn paths_set_store_root(core: &Core, _context: RequestContext, params: Value) -> HandlerFuture<'_> {
    Box::pin(async move {
        let params = read_params::<PathsSetStoreRoot>(params)?;
        let info = core.paths().set_store_root(Path::new(&params.path)).await;
        write_result::<PathsSetStoreRoot>(info.map_err(domain_error)?)
    })
}

fn paths_reset_store_root(
    core: &Core,
    _context: RequestContext,
    params: Value,
) -> HandlerFuture<'_> {
    Box::pin(async move {
        read_params::<PathsResetStoreRoot>(params)?;
        let info = core.paths().reset_store_root().await;
        write_result::<PathsResetStoreRoot>(info.map_err(domain_error)?)
    })
}

fn shell_resolve_path(core: &Core, _context: RequestContext, params: Value) -> HandlerFuture<'_> {
    Box::pin(async move {
        let params = read_params::<ShellResolvePath>(params)?;
        let resolved = core.paths().resolve(&params.target).map_err(domain_error)?;
        let path = path_to_wire(&resolved).map_err(domain_error)?;
        write_result::<ShellResolvePath>(ResolvePathResult { path })
    })
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeSet;

    use codecharta_core::CoreConfig;
    use codecharta_core_api::registry::METHODS;

    use super::*;

    fn test_core() -> Core {
        let missing_data_dir =
            std::env::temp_dir().join("codecharta-core-dispatch-test-never-written");
        Core::open(CoreConfig {
            data_dir: missing_data_dir,
        })
        .unwrap()
    }

    fn test_context() -> RequestContext {
        let (output, _writer) = super::super::output::spawn_writer(tokio::io::sink());
        RequestContext {
            id: RequestId::Number(1),
            cancel: CancellationToken::new(),
            notifier: Notifier::new(output),
        }
    }

    #[test]
    fn should_handle_exactly_the_registered_methods() {
        // Arrange
        let registered: BTreeSet<&str> = METHODS.iter().map(|spec| spec.name).collect();

        // Act
        let handled: BTreeSet<&str> = ROUTES.iter().map(|route| route.name).collect();

        // Assert
        assert_eq!(handled, registered);
    }

    #[tokio::test]
    async fn should_answer_an_unknown_method_with_method_not_found() {
        // Arrange
        let core = test_core();

        // Act
        let result = dispatch(&core, test_context(), "core.unknown", Value::Null).await;

        // Assert
        let error = result.unwrap_err();
        assert_eq!(error.code, METHOD_NOT_FOUND);
        assert_eq!(error.data.code, ErrorCode::NotFound);
    }

    #[tokio::test]
    async fn should_answer_invalid_params_with_bad_request() {
        // Arrange
        let core = test_core();

        // Act
        let result = dispatch(
            &core,
            test_context(),
            CorePing::NAME,
            serde_json::json!({ "extra": 1 }),
        )
        .await;

        // Assert
        let error = result.unwrap_err();
        assert_eq!(error.code, INVALID_PARAMS);
        assert_eq!(error.data.code, ErrorCode::BadRequest);
    }

    #[tokio::test]
    async fn should_accept_missing_params_as_empty() {
        // Arrange
        let core = test_core();

        // Act
        let result = dispatch(&core, test_context(), CorePing::NAME, Value::Null).await;

        // Assert
        assert_eq!(
            result.unwrap(),
            serde_json::json!({ "coreVersion": CORE_VERSION })
        );
    }
}
