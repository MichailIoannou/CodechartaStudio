use std::collections::HashMap;
use std::sync::{Arc, Mutex, PoisonError};
use std::time::Duration;

use codecharta_core::{Core, CoreError};
use codecharta_core_api::error::{ErrorCode, ErrorPayload};
use codecharta_core_api::methods::core::{CancelParams, CoreCancel, CoreHello, CoreShutdown};
use codecharta_core_api::protocol::{
    INVALID_REQUEST, Notification, PARSE_ERROR, Request, RequestId, Response, ResponseError,
};
use codecharta_core_api::registry::{Event, Method};
use serde_json::Value;
use tokio_util::sync::CancellationToken;
use tokio_util::task::TaskTracker;

use super::dispatch::{DispatchResult, Notifier, RequestContext, dispatch, domain_error};
use super::framing::Frame;
use super::output::OutputLines;

pub const SHUTDOWN_GRACE: Duration = Duration::from_secs(5);

#[derive(Debug, PartialEq, Eq)]
pub enum Flow {
    Continue,
    Stop,
}

type InFlight = Arc<Mutex<HashMap<RequestId, CancellationToken>>>;

pub struct Session {
    core: Arc<Core>,
    output: OutputLines,
    in_flight: InFlight,
    tasks: TaskTracker,
    is_greeted: bool,
}

impl Session {
    pub fn new(core: Arc<Core>, output: OutputLines) -> Self {
        Self {
            core,
            output,
            in_flight: Arc::default(),
            tasks: TaskTracker::new(),
            is_greeted: false,
        }
    }

    pub async fn handle_frame(&mut self, frame: Frame) -> Flow {
        match frame {
            Frame::TooLong => self.reply_framing_fault(
                None,
                INVALID_REQUEST,
                "The message exceeds the maximum line length.",
            ),
            Frame::Line(bytes) => return self.handle_line(&bytes).await,
        }
        Flow::Continue
    }

    async fn handle_line(&mut self, bytes: &[u8]) -> Flow {
        if bytes.trim_ascii().is_empty() {
            return Flow::Continue;
        }
        match serde_json::from_slice::<Value>(bytes) {
            Ok(message) if message.get("id").is_some() => self.handle_request_value(message).await,
            Ok(message) => {
                self.handle_notification_value(message);
                Flow::Continue
            }
            Err(_) => {
                self.reply_framing_fault(None, PARSE_ERROR, "The message is not valid JSON.");
                Flow::Continue
            }
        }
    }

    async fn handle_request_value(&mut self, message: Value) -> Flow {
        let id = message
            .get("id")
            .cloned()
            .and_then(|id| serde_json::from_value::<RequestId>(id).ok());
        match serde_json::from_value::<Request>(message) {
            Ok(request) => self.handle_request(request).await,
            Err(error) => {
                self.reply_framing_fault(
                    id,
                    INVALID_REQUEST,
                    &format!("The request is malformed: {error}"),
                );
                Flow::Continue
            }
        }
    }

    async fn handle_request(&mut self, request: Request) -> Flow {
        tracing::debug!(method = %request.method, "request");
        if !self.is_greeted && request.method != CoreHello::NAME {
            let refusal = ErrorPayload::new(
                ErrorCode::BadRequest,
                format!("{} must be the first request.", CoreHello::NAME),
            );
            self.reply(request.id, Err(ResponseError::domain(refusal)));
            return Flow::Continue;
        }
        match request.method.as_str() {
            CoreHello::NAME => self.handle_hello(request).await,
            CoreShutdown::NAME => return self.handle_shutdown(request).await,
            _ => self.spawn_request(request),
        }
        Flow::Continue
    }

    async fn handle_hello(&mut self, request: Request) {
        let result = self.dispatch_inline(&request).await;
        self.is_greeted = self.is_greeted || result.is_ok();
        self.reply(request.id, result);
    }

