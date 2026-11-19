use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::ids::{BatchId, FolderId, JobId, ProjectId, SnapshotId};
use crate::methods::core::EmptyParams;
use crate::methods::projects::FolderRef;
use crate::methods::snapshots::SnapshotLog;
use crate::registry::{Audience, Event, method};
use crate::values::CommitSha;

/// What one analysis maps: a commit, checked out by ccsh in a temporary worktree, or the folder as it is.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum AnalysisTarget {
    Commit { sha: CommitSha },
    WorkingTree,
}

impl AnalysisTarget {
    pub fn kind(&self) -> TargetKind {
        match self {
            AnalysisTarget::Commit { .. } => TargetKind::Commit,
            AnalysisTarget::WorkingTree => TargetKind::WorkingTree,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub enum TargetKind {
    Commit,
    WorkingTree,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "mode", rename_all = "camelCase")]
pub enum JobProgress {
    Indeterminate,
    Determinate { percent: u8 },
}

/// Why an analysis job failed. Append-only, like the protocol's error codes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AnalysisErrorCode {
    CcshNotFound,
    JavaNotFound,
    JavaTooOld,
    CcshTooOld,
    GitNotFound,
    FolderMissing,
    NotARepository,
    UnknownCommit,
    InvalidProfile,
    InvalidArguments,
    WorktreeFailed,
    GitTimeout,
    InteractiveTrap,
    AnalysisFailed,
    NoOutput,
    HeadMoved,
    Timeout,
    DiskFull,
    StoreWriteFailed,
    Crashed,
    OutputTooLarge,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct JobError {
    pub code: AnalysisErrorCode,
    pub message: String,
    pub hint: Option<String>,
}

impl JobError {
    pub fn new(code: AnalysisErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            hint: None,
        }
    }

    pub fn with_hint(self, hint: impl Into<String>) -> Self {
        Self {
            hint: Some(hint.into()),
            ..self
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub enum JobState {
    Queued,
    Running,
    Done,
    Failed,
    Cancelled,
}

impl JobState {
    pub fn is_finished(self) -> bool {
        matches!(
            self,
            JobState::Done | JobState::Failed | JobState::Cancelled
        )
    }
}

/// One analysis in the core's queue. `snapshotId` is set when it is done, `error` when it failed; a job
/// of a batch has its `batchId`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisJob {
    pub id: JobId,
    pub batch_id: Option<BatchId>,
    pub project_id: ProjectId,
    pub folder_id: FolderId,
    pub target: AnalysisTarget,
    pub profile_hash: String,
    pub state: JobState,
    pub progress: JobProgress,
    pub queued_at: String,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
    pub snapshot_id: Option<SnapshotId>,
    pub error: Option<JobError>,
}

impl AnalysisJob {
    pub fn folder(&self) -> FolderRef {
        FolderRef {
            project_id: self.project_id.clone(),
            folder_id: self.folder_id.clone(),
        }
    }
}

/// A finding of the preflight that does not block the analysis. Append-only.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum WarningCode {
    NotRepoRoot,
    ShallowClone,
    LowDiskSpace,
}

/// A blocking problem uses the job error the run would end with; a warning has its own codes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(untagged)]
pub enum ProblemCode {
    Error(AnalysisErrorCode),
    Warning(WarningCode),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub enum Severity {
    Error,
    Warning,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct PreflightProblem {
    pub code: ProblemCode,
    pub severity: Severity,
    pub message: String,
    pub hint: Option<String>,
}

impl PreflightProblem {
    pub fn error(error: JobError) -> Self {
        Self {
            code: ProblemCode::Error(error.code),
            severity: Severity::Error,
            message: error.message,
            hint: error.hint,
        }
    }

    pub fn warning(code: WarningCode, message: impl Into<String>) -> Self {
        Self {
            code: ProblemCode::Warning(code),
            severity: Severity::Warning,
            message: message.into(),
            hint: None,
        }
    }
}

/// `ok` is false when any problem is an error; warnings are shown and do not block.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct PreflightResult {
    pub ok: bool,
    pub problems: Vec<PreflightProblem>,
}

impl PreflightResult {
    pub fn of(problems: Vec<PreflightProblem>) -> Self {
        let ok = problems
            .iter()
            .all(|problem| problem.severity == Severity::Warning);
        Self { ok, problems }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PreflightParams {
    pub project_id: ProjectId,
    pub folder_id: FolderId,
    pub target: AnalysisTarget,
}

impl PreflightParams {
    pub fn folder(&self) -> FolderRef {
        FolderRef {
            project_id: self.project_id.clone(),
            folder_id: self.folder_id.clone(),
        }
    }
}

/// `force` analyses a commit again although it has a snapshot of the current profile.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EnqueueParams {
    pub project_id: ProjectId,
    pub folder_id: FolderId,
    pub target: AnalysisTarget,
    #[serde(default)]
    pub force: bool,
}

impl EnqueueParams {
    pub fn folder(&self) -> FolderRef {
        FolderRef {
            project_id: self.project_id.clone(),
            folder_id: self.folder_id.clone(),
        }
    }
}

/// `rejected` carries the preflight problems; nothing was queued then.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(
    tag = "status",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum EnqueueResult {
    Queued { job: AnalysisJob },
    AlreadyQueued { job: AnalysisJob },
    AlreadyAnalysed { snapshot_id: SnapshotId },
    Rejected { problems: Vec<PreflightProblem> },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct JobRefParams {
    pub job_id: JobId,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisJobList {
    pub jobs: Vec<AnalysisJob>,
}

/// The payload of every job notification but `analysis.progress`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisJobChanged {
    pub job: AnalysisJob,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisProgress {
    pub job_id: JobId,
    pub progress: JobProgress,
}

/// The commits a batch analyses: the given ones, the last `count` commits up to `tipSha`, or the commit of
/// every tag. A batch queues at most `MAX_BATCH_JOBS` (200) analyses.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum BatchSelection {
    Commits {
        shas: Vec<CommitSha>,
    },
    LastCommits {
        tip_sha: CommitSha,
        count: u16,
        first_parent_only: bool,
    },
    Tags,
}

/// `dryRun` answers what the batch would analyse and queues nothing.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EnqueueBatchParams {
    pub project_id: ProjectId,
    pub folder_id: FolderId,
    pub selection: BatchSelection,
    #[serde(default)]
    pub dry_run: bool,
}

impl EnqueueBatchParams {
    pub fn folder(&self) -> FolderRef {
        FolderRef {
            project_id: self.project_id.clone(),
            folder_id: self.folder_id.clone(),
        }
    }
}

/// `toAnalyse` lists the commits without a snapshot of the current profile, newest first, `leftOut` how
/// many more there were beyond the batch limit. `batchId` and `jobs` are set once something was queued; a
/// blocking preflight problem queues nothing.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct BatchResult {
    pub batch_id: Option<BatchId>,
    pub to_analyse: Vec<CommitSha>,
    pub already_analysed: Vec<CommitSha>,
    pub left_out: u32,
    pub jobs: Vec<AnalysisJob>,
    pub estimated_duration_ms: Option<u64>,
    pub problems: Vec<PreflightProblem>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BatchRefParams {
    pub batch_id: BatchId,
}

method!(
    AnalysisPreflight,
    "analysis.preflight",
    Renderer,
    PreflightParams,
    PreflightResult
);
method!(
    AnalysisEnqueue,
    "analysis.enqueue",
    Renderer,
    EnqueueParams,
    EnqueueResult
);
method!(
    AnalysisCancel,
    "analysis.cancel",
    Renderer,
    JobRefParams,
    ()
);
method!(
    AnalysisEnqueueBatch,
    "analysis.enqueueBatch",
    Renderer,
    EnqueueBatchParams,
    BatchResult
);
method!(
    AnalysisCancelBatch,
    "analysis.cancelBatch",
    Renderer,
    BatchRefParams,
    ()
);
method!(
    AnalysisList,
    "analysis.list",
    Renderer,
    EmptyParams,
    AnalysisJobList
);
method!(
    AnalysisReadLog,
    "analysis.readLog",
    Renderer,
    JobRefParams,
    SnapshotLog
);
method!(
    AnalysisClearFinished,
    "analysis.clearFinished",
    Renderer,
    EmptyParams,
    ()
);

/// Declares a notification the renderer receives: `renderer_event!(Marker, "domain.event", Params)`.
macro_rules! renderer_event {
    ($marker:ident, $name:literal, $params:ty) => {
        pub struct $marker;

        impl Event for $marker {
            const NAME: &'static str = $name;
            const AUDIENCE: Audience = Audience::Renderer;
            type Params = $params;
        }
    };
}

renderer_event!(AnalysisQueuedEvent, "analysis.queued", AnalysisJobChanged);
renderer_event!(AnalysisStartedEvent, "analysis.started", AnalysisJobChanged);
renderer_event!(AnalysisProgressEvent, "analysis.progress", AnalysisProgress);
renderer_event!(
    AnalysisFinishedEvent,
    "analysis.finished",
    AnalysisJobChanged
);
renderer_event!(AnalysisFailedEvent, "analysis.failed", AnalysisJobChanged);
renderer_event!(
    AnalysisCancelledEvent,
    "analysis.cancelled",
    AnalysisJobChanged
);
renderer_event!(SnapshotsChangedEvent, "snapshots.changed", FolderRef);

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn should_write_analysis_error_codes_in_screaming_snake_case() {
        // Arrange
        let codes = [
            AnalysisErrorCode::JavaTooOld,
            AnalysisErrorCode::NotARepository,
            AnalysisErrorCode::OutputTooLarge,
        ];

        // Act
        let written: Vec<serde_json::Value> = codes
            .iter()
            .map(|code| serde_json::to_value(code).unwrap())
            .collect();

        // Assert
        assert_eq!(
            written,
            [
                json!("JAVA_TOO_OLD"),
                json!("NOT_A_REPOSITORY"),
                json!("OUTPUT_TOO_LARGE")
            ]
        );
    }

    #[test]
    fn should_tag_targets_by_kind() {
        // Arrange
        let sha = CommitSha::try_from("0123456789abcdef0123456789abcdef01234567").unwrap();
        let targets = [AnalysisTarget::Commit { sha }, AnalysisTarget::WorkingTree];

        // Act
        let written = serde_json::to_value(&targets).unwrap();
        let kinds = serde_json::to_value(targets.map(|target| target.kind())).unwrap();

        // Assert
        assert_eq!(
            written,
            json!([
                { "kind": "commit", "sha": "0123456789abcdef0123456789abcdef01234567" },
                { "kind": "workingTree" }
            ])
        );
        assert_eq!(kinds, json!(["commit", "workingTree"]));
    }

    #[test]
    fn should_tag_progress_by_mode() {
        // Arrange
        let progress = [
            JobProgress::Indeterminate,
            JobProgress::Determinate { percent: 42 },
        ];

        // Act
        let written = serde_json::to_value(progress).unwrap();

        // Assert
        assert_eq!(
            written,
            json!([{ "mode": "indeterminate" }, { "mode": "determinate", "percent": 42 }])
        );
    }

    #[test]
    fn should_write_a_job_error_with_its_hint() {
        // Arrange
        let error = JobError::new(AnalysisErrorCode::UnknownCommit, "No commit found for x")
            .with_hint("Fetch the commit.");

        // Act
        let written = serde_json::to_value(error).unwrap();

        // Assert
        assert_eq!(
            written,
            json!({ "code": "UNKNOWN_COMMIT", "message": "No commit found for x", "hint": "Fetch the commit." })
        );
    }

    #[test]
    fn should_write_problem_codes_as_plain_strings_and_block_only_on_errors() {
        // Arrange
        let warning = PreflightProblem::warning(WarningCode::ShallowClone, "shallow");
        let error = PreflightProblem::error(JobError::new(AnalysisErrorCode::DiskFull, "full"));

        // Act
        let warned = PreflightResult::of(vec![warning.clone()]);
        let blocked = PreflightResult::of(vec![warning, error]);
        let written = serde_json::to_value(&blocked).unwrap();

        // Assert
        assert!(warned.ok);
        assert!(!blocked.ok);
        assert_eq!(
            written,
            json!({ "ok": false, "problems": [
                { "code": "SHALLOW_CLONE", "severity": "warning", "message": "shallow", "hint": null },
                { "code": "DISK_FULL", "severity": "error", "message": "full", "hint": null }
            ] })
        );
    }

    #[test]
    fn should_tag_enqueue_results_by_status() {
        // Arrange
        let snapshot_id =
            SnapshotId::try_from("0123456789abcdef0123456789abcdef01234567-0a1b2c3d").unwrap();
        let results = [
            EnqueueResult::AlreadyAnalysed { snapshot_id },
            EnqueueResult::Rejected {
                problems: Vec::new(),
            },
        ];

        // Act
        let written = serde_json::to_value(results).unwrap();

        // Assert
        assert_eq!(
            written,
            json!([
                { "status": "alreadyAnalysed", "snapshotId": "0123456789abcdef0123456789abcdef01234567-0a1b2c3d" },
                { "status": "rejected", "problems": [] }
            ])
        );
    }

    #[test]
    fn should_read_batch_selections_by_kind_and_default_to_a_real_run() {
        // Arrange
        let params = json!({
            "projectId": "p-1",
            "folderId": "f-1",
            "selection": {
                "kind": "lastCommits",
                "tipSha": "0123456789abcdef0123456789abcdef01234567",
                "count": 20,
                "firstParentOnly": true
            }
        });

        // Act
        let parsed: EnqueueBatchParams = serde_json::from_value(params).unwrap();
        let tags = serde_json::to_value(BatchSelection::Tags).unwrap();

        // Assert
        assert!(!parsed.dry_run);
        assert_eq!(
            parsed.selection,
            BatchSelection::LastCommits {
                tip_sha: CommitSha::try_from("0123456789abcdef0123456789abcdef01234567").unwrap(),
                count: 20,
                first_parent_only: true,
            }
        );
        assert_eq!(tags, json!({ "kind": "tags" }));
    }

    #[test]
    fn should_enqueue_without_force_when_it_is_left_out() {
        // Arrange
        let params =
            json!({ "projectId": "p-1", "folderId": "f-1", "target": { "kind": "workingTree" } });

        // Act
        let parsed: EnqueueParams = serde_json::from_value(params).unwrap();

        // Assert
        assert!(!parsed.force);
        assert_eq!(parsed.target, AnalysisTarget::WorkingTree);
    }
}
