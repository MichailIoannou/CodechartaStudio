use std::collections::BTreeMap;

use codecharta_core_api::error::{ErrorCode, ErrorPayload};
use codecharta_core_api::methods::tools::ToolId;

use crate::git::error::GitError;

const INTERNAL_MESSAGE: &str = "An internal error occurred; see the core log for details.";

#[derive(Debug, thiserror::Error)]
pub enum CoreError {
    #[error("{0}")]
    BadRequest(String),
    #[error("{0}")]
    NotFound(String),
    #[error("{0}")]
    NotAllowed(String),
    #[error("{0}")]
    Conflict(String),
    #[error("{tool} was not found")]
    ToolNotFound { tool: ToolId },
    #[error("{tool} failed: {message}")]
    ToolFailed { tool: ToolId, message: String },
    #[error("timed out after {after_ms} ms")]
    Timeout { after_ms: u64 },
    #[error("cancelled")]
    Cancelled,
    #[error("output exceeded {limit_bytes} bytes")]
    OutputTooLarge { limit_bytes: u64 },
    #[error("{context}: {source}")]
    Io {
        context: String,
        #[source]
        source: std::io::Error,
    },
    #[error("internal error: {0}")]
    Internal(String),
    #[error(
        "The store was written by a newer CodeCharta (schema {found}); this version reads up to schema {supported}."
    )]
    StoreNewerSchema { found: u64, supported: u32 },
    #[error("Another CodeCharta process is using the store at {store_root}.")]
    StoreLocked { store_root: String },
    #[error("The choice has expired or was used already; choose the {what} again.")]
    TokenExpired { what: &'static str },
    #[error("The folder {path} is already part of this project.")]
    DuplicateFolder { path: String },
    #[error("Another folder of this project is already called {label:?}.")]
    DuplicateLabel { label: String },
    #[error("{0}")]
    FolderUnavailable(String),
    #[error(
        "The folder at {path} has a different history; relink anyway only if this is intended."
    )]
    DifferentHistory { path: String },
    #[error("The file is larger than {limit_bytes} bytes.")]
    TooLarge { limit_bytes: u64 },
    #[error("The folder has no commit {commit}.")]
    NotACommit { commit: String },
    #[error("{}", .0.message)]
    Git(GitError),
}

pub type CoreResult<T> = Result<T, CoreError>;

impl CoreError {
    pub fn code(&self) -> ErrorCode {
        match self {
            CoreError::BadRequest(_) => ErrorCode::BadRequest,
            CoreError::NotFound(_) => ErrorCode::NotFound,
            CoreError::NotAllowed(_) => ErrorCode::NotAllowed,
            CoreError::Conflict(_) => ErrorCode::Conflict,
            CoreError::ToolNotFound { .. } => ErrorCode::ToolNotFound,
            CoreError::ToolFailed { .. } => ErrorCode::ToolFailed,
            CoreError::Timeout { .. } => ErrorCode::Timeout,
            CoreError::Cancelled => ErrorCode::Cancelled,
            CoreError::OutputTooLarge { .. } => ErrorCode::OutputTooLarge,
            CoreError::Io { .. } => ErrorCode::Io,
            CoreError::Internal(_) => ErrorCode::Internal,
            CoreError::StoreNewerSchema { .. } => ErrorCode::StoreNewerSchema,
            CoreError::StoreLocked { .. } => ErrorCode::StoreLocked,
            CoreError::TokenExpired { .. } => ErrorCode::TokenExpired,
            CoreError::DuplicateFolder { .. } => ErrorCode::DuplicateFolder,
            CoreError::DuplicateLabel { .. } => ErrorCode::DuplicateLabel,
            CoreError::FolderUnavailable(_) => ErrorCode::FolderUnavailable,
            CoreError::DifferentHistory { .. } => ErrorCode::DifferentHistory,
            CoreError::TooLarge { .. } => ErrorCode::TooLarge,
            CoreError::NotACommit { .. } => ErrorCode::NotACommit,
            CoreError::Git(error) => error.code,
        }
    }

    pub fn to_payload(&self) -> ErrorPayload {
        ErrorPayload {
            code: self.code(),
            message: self.payload_message(),
            details: self.details(),
        }
    }

    fn payload_message(&self) -> String {
        match self {
            CoreError::Io { context, .. } => context.clone(),
            CoreError::Internal(_) => INTERNAL_MESSAGE.to_string(),
            _ => self.to_string(),
        }
    }

    fn details(&self) -> BTreeMap<String, serde_json::Value> {
        if let CoreError::Git(error) = self {
            return git_details(error);
        }
        let detail = match self {
            CoreError::ToolNotFound { tool } | CoreError::ToolFailed { tool, .. } => {
                Some(("tool", serde_json::json!(tool)))
            }
            CoreError::Timeout { after_ms } => Some(("afterMs", serde_json::json!(after_ms))),
            CoreError::OutputTooLarge { limit_bytes } | CoreError::TooLarge { limit_bytes } => {
                Some(("limitBytes", serde_json::json!(limit_bytes)))
            }
            _ => None,
        };
        detail
            .into_iter()
            .map(|(key, value)| (key.to_string(), value))
            .collect()
    }
}

