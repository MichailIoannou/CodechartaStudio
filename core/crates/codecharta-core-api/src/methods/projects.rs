use std::collections::BTreeMap;

use serde::{Deserialize, Deserializer, Serialize};
use ts_rs::TS;

use crate::ids::{FolderId, ProjectId, SnapshotId};
use crate::values::{Description, ExcludePattern, FullCommit, Label, PickToken, ProjectName};

pub const MAX_EXCLUDE_PATTERNS: usize = 50;

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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub enum FolderRole {
    Primary,
    Fork,
    Helper,
}

/// The `ccsh analyse` parts a profile can leave out.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum AnalyserName {
    Rawtextparser,
    Unifiedparser,
    Dependencyparser,
    Domainlanguageparser,
    Git,
    Svn,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AnalysisProfile {
    #[serde(deserialize_with = "at_most_max_exclude_patterns")]
    pub exclude: Vec<ExcludePattern>,
    pub without: Vec<AnalyserName>,
    pub parallel: bool,
}

impl Default for AnalysisProfile {
    fn default() -> Self {
        Self {
            exclude: Vec::new(),
            without: Vec::new(),
            parallel: true,
        }
    }
}

fn at_most_max_exclude_patterns<'de, D: Deserializer<'de>>(
    deserializer: D,
) -> Result<Vec<ExcludePattern>, D::Error> {
    let patterns = Vec::<ExcludePattern>::deserialize(deserializer)?;
    if patterns.len() > MAX_EXCLUDE_PATTERNS {
        return Err(serde::de::Error::custom(format!(
            "use at most {MAX_EXCLUDE_PATTERNS} exclude patterns"
        )));
    }
    Ok(patterns)
}

/// A folder to add, named by the token its native pick answered; the renderer never sends a path.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NewFolder {
    pub pick_token: PickToken,
    pub label: Label,
    pub role: FolderRole,
}

/// Derived on every read: whether the folder is still where the project says.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub enum FolderStatus {
    Ok,
    Missing,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ProjectFolder {
    pub id: FolderId,
    pub path: String,
    pub label: Label,
    pub role: FolderRole,
    pub kind: FolderKind,
    pub git: Option<FolderGitFacts>,
    pub added_at: String,
    pub status: FolderStatus,
    pub relationships: Vec<FolderRelationship>,
    pub snapshot_count: u32,
}

/// The user works in one folder at a time (owner decision OD1); each folder remembers what it showed.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProjectView {
    pub working_folder_id: Option<FolderId>,
    pub shown_snapshot_id_by_folder: BTreeMap<FolderId, SnapshotId>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: ProjectId,
    pub name: ProjectName,
    pub description: Option<Description>,
    pub created_at: String,
    pub updated_at: String,
    pub folders: Vec<ProjectFolder>,
    pub analysis_profile: AnalysisProfile,
    pub view: ProjectView,
}

/// `problem` names why a project could not be read; the list shows it instead of failing.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSummary {
    pub id: ProjectId,
    pub name: String,
    pub folder_count: u32,
    pub missing_folder_count: u32,
    pub snapshot_count: u32,
    pub problem: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FolderRef {
    pub project_id: ProjectId,
    pub folder_id: FolderId,
}

/// Fields left out stay as they are; an empty description removes it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdateProjectParams {
    pub project_id: ProjectId,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub name: Option<ProjectName>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub description: Option<Description>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub analysis_profile: Option<AnalysisProfile>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn should_reject_an_unknown_analyser_name() {
        // Arrange
        let profile = json!({ "exclude": [], "without": ["gitlogparser"], "parallel": true });

        // Act
        let parsed = serde_json::from_value::<AnalysisProfile>(profile);

        // Assert
        assert!(parsed.is_err());
    }

    #[test]
    fn should_read_a_profile_with_known_analysers() {
        // Arrange
        let profile = json!({ "exclude": ["build"], "without": ["svn", "dependencyparser"], "parallel": false });

        // Act
        let parsed = serde_json::from_value::<AnalysisProfile>(profile).unwrap();

        // Assert
        assert_eq!(
            parsed.without,
            vec![AnalyserName::Svn, AnalyserName::Dependencyparser]
        );
        assert_eq!(parsed.exclude[0].as_str(), "build");
    }

    #[test]
    fn should_reject_more_exclude_patterns_than_the_limit() {
        // Arrange
        let patterns: Vec<String> = (0..=MAX_EXCLUDE_PATTERNS)
            .map(|index| format!("p{index}"))
            .collect();
        let profile = json!({ "exclude": patterns, "without": [], "parallel": true });

        // Act
        let parsed = serde_json::from_value::<AnalysisProfile>(profile);

        // Assert
        assert!(parsed.is_err());
    }

    #[test]
    fn should_reject_a_new_folder_with_an_unknown_key_or_a_bad_label() {
        // Arrange
        let token = "0123456789abcdef0123456789abcdef";
        let unknown_key =
            json!({ "pickToken": token, "label": "app", "role": "primary", "path": "/etc" });
        let bad_label = json!({ "pickToken": token, "label": "../app", "role": "helper" });

        // Act
        let parsed = [unknown_key, bad_label].map(serde_json::from_value::<NewFolder>);

        // Assert
        assert!(parsed.iter().all(Result::is_err), "{parsed:?}");
    }

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
