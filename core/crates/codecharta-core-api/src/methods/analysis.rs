use serde::{Deserialize, Serialize};
use ts_rs::TS;

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
}
