#[cfg(not(feature = "test-methods"))]
pub const ROUTES: &[super::dispatch::Route] = &[];

#[cfg(feature = "test-methods")]
pub use enabled::ROUTES;

/// Methods that only the protocol tests need. They are compiled in only with the `test-methods`
/// feature, are not part of the registry, and therefore never reach the generated contract.
#[cfg(feature = "test-methods")]
mod enabled {
    use std::time::Duration;

    use codecharta_core::git::GitCli;
    use codecharta_core::git::command::{GitCommand, Limits};
    use codecharta_core::prompt::SessionRequest;
    use codecharta_core::{Core, CoreError};
    use codecharta_core_api::events::ProgressParams;
    use serde::Deserialize;
    use serde_json::Value;

    use super::super::dispatch::{HandlerFuture, RequestContext, Route, domain_error};

    pub const ROUTES: &[Route] = &[
        Route {
            name: "core.sleep",
            handler: sleep,
        },
        Route {
            name: "core.credentialFill",
            handler: credential_fill,
        },
    ];

    const CREDENTIAL_LIMITS: Limits = Limits {
        timeout: Duration::from_secs(60),
        max_stdout_bytes: 64 * 1024,
    };
    const CREDENTIAL_ARGS: [&str; 4] = ["-c", "credential.helper=", "credential", "fill"];
    const CREDENTIAL_REQUEST: &str = "protocol=https\nhost=example.test\n\n";

    /// A network git command that asks for a user name and a password through the core's prompts, without
    /// any network: what fetch, pull and push will do from M8 on.
    fn credential_fill(core: &Core, context: RequestContext, _params: Value) -> HandlerFuture<'_> {
        Box::pin(async move {
            let request = SessionRequest {
                request_id: Some(context.id.clone()),
                repository_label: Some("credential test".to_string()),
            };
            let session = core.prompts().open_session(request).map_err(domain_error)?;
            let command = GitCommand::network(
                core.data_dir(),
                &CREDENTIAL_ARGS,
                CREDENTIAL_LIMITS,
                session.askpass().cloned(),
            )
            .with_stdin(CREDENTIAL_REQUEST.to_string());
            let filled = GitCli::new(core.tools(), core.data_dir())
                .run(&command, &context.cancel)
                .await;
            let filled = session.settle(filled).map_err(domain_error)?;
            Ok(Value::String(filled))
        })
    }

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
