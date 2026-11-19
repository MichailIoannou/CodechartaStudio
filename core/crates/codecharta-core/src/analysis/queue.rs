use std::future::Future;
use std::sync::{Mutex, MutexGuard, PoisonError};
use std::time::{Duration, Instant};

use codecharta_core_api::ids::{BatchId, JobId, SnapshotId};
use codecharta_core_api::methods::analysis::{AnalysisJob, AnalysisTarget, JobProgress, JobState};
use codecharta_core_api::methods::projects::FolderRef;
use codecharta_core_api::values::FullCommit;
use tokio::sync::{Notify, broadcast, mpsc};
use tokio_util::sync::CancellationToken;

use super::runner::RunHooks;
use super::service::{JobFailure, JobRequest};
use crate::error::{CoreError, CoreResult};
use crate::git::progress::ProgressThrottle;
use crate::ids::{commit_snapshot_id, new_job_id};
use crate::timestamps;

/// Finished jobs stay listed until they are cleared; only the newest ones are kept.
pub const MAX_FINISHED_JOBS: usize = 100;
/// At most one progress notification per job in this interval; the job always holds the latest.
pub const PROGRESS_INTERVAL: Duration = Duration::from_millis(250);
const EVENT_CAPACITY: usize = 1024;

/// Every change of the queue, for the serving core to send as notifications.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AnalysisEvent {
    Queued(AnalysisJob),
    Started(AnalysisJob),
    Progress {
        job_id: JobId,
        progress: JobProgress,
    },
    Finished(AnalysisJob),
    Failed(AnalysisJob),
    Cancelled(AnalysisJob),
    SnapshotsChanged(FolderRef),
}

/// A job to queue; one without a batch is a direct user action and runs before queued batch jobs.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NewJob {
    pub folder: FolderRef,
    pub target: AnalysisTarget,
    pub profile_hash: String,
    pub batch_id: Option<BatchId>,
    pub force: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EnqueueOutcome {
    Queued(AnalysisJob),
    AlreadyQueued(AnalysisJob),
    AlreadyAnalysed(SnapshotId),
}

/// Runs one job; the queue owns ordering, state and notifications.
pub trait JobExecutor: Send + Sync {
    fn execute(
        &self,
        job: &JobRequest,
        hooks: &RunHooks,
        cancel: &CancellationToken,
    ) -> impl Future<Output = Result<SnapshotId, JobFailure>> + Send;
}

struct Entry {
    job: AnalysisJob,
    force: bool,
    cancel: CancellationToken,
    finished_order: u64,
}

impl Entry {
    fn is_active(&self) -> bool {
        !self.job.state.is_finished()
    }

    fn has_key_of(&self, job: &NewJob) -> bool {
        self.job.project_id == job.folder.project_id
            && self.job.folder_id == job.folder.folder_id
            && self.job.target == job.target
            && self.job.profile_hash == job.profile_hash
    }

    fn request(&self) -> JobRequest {
        JobRequest {
            id: self.job.id.clone(),
            folder: self.job.folder(),
            target: self.job.target.clone(),
            force: self.force,
        }
    }
}

#[derive(Default)]
struct QueueState {
    entries: Vec<Entry>,
    finished_count: u64,
}

/// The core's analysis jobs: one runs at a time, in the order they came, direct jobs first. Jobs live in
/// memory only; a core restart forgets them.
pub struct AnalysisQueue {
    state: Mutex<QueueState>,
    wake: Notify,
    events: broadcast::Sender<AnalysisEvent>,
    stopped: CancellationToken,
}

impl Default for AnalysisQueue {
    fn default() -> Self {
        Self::new()
    }
}

impl AnalysisQueue {
    pub fn new() -> Self {
        Self {
            state: Mutex::default(),
            wake: Notify::new(),
            events: broadcast::channel(EVENT_CAPACITY).0,
            stopped: CancellationToken::new(),
        }
    }

