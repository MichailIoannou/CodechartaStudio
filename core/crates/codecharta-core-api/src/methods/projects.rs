use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::ids::FolderId;
use crate::values::FullCommit;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct GitRemote {
    pub name: String,
    pub url: String,
}

/// What git said about a folder when it was last inspected; kept while a later inspection fails.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct FolderGitFacts {
    pub top_level: String,
    pub is_repository_root: bool,
    pub remotes: Vec<GitRemote>,
    pub default_branch: Option<String>,
    pub root_commits: Vec<FullCommit>,
    pub is_shallow: bool,
    pub detected_at: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub enum RelationshipKind {
    ForkOf,
    SharesHistoryWith,
    SameRemote,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct FolderRelationship {
    pub kind: RelationshipKind,
    pub folder_id: FolderId,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub enum FolderKind {
    Git,
    Plain,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedCommit {
    pub commit: FullCommit,
    pub short_commit: String,
    pub subject: String,
    pub author_name: String,
    pub author_date: String,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn should_write_relationships_in_camel_case() {
        // Arrange
        let relationship = FolderRelationship {
            kind: RelationshipKind::SharesHistoryWith,
            folder_id: FolderId::try_from("f-1").unwrap(),
        };

        // Act
        let json = serde_json::to_value(relationship).unwrap();

        // Assert
        assert_eq!(
            json,
            json!({ "kind": "sharesHistoryWith", "folderId": "f-1" })
        );
    }
}