fn git_details(error: &GitError) -> BTreeMap<String, serde_json::Value> {
    [
        ("detail", error.detail.as_ref()),
        ("repositoryPath", error.repository_path.as_ref()),
    ]
    .into_iter()
    .filter_map(|(key, value)| Some((key.to_string(), serde_json::json!(value?))))
    .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn one_error_of_each_kind() -> Vec<(CoreError, ErrorCode)> {
        vec![
            (CoreError::BadRequest("bad".into()), ErrorCode::BadRequest),
            (CoreError::NotFound("gone".into()), ErrorCode::NotFound),
            (CoreError::NotAllowed("no".into()), ErrorCode::NotAllowed),
            (CoreError::Conflict("busy".into()), ErrorCode::Conflict),
            (
                CoreError::ToolNotFound { tool: ToolId::Git },
                ErrorCode::ToolNotFound,
            ),
            (
                CoreError::ToolFailed {
                    tool: ToolId::Ccsh,
                    message: "exit 1".into(),
                },
                ErrorCode::ToolFailed,
            ),
            (CoreError::Timeout { after_ms: 10 }, ErrorCode::Timeout),
            (CoreError::Cancelled, ErrorCode::Cancelled),
            (
                CoreError::OutputTooLarge { limit_bytes: 16 },
                ErrorCode::OutputTooLarge,
            ),
            (
                CoreError::Io {
                    context: "Could not read the settings".into(),
                    source: std::io::Error::other("disk on fire"),
                },
                ErrorCode::Io,
            ),
            (
                CoreError::Internal("broken invariant".into()),
                ErrorCode::Internal,
            ),
            (
                CoreError::StoreNewerSchema {
                    found: 2,
                    supported: 1,
                },
                ErrorCode::StoreNewerSchema,
            ),
            (
                CoreError::StoreLocked {
                    store_root: "/data/store".into(),
                },
                ErrorCode::StoreLocked,
            ),
            (
                CoreError::TokenExpired { what: "folder" },
                ErrorCode::TokenExpired,
            ),
            (
                CoreError::DuplicateFolder {
                    path: "/src/app".into(),
                },
                ErrorCode::DuplicateFolder,
            ),
            (
                CoreError::DuplicateLabel {
                    label: "app".into(),
                },
                ErrorCode::DuplicateLabel,
            ),
            (
                CoreError::FolderUnavailable("gone".into()),
                ErrorCode::FolderUnavailable,
            ),
            (
                CoreError::DifferentHistory {
                    path: "/src/other".into(),
                },
                ErrorCode::DifferentHistory,
            ),
            (CoreError::TooLarge { limit_bytes: 16 }, ErrorCode::TooLarge),
            (
                CoreError::NotACommit {
                    commit: "0123456789abcdef0123456789abcdef01234567".into(),
                },
                ErrorCode::NotACommit,
            ),
            (
                CoreError::Git(GitError::new(ErrorCode::NotARepository, "not here")),
                ErrorCode::NotARepository,
            ),
        ]
    }

    #[test]
    fn should_map_every_core_error_to_a_code() {
        // Arrange
        let errors = one_error_of_each_kind();

        // Act
        let mapped: Vec<(ErrorCode, ErrorCode)> = errors
            .iter()
            .map(|(error, expected)| (error.code(), *expected))
            .collect();

        // Assert
        assert!(
            mapped.iter().all(|(actual, expected)| actual == expected),
            "{mapped:?}"
        );
    }

    #[test]
    fn should_keep_io_and_internal_details_out_of_the_payload() {
        // Arrange
        let errors = one_error_of_each_kind();

        // Act
        let messages: Vec<String> = errors
            .iter()
            .map(|(error, _)| error.to_payload().message)
            .collect();

        // Assert
        assert!(messages.contains(&"Could not read the settings".to_string()));
        assert!(messages.contains(&INTERNAL_MESSAGE.to_string()));
        assert!(!messages.iter().any(
            |message| message.contains("disk on fire") || message.contains("broken invariant")
        ));
    }

    #[test]
    fn should_carry_git_text_and_repository_path_in_the_details() {
        // Arrange
        let error = CoreError::Git(
            GitError::new(ErrorCode::DubiousOwnership, "Not trusted.")
                .with_detail("fatal: detected dubious ownership\n")
                .with_repository_path("/srv/repo".to_string()),
        );

        // Act
        let payload = error.to_payload();

        // Assert
        assert_eq!(payload.code, ErrorCode::DubiousOwnership);
        assert_eq!(payload.message, "Not trusted.");
        assert_eq!(
            payload.details.get("detail"),
            Some(&serde_json::json!("fatal: detected dubious ownership"))
        );
        assert_eq!(
            payload.details.get("repositoryPath"),
            Some(&serde_json::json!("/srv/repo"))
        );
    }

    #[test]
    fn should_name_the_tool_in_the_details() {
        // Arrange
        let error = CoreError::ToolNotFound { tool: ToolId::Java };

        // Act
        let payload = error.to_payload();

        // Assert
        assert_eq!(
            payload.details.get("tool"),
            Some(&serde_json::json!("java"))
        );
        assert_eq!(payload.message, "java was not found");
    }
}
