use codecharta_core_api::ids::{BatchId, JobId, SnapshotId};
use codecharta_core_api::methods::analysis::{
    AnalysisErrorCode, AnalysisJob, AnalysisTarget, BatchResult, BatchSelection, EnqueueResult,
    JobError, JobState, PreflightProblem, PreflightResult,
};
use codecharta_core_api::methods::projects::{AnalysisProfile, FolderKind, FolderRef};
use codecharta_core_api::methods::snapshots::SnapshotRef;
use codecharta_core_api::methods::tools::ToolsReport;
use codecharta_core_api::values::{CommitSha, FullCommit};
use tokio_util::sync::CancellationToken;

use super::batch::{BatchPlan, expand_batch, plan_batch, preflight_target, validate_selection};
use super::launcher::TargetOs;
use super::preflight::{
    DiskPlaces, PreflightContext, PreflightSubject, SystemDiskSpace, run_preflight,
};
use super::profile::{profile_hash, validate_profile};
use super::queue::{EnqueueOutcome, JobExecutor, NewJob};
use super::recovery::{Recovery, recover};
use super::runner::{ANALYSIS_TIMEOUT, RunHooks};
use super::service::{AnalysisConfig, AnalysisDeps, AnalysisService, JobFailure, JobRequest};
use crate::Core;
use crate::error::{CoreError, CoreResult};
use crate::git::GitFolder;
use crate::ids::{commit_snapshot_id, new_batch_id};
use crate::projects::folder_operations::ResolvedFolder;
use crate::snapshots::hosting::HOSTING_BUDGET;

/// The analyses of a core: preflight, the queue and the recovery after a crash, over the store, git and
/// tools of that core. The serving core and the command line use the same calls.
pub struct Analyses<'core> {
    core: &'core Core,
}

/// What the preflight and the queue need to know about a project folder.
struct FolderFacts {
    folder: ResolvedFolder,
    profile: AnalysisProfile,
    largest_snapshot_bytes: u64,
}

impl FolderFacts {
    fn subject<'facts>(
        &'facts self,
        folder: &'facts GitFolder,
        target: &'facts AnalysisTarget,
    ) -> PreflightSubject<'facts> {
        PreflightSubject {
            folder,
            kind: self.folder.kind,
            profile: &self.profile,
            target,
            largest_snapshot_bytes: self.largest_snapshot_bytes,
        }
    }
}

impl<'core> Analyses<'core> {
    pub fn new(core: &'core Core) -> Self {
        Self { core }
    }

    /// `NOT_FOUND` for an unknown project or folder; everything else is a problem in the result.
    pub async fn preflight(
        &self,
        folder: &FolderRef,
        target: &AnalysisTarget,
    ) -> CoreResult<PreflightResult> {
        let facts = self.folder_facts(folder)?;
        self.check(folder, &facts, target).await
    }

    /// Runs the preflight first: a blocking problem rejects the job before anything is queued.
    pub async fn enqueue(
        &self,
        folder: &FolderRef,
        target: AnalysisTarget,
        force: bool,
    ) -> CoreResult<EnqueueResult> {
        let facts = self.folder_facts(folder)?;
        let preflight = self.check(folder, &facts, &target).await?;
        if !preflight.ok {
            return Ok(EnqueueResult::Rejected {
                problems: preflight.problems,
            });
        }
        let profile = validate_profile(&facts.profile)
            .map_err(|error| CoreError::BadRequest(error.message))?;
        let job = NewJob {
            folder: folder.clone(),
            target,
            profile_hash: profile_hash(&profile),
            batch_id: None,
            force,
        };
        let existing = self.existing_snapshot(&job);
        Ok(match self.core.analysis_queue().enqueue(job, existing)? {
            EnqueueOutcome::Queued(job) => EnqueueResult::Queued { job },
            EnqueueOutcome::AlreadyQueued(job) => EnqueueResult::AlreadyQueued { job },
            EnqueueOutcome::AlreadyAnalysed(snapshot_id) => {
                EnqueueResult::AlreadyAnalysed { snapshot_id }
            }
        })
    }

