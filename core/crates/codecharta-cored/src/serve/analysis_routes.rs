use std::sync::Arc;

use codecharta_core::analysis::queue::AnalysisEvent;
use codecharta_core::{Core, CoreResult};
use codecharta_core_api::methods::analysis::{
    AnalysisCancel, AnalysisCancelledEvent, AnalysisClearFinished, AnalysisEnqueue,
    AnalysisFailedEvent, AnalysisFinishedEvent, AnalysisJobChanged, AnalysisJobList, AnalysisList,
    AnalysisPreflight, AnalysisProgress, AnalysisProgressEvent, AnalysisQueuedEvent,
    AnalysisStartedEvent, SnapshotsChangedEvent,
};
use codecharta_core_api::registry::{Event, Method};
use serde_json::Value;
use tokio::sync::broadcast;
use tokio::task::JoinHandle;

use super::dispatch::{
    DispatchResult, HandlerFuture, Notifier, RequestContext, domain_error, read_params,
    write_result,
};
use super::session::SHUTDOWN_GRACE;

fn answer<M: Method>(result: CoreResult<M::Result>) -> DispatchResult {
    write_result::<M>(result.map_err(domain_error)?)
}

pub fn preflight(core: &Core, _context: RequestContext, params: Value) -> HandlerFuture<'_> {
    Box::pin(async move {
        let params = read_params::<AnalysisPreflight>(params)?;
        let checked = core
            .analyses()
            .preflight(&params.folder(), &params.target)
            .await;
        answer::<AnalysisPreflight>(checked)
    })
}

pub fn enqueue(core: &Core, _context: RequestContext, params: Value) -> HandlerFuture<'_> {
    Box::pin(async move {
        let params = read_params::<AnalysisEnqueue>(params)?;
        let enqueued = core
            .analyses()
            .enqueue(&params.folder(), params.target, params.force)
            .await;
        answer::<AnalysisEnqueue>(enqueued)
    })
}

pub fn cancel(core: &Core, _context: RequestContext, params: Value) -> HandlerFuture<'_> {
    Box::pin(async move {
        let params = read_params::<AnalysisCancel>(params)?;
        answer::<AnalysisCancel>(core.analyses().cancel(&params.job_id))
    })
}

pub fn list(core: &Core, _context: RequestContext, params: Value) -> HandlerFuture<'_> {
    Box::pin(async move {
        read_params::<AnalysisList>(params)?;
        let jobs = core.analyses().list();
        write_result::<AnalysisList>(AnalysisJobList { jobs })
    })
}

pub fn clear_finished(core: &Core, _context: RequestContext, params: Value) -> HandlerFuture<'_> {
    Box::pin(async move {
        read_params::<AnalysisClearFinished>(params)?;
        answer::<AnalysisClearFinished>(core.analyses().clear_finished())
    })
}

/// The queue's driver, the recovery after a crash and the notifications for the session.
pub struct AnalysisTasks {
    driver: JoinHandle<()>,
    recovery: JoinHandle<()>,
    forwarder: JoinHandle<()>,
}

impl AnalysisTasks {
    pub fn start(core: &Arc<Core>, notifier: Notifier) -> Self {
        let forwarder = tokio::spawn(forward_analysis_events(
            core.analysis_queue().subscribe(),
            notifier,
        ));
        let driving = Arc::clone(core);
        let recovering = Arc::clone(core);
        Self {
            driver: tokio::spawn(async move { driving.analyses().drive().await }),
            recovery: tokio::spawn(async move { recover(&recovering).await }),
            forwarder,
        }
    }

    /// Cancels every queued and running job and waits a bounded time for the running one to end.
    pub async fn stop(self, core: &Core) {
        core.analysis_queue().shutdown();
        for (name, task) in [("analysis queue", self.driver), ("recovery", self.recovery)] {
            if tokio::time::timeout(SHUTDOWN_GRACE, task).await.is_err() {
                tracing::warn!("the {name} was still running at shutdown");
            }
        }
        self.forwarder.abort();
        let _aborted = self.forwarder.await;
    }
}

async fn recover(core: &Core) {
    match core.analyses().recover().await {
        Ok(recovery) if recovery.cleaned > 0 || recovery.still_running > 0 => tracing::info!(
            "cleaned up after {} abandoned analyses, {} still running elsewhere",
            recovery.cleaned,
            recovery.still_running
        ),
        Ok(_) => {}
        Err(error) => tracing::warn!("could not clean up after abandoned analyses: {error}"),
    }
}

/// Sends every queue change as its `analysis.*` or `snapshots.changed` notification.
pub async fn forward_analysis_events(
    mut events: broadcast::Receiver<AnalysisEvent>,
    notifier: Notifier,
) {
    loop {
        match events.recv().await {
            Ok(event) => emit(&notifier, event),
            Err(broadcast::error::RecvError::Lagged(missed)) => {
                tracing::warn!("missed {missed} analysis notifications");
            }
            Err(broadcast::error::RecvError::Closed) => return,
        }
    }
}

fn emit(notifier: &Notifier, event: AnalysisEvent) {
    let job_event = |name: &'static str, job| notifier.emit(name, &AnalysisJobChanged { job });
    match event {
        AnalysisEvent::Queued(job) => job_event(AnalysisQueuedEvent::NAME, job),
        AnalysisEvent::Started(job) => job_event(AnalysisStartedEvent::NAME, job),
        AnalysisEvent::Finished(job) => job_event(AnalysisFinishedEvent::NAME, job),
        AnalysisEvent::Failed(job) => job_event(AnalysisFailedEvent::NAME, job),
        AnalysisEvent::Cancelled(job) => job_event(AnalysisCancelledEvent::NAME, job),
        AnalysisEvent::Progress { job_id, progress } => notifier.emit(
            AnalysisProgressEvent::NAME,
            &AnalysisProgress { job_id, progress },
        ),
        AnalysisEvent::SnapshotsChanged(folder) => {
            notifier.emit(SnapshotsChangedEvent::NAME, &folder)
        }
    }
}
