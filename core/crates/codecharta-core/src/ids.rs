use std::fmt::Write;

use codecharta_core_api::ids::{FolderId, ProjectId};

use crate::error::{CoreError, CoreResult};

const PROJECT_ID_PREFIX: &str = "p-";
const FOLDER_ID_PREFIX: &str = "f-";
const RANDOM_ID_BYTES: usize = 8;

pub fn new_project_id() -> CoreResult<ProjectId> {
    let id = random_id(PROJECT_ID_PREFIX)?;
    ProjectId::try_from(id).map_err(|error| CoreError::Internal(error.to_string()))
}

pub fn new_folder_id() -> CoreResult<FolderId> {
    let id = random_id(FOLDER_ID_PREFIX)?;
    FolderId::try_from(id).map_err(|error| CoreError::Internal(error.to_string()))
}

fn random_id(prefix: &str) -> CoreResult<String> {
    let mut bytes = [0u8; RANDOM_ID_BYTES];
    getrandom::fill(&mut bytes).map_err(|error| CoreError::Io {
        context: "Could not generate a random id".to_string(),
        source: std::io::Error::other(error.to_string()),
    })?;
    Ok(bytes.iter().fold(prefix.to_string(), |mut id, byte| {
        let _ = write!(id, "{byte:02x}");
        id
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    const HEX_DIGITS_PER_BYTE: usize = 2;

    #[test]
    fn should_accept_a_generated_id() {
        // Arrange
        let expected_length = PROJECT_ID_PREFIX.len() + RANDOM_ID_BYTES * HEX_DIGITS_PER_BYTE;

        // Act
        let project_id = new_project_id().unwrap();
        let folder_id = new_folder_id().unwrap();

        // Assert
        assert!(project_id.as_str().starts_with(PROJECT_ID_PREFIX));
        assert!(folder_id.as_str().starts_with(FOLDER_ID_PREFIX));
        assert_eq!(project_id.as_str().len(), expected_length);
        assert_eq!(
            ProjectId::try_from(project_id.as_str()).unwrap(),
            project_id
        );
    }

    #[test]
    fn should_generate_a_different_id_each_time() {
        // Arrange
        let first = new_project_id().unwrap();

        // Act
        let second = new_project_id().unwrap();

        // Assert
        assert_ne!(first, second);
    }
}
