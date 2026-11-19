use std::fmt::Write;
use std::time::SystemTime;

use codecharta_core_api::ids::{
    FolderId, JobId, ProjectId, SnapshotId, WORKING_TREE_SNAPSHOT_PREFIX,
};
use codecharta_core_api::secret::Secret;
use codecharta_core_api::values::{FullCommit, PICK_TOKEN_LENGTH, PickToken, PromptId};

use crate::error::{CoreError, CoreResult};

const PROJECT_ID_PREFIX: &str = "p-";
const FOLDER_ID_PREFIX: &str = "f-";
const JOB_ID_PREFIX: &str = "job-";
const RANDOM_ID_BYTES: usize = 8;
const STAGING_SUFFIX_BYTES: usize = 4;
const IMPORTED_MARKER: &str = "imported";
const BOUND_IMPORT_HASH_DIGITS: usize = 8;
const UNBOUND_IMPORT_HASH_DIGITS: usize = 16;
const HEX_DIGITS_PER_BYTE: usize = 2;
const ASKPASS_TOKEN_BYTES: usize = 32;
const PROMPT_ID_BYTES: usize = 16;

pub fn new_project_id() -> CoreResult<ProjectId> {
    let id = random_hex(PROJECT_ID_PREFIX, RANDOM_ID_BYTES)?;
    ProjectId::try_from(id).map_err(|error| CoreError::Internal(error.to_string()))
}

pub fn new_folder_id() -> CoreResult<FolderId> {
    let id = random_hex(FOLDER_ID_PREFIX, RANDOM_ID_BYTES)?;
    FolderId::try_from(id).map_err(|error| CoreError::Internal(error.to_string()))
}

pub fn new_job_id() -> CoreResult<JobId> {
    let id = random_hex(JOB_ID_PREFIX, RANDOM_ID_BYTES)?;
    JobId::try_from(id).map_err(|error| CoreError::Internal(error.to_string()))
}

pub fn new_token() -> CoreResult<PickToken> {
    let token = random_hex("", PICK_TOKEN_LENGTH / HEX_DIGITS_PER_BYTE)?;
    PickToken::try_from(token).map_err(|error| CoreError::Internal(error.to_string()))
}

/// Names a log session in its page cursors: 16 hex digits.
pub fn new_log_session_id() -> CoreResult<String> {
    random_hex("", RANDOM_ID_BYTES)
}

/// The secret an askpass helper proves it was started for one operation: 64 hex digits.
pub fn new_askpass_token() -> CoreResult<Secret> {
    random_hex("", ASKPASS_TOKEN_BYTES).map(Secret::new)
}

/// 32 hex digits, unguessable so another renderer frame cannot answer a prompt it never saw.
pub fn new_prompt_id() -> CoreResult<PromptId> {
    let id = random_hex("", PROMPT_ID_BYTES)?;
    PromptId::try_from(id).map_err(|error| CoreError::Internal(error.to_string()))
}

/// Names the askpass socket or pipe of one serving core: 16 hex digits.
pub fn new_endpoint_suffix() -> CoreResult<String> {
    random_hex("", RANDOM_ID_BYTES)
}

/// The random part of a staging directory name: 8 hex digits.
pub fn new_staging_suffix() -> CoreResult<String> {
    random_hex("", STAGING_SUFFIX_BYTES)
}

/// `<fullSha>-imported-<8hex>` when bound to a commit, else `imported-<16hex>`; the hex digits are the
/// first ones of the content hash.
pub fn imported_snapshot_id(
    content_sha256: &str,
    commit: Option<&FullCommit>,
) -> CoreResult<SnapshotId> {
    let digits = if commit.is_some() {
        BOUND_IMPORT_HASH_DIGITS
    } else {
        UNBOUND_IMPORT_HASH_DIGITS
    };
    let hash_prefix = content_sha256
        .get(..digits)
        .ok_or_else(|| CoreError::Internal("the content hash is too short".to_string()))?;
    let id = match commit {
        Some(commit) => format!("{commit}-{IMPORTED_MARKER}-{hash_prefix}"),
        None => format!("{IMPORTED_MARKER}-{hash_prefix}"),
    };
    SnapshotId::try_from(id).map_err(|error| CoreError::Internal(error.to_string()))
}

/// `<fullSha>-<profileHash>`: one snapshot per commit and profile.
pub fn commit_snapshot_id(commit: &FullCommit, profile_hash: &str) -> CoreResult<SnapshotId> {
    snapshot_id(format!("{commit}-{profile_hash}"))
}

/// `worktree-<YYYYMMDD>T<HHmmssSSS>Z-<profileHash>` in UTC: no `:` or `.`, which Windows file names do not
/// allow or trim.
pub fn working_tree_snapshot_id(at: SystemTime, profile_hash: &str) -> CoreResult<SnapshotId> {
    let compact: String = humantime::format_rfc3339_millis(at)
        .to_string()
        .chars()
        .filter(char::is_ascii_alphanumeric)
        .collect();
    snapshot_id(format!(
        "{WORKING_TREE_SNAPSHOT_PREFIX}{compact}-{profile_hash}"
    ))
}

fn snapshot_id(id: String) -> CoreResult<SnapshotId> {
    SnapshotId::try_from(id).map_err(|error| CoreError::Internal(error.to_string()))
}

fn random_hex(prefix: &str, byte_count: usize) -> CoreResult<String> {
    let mut bytes = vec![0u8; byte_count];
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

    #[test]
    fn should_generate_a_token_of_32_hex_digits() {
        // Arrange
        let first = new_token().unwrap();

        // Act
        let second = new_token().unwrap();

        // Assert
        assert_eq!(first.as_str().len(), PICK_TOKEN_LENGTH);
        assert_ne!(first, second);
    }

    #[test]
    fn should_build_imported_ids_from_the_content_hash_and_the_commit() {
        // Arrange
        let content_sha256 = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
        let commit = FullCommit::try_from("fedcba9876543210fedcba9876543210fedcba98").unwrap();

        // Act
        let unbound = imported_snapshot_id(content_sha256, None).unwrap();
        let bound = imported_snapshot_id(content_sha256, Some(&commit)).unwrap();

        // Assert
        assert_eq!(unbound.as_str(), "imported-0123456789abcdef");
        assert_eq!(
            bound.as_str(),
            "fedcba9876543210fedcba9876543210fedcba98-imported-01234567"
        );
    }
}
