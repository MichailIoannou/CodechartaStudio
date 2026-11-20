use codecharta_core_api::ids::{FolderId, ProjectId};

pub fn parse_project_id(value: &str) -> Result<ProjectId, String> {
    ProjectId::try_from(value).map_err(|error| error.to_string())
}

pub fn parse_folder_id(value: &str) -> Result<FolderId, String> {
    FolderId::try_from(value).map_err(|error| error.to_string())
}