    pub fn subscribe(&self) -> broadcast::Receiver<AnalysisEvent> {
        self.events.subscribe()
    }

    /// A key that is queued or running answers that job; a commit that `existing` already analysed
    /// answers that snapshot unless forced. A working tree always gets a new snapshot.
    pub fn enqueue(&self, job: NewJob, existing: Option<SnapshotId>) -> CoreResult<EnqueueOutcome> {
        if self.stopped.is_cancelled() {
            return Err(CoreError::NotAllowed(
                "The core is shutting down and starts no more analyses.".to_string(),
            ));
        }
        let mut state = self.lock();
        if let Some(known) = known_outcome(&state, &job, existing) {
            return Ok(known);
        }
        let entry = new_entry(job)?;
        let queued = entry.job.clone();
        state.entries.push(entry);
        self.emit(AnalysisEvent::Queued(queued.clone()));
        drop(state);
        self.wake.notify_one();
        Ok(EnqueueOutcome::Queued(queued))
    }

    /// A queued job is cancelled at once and never starts; a running one is stopped and ends cancelled.
    pub fn cancel(&self, job_id: &JobId) -> CoreResult<()> {
        let mut state = self.lock();
        let (job_state, token) = state
            .entries
            .iter()
            .find(|entry| entry.job.id == *job_id)
            .map(|entry| (entry.job.state, entry.cancel.clone()))
            .ok_or_else(|| CoreError::NotFound(format!("There is no analysis job {job_id}.")))?;
        match job_state {
            JobState::Queued => self.finish(&mut state, job_id, Err(JobFailure::Cancelled)),
            JobState::Running => token.cancel(),
            _ => {}
        }
        Ok(())
    }

    /// Cancels every queued and running job of the batch and answers how many; `NOT_FOUND` when the
    /// queue knows no job of it.
    pub fn cancel_batch(&self, batch_id: &BatchId) -> CoreResult<usize> {
        let batch_jobs: Vec<(JobId, bool)> = self
            .lock()
            .entries
            .iter()
            .filter(|entry| entry.job.batch_id.as_ref() == Some(batch_id))
            .map(|entry| (entry.job.id.clone(), entry.is_active()))
            .collect();
        if batch_jobs.is_empty() {
            return Err(CoreError::NotFound(format!(
                "There is no analysis batch {batch_id}."
            )));
        }
        let active: Vec<JobId> = batch_jobs
            .into_iter()
            .filter_map(|(job_id, is_active)| is_active.then_some(job_id))
            .collect();
        for job_id in &active {
            self.cancel(job_id)?;
        }
        Ok(active.len())
    }

    /// The commit snapshots of `folder` that a running job writes; a forced analysis replaces one that
    /// exists. A working-tree snapshot only appears once written, so none is listed.
    pub fn snapshots_being_written(&self, folder: &FolderRef) -> Vec<SnapshotId> {
        self.lock()
            .entries
            .iter()
            .filter(|entry| entry.job.state == JobState::Running && entry.job.folder() == *folder)
            .filter_map(|entry| written_snapshot_id(&entry.job))
            .collect()
    }

    /// Tells listeners that the snapshots of `folder` changed outside an analysis, such as by a deletion.
    pub fn announce_snapshots_changed(&self, folder: FolderRef) {
        self.emit(AnalysisEvent::SnapshotsChanged(folder));
    }

    pub fn list(&self) -> Vec<AnalysisJob> {
        self.lock()
            .entries
            .iter()
            .map(|entry| entry.job.clone())
            .collect()
    }

    /// Removes the finished jobs and answers them.
    pub fn clear_finished(&self) -> Vec<AnalysisJob> {
        let mut state = self.lock();
        let (finished, active): (Vec<Entry>, Vec<Entry>) = std::mem::take(&mut state.entries)
            .into_iter()
            .partition(|entry| !entry.is_active());
        state.entries = active;
        finished.into_iter().map(|entry| entry.job).collect()
    }

