use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::methods::git::GitFileChange;
use crate::methods::projects::FolderRef;
use crate::methods::snapshots::{SnapshotRelation, SnapshotSummary};
use crate::registry::method;
use crate::values::{CommitSha, Revision};

/// What the user pointed at in one project folder. `Commits` takes the ancestor as the base, else the
/// older commit; `WithParent` compares with the first parent; `WithCurrent` compares with `shownCommit`,
/// else with `HEAD`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum CompareIntent {
    Commits {
        folder: FolderRef,
        a: Revision,
        b: Revision,
    },
    WithParent {
        folder: FolderRef,
        commit: Revision,
    },
    WithCurrent {
        folder: FolderRef,
        commit: Revision,
    },
}

impl CompareIntent {
    pub fn folder(&self) -> &FolderRef {
        match self {
            CompareIntent::Commits { folder, .. }
            | CompareIntent::WithParent { folder, .. }
            | CompareIntent::WithCurrent { folder, .. } => folder,
        }
    }
}

/// Resolving never starts an analysis.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResolveComparisonParams {
    pub intent: CompareIntent,
    pub shown_commit: Option<CommitSha>,
}

/// `mergeBase` compares a branch from where it left its target, `tip` the two commits themselves.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub enum BaseMode {
    MergeBase,
    Tip,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub enum RefLabelKind {
    Commit,
    Branch,
    Tag,
}

/// How a side is named: a branch or tag name when the user picked one, else the short commit.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct RefLabel {
    pub kind: RefLabelKind,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ComparedCommit {
    pub folder: FolderRef,
    pub commit: CommitSha,
    pub short_commit: String,
    pub label: RefLabel,
}

/// The snapshot "Use nearest" would show; `staleBy` counts the commits between it and the asked commit.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct NearestSnapshot {
    pub snapshot: SnapshotSummary,
    pub relation: SnapshotRelation,
    pub stale_by: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(
    tag = "status",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum SideStatus {
    Exact { snapshot: SnapshotSummary },
    Missing { nearest: Option<NearestSnapshot> },
}

impl SideStatus {
    /// The exact snapshot, else the nearest one.
    pub fn shown_snapshot(&self) -> Option<&SnapshotSummary> {
        match self {
            SideStatus::Exact { snapshot } => Some(snapshot),
            SideStatus::Missing { nearest } => nearest.as_ref().map(|nearest| &nearest.snapshot),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedSide {
    pub requested: ComparedCommit,
    pub status: SideStatus,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub enum SizeVerdict {
    Ok,
    Warn,
    Block,
}

/// Checked on the snapshots each side would show (exact, else nearest); `combinedBytes` sums their
/// compressed maps.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct Preflight {
    pub identical_checksums: bool,
    pub profiles_differ: bool,
    pub combined_bytes: u64,
    pub size_verdict: SizeVerdict,
}

/// Outcomes the user must see; they are results, not errors.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ResolveStatus {
    Ready,
    SameCommit,
    NoCommonAncestor,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedComparison {
    pub status: ResolveStatus,
    pub base_mode: BaseMode,
    pub base: ResolvedSide,
    pub head: ResolvedSide,
    pub preflight: Preflight,
}

method!(
    CompareResolve,
    "compare.resolve",
    Renderer,
    ResolveComparisonParams,
    ResolvedComparison
);

/// The commits are looked for in `baseFolder` first, then in `headFolder`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ChangedFilesParams {
    pub base_folder: FolderRef,
    pub head_folder: FolderRef,
    pub base: CommitSha,
    pub head: CommitSha,
}

/// `git` when a clone holds both commits; `unavailable` when none does.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub enum ChangedFilesSource {
    Git,
    Unavailable,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ChangedFile {
    pub change: GitFileChange,
    /// Relative to the project folder, with `/` separators.
    pub path: String,
    /// The path before a rename or copy.
    pub previous_path: Option<String>,
}

/// Every changed file below the project folder, never cut short.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ChangedFilesResult {
    pub source: ChangedFilesSource,
    pub files: Vec<ChangedFile>,
}

method!(
    CompareChangedFiles,
    "compare.changedFiles",
    Renderer,
    ChangedFilesParams,
    ChangedFilesResult
);

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn should_read_an_intent_by_kind_with_its_folder() {
        // Arrange
        let json = json!({
            "intent": {
                "kind": "withParent",
                "folder": { "projectId": "p-1", "folderId": "f-1" },
                "commit": "HEAD"
            },
            "shownCommit": null
        });

        // Act
        let params: ResolveComparisonParams = serde_json::from_value(json).unwrap();

        // Assert
        assert_eq!(params.intent.folder().folder_id.as_str(), "f-1");
        assert!(matches!(
            params.intent,
            CompareIntent::WithParent { ref commit, .. } if commit.as_str() == "HEAD"
        ));
    }

    #[test]
    fn should_refuse_an_expression_as_a_revision() {
        // Arrange
        let json = json!({
            "intent": {
                "kind": "commits",
                "folder": { "projectId": "p-1", "folderId": "f-1" },
                "a": "HEAD~1",
                "b": "HEAD"
            },
            "shownCommit": null
        });

        // Act
        let params = serde_json::from_value::<ResolveComparisonParams>(json);

        // Assert
        assert!(params.is_err());
    }

    #[test]
    fn should_write_statuses_with_their_tags() {
        // Arrange
        let missing = SideStatus::Missing { nearest: None };

        // Act
        let missing_json = serde_json::to_value(missing).unwrap();
        let status_json = serde_json::to_value(ResolveStatus::NoCommonAncestor).unwrap();

        // Assert
        assert_eq!(
            missing_json,
            json!({ "status": "missing", "nearest": null })
        );
        assert_eq!(status_json, json!({ "kind": "noCommonAncestor" }));
    }

    #[test]
    fn should_write_an_unavailable_source_without_files() {
        // Arrange
        let result = ChangedFilesResult {
            source: ChangedFilesSource::Unavailable,
            files: Vec::new(),
        };

        // Act
        let json = serde_json::to_value(result).unwrap();

        // Assert
        assert_eq!(json, json!({ "source": "unavailable", "files": [] }));
    }

    #[test]
    fn should_refuse_changed_files_params_with_an_unknown_field() {
        // Arrange
        let json = json!({
            "baseFolder": { "projectId": "p-1", "folderId": "f-1" },
            "headFolder": { "projectId": "p-1", "folderId": "f-1" },
            "base": "a".repeat(40),
            "head": "b".repeat(40),
            "mode": "tip"
        });

        // Act
        let params = serde_json::from_value::<ChangedFilesParams>(json);

        // Assert
        assert!(params.is_err());
    }
}
