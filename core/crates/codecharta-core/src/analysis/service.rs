use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant, SystemTime};

use codecharta_core_api::error::ErrorCode;
use codecharta_core_api::ids::{JobId, SnapshotId};
use codecharta_core_api::methods::analysis::{AnalysisErrorCode, AnalysisTarget, JobError};
use codecharta_core_api::methods::projects::{AnalyserName, FolderKind, FolderRef, FolderStatus};
use codecharta_core_api::methods::snapshots::SnapshotSource;
use codecharta_core_api::methods::tools::{ToolId, ToolsReport};
use codecharta_core_api::values::CommitSha;
use tokio_util::sync::CancellationToken;

use super::argv::{AnalyseArgvInput, build_analyse_argv};
use super::janitor::{list_codecharta_worktrees, remove_orphans};
use super::launcher::{LaunchOptions, LaunchOverride, TargetOs, resolve_ccsh_launch};
use super::output::{CcshRunResult, RunEnd, classify_failure, parse_map_line, parse_not_in_map};
use super::profile::{ValidProfile, profile_hash, validate_profile};
use super::runner::{CcshRun, RunHooks, run_ccsh};
use crate::error::CoreError;
use crate::git::worktrees::WorktreeEntry;
use crate::git::{GitFolder, GitService};
use crate::ids::{commit_snapshot_id, working_tree_snapshot_id};
use crate::process::ProcessRunner;
use crate::snapshots::SnapshotRepository;
use crate::snapshots::StagedSnapshot;
use crate::snapshots::git_state::{GitReads, collect_git_state, head_commit};
use crate::snapshots::hosting::{HostingCli, HostingProbe, probe_hosting};
use crate::snapshots::map_head::read_map_head;
use crate::snapshots::record::{
    AnalysisProfileRecord, AnalysisRecord, GitRecord, HostingRecord, MapRecord,
    SNAPSHOT_SCHEMA_VERSION, SnapshotRecord,
};
use crate::store::paths::MAP_FILE_NAME;
use crate::timestamps;

/// ccsh appends `.cc.json.gz` (and, for a commit, prefixes the short hash) to this name in the job folder.
const OUTPUT_BASE_NAME: &str = "map";
/// The JVM's temp folder inside the job folder, so an orphaned worktree goes away with it (java-direct).
const WORKTREE_TEMP_FOLDER: &str = "tmp";
const UNKNOWN_VERSION: &str = "unknown";
const SHORT_HASH_SEPARATOR: char = '.';
const SUCCESS_EXIT_CODE: i32 = 0;

/// What an analysis needs from the core; `snapshots` also carries plan 03's git runner.
pub struct AnalysisDeps<'core> {
    pub snapshots: SnapshotRepository<'core>,
    pub git: &'core GitService<'core>,
    pub runner: &'core ProcessRunner,
    pub hosting: &'core dyn HostingCli,
}

pub struct AnalysisConfig {
    pub tools: ToolsReport,
    pub os: TargetOs,
    pub launch_override: Option<LaunchOverride>,
    pub timeout: Duration,
    pub hosting_budget: Duration,
}

/// One analysis to run; `force` replaces a snapshot of the same commit and profile.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct JobRequest {
    pub id: JobId,
    pub folder: FolderRef,
    pub target: AnalysisTarget,
    pub force: bool,
}

/// A cancelled job is no failure: it has no error to show.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum JobFailure {
    Cancelled,
    Failed(JobError),
}

impl From<JobError> for JobFailure {
    fn from(error: JobError) -> Self {
        JobFailure::Failed(error)
    }
}

/// What a job knows before anything runs.
struct JobPlan {
    folder_path: PathBuf,
    profile: ValidProfile,
    profile_hash: String,
    git: Option<GitRecord>,
}

/// How the staged map came about.
enum MapOrigin {
    Ran {
        not_in_map: Vec<String>,
    },
    Reused {
        from: SnapshotId,
        not_in_map: Vec<String>,
    },
}

