use codecharta_core_api::error::ErrorCode;

use super::failure::classify;
use crate::error::CoreError;
use crate::process::RunOutput;

pub const MAX_DETAIL_CHARS: usize = 2000;

/// A refusal of git itself. `message` is one sentence safe to show; `detail` is git's own text, shown
/// verbatim next to it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GitError {
    pub code: ErrorCode,
    pub message: String,
    pub detail: Option<String>,
    pub repository_path: Option<String>,
}

impl GitError {
    pub fn new(code: ErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            detail: None,
            repository_path: None,
        }
    }

    /// Keeps git's text trimmed and at most `MAX_DETAIL_CHARS` characters long; empty text is no detail.
    pub fn with_detail(self, text: &str) -> Self {
        let trimmed = text.trim();
        let detail =
            (!trimmed.is_empty()).then(|| trimmed.chars().take(MAX_DETAIL_CHARS).collect());
        Self { detail, ..self }
    }

    pub fn with_repository_path(self, path: String) -> Self {
        Self {
            repository_path: Some(path),
            ..self
        }
    }
}

impl From<GitError> for CoreError {
    fn from(error: GitError) -> Self {
        CoreError::Git(error)
    }
}

/// A git command that exited non-zero.
pub fn command_failed(output: &RunOutput) -> CoreError {
    let code = classify(&output.stderr);
    GitError::new(code, message_for(code))
        .with_detail(&output.stderr)
        .into()
}

pub fn parse_failed(what: &str) -> CoreError {
    GitError::new(
        ErrorCode::ParseFailed,
        format!("git answered {what} in an unexpected form."),
    )
    .into()
}

pub fn message_for(code: ErrorCode) -> &'static str {
    match code {
        ErrorCode::NotARepository => "The folder is not inside a git repository.",
        ErrorCode::DubiousOwnership => {
            "git does not trust this repository because another user owns it."
        }
        ErrorCode::BareRepository => "The folder is a bare repository without a working tree.",
        ErrorCode::IndexLocked => "Another git process is using this repository.",
        _ => "git failed.",
    }
}
