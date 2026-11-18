use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::ids::{FolderId, ProjectId, SnapshotId};
use crate::values::FullCommit;

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
