use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ErrorCode {
    BadRequest,
    NotFound,
    NotAllowed,
    Conflict,
    ToolNotFound,
    ToolFailed,
    Timeout,
    Cancelled,
    OutputTooLarge,
    Io,
    ProtocolMismatch,
    CoreUnavailable,
    Internal,
    StoreNewerSchema,
    StoreLocked,
    TokenExpired,
    DuplicateFolder,
    DuplicateLabel,
    FolderUnavailable,
    DifferentHistory,
    TooLarge,
    NotACommit,
    GitTooOld,
    NotARepository,
    DubiousOwnership,
    BareRepository,
    IndexLocked,
    ParseFailed,
    CommandFailed,
    LogSessionExpired,
    UnknownRevision,
    AuthenticationCancelled,
    BranchExists,
    BranchNotFullyMerged,
    BranchCheckedOutElsewhere,
    LocalChangesWouldBeOverwritten,
    OperationInProgress,
    AuthenticationRequired,
    NetworkUnavailable,
    ChangedSinceListed,
    IdentityUnknown,
    NothingToCommit,
    HookFailed,
    Conflicts,
    NotFastForward,
    PushRejected,
    NoUpstream,
    StalePushLease,
    SnapshotBeingWritten,
    RecycleFailed,
}

impl ErrorCode {
    pub const ALL: [ErrorCode; 50] = [
        ErrorCode::BadRequest,
        ErrorCode::NotFound,
        ErrorCode::NotAllowed,
        ErrorCode::Conflict,
        ErrorCode::ToolNotFound,
        ErrorCode::ToolFailed,
        ErrorCode::Timeout,
        ErrorCode::Cancelled,
        ErrorCode::OutputTooLarge,
        ErrorCode::Io,
        ErrorCode::ProtocolMismatch,
        ErrorCode::CoreUnavailable,
        ErrorCode::Internal,
        ErrorCode::StoreNewerSchema,
        ErrorCode::StoreLocked,
        ErrorCode::TokenExpired,
        ErrorCode::DuplicateFolder,
        ErrorCode::DuplicateLabel,
        ErrorCode::FolderUnavailable,
        ErrorCode::DifferentHistory,
        ErrorCode::TooLarge,
        ErrorCode::NotACommit,
        ErrorCode::GitTooOld,
        ErrorCode::NotARepository,
        ErrorCode::DubiousOwnership,
        ErrorCode::BareRepository,
        ErrorCode::IndexLocked,
        ErrorCode::ParseFailed,
        ErrorCode::CommandFailed,
        ErrorCode::LogSessionExpired,
        ErrorCode::UnknownRevision,
        ErrorCode::AuthenticationCancelled,
        ErrorCode::BranchExists,
        ErrorCode::BranchNotFullyMerged,
        ErrorCode::BranchCheckedOutElsewhere,
        ErrorCode::LocalChangesWouldBeOverwritten,
        ErrorCode::OperationInProgress,
        ErrorCode::AuthenticationRequired,
        ErrorCode::NetworkUnavailable,
        ErrorCode::ChangedSinceListed,
        ErrorCode::IdentityUnknown,
        ErrorCode::NothingToCommit,
        ErrorCode::HookFailed,
        ErrorCode::Conflicts,
        ErrorCode::NotFastForward,
        ErrorCode::PushRejected,
        ErrorCode::NoUpstream,
        ErrorCode::StalePushLease,
        ErrorCode::SnapshotBeingWritten,
        ErrorCode::RecycleFailed,
    ];
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ErrorPayload {
    pub code: ErrorCode,
    pub message: String,
    pub details: BTreeMap<String, serde_json::Value>,
}

impl ErrorPayload {
    pub fn new(code: ErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            details: BTreeMap::new(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_serialize_error_code_in_screaming_snake_case() {
        // Arrange
        let code = ErrorCode::OutputTooLarge;

        // Act
        let json = serde_json::to_string(&code).unwrap();

        // Assert
        assert_eq!(json, "\"OUTPUT_TOO_LARGE\"");
    }

    #[test]
    fn should_serialize_git_error_codes_as_stable_screaming_snake_case_strings() {
        // Arrange
        let codes = [
            ErrorCode::GitTooOld,
            ErrorCode::NotARepository,
            ErrorCode::DubiousOwnership,
            ErrorCode::BareRepository,
            ErrorCode::IndexLocked,
            ErrorCode::ParseFailed,
            ErrorCode::CommandFailed,
            ErrorCode::LogSessionExpired,
            ErrorCode::UnknownRevision,
            ErrorCode::AuthenticationCancelled,
            ErrorCode::BranchExists,
            ErrorCode::BranchNotFullyMerged,
            ErrorCode::BranchCheckedOutElsewhere,
            ErrorCode::LocalChangesWouldBeOverwritten,
            ErrorCode::OperationInProgress,
            ErrorCode::AuthenticationRequired,
            ErrorCode::NetworkUnavailable,
            ErrorCode::ChangedSinceListed,
            ErrorCode::IdentityUnknown,
            ErrorCode::NothingToCommit,
            ErrorCode::HookFailed,
            ErrorCode::Conflicts,
            ErrorCode::NotFastForward,
            ErrorCode::PushRejected,
            ErrorCode::NoUpstream,
            ErrorCode::StalePushLease,
        ];

        // Act
        let json = serde_json::to_value(codes).unwrap();

        // Assert
        assert_eq!(
            json,
            serde_json::json!([
                "GIT_TOO_OLD",
                "NOT_A_REPOSITORY",
                "DUBIOUS_OWNERSHIP",
                "BARE_REPOSITORY",
                "INDEX_LOCKED",
                "PARSE_FAILED",
                "COMMAND_FAILED",
                "LOG_SESSION_EXPIRED",
                "UNKNOWN_REVISION",
                "AUTHENTICATION_CANCELLED",
                "BRANCH_EXISTS",
                "BRANCH_NOT_FULLY_MERGED",
                "BRANCH_CHECKED_OUT_ELSEWHERE",
                "LOCAL_CHANGES_WOULD_BE_OVERWRITTEN",
                "OPERATION_IN_PROGRESS",
                "AUTHENTICATION_REQUIRED",
                "NETWORK_UNAVAILABLE",
                "CHANGED_SINCE_LISTED",
                "IDENTITY_UNKNOWN",
                "NOTHING_TO_COMMIT",
                "HOOK_FAILED",
                "CONFLICTS",
                "NOT_FAST_FORWARD",
                "PUSH_REJECTED",
                "NO_UPSTREAM",
                "STALE_PUSH_LEASE"
            ])
        );
    }

    #[test]
    fn should_serialize_retention_error_codes_as_stable_screaming_snake_case_strings() {
        // Arrange
        let codes = [ErrorCode::SnapshotBeingWritten, ErrorCode::RecycleFailed];

        // Act
        let json = serde_json::to_value(codes).unwrap();

        // Assert
        assert_eq!(
            json,
            serde_json::json!(["SNAPSHOT_BEING_WRITTEN", "RECYCLE_FAILED"])
        );
    }

    #[test]
    fn should_list_every_error_code_once() {
        // Arrange
        let codes = ErrorCode::ALL;

        // Act
        let distinct: std::collections::HashSet<ErrorCode> = codes.into_iter().collect();

        // Assert
        assert_eq!(distinct.len(), ErrorCode::ALL.len());
    }

    #[test]
    fn should_serialize_a_payload_with_camel_case_fields_and_empty_details() {
        // Arrange
        let payload = ErrorPayload::new(ErrorCode::NotFound, "Nothing here.");

        // Act
        let json = serde_json::to_value(&payload).unwrap();

        // Assert
        assert_eq!(
            json,
            serde_json::json!({ "code": "NOT_FOUND", "message": "Nothing here.", "details": {} })
        );
    }
}
