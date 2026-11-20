use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::registry::{Audience, Method};

/// What the shell may reveal or read. The renderer names a target; only the core turns it into a path.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum ShellPathTarget {
    DataFolder,
    LogsFolder,
    StoreRoot,
    SnapshotMap {
        project_id: String,
        folder_id: String,
        snapshot_id: String,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResolvePathParams {
    pub target: ShellPathTarget,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ResolvePathResult {
    pub path: String,
}

pub struct ShellResolvePath;

impl Method for ShellResolvePath {
    const NAME: &'static str = "shell.resolvePath";
    const AUDIENCE: Audience = Audience::Shell;
    type Params = ResolvePathParams;
    type Result = ResolvePathResult;
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn should_read_targets_by_kind() {
        // Arrange
        let params = json!({ "target": { "kind": "snapshotMap", "projectId": "p", "folderId": "f", "snapshotId": "s" } });

        // Act
        let parsed = serde_json::from_value::<ResolvePathParams>(params).unwrap();

        // Assert
        assert_eq!(
            parsed.target,
            ShellPathTarget::SnapshotMap {
                project_id: "p".to_string(),
                folder_id: "f".to_string(),
                snapshot_id: "s".to_string(),
            }
        );
    }

    #[test]
    fn should_write_a_unit_target_as_its_kind() {
        // Arrange
        let target = ShellPathTarget::StoreRoot;

        // Act
        let json = serde_json::to_value(target).unwrap();

        // Assert
        assert_eq!(json, json!({ "kind": "storeRoot" }));
    }
}