    /// Cancels every queued and running job; `drive` returns once the running one has ended.
    pub fn shutdown(&self) {
        self.stopped.cancel();
        let mut state = self.lock();
        let active: Vec<(JobId, JobState, CancellationToken)> = state
            .entries
            .iter()
            .filter(|entry| entry.is_active())
            .map(|entry| (entry.job.id.clone(), entry.job.state, entry.cancel.clone()))
            .collect();
        for (job_id, job_state, token) in active {
            match job_state {
                JobState::Running => token.cancel(),
                _ => self.finish(&mut state, &job_id, Err(JobFailure::Cancelled)),
            }
        }
    }

    /// Runs the queued jobs one after another until `shutdown`.
    pub async fn drive(&self, executor: &impl JobExecutor) {
        loop {
            if let Some((request, cancel)) = self.start_next() {
                let outcome = self.run(executor, &request, &cancel).await;
                self.finish(&mut self.lock(), &request.id, outcome);
                continue;
            }
            if self.stopped.is_cancelled() {
                return;
            }
            tokio::select! {
                () = self.wake.notified() => {}
                () = self.stopped.cancelled() => {}
            }
        }
    }

    /// The job once it has finished; `None` for a job the queue does not know (any more).
    pub async fn wait_for(&self, job_id: &JobId) -> Option<AnalysisJob> {
        let mut events = self.subscribe();
        loop {
            let job = self.list().into_iter().find(|job| job.id == *job_id)?;
            if job.state.is_finished() {
                return Some(job);
            }
            if let Err(broadcast::error::RecvError::Closed) = events.recv().await {
                return None;
            }
        }
    }

    fn start_next(&self) -> Option<(JobRequest, CancellationToken)> {
        if self.stopped.is_cancelled() {
            return None;
        }
        let mut state = self.lock();
        let position = next_position(&state.entries)?;
        let entry = &mut state.entries[position];
        entry.job.state = JobState::Running;
        entry.job.started_at = Some(timestamps::now());
        self.emit(AnalysisEvent::Started(entry.job.clone()));
        Some((entry.request(), entry.cancel.clone()))
    }

    async fn run(
        &self,
        executor: &impl JobExecutor,
        request: &JobRequest,
        cancel: &CancellationToken,
    ) -> Result<SnapshotId, JobFailure> {
        let (sender, mut updates) = mpsc::unbounded_channel();
        let hooks = RunHooks {
            on_progress: Box::new(move |progress| {
                let _ignored_after_the_end = sender.send(progress);
            }),
        };
        let execution = executor.execute(request, &hooks, cancel);
        tokio::pin!(execution);
        let mut throttle = ProgressThrottle::new(PROGRESS_INTERVAL);
        let outcome = loop {
            tokio::select! {
                outcome = &mut execution => break outcome,
                Some(progress) = updates.recv() => {
                    self.record_progress(&request.id, progress, &mut throttle);
                }
            }
        };
        while let Ok(progress) = updates.try_recv() {
            self.record_progress(&request.id, progress, &mut throttle);
        }
        outcome
    }

    fn record_progress(
        &self,
        job_id: &JobId,
        progress: JobProgress,
        throttle: &mut ProgressThrottle,
    ) {
        let mut state = self.lock();
        let Some(entry) = state
            .entries
            .iter_mut()
            .find(|entry| entry.job.id == *job_id)
        else {
            return;
        };
        entry.job.progress = progress;
        if throttle.admit(Instant::now()) {
            self.emit(AnalysisEvent::Progress {
                job_id: job_id.clone(),
                progress,
            });
        }
    }