struct Started {
    at: String,
    instant: Instant,
}

pub struct AnalysisService<'core> {
    deps: AnalysisDeps<'core>,
    config: AnalysisConfig,
}

impl<'core> AnalysisService<'core> {
    pub fn new(deps: AnalysisDeps<'core>, config: AnalysisConfig) -> Self {
        Self { deps, config }
    }

    /// Runs ccsh (or reuses a map of the same tree) in a staging directory and stores the snapshot. A
    /// failed run keeps its `run.log` as `.failed-<jobId>`; a cancelled one leaves nothing behind.
    pub async fn execute(
        &self,
        job: &JobRequest,
        hooks: &RunHooks,
        cancel: &CancellationToken,
    ) -> Result<SnapshotId, JobFailure> {
        let started = Started {
            at: timestamps::now(),
            instant: Instant::now(),
        };
        let plan = self.prepare(job, cancel).await?;
        let staged = self
            .deps
            .snapshots
            .begin_snapshot(&job.folder)
            .map_err(store_failure)?;
        let (origin, hosting) = tokio::join!(
            self.produce_map(job, &plan, &staged, hooks, cancel),
            self.probe_hosting(&plan, cancel)
        );
        let record = match origin {
            Ok(origin) => {
                let finished = Finished {
                    origin,
                    hosting,
                    started,
                };
                self.completed_record(job, &plan, &staged, finished).await
            }
            Err(failure) => Err(failure),
        };
        match record {
            Ok(record) => self.store(job, staged, record).await,
            Err(failure) => Err(self.discard(job, staged, failure)),
        }
    }

    async fn prepare(
        &self,
        job: &JobRequest,
        cancel: &CancellationToken,
    ) -> Result<JobPlan, JobFailure> {
        let projects = self.deps.snapshots.projects();
        let folder = projects
            .resolve_folder(&job.folder)
            .map_err(missing_folder)?;
        if folder.status != FolderStatus::Ok {
            let message = format!("The folder {} is missing.", folder.path.display());
            return Err(JobError::new(AnalysisErrorCode::FolderMissing, message).into());
        }
        let record = projects
            .read_record(&job.folder.project_id)
            .map_err(missing_folder)?;
        let profile = validate_profile(&record.analysis_profile)?;
        let git = match folder.kind {
            FolderKind::Git => Some(self.git_state(job, &folder.path, cancel).await?),
            FolderKind::Plain => plain_folder_git(&job.target)?,
        };
        Ok(JobPlan {
            folder_path: folder.path,
            profile_hash: profile_hash(&profile),
            profile,
            git,
        })
    }

    async fn git_state(
        &self,
        job: &JobRequest,
        folder_path: &Path,
        cancel: &CancellationToken,
    ) -> Result<GitRecord, JobFailure> {
        let reads = GitReads {
            service: self.deps.git,
            runner: self.deps.snapshots.git,
        };
        let folder = git_folder(job, folder_path);
        collect_git_state(&reads, &folder, &job.target, cancel)
            .await
            .map_err(git_failure)
    }

    async fn produce_map(
        &self,
        job: &JobRequest,
        plan: &JobPlan,
        staged: &StagedSnapshot,
        hooks: &RunHooks,
        cancel: &CancellationToken,
    ) -> Result<MapOrigin, JobFailure> {
        if let Some(reusable) = self.reusable_snapshot(job, plan) {
            let source = self
                .deps
                .snapshots
                .map_location(&reusable.snapshot_ref())
                .map_err(store_failure)?;
            return reuse_map(staged, &reusable, &source);
        }
        let commit = target_commit(&job.target);
        let janitor_scope = commit.filter(|_| plan.git.is_some());
        let before = match janitor_scope {
            Some(_) => self.worktrees_before(job, plan).await,
            None => Vec::new(),
        };
        let run = self.run_ccsh(job, plan, staged, hooks, cancel).await;
        if let Some(sha) = janitor_scope {
            self.remove_orphans(job, plan, &before, sha).await;
        }
        place_map(&run?, staged, commit)
    }