    async fn handle_shutdown(&mut self, request: Request) -> Flow {
        let result = self.dispatch_inline(&request).await;
        let flow = if result.is_ok() {
            Flow::Stop
        } else {
            Flow::Continue
        };
        self.reply(request.id, result);
        flow
    }

    async fn dispatch_inline(&self, request: &Request) -> DispatchResult {
        let context = self.context_for(request.id.clone(), CancellationToken::new());
        dispatch(&self.core, context, &request.method, request.params.clone()).await
    }

    fn spawn_request(&mut self, request: Request) {
        let cancel = CancellationToken::new();
        if !self.try_register(&request.id, &cancel) {
            self.reply_framing_fault(
                Some(request.id),
                INVALID_REQUEST,
                "A request with this id is still running.",
            );
            return;
        }
        let context = self.context_for(request.id.clone(), cancel);
        let core = Arc::clone(&self.core);
        let output = self.output.clone();
        let in_flight = Arc::clone(&self.in_flight);
        self.tasks.spawn(async move {
            let id = request.id.clone();
            let handler = tokio::spawn(async move {
                dispatch(&core, context, &request.method, request.params).await
            });
            let result = handler
                .await
                .unwrap_or_else(|failure| Err(panicked(&failure)));
            lock(&in_flight).remove(&id);
            output.send(&to_response(id, result));
        });
    }

    fn try_register(&self, id: &RequestId, cancel: &CancellationToken) -> bool {
        let mut in_flight = lock(&self.in_flight);
        if in_flight.contains_key(id) {
            return false;
        }
        in_flight.insert(id.clone(), cancel.clone());
        true
    }

    fn handle_notification_value(&self, message: Value) {
        match serde_json::from_value::<Notification>(message) {
            Ok(notification) if notification.method == CoreCancel::NAME => {
                self.cancel(notification.params)
            }
            Ok(notification) => {
                tracing::warn!(method = %notification.method, "ignored an unknown notification")
            }
            Err(_) => self.reply_framing_fault(
                None,
                INVALID_REQUEST,
                "The message is neither a request nor a notification.",
            ),
        }
    }

    fn cancel(&self, params: Value) {
        match serde_json::from_value::<CancelParams>(params) {
            Ok(CancelParams { id }) => {
                if let Some(token) = lock(&self.in_flight).get(&id) {
                    token.cancel();
                }
            }
            Err(error) => tracing::warn!("ignored a malformed {}: {error}", CoreCancel::NAME),
        }
    }

    /// Cancels everything still running and waits a bounded time for the answers to be written.
    pub async fn finish(self) {
        lock(&self.in_flight)
            .values()
            .for_each(CancellationToken::cancel);
        self.tasks.close();
        if tokio::time::timeout(SHUTDOWN_GRACE, self.tasks.wait())
            .await
            .is_err()
        {
            tracing::warn!("requests were still running at shutdown");
        }
    }

    fn context_for(&self, id: RequestId, cancel: CancellationToken) -> RequestContext {
        RequestContext {
            id,
            cancel,
            notifier: Notifier::new(self.output.clone()),
        }
    }

    fn reply(&self, id: RequestId, result: DispatchResult) {
        self.output.send(&to_response(id, result));
    }

    fn reply_framing_fault(&self, id: Option<RequestId>, code: i32, message: &str) {
        let error = ResponseError::framing(code, ErrorCode::BadRequest, message);
        self.output.send(&Response::failure(id, error));
    }
}

fn to_response(id: RequestId, result: DispatchResult) -> Response {
    match result {
        Ok(value) => Response::success(id, value),
        Err(error) => Response::failure(Some(id), error),
    }
}

fn panicked(failure: &tokio::task::JoinError) -> ResponseError {
    domain_error(CoreError::Internal(format!(
        "a request handler failed: {failure}"
    )))
}

fn lock(in_flight: &InFlight) -> std::sync::MutexGuard<'_, HashMap<RequestId, CancellationToken>> {
    in_flight.lock().unwrap_or_else(PoisonError::into_inner)
}