    fn finish(
        &self,
        state: &mut QueueState,
        job_id: &JobId,
        outcome: Result<SnapshotId, JobFailure>,
    ) {
        state.finished_count += 1;
        let finished_order = state.finished_count;
        let Some(entry) = state
            .entries
            .iter_mut()
            .find(|entry| entry.job.id == *job_id)
        else {
            return;
        };
        entry.finished_order = finished_order;
        let event = apply_outcome(&mut entry.job, outcome);
        let changed = matches!(event, AnalysisEvent::Finished(_)).then(|| entry.job.folder());
        self.emit(event);
        if let Some(folder) = changed {
            self.emit(AnalysisEvent::SnapshotsChanged(folder));
        }
        forget_oldest_finished(state);
    }

    fn emit(&self, event: AnalysisEvent) {
        let _sent_or_nobody_listens = self.events.send(event);
    }

    fn lock(&self) -> MutexGuard<'_, QueueState> {
        self.state.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

fn written_snapshot_id(job: &AnalysisJob) -> Option<SnapshotId> {
    let AnalysisTarget::Commit { sha } = &job.target else {
        return None;
    };
    let commit = FullCommit::try_from(sha.as_str()).ok()?;
    commit_snapshot_id(&commit, &job.profile_hash).ok()
}

fn known_outcome(
    state: &QueueState,
    job: &NewJob,
    existing: Option<SnapshotId>,
) -> Option<EnqueueOutcome> {
    let active = state
        .entries
        .iter()
        .find(|entry| entry.is_active() && entry.has_key_of(job));
    if let Some(entry) = active {
        return Some(EnqueueOutcome::AlreadyQueued(entry.job.clone()));
    }
    let is_commit = matches!(job.target, AnalysisTarget::Commit { .. });
    existing
        .filter(|_| is_commit && !job.force)
        .map(EnqueueOutcome::AlreadyAnalysed)
}

fn apply_outcome(job: &mut AnalysisJob, outcome: Result<SnapshotId, JobFailure>) -> AnalysisEvent {
    job.finished_at = Some(timestamps::now());
    match outcome {
        Ok(snapshot) => {
            job.state = JobState::Done;
            job.snapshot_id = Some(snapshot);
            AnalysisEvent::Finished(job.clone())
        }
        Err(JobFailure::Failed(error)) => {
            job.state = JobState::Failed;
            job.error = Some(error);
            AnalysisEvent::Failed(job.clone())
        }
        Err(JobFailure::Cancelled) => {
            job.state = JobState::Cancelled;
            AnalysisEvent::Cancelled(job.clone())
        }
    }
}

/// The first queued direct job, else the first queued batch job.
fn next_position(entries: &[Entry]) -> Option<usize> {
    let is_queued = |entry: &Entry| entry.job.state == JobState::Queued;
    entries
        .iter()
        .position(|entry| is_queued(entry) && entry.job.batch_id.is_none())
        .or_else(|| entries.iter().position(is_queued))
}

fn new_entry(job: NewJob) -> CoreResult<Entry> {
    Ok(Entry {
        job: AnalysisJob {
            id: new_job_id()?,
            batch_id: job.batch_id,
            project_id: job.folder.project_id,
            folder_id: job.folder.folder_id,
            target: job.target,
            profile_hash: job.profile_hash,
            state: JobState::Queued,
            progress: JobProgress::Indeterminate,
            queued_at: timestamps::now(),
            started_at: None,
            finished_at: None,
            snapshot_id: None,
            error: None,
        },
        force: job.force,
        cancel: CancellationToken::new(),
        finished_order: 0,
    })
}

fn forget_oldest_finished(state: &mut QueueState) {
    let finished = state
        .entries
        .iter()
        .filter(|entry| !entry.is_active())
        .count();
    let Some(excess) = finished
        .checked_sub(MAX_FINISHED_JOBS)
        .filter(|excess| *excess > 0)
    else {
        return;
    };
    let mut orders: Vec<u64> = state
        .entries
        .iter()
        .filter(|entry| !entry.is_active())
        .map(|entry| entry.finished_order)
        .collect();
    orders.sort_unstable();
    let newest_dropped = orders[excess - 1];
    state
        .entries
        .retain(|entry| entry.is_active() || entry.finished_order > newest_dropped);
}
