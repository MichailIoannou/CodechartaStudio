use std::sync::Arc;

use codecharta_core::Core;
use codecharta_core::git::askpass::{
    HelperLocation, HelperPlatform, SystemHelperFiles, askpass_helpers,
};
use codecharta_core::prompt::{AskpassServer, PromptEvent};
use codecharta_core_api::methods::prompt::{
    PromptAnswerMethod, PromptCancelMethod, PromptClosedEvent, PromptRequestedEvent,
};
use codecharta_core_api::registry::Event;
use serde_json::Value;
use tokio::sync::broadcast;

use super::dispatch::{
    HandlerFuture, Notifier, RequestContext, domain_error, read_params, write_result,
};

/// `prompt.answer` params are never logged: the session traces method names only, and a refused answer
/// is described without repeating it.
pub fn answer(core: &Core, _context: RequestContext, params: Value) -> HandlerFuture<'_> {
    Box::pin(async move {
        let params = read_params::<PromptAnswerMethod>(params)?;
        core.prompts()
            .answer(&params.prompt_id, params.answer)
            .map_err(domain_error)?;
        write_result::<PromptAnswerMethod>(())
    })
}

pub fn cancel(core: &Core, _context: RequestContext, params: Value) -> HandlerFuture<'_> {
    Box::pin(async move {
        let params = read_params::<PromptCancelMethod>(params)?;
        core.prompts()
            .cancel(&params.prompt_id)
            .map_err(domain_error)?;
        write_result::<PromptCancelMethod>(())
    })
}

/// Without the server nothing can prompt, and network git commands fail as they would without a
/// terminal; the rest of the core works.
pub fn start_askpass_server(core: &Core) -> Option<AskpassServer> {
    let executable = std::env::current_exe()
        .inspect_err(|error| tracing::warn!("credential prompts are unavailable: {error}"))
        .ok()?;
    let location = HelperLocation {
        executable: &executable,
        data_dir: core.data_dir(),
        platform: HelperPlatform::current(),
    };
    let helpers = askpass_helpers(&location, &SystemHelperFiles);
    AskpassServer::start(Arc::clone(core.prompts()), helpers)
        .inspect_err(|error| tracing::warn!("credential prompts are unavailable: {error}"))
        .ok()
}

/// Sends every prompt the broker opens or closes as `prompt.requested` / `prompt.closed`.
pub async fn forward_prompt_events(
    mut events: broadcast::Receiver<PromptEvent>,
    notifier: Notifier,
) {
    loop {
        match events.recv().await {
            Ok(PromptEvent::Requested(requested)) => {
                notifier.emit(PromptRequestedEvent::NAME, &requested)
            }
            Ok(PromptEvent::Closed(closed)) => notifier.emit(PromptClosedEvent::NAME, &closed),
            Err(broadcast::error::RecvError::Lagged(missed)) => {
                tracing::warn!("missed {missed} prompt notifications");
            }
            Err(broadcast::error::RecvError::Closed) => return,
        }
    }
}