    /// Expands the selection, checks the folder once and queues one batch job per commit without a
    /// snapshot of the current profile; a dry run only answers what it would queue.
    pub async fn enqueue_batch(
        &self,
        folder: &FolderRef,
        selection: &BatchSelection,
        dry_run: bool,
    ) -> CoreResult<BatchResult> {
        validate_selection(selection)?;
        let facts = self.folder_facts(folder)?;
        if facts.folder.kind == FolderKind::Plain {
            return Err(CoreError::BadRequest(
                "Only a git folder has commits to analyse.".to_string(),
            ));
        }
        let preflight = self
            .check(folder, &facts, &preflight_target(selection))
            .await?;
        if !preflight.ok {
            return Ok(rejected_batch(preflight.problems));
        }
        let profile = validate_profile(&facts.profile)
            .map_err(|error| CoreError::BadRequest(error.message))?;
        let profile_hash = profile_hash(&profile);
        let expanded = match self.expand(folder, &facts, selection).await {
            Err(CoreError::NotACommit { commit }) => {
                return Ok(rejected_batch(vec![unknown_commit_problem(&commit)]));
            }
            expanded => expanded?,
        };
        let snapshots = self.core.snapshots()?.list(folder)?;
        let plan = plan_batch(expanded, &snapshots, &profile_hash);
        let batch = PlannedBatch {
            folder,
            profile_hash,
            plan,
        };
        let queued = if dry_run {
            None
        } else {
            self.queue_batch(&batch)?
        };
        Ok(batch.into_result(queued, preflight.problems))
    }

    pub fn cancel_batch(&self, batch_id: &BatchId) -> CoreResult<()> {
        self.core
            .analysis_queue()
            .cancel_batch(batch_id)
            .map(|_| ())
    }

    pub fn cancel(&self, job_id: &JobId) -> CoreResult<()> {
        self.core.analysis_queue().cancel(job_id)
    }

    pub fn list(&self) -> Vec<AnalysisJob> {
        self.core.analysis_queue().list()
    }

    /// Forgets the finished jobs; the kept logs of the failed ones go with them.
    pub fn clear_finished(&self) -> CoreResult<()> {
        let cleared = self.core.analysis_queue().clear_finished();
        let snapshots = self.core.snapshots()?;
        for job in cleared.iter().filter(|job| job.state == JobState::Failed) {
            if let Err(error) = snapshots.forget_failed(&job.folder(), &job.id) {
                tracing::warn!(
                    "could not remove the log of the failed analysis {}: {error}",
                    job.id
                );
            }
        }
        Ok(())
    }

    /// Cleans up after analyses of a core that died; runs at start.
    pub async fn recover(&self) -> CoreResult<Recovery> {
        let store = self.core.store()?;
        recover(store.paths(), &self.core.git()?).await
    }

    /// Runs the queued jobs until the queue shuts down.
    pub async fn drive(&self) {
        let executor = CoreExecutor { core: self.core };
        self.core.analysis_queue().drive(&executor).await;
    }

    async fn expand(
        &self,
        folder: &FolderRef,
        facts: &FolderFacts,
        selection: &BatchSelection,
    ) -> CoreResult<Vec<CommitSha>> {
        let git_folder = GitFolder {
            path: facts.folder.path.clone(),
            repo: Some(folder.clone()),
        };
        let git = self.core.git()?;
        expand_batch(&git, &git_folder, selection, &CancellationToken::new()).await
    }

    /// `None` when there is nothing to queue.
    fn queue_batch(&self, batch: &PlannedBatch<'_>) -> CoreResult<Option<QueuedBatch>> {
        if batch.plan.to_analyse.is_empty() {
            return Ok(None);
        }
        let batch_id = new_batch_id()?;
        let mut jobs = Vec::new();
        for sha in &batch.plan.to_analyse {
            let job = NewJob {
                folder: batch.folder.clone(),
                target: AnalysisTarget::Commit { sha: sha.clone() },
                profile_hash: batch.profile_hash.clone(),
                batch_id: Some(batch_id.clone()),
                force: false,
            };
            match self.core.analysis_queue().enqueue(job, None)? {
                EnqueueOutcome::Queued(job) | EnqueueOutcome::AlreadyQueued(job) => jobs.push(job),
                EnqueueOutcome::AlreadyAnalysed(_) => {}
            }
        }
        Ok(Some(QueuedBatch { batch_id, jobs }))
    }

    fn folder_facts(&self, folder: &FolderRef) -> CoreResult<FolderFacts> {
        let projects = self.core.projects()?;
        let resolved = projects.resolve_folder(folder)?;
        let profile = projects.read_record(&folder.project_id)?.analysis_profile;
        let largest_snapshot_bytes = self
            .core
            .snapshots()?
            .list(folder)?
            .iter()
            .map(|snapshot| snapshot.map_bytes)
            .max()
            .unwrap_or_default();
        Ok(FolderFacts {
            folder: resolved,
            profile,
            largest_snapshot_bytes,
        })
    }

