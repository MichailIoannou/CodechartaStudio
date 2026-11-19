use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Duration;

use codecharta_core::analysis::queue::{
    AnalysisEvent, AnalysisQueue, EnqueueOutcome, JobExecutor, MAX_FINISHED_JOBS, NewJob,
};
use codecharta_core::analysis::runner::RunHooks;
use codecharta_core::analysis::service::{JobFailure, JobRequest};
use codecharta_core_api::ids::{BatchId, FolderId, JobId, ProjectId, SnapshotId};
use codecharta_core_api::methods::analysis::{
    AnalysisErrorCode, AnalysisJob, AnalysisTarget, JobError, JobProgress, JobState,
};
use codecharta_core_api::methods::projects::FolderRef;
use codecharta_core_api::values::CommitSha;
use tokio::sync::{Mutex, broadcast, mpsc};
use tokio::task::JoinHandle;
use tokio_util::sync::CancellationToken;

const WAIT: Duration = Duration::from_secs(5);
const QUIET: Duration = Duration::from_millis(100);
const PROFILE_HASH: &str = "0a1b2c3d";

enum Step {
    Progress(JobProgress),
    End(Result<SnapshotId, JobFailure>),
}

/// Runs each job until the test sends its end; counts how many run at the same time.
struct ScriptedExecutor {
    started: mpsc::UnboundedSender<JobId>,
    steps: Mutex<mpsc::UnboundedReceiver<Step>>,
    running: AtomicUsize,
    most_running: AtomicUsize,
}

impl JobExecutor for ScriptedExecutor {
    async fn execute(
        &self,
        job: &JobRequest,
        hooks: &RunHooks,
        cancel: &CancellationToken,
    ) -> Result<SnapshotId, JobFailure> {
        let running = self.running.fetch_add(1, Ordering::SeqCst) + 1;
        self.most_running.fetch_max(running, Ordering::SeqCst);
        self.started.send(job.id.clone()).expect("the test listens");
        let end = self.play(hooks, cancel).await;
        self.running.fetch_sub(1, Ordering::SeqCst);
        end
    }
}

impl ScriptedExecutor {
    async fn play(
        &self,
        hooks: &RunHooks,
        cancel: &CancellationToken,
    ) -> Result<SnapshotId, JobFailure> {
        let mut steps = self.steps.lock().await;
        loop {
            tokio::select! {
                () = cancel.cancelled() => return Err(JobFailure::Cancelled),
                step = steps.recv() => match step.expect("the test sends steps") {
                    Step::Progress(progress) => (hooks.on_progress)(progress),
                    Step::End(end) => return end,
                },
            }
        }
    }
}

struct Harness {
    queue: Arc<AnalysisQueue>,
    executor: Arc<ScriptedExecutor>,
    started: mpsc::UnboundedReceiver<JobId>,
    steps: mpsc::UnboundedSender<Step>,
    events: broadcast::Receiver<AnalysisEvent>,
    driver: Option<JoinHandle<()>>,
}

impl Harness {
    fn new() -> Self {
        let (started_sender, started) = mpsc::unbounded_channel();
        let (steps, step_receiver) = mpsc::unbounded_channel();
        let queue = Arc::new(AnalysisQueue::new());
        let events = queue.subscribe();
        Self {
            queue,
            executor: Arc::new(ScriptedExecutor {
                started: started_sender,
                steps: Mutex::new(step_receiver),
                running: AtomicUsize::new(0),
                most_running: AtomicUsize::new(0),
            }),
            started,
            steps,
            events,
            driver: None,
        }
    }

    fn driven() -> Self {
        let mut harness = Self::new();
        harness.drive();
        harness
    }

    fn drive(&mut self) {
        let queue = Arc::clone(&self.queue);
        let executor = Arc::clone(&self.executor);
        self.driver = Some(tokio::spawn(async move { queue.drive(&*executor).await }));
    }

    fn enqueue(&self, job: NewJob) -> AnalysisJob {
        match self.queue.enqueue(job, None).expect("the job is accepted") {
            EnqueueOutcome::Queued(job) => job,
            other => panic!("not queued: {other:?}"),
        }
    }

    async fn next_started(&mut self) -> JobId {
        tokio::time::timeout(WAIT, self.started.recv())
            .await
            .expect("a job starts in time")
            .expect("the executor is alive")
    }

