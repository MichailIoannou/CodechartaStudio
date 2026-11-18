use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::ids::{FolderId, ProjectId, SnapshotId};
use crate::methods::projects::{FolderGitFacts, FolderKind, Project, ResolvedCommit};
use crate::values::{CommitHash, FullCommit, PickToken, ProjectName};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub enum SnapshotSource {
    Analysed,
    Imported,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SnapshotRef {
    pub project_id: ProjectId,
    pub folder_id: FolderId,
    pub snapshot_id: SnapshotId,
}

/// One snapshot as lists show it. An imported map has no analysis time: `createdAt` is when it entered
/// the store and `fileModifiedAt` only a hint.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotSummary {
    #[serde(rename = "ref")]
    pub snapshot_ref: SnapshotRef,
    pub source: SnapshotSource,
    pub created_at: String,
    pub commit: Option<FullCommit>,
    pub short_commit: Option<String>,
    pub subject: Option<String>,
    pub commit_date: Option<String>,
    pub dirty: bool,
    pub original_file_name: Option<String>,
    pub file_modified_at: Option<String>,
    pub map_bytes: u64,
    pub checksum: Option<String>,
    pub profile_hash: Option<String>,
}

/// The commit a file name starts with, the way `ccsh analyse --commit` names its output.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct CommitHint {
    pub hash: CommitHash,
}

/// The folder an import file lies in, inspected like a picked folder; the token stands for its path.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ContainingFolder {
    pub pick_token: PickToken,
    pub path: String,
    pub suggested_name: ProjectName,
    pub kind: FolderKind,
    pub git: Option<FolderGitFacts>,
}

/// A project that already has the containing folder.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ExistingTarget {
    pub project_id: ProjectId,
    pub project_name: String,
    pub folder_id: FolderId,
}

/// What the shell shows after a native file pick; `importToken` stands for the file from then on.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct PickedImportFile {
    pub import_token: PickToken,
    pub file_name: String,
    pub size_bytes: u64,
    pub file_modified_at: String,
    pub commit_hint: Option<CommitHint>,
    pub containing_folder: ContainingFolder,
    pub hint_commit: Option<ResolvedCommit>,
    pub existing_target: Option<ExistingTarget>,
    pub duplicate_of: Option<SnapshotRef>,
}

/// The project a cc.json file was opened into and the snapshot it became (or already was).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct OpenedFile {
    pub project: Project,
    pub snapshot: SnapshotSummary,
    pub created_project: bool,
    pub was_already_imported: bool,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn should_write_the_snapshot_reference_as_ref() {
        // Arrange
        let summary = SnapshotSummary {
            snapshot_ref: SnapshotRef {
                project_id: ProjectId::try_from("p-1").unwrap(),
                folder_id: FolderId::try_from("f-1").unwrap(),
                snapshot_id: SnapshotId::try_from("imported-0123456789abcdef").unwrap(),
            },
            source: SnapshotSource::Imported,
            created_at: "2026-11-18T00:00:00Z".to_string(),
            commit: None,
            short_commit: None,
            subject: None,
            commit_date: None,
            dirty: false,
            original_file_name: Some("map.cc.json".to_string()),
            file_modified_at: None,
            map_bytes: 1,
            checksum: None,
            profile_hash: None,
        };

        // Act
        let json = serde_json::to_value(summary).unwrap();

        // Assert
        assert_eq!(
            json["ref"],
            json!({ "projectId": "p-1", "folderId": "f-1", "snapshotId": "imported-0123456789abcdef" })
        );
        assert_eq!(json["source"], json!("imported"));
        assert_eq!(json["originalFileName"], json!("map.cc.json"));
    }
}