    async fn check(
        &self,
        folder: &FolderRef,
        facts: &FolderFacts,
        target: &AnalysisTarget,
    ) -> CoreResult<PreflightResult> {
        let tools = self.tools_report(&CancellationToken::new()).await?;
        let git = self.core.git()?;
        let places = DiskPlaces {
            store: self.core.store()?.paths().root().to_path_buf(),
            temp: std::env::temp_dir(),
        };
        let context = PreflightContext {
            tools: &tools,
            git: &git,
            disk: &SystemDiskSpace,
            places: &places,
        };
        let git_folder = GitFolder {
            path: facts.folder.path.clone(),
            repo: Some(folder.clone()),
        };
        Ok(run_preflight(&context, &facts.subject(&git_folder, target)).await)
    }

    /// Only a commit has one snapshot per profile; a commit named by 64 hex digits has none yet.
    fn existing_snapshot(&self, job: &NewJob) -> Option<SnapshotId> {
        let AnalysisTarget::Commit { sha } = &job.target else {
            return None;
        };
        let commit = FullCommit::try_from(sha.as_str()).ok()?;
        let snapshot = SnapshotRef {
            project_id: job.folder.project_id.clone(),
            folder_id: job.folder.folder_id.clone(),
            snapshot_id: commit_snapshot_id(&commit, &job.profile_hash).ok()?,
        };
        let record = self.core.snapshots().ok()?.read(&snapshot).ok()?;
        Some(record.id)
    }

    async fn tools_report(&self, cancel: &CancellationToken) -> CoreResult<ToolsReport> {
        self.core.tools().doctor(false, cancel, &|_, _| {}).await
    }
}

/// A batch whose commits are known, before or after it was queued.
struct PlannedBatch<'folder> {
    folder: &'folder FolderRef,
    profile_hash: String,
    plan: BatchPlan,
}

struct QueuedBatch {
    batch_id: BatchId,
    jobs: Vec<AnalysisJob>,
}

impl PlannedBatch<'_> {
    fn into_result(
        self,
        queued: Option<QueuedBatch>,
        problems: Vec<PreflightProblem>,
    ) -> BatchResult {
        let (batch_id, jobs) = queued.map_or((None, Vec::new()), |queued| {
            (Some(queued.batch_id), queued.jobs)
        });
        BatchResult {
            batch_id,
            to_analyse: self.plan.to_analyse,
            already_analysed: self.plan.already_analysed,
            left_out: self.plan.left_out,
            jobs,
            estimated_duration_ms: self.plan.estimated_duration_ms,
            problems,
        }
    }
}

fn rejected_batch(problems: Vec<PreflightProblem>) -> BatchResult {
    BatchResult {
        batch_id: None,
        to_analyse: Vec::new(),
        already_analysed: Vec::new(),
        left_out: 0,
        jobs: Vec::new(),
        estimated_duration_ms: None,
        problems,
    }
}

fn unknown_commit_problem(commit: &str) -> PreflightProblem {
    PreflightProblem::error(JobError::new(
        AnalysisErrorCode::UnknownCommit,
        format!("The repository has no commit {commit}."),
    ))
}

/// Builds the analysis service of the core for each job, so every job sees the current tools and store.
struct CoreExecutor<'core> {
    core: &'core Core,
}

impl JobExecutor for CoreExecutor<'_> {
    async fn execute(
        &self,
        job: &JobRequest,
        hooks: &RunHooks,
        cancel: &CancellationToken,
    ) -> Result<SnapshotId, JobFailure> {
        let tools = Analyses::new(self.core)
            .tools_report(cancel)
            .await
            .map_err(|error| failure(AnalysisErrorCode::CcshNotFound, &error))?;
        let store_failure = |error| failure(AnalysisErrorCode::StoreWriteFailed, &error);
        let git = self.core.git().map_err(store_failure)?;
        let deps = AnalysisDeps {
            snapshots: self.core.snapshots().map_err(store_failure)?,
            git: &git,
            runner: self.core.runner(),
            hosting: self.core.tools(),
        };
        AnalysisService::new(deps, production_config(tools))
            .execute(job, hooks, cancel)
            .await
    }
}

fn production_config(tools: ToolsReport) -> AnalysisConfig {
    AnalysisConfig {
        tools,
        os: TargetOs::current(),
        launch_override: None,
        timeout: ANALYSIS_TIMEOUT,
        hosting_budget: HOSTING_BUDGET,
    }
}

fn failure(code: AnalysisErrorCode, error: &CoreError) -> JobFailure {
    if matches!(error, CoreError::Cancelled) {
        return JobFailure::Cancelled;
    }
    JobFailure::Failed(JobError::new(code, error.to_string()))
}
