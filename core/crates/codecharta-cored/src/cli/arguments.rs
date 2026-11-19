use codecharta_core_api::ids::{FolderId, ProjectId};
use codecharta_core_api::values::CommitSha;

pub fn parse_project_id(value: &str) -> Result<ProjectId, String> {
    ProjectId::try_from(value).map_err(|error| error.to_string())
}

pub fn parse_folder_id(value: &str) -> Result<FolderId, String> {
    FolderId::try_from(value).map_err(|error| error.to_string())
}

pub fn parse_commit_sha(value: &str) -> Result<CommitSha, String> {
    CommitSha::try_from(value).map_err(|error| error.to_string())
}