    async fn nothing_starts(&mut self) {
        let started = tokio::time::timeout(QUIET, self.started.recv()).await;
        assert!(started.is_err(), "a job started: {started:?}");
    }

    fn end(&self, end: Result<SnapshotId, JobFailure>) {
        self.steps
            .send(Step::End(end))
            .expect("the executor listens");
    }

    async fn finished(&self, job: &AnalysisJob) -> AnalysisJob {
        tokio::time::timeout(WAIT, self.queue.wait_for(&job.id))
            .await
            .expect("the job finishes in time")
            .expect("the job is listed")
    }

    fn state_of(&self, job: &AnalysisJob) -> JobState {
        self.queue
            .list()
            .into_iter()
            .find(|listed| listed.id == job.id)
            .map(|listed| listed.state)
            .expect("the job is listed")
    }

    fn received_events(&mut self) -> Vec<AnalysisEvent> {
        std::iter::from_fn(|| self.events.try_recv().ok()).collect()
    }
}

fn folder() -> FolderRef {
    FolderRef {
        project_id: ProjectId::try_from("p-1").expect("a project id"),
        folder_id: FolderId::try_from("f-1").expect("a folder id"),
    }
}

fn sha(number: usize) -> CommitSha {
    CommitSha::try_from(format!("{number:040x}")).expect("a commit sha")
}

fn commit_job(number: usize) -> NewJob {
    NewJob {
        folder: folder(),
        target: AnalysisTarget::Commit { sha: sha(number) },
        profile_hash: PROFILE_HASH.to_string(),
        batch_id: None,
        force: false,
    }
}

fn batch_job(number: usize) -> NewJob {
    NewJob {
        batch_id: Some(BatchId::try_from("batch-1").expect("a batch id")),
        ..commit_job(number)
    }
}

fn snapshot(number: usize) -> SnapshotId {
    SnapshotId::try_from(format!("{}-{PROFILE_HASH}", sha(number))).expect("a snapshot id")
}

fn failure() -> JobFailure {
    JobFailure::Failed(JobError::new(AnalysisErrorCode::AnalysisFailed, "broken"))
}