    async fn run_ccsh(
        &self,
        job: &JobRequest,
        plan: &JobPlan,
        staged: &StagedSnapshot,
        hooks: &RunHooks,
        cancel: &CancellationToken,
    ) -> Result<CcshRunResult, JobFailure> {
        let worktree_temp_dir = staged.directory().join(WORKTREE_TEMP_FOLDER);
        fs::create_dir_all(&worktree_temp_dir)
            .map_err(|error| write_failure(&worktree_temp_dir, &error))?;
        let options = LaunchOptions {
            worktree_temp_dir: Some(worktree_temp_dir),
            launch_override: self.config.launch_override.clone(),
        };
        let launch = resolve_ccsh_launch(&self.config.tools, self.config.os, &options)?;
        let argv = build_analyse_argv(&AnalyseArgvInput {
            folder_path: &plan.folder_path,
            output_base: &staged.directory().join(OUTPUT_BASE_NAME),
            profile: &plan.profile,
            commit: target_commit(&job.target),
        })?;
        let run = CcshRun {
            launch: &launch,
            argv: &argv,
            cwd: staged.directory(),
            log_file: &staged.log_file(),
            timeout: self.config.timeout,
        };
        Ok(run_ccsh(self.deps.runner, &run, hooks, cancel).await?)
    }

    /// Without history metrics a map depends on the files alone, so a clean snapshot of the same tree and
    /// profile can be copied.
    fn reusable_snapshot(&self, job: &JobRequest, plan: &JobPlan) -> Option<SnapshotRecord> {
        let leaves_out_history = plan.profile.without().contains(&AnalyserName::Git);
        let git = plan.git.as_ref().filter(|git| !git.dirty)?;
        let tree = git.tree.as_ref().filter(|_| leaves_out_history)?;
        let records = self.deps.snapshots.records(&job.folder).ok()?;
        records.into_iter().find(|record| {
            let same_profile = record
                .analysis
                .as_ref()
                .is_some_and(|analysis| analysis.profile_hash == plan.profile_hash);
            let same_tree = record
                .git
                .as_ref()
                .is_some_and(|other| !other.dirty && other.tree.as_ref() == Some(tree));
            record.source == SnapshotSource::Analysed && same_profile && same_tree
        })
    }

    async fn worktrees_before(&self, job: &JobRequest, plan: &JobPlan) -> Vec<WorktreeEntry> {
        let folder = git_folder(job, &plan.folder_path);
        list_codecharta_worktrees(self.deps.git, &folder)
            .await
            .unwrap_or_else(|error| {
                tracing::warn!("could not list the worktrees before the analysis: {error}");
                Vec::new()
            })
    }

    async fn remove_orphans(
        &self,
        job: &JobRequest,
        plan: &JobPlan,
        before: &[WorktreeEntry],
        sha: &CommitSha,
    ) {
        let folder = git_folder(job, &plan.folder_path);
        if let Err(error) = remove_orphans(self.deps.git, &folder, before, sha).await {
            tracing::warn!("a worktree of the analysis stays behind: {error}");
        }
    }

    async fn probe_hosting(
        &self,
        plan: &JobPlan,
        cancel: &CancellationToken,
    ) -> Option<HostingRecord> {
        let git = plan.git.as_ref()?;
        let commit = CommitSha::try_from(git.commit.as_str()).ok()?;
        let probe = HostingProbe {
            repository_path: &plan.folder_path,
            remotes: &git.remotes,
            commit: &commit,
            budget: self.config.hosting_budget,
        };
        probe_hosting(self.deps.hosting, &probe, cancel).await
    }

