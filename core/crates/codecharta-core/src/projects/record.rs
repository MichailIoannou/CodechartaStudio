use codecharta_core_api::ids::{FolderId, ProjectId};
use codecharta_core_api::methods::hosting::HostingOverride;
use codecharta_core_api::methods::projects::{
    AnalysisProfile, FolderGitFacts, FolderKind, FolderRole, ProjectView,
};
use codecharta_core_api::values::{Description, Label, ProjectName};
use serde::{Deserialize, Serialize};

pub const PROJECT_SCHEMA_VERSION: u32 = 1;

/// `project.json` as it is stored; status, relationships and counts are derived when it is read.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRecord {
    pub schema_version: u32,
    pub id: ProjectId,
    pub name: ProjectName,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<Description>,
    pub created_at: String,
    pub updated_at: String,
    pub folders: Vec<FolderRecord>,
    pub analysis_profile: AnalysisProfile,
    pub view: ProjectView,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderRecord {
    pub id: FolderId,
    pub path: String,
    pub label: Label,
    pub role: FolderRole,
    pub kind: FolderKind,
    pub git: Option<FolderGitFacts>,
    pub added_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hosting: Option<HostingOverride>,
}

impl ProjectRecord {
    pub fn folder(&self, folder: &FolderId) -> Option<&FolderRecord> {
        self.folders
            .iter()
            .find(|candidate| &candidate.id == folder)
    }

    pub fn folder_mut(&mut self, folder: &FolderId) -> Option<&mut FolderRecord> {
        self.folders
            .iter_mut()
            .find(|candidate| &candidate.id == folder)
    }

    pub fn primary_folder(&self) -> Option<&FolderRecord> {
        self.folders
            .iter()
            .find(|folder| folder.role == FolderRole::Primary)
    }
}
