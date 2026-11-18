use codecharta_core::{Core, CoreResult};
use codecharta_core_api::methods::git::{
    GitBranchesMethod, GitRefsFingerprintMethod, GitRepositoryInfoMethod, GitStatusMethod,
    RepositoryChanged, RepositoryChangedEvent,
};
use codecharta_core_api::registry::{Event, Method};
use serde_json::Value;
use tokio::sync::broadcast;

use super::dispatch::{
    DispatchResult, HandlerFuture, Notifier, RequestContext, domain_error, read_params,
    write_result,
};

fn answer<M: Method>(result: CoreResult<M::Result>) -> DispatchResult {
    write_result::<M>(result.map_err(domain_error)?)
}

/// A handler for a method whose params name a project folder as `repo`: the folder is resolved through
/// the store, then `$call` runs with the core's git service, the folder, the params and the request's
/// cancellation token.
macro_rules! folder_route {
    ($handler:ident, $method:ty, |$git:ident, $folder:ident, $params:ident, $cancel:ident| $call:expr) => {
        pub fn $handler(core: &Core, context: RequestContext, params: Value) -> HandlerFuture<'_> {
            Box::pin(async move {
                let $params = read_params::<$method>(params)?;
                let result = async {
                    let $folder = core.git_folder(&$params.repo)?;
                    let $git = core.git()?;
                    let $cancel = &context.cancel;
                    $call.await
                };
                answer::<$method>(result.await)
            })
        }
    };
}

folder_route!(
    repository_info,
    GitRepositoryInfoMethod,
    |git, folder, _params, cancel| git.repository_info(&folder, cancel)
);

folder_route!(status, GitStatusMethod, |git, folder, _params, cancel| git
    .status(&folder, cancel));

folder_route!(
    branches,
    GitBranchesMethod,
    |git, folder, _params, cancel| git.refs(&folder, cancel)
);

folder_route!(
    refs_fingerprint,
    GitRefsFingerprintMethod,
    |git, folder, _params, cancel| git.refs_fingerprint(&folder, cancel)
);

/// Sends every repository change the core announces as a `repository.changed` notification.
pub async fn forward_repository_changes(
    mut changes: broadcast::Receiver<RepositoryChanged>,
    notifier: Notifier,
) {
    loop {
        match changes.recv().await {
            Ok(changed) => notifier.emit(RepositoryChangedEvent::NAME, &changed),
            Err(broadcast::error::RecvError::Lagged(missed)) => {
                tracing::warn!("missed {missed} repository change notifications");
            }
            Err(broadcast::error::RecvError::Closed) => return,
        }
    }
}