    async fn completed_record(
        &self,
        job: &JobRequest,
        plan: &JobPlan,
        staged: &StagedSnapshot,
        finished: Finished,
    ) -> Result<SnapshotRecord, JobFailure> {
        self.ensure_head_unmoved(job, plan).await?;
        remove_worktree_temp(staged)?;
        let map = map_record(&staged.map_file())?;
        let id = snapshot_id_for(job, plan)?;
        Ok(SnapshotRecord {
            schema_version: SNAPSHOT_SCHEMA_VERSION,
            id,
            project_id: job.folder.project_id.clone(),
            folder_id: job.folder.folder_id.clone(),
            source: SnapshotSource::Analysed,
            created_at: timestamps::now(),
            git: plan.git.clone(),
            hosting: finished.hosting.clone(),
            analysis: Some(self.analysis_record(job, plan, finished)),
            imported: None,
            map,
        })
    }

    /// A working-tree map is bound to the commit HEAD named before the run; a checkout during the run
    /// would bind it to the wrong one.
    async fn ensure_head_unmoved(
        &self,
        job: &JobRequest,
        plan: &JobPlan,
    ) -> Result<(), JobFailure> {
        let Some(git) = plan.git.as_ref() else {
            return Ok(());
        };
        if job.target != AnalysisTarget::WorkingTree {
            return Ok(());
        }
        let folder = git_folder(job, &plan.folder_path);
        let status = self
            .deps
            .git
            .status(&folder, &CancellationToken::new())
            .await
            .map_err(git_failure)?;
        let head = head_commit(&status.head).map_err(git_failure)?;
        if head.as_str() == git.commit.as_str() {
            return Ok(());
        }
        let message = "The checkout changed during the analysis; run it again.";
        Err(JobError::new(AnalysisErrorCode::HeadMoved, message).into())
    }

    fn analysis_record(
        &self,
        job: &JobRequest,
        plan: &JobPlan,
        finished: Finished,
    ) -> AnalysisRecord {
        let (not_in_map, reused_from) = match finished.origin {
            MapOrigin::Ran { not_in_map } => (not_in_map, None),
            MapOrigin::Reused { from, not_in_map } => (not_in_map, Some(from)),
        };
        let elapsed = finished.started.instant.elapsed().as_millis();
        AnalysisRecord {
            started_at: finished.started.at,
            finished_at: timestamps::now(),
            duration_ms: u64::try_from(elapsed).unwrap_or(u64::MAX),
            ccsh_version: tool_version(&self.config.tools, ToolId::Ccsh)
                .unwrap_or_else(|| UNKNOWN_VERSION.to_string()),
            java_version: tool_version(&self.config.tools, ToolId::Java),
            profile: AnalysisProfileRecord {
                without: plan.profile.without().to_vec(),
                exclude: plan.profile.exclude().to_vec(),
                extra_args: Vec::new(),
            },
            profile_hash: plan.profile_hash.clone(),
            exit_code: SUCCESS_EXIT_CODE,
            not_in_map,
            target: Some(job.target.kind()),
            reused_from,
        }
    }

    async fn store(
        &self,
        job: &JobRequest,
        staged: StagedSnapshot,
        record: SnapshotRecord,
    ) -> Result<SnapshotId, JobFailure> {
        let snapshots = &self.deps.snapshots;
        let committed = if job.force {
            snapshots.commit_snapshot_replacing(staged, record).await
        } else {
            snapshots.commit_snapshot(staged, record).await
        };
        committed
            .map(|summary| summary.snapshot_ref.snapshot_id)
            .map_err(store_failure)
    }

    fn discard(&self, job: &JobRequest, staged: StagedSnapshot, failure: JobFailure) -> JobFailure {
        let has_log = staged.log_file().is_file();
        let discarded = match &failure {
            JobFailure::Failed(_) if has_log => {
                self.deps.snapshots.keep_failed(staged, &job.id).map(|_| ())
            }
            _ => self.deps.snapshots.abort_snapshot(staged),
        };
        if let Err(error) = discarded {
            tracing::warn!("could not clean up after the analysis {}: {error}", job.id);
        }
        failure
    }
}

struct Finished {
    origin: MapOrigin,
    hosting: Option<HostingRecord>,
    started: Started,
}

