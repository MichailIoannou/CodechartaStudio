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

pub fn repository_info(core: &Core, context: RequestContext, params: Value) -> HandlerFuture<'_> {
    Box::pin(async move {
        let params = read_params::<GitRepositoryInfoMethod>(params)?;
        let info = async {
            let folder = core.git_folder(&params.repo)?;
            core.git()?.repository_info(&folder, &context.cancel).await
        };
        answer::<GitRepositoryInfoMethod>(info.await)
    })
}

pub fn status(core: &Core, context: RequestContext, params: Value) -> HandlerFuture<'_> {
    Box::pin(async move {
        let params = read_params::<GitStatusMethod>(params)?;
        let status = async {
            let folder = core.git_folder(&params.repo)?;
            core.git()?.status(&folder, &context.cancel).await
        };
        answer::<GitStatusMethod>(status.await)
    })
}

pub fn branches(core: &Core, context: RequestContext, params: Value) -> HandlerFuture<'_> {
    Box::pin(async move {
        let params = read_params::<GitBranchesMethod>(params)?;
        let refs = async {
            let folder = core.git_folder(&params.repo)?;
            core.git()?.refs(&folder, &context.cancel).await
        };
        answer::<GitBranchesMethod>(refs.await)
    })
}

pub fn refs_fingerprint(core: &Core, context: RequestContext, params: Value) -> HandlerFuture<'_> {
    Box::pin(async move {
        let params = read_params::<GitRefsFingerprintMethod>(params)?;
        let fingerprint = async {
            let folder = core.git_folder(&params.repo)?;
            core.git()?.refs_fingerprint(&folder, &context.cancel).await
        };
        answer::<GitRefsFingerprintMethod>(fingerprint.await)
    })
}

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