#[tokio::test]
async fn should_run_one_job_at_a_time() {
    // Arrange
    let mut harness = Harness::driven();
    let first = harness.enqueue(commit_job(1));
    let second = harness.enqueue(commit_job(2));

    // Act
    let started = harness.next_started().await;
    harness.nothing_starts().await;
    let state_while_first_runs = harness.state_of(&second);
    harness.end(Ok(snapshot(1)));
    let next = harness.next_started().await;
    harness.end(Ok(snapshot(2)));
    harness.finished(&second).await;

    // Assert
    assert_eq!(started, first.id);
    assert_eq!(state_while_first_runs, JobState::Queued);
    assert_eq!(next, second.id);
    assert_eq!(harness.executor.most_running.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn should_start_the_next_after_done_failed_and_cancelled() {
    // Arrange
    let mut harness = Harness::driven();
    let jobs: Vec<AnalysisJob> = (1..=4).map(|n| harness.enqueue(commit_job(n))).collect();

    // Act
    harness.next_started().await;
    harness.end(Ok(snapshot(1)));
    harness.next_started().await;
    harness.end(Err(failure()));
    harness.next_started().await;
    harness.queue.cancel(&jobs[2].id).expect("the job is known");
    let last = harness.next_started().await;
    harness.end(Ok(snapshot(4)));
    let finished = [
        harness.finished(&jobs[0]).await,
        harness.finished(&jobs[1]).await,
        harness.finished(&jobs[2]).await,
        harness.finished(&jobs[3]).await,
    ];

    // Assert
    assert_eq!(last, jobs[3].id);
    let states: Vec<JobState> = finished.iter().map(|job| job.state).collect();
    assert_eq!(
        states,
        [
            JobState::Done,
            JobState::Failed,
            JobState::Cancelled,
            JobState::Done
        ]
    );
    assert_eq!(finished[0].snapshot_id, Some(snapshot(1)));
    assert_eq!(
        finished[1].error.as_ref().map(|error| error.code),
        Some(AnalysisErrorCode::AnalysisFailed)
    );
    assert!(finished.iter().all(|job| job.finished_at.is_some()));
}

#[tokio::test]
async fn should_cancel_a_queued_job_without_starting_it() {
    // Arrange
    let mut harness = Harness::driven();
    let first = harness.enqueue(commit_job(1));
    let second = harness.enqueue(commit_job(2));
    harness.next_started().await;

    // Act
    harness.queue.cancel(&second.id).expect("the job is known");
    harness.end(Ok(snapshot(1)));
    harness.finished(&first).await;

    // Assert
    harness.nothing_starts().await;
    let cancelled = harness.finished(&second).await;
    assert_eq!(cancelled.state, JobState::Cancelled);
    assert_eq!(cancelled.started_at, None);
}

#[tokio::test]
async fn should_dedupe_a_queued_or_running_key() {
    // Arrange
    let mut harness = Harness::driven();
    let running = harness.enqueue(commit_job(1));
    harness.next_started().await;
    let queued = harness.enqueue(commit_job(2));

    // Act
    let again_running = harness.queue.enqueue(commit_job(1), None).unwrap();
    let again_queued = harness.queue.enqueue(commit_job(2), None).unwrap();
    let other_profile = harness.queue.enqueue(
        NewJob {
            profile_hash: "ffffffff".to_string(),
            ..commit_job(2)
        },
        None,
    );

    // Assert
    assert!(
        matches!(again_running, EnqueueOutcome::AlreadyQueued(ref job) if job.id == running.id)
    );
    assert!(matches!(again_queued, EnqueueOutcome::AlreadyQueued(ref job) if job.id == queued.id));
    assert!(matches!(other_profile, Ok(EnqueueOutcome::Queued(_))));
    assert_eq!(harness.queue.list().len(), 3);
}

#[tokio::test]
async fn should_report_already_analysed_unless_forced() {
    // Arrange
    let harness = Harness::new();
    let working_tree = NewJob {
        target: AnalysisTarget::WorkingTree,
        ..commit_job(1)
    };

    // Act
    let unforced = harness.queue.enqueue(commit_job(1), Some(snapshot(1)));
    let forced = harness.queue.enqueue(
        NewJob {
            force: true,
            ..commit_job(1)
        },
        Some(snapshot(1)),
    );
    let working = harness.queue.enqueue(working_tree, Some(snapshot(1)));

    // Assert
    assert!(matches!(unforced, Ok(EnqueueOutcome::AlreadyAnalysed(ref id)) if *id == snapshot(1)));
    assert!(matches!(forced, Ok(EnqueueOutcome::Queued(_))));
    assert!(matches!(working, Ok(EnqueueOutcome::Queued(_))));
}

#[tokio::test]
async fn should_put_a_direct_job_ahead_of_batch_jobs() {
    // Arrange
    let mut harness = Harness::driven();
    harness.enqueue(batch_job(1));
    harness.next_started().await;
    let second_batch_job = harness.enqueue(batch_job(2));
    let direct = harness.enqueue(commit_job(3));

    // Act
    harness.end(Ok(snapshot(1)));
    let after_first = harness.next_started().await;
    harness.end(Ok(snapshot(3)));
    let after_direct = harness.next_started().await;
    harness.end(Ok(snapshot(2)));
    harness.finished(&second_batch_job).await;

    // Assert
    assert_eq!(after_first, direct.id);
    assert_eq!(after_direct, second_batch_job.id);
}

#[tokio::test]
async fn should_emit_a_notification_on_every_transition() {
    // Arrange
    let mut harness = Harness::driven();
    let done = harness.enqueue(commit_job(1));
    let failed = harness.enqueue(commit_job(2));
    let cancelled = harness.enqueue(commit_job(3));

    // Act
    harness.next_started().await;
    harness
        .steps
        .send(Step::Progress(JobProgress::Determinate { percent: 42 }))
        .unwrap();
    harness.end(Ok(snapshot(1)));
    harness.next_started().await;
    harness.end(Err(failure()));
    harness.next_started().await;
    harness.queue.cancel(&cancelled.id).unwrap();
    harness.finished(&cancelled).await;

    // Assert
    let seen: Vec<String> = harness
        .received_events()
        .iter()
        .map(|event| match event {
            AnalysisEvent::Queued(job) => format!("queued {}", job.id),
            AnalysisEvent::Started(job) => format!("started {}", job.id),
            AnalysisEvent::Progress { job_id, progress } => {
                format!("progress {job_id} {progress:?}")
            }
            AnalysisEvent::Finished(job) => format!("finished {}", job.id),
            AnalysisEvent::Failed(job) => format!("failed {}", job.id),
            AnalysisEvent::Cancelled(job) => format!("cancelled {}", job.id),
            AnalysisEvent::SnapshotsChanged(changed) => format!("changed {}", changed.folder_id),
        })
        .collect();
    assert_eq!(
        seen,
        [
            format!("queued {}", done.id),
            format!("queued {}", failed.id),
            format!("queued {}", cancelled.id),
            format!("started {}", done.id),
            format!("progress {} Determinate {{ percent: 42 }}", done.id),
            format!("finished {}", done.id),
            "changed f-1".to_string(),
            format!("started {}", failed.id),
            format!("failed {}", failed.id),
            format!("started {}", cancelled.id),
            format!("cancelled {}", cancelled.id),
        ]
    );
}

#[tokio::test]
async fn should_keep_at_most_100_finished_jobs() {
    // Arrange
    let harness = Harness::new();
    let jobs: Vec<AnalysisJob> = (0..MAX_FINISHED_JOBS + 5)
        .map(|n| harness.enqueue(commit_job(n)))
        .collect();
    let waiting = harness.enqueue(commit_job(MAX_FINISHED_JOBS + 5));

    // Act
    for job in &jobs {
        harness.queue.cancel(&job.id).unwrap();
    }

    // Assert
    let listed = harness.queue.list();
    assert_eq!(MAX_FINISHED_JOBS, 100);
    assert_eq!(listed.len(), MAX_FINISHED_JOBS + 1);
    assert!(!listed.iter().any(|job| job.id == jobs[0].id));
    assert!(listed.iter().any(|job| job.id == jobs[5].id));
    assert!(listed.iter().any(|job| job.id == waiting.id));
}

#[tokio::test]
async fn should_cancel_queued_and_running_jobs_on_shutdown() {
    // Arrange
    let mut harness = Harness::driven();
    let running = harness.enqueue(commit_job(1));
    let queued = harness.enqueue(commit_job(2));
    harness.next_started().await;

    // Act
    harness.queue.shutdown();
    let driver = harness.driver.take().expect("the queue is driven");
    tokio::time::timeout(WAIT, driver)
        .await
        .expect("the driver stops in time")
        .unwrap();

    // Assert
    assert_eq!(harness.state_of(&running), JobState::Cancelled);
    assert_eq!(harness.state_of(&queued), JobState::Cancelled);
    assert_eq!(harness.executor.running.load(Ordering::SeqCst), 0);
    assert!(harness.queue.enqueue(commit_job(3), None).is_err());
}

#[tokio::test]
async fn should_throttle_progress_notifications_but_keep_the_latest_progress() {
    // Arrange
    let mut harness = Harness::driven();
    let job = harness.enqueue(commit_job(1));
    harness.next_started().await;

    // Act
    for percent in 1..=5 {
        harness
            .steps
            .send(Step::Progress(JobProgress::Determinate { percent }))
            .unwrap();
    }
    let latest = JobProgress::Determinate { percent: 5 };
    let deadline = tokio::time::Instant::now() + WAIT;
    while harness.queue.list()[0].progress != latest && tokio::time::Instant::now() < deadline {
        tokio::time::sleep(Duration::from_millis(10)).await;
    }

    // Assert
    let progress_events = harness
        .received_events()
        .into_iter()
        .filter(|event| matches!(event, AnalysisEvent::Progress { .. }))
        .count();
    assert_eq!(progress_events, 1);
    assert_eq!(harness.queue.list()[0].progress, latest);
    harness.end(Ok(snapshot(1)));
    harness.finished(&job).await;
}

#[tokio::test]
async fn should_forget_finished_jobs_on_clear() {
    // Arrange
    let harness = Harness::new();
    let finished = harness.enqueue(commit_job(1));
    let waiting = harness.enqueue(commit_job(2));
    harness.queue.cancel(&finished.id).unwrap();

    // Act
    let cleared = harness.queue.clear_finished();

    // Assert
    assert_eq!(
        cleared.iter().map(|job| &job.id).collect::<Vec<_>>(),
        [&finished.id]
    );
    let listed: Vec<JobId> = harness.queue.list().into_iter().map(|job| job.id).collect();
    assert_eq!(listed, [waiting.id]);
}