fn git_folder(job: &JobRequest, folder_path: &Path) -> GitFolder {
    GitFolder {
        path: folder_path.to_path_buf(),
        repo: Some(job.folder.clone()),
    }
}

fn target_commit(target: &AnalysisTarget) -> Option<&CommitSha> {
    match target {
        AnalysisTarget::Commit { sha } => Some(sha),
        AnalysisTarget::WorkingTree => None,
    }
}

fn plain_folder_git(target: &AnalysisTarget) -> Result<Option<GitRecord>, JobFailure> {
    match target {
        AnalysisTarget::WorkingTree => Ok(None),
        AnalysisTarget::Commit { .. } => Err(JobError::new(
            AnalysisErrorCode::InvalidArguments,
            "A folder that is not a git repository has no commits to analyse.",
        )
        .into()),
    }
}

fn reuse_map(
    staged: &StagedSnapshot,
    reusable: &SnapshotRecord,
    source: &Path,
) -> Result<MapOrigin, JobFailure> {
    fs::copy(source, staged.map_file()).map_err(|error| write_failure(source, &error))?;
    let note = format!(
        "Reused the map of snapshot {}, which has the same files and profile; ccsh did not run.\n",
        reusable.id
    );
    fs::write(staged.log_file(), note)
        .map_err(|error| write_failure(&staged.log_file(), &error))?;
    let not_in_map = reusable
        .analysis
        .as_ref()
        .map(|analysis| analysis.not_in_map.clone())
        .unwrap_or_default();
    Ok(MapOrigin::Reused {
        from: reusable.id.clone(),
        not_in_map,
    })
}

/// After exit 0 the `Map:` line names the file; for a commit its name must start with a prefix of the
/// sha, since ccsh silently analyses HEAD for a reference it cannot resolve (05-M0).
fn place_map(
    run: &CcshRunResult,
    staged: &StagedSnapshot,
    commit: Option<&CommitSha>,
) -> Result<MapOrigin, JobFailure> {
    let failure = || classify_failure(run).map_or(JobFailure::Cancelled, JobFailure::Failed);
    if run.end
        != (RunEnd::Exited {
            code: SUCCESS_EXIT_CODE,
        })
    {
        return Err(failure());
    }
    let map = parse_map_line(&run.stdout)
        .filter(|map| map.is_file() && map.parent() == Some(staged.directory()))
        .ok_or_else(failure)?;
    if let Some(sha) = commit {
        ensure_map_of_commit(&map, sha)?;
    }
    if map != staged.map_file() {
        fs::rename(&map, staged.map_file()).map_err(|error| write_failure(&map, &error))?;
    }
    Ok(MapOrigin::Ran {
        not_in_map: parse_not_in_map(&run.stdout),
    })
}

fn ensure_map_of_commit(map: &Path, sha: &CommitSha) -> Result<(), JobFailure> {
    let prefix = map
        .file_name()
        .and_then(|name| name.to_str())
        .and_then(|name| name.split(SHORT_HASH_SEPARATOR).next())
        .unwrap_or_default();
    if !prefix.is_empty() && sha.as_str().starts_with(prefix) {
        return Ok(());
    }
    let message = format!("ccsh analysed another commit than {sha}.");
    Err(JobError::new(AnalysisErrorCode::UnknownCommit, message).into())
}

fn remove_worktree_temp(staged: &StagedSnapshot) -> Result<(), JobFailure> {
    let temp = staged.directory().join(WORKTREE_TEMP_FOLDER);
    match fs::remove_dir_all(&temp) {
        Err(error) if error.kind() != io::ErrorKind::NotFound => Err(write_failure(&temp, &error)),
        _ => Ok(()),
    }
}

