use codecharta_core_api::ids::{JobId, SnapshotId};
use codecharta_core_api::methods::analysis::{
    AnalysisErrorCode, AnalysisJob, AnalysisTarget, EnqueueResult, JobError, JobState,
    PreflightResult,
};
use codecharta_core_api::methods::projects::{AnalysisProfile, FolderRef};
use codecharta_core_api::methods::snapshots::SnapshotRef;
use codecharta_core_api::methods::tools::ToolsReport;
use codecharta_core_api::values::FullCommit;
use tokio_util::sync::CancellationToken;

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
use crate::ids::commit_snapshot_id;
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