fn map_record(map_file: &Path) -> Result<MapRecord, JobFailure> {
    let bytes = fs::metadata(map_file)
        .map_err(|error| write_failure(map_file, &error))?
        .len();
    let head = read_map_head(map_file).unwrap_or_else(|error| {
        tracing::warn!(
            "could not read the start of {}: {error}",
            map_file.display()
        );
        Default::default()
    });
    Ok(MapRecord {
        file: MAP_FILE_NAME.to_string(),
        bytes,
        checksum: head.checksum,
        root_name: head.root_name,
    })
}

fn snapshot_id_for(job: &JobRequest, plan: &JobPlan) -> Result<SnapshotId, JobFailure> {
    let id = match (&job.target, &plan.git) {
        (AnalysisTarget::Commit { .. }, Some(git)) => {
            commit_snapshot_id(&git.commit, &plan.profile_hash)
        }
        _ => working_tree_snapshot_id(SystemTime::now(), &plan.profile_hash),
    };
    id.map_err(store_failure)
}

fn tool_version(report: &ToolsReport, tool: ToolId) -> Option<String> {
    report
        .tools
        .iter()
        .find(|status| status.tool == tool)
        .and_then(|status| status.version.clone())
}

fn missing_folder(error: CoreError) -> JobFailure {
    let code = match error {
        CoreError::NotFound(_) | CoreError::FolderUnavailable(_) => {
            AnalysisErrorCode::FolderMissing
        }
        _ => AnalysisErrorCode::StoreWriteFailed,
    };
    JobError::new(code, error.to_string()).into()
}

fn git_failure(error: CoreError) -> JobFailure {
    if matches!(error, CoreError::Cancelled) {
        return JobFailure::Cancelled;
    }
    let code = match error.code() {
        ErrorCode::ToolNotFound => AnalysisErrorCode::GitNotFound,
        ErrorCode::Timeout => AnalysisErrorCode::GitTimeout,
        ErrorCode::NotACommit | ErrorCode::UnknownRevision => AnalysisErrorCode::UnknownCommit,
        _ => AnalysisErrorCode::NotARepository,
    };
    JobError::new(code, error.to_string()).into()
}

fn store_failure(error: CoreError) -> JobFailure {
    JobError::new(AnalysisErrorCode::StoreWriteFailed, error.to_string()).into()
}

fn write_failure(path: &Path, error: &io::Error) -> JobFailure {
    let message = format!("Could not write {}: {error}", path.display());
    JobError::new(AnalysisErrorCode::StoreWriteFailed, message).into()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_accept_a_map_named_after_a_prefix_of_the_commit() {
        // Arrange
        let sha = CommitSha::try_from("afdb82c0123456789abcdef0123456789abcdef0").unwrap();

        // Act
        let matching = ensure_map_of_commit(Path::new("/job/afdb82c.map.cc.json.gz"), &sha);
        let other = ensure_map_of_commit(Path::new("/job/20acbf8.map.cc.json.gz"), &sha);

        // Assert
        assert!(matching.is_ok());
        assert!(
            matches!(other, Err(JobFailure::Failed(ref error)) if error.code == AnalysisErrorCode::UnknownCommit),
            "{other:?}"
        );
    }

    #[test]
    fn should_map_git_errors_to_job_errors() {
        // Arrange
        let errors = [
            CoreError::ToolNotFound { tool: ToolId::Git },
            CoreError::Timeout { after_ms: 1 },
            CoreError::NotACommit {
                commit: "HEAD".to_string(),
            },
            CoreError::Cancelled,
        ];

        // Act
        let failures: Vec<JobFailure> = errors.into_iter().map(git_failure).collect();

        // Assert
        let codes: Vec<Option<AnalysisErrorCode>> = failures
            .iter()
            .map(|failure| match failure {
                JobFailure::Failed(error) => Some(error.code),
                JobFailure::Cancelled => None,
            })
            .collect();
        assert_eq!(
            codes,
            [
                Some(AnalysisErrorCode::GitNotFound),
                Some(AnalysisErrorCode::GitTimeout),
                Some(AnalysisErrorCode::UnknownCommit),
                None,
            ]
        );
    }
}
