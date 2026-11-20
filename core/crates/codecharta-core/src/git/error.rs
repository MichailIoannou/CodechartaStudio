use codecharta_core_api::error::ErrorCode;

use super::failure::{classify, classify_streams};
use crate::error::CoreError;
use crate::process::RunOutput;

pub const MAX_DETAIL_CHARS: usize = 2000;
/// Without a space-free helper path ssh cannot ask through the core, so it fails as if it had no key.
pub const SSH_AGENT_MESSAGE: &str = "CodeCharta cannot ask for ssh passphrases on this machine. Load the key into ssh-agent / Pageant first.";
const SSH_FAILURES: [&str; 2] = [
    "Permission denied (publickey",
    "Host key verification failed",
];

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

/// A command that talked to a remote: git names conflicts and refused refs on stdout, so both streams are
/// classified and both are the detail.
pub fn network_failed(output: &RunOutput) -> CoreError {
    let code = classify_streams(&[&output.stderr, &output.stdout]);
    let text = format!("{}\n{}", output.stderr.trim(), output.stdout.trim());
    GitError::new(code, message_for(code))
        .with_detail(&text)
        .into()
}

/// An ssh refusal of a command that ran without an ssh helper says how to get past it.
pub fn without_ssh_prompts(error: CoreError) -> CoreError {
    match error {
        CoreError::Git(git_error) if is_ssh_refusal(&git_error) => CoreError::Git(GitError {
            message: SSH_AGENT_MESSAGE.to_string(),
            ..git_error
        }),
        other => other,
    }
}

fn is_ssh_refusal(error: &GitError) -> bool {
    let detail = error.detail.as_deref().unwrap_or_default();
    error.code == ErrorCode::AuthenticationRequired
        && SSH_FAILURES.iter().any(|text| detail.contains(text))
}

/// A refusal the core decides itself, before git runs, worded as git's own would be.
pub fn refused(code: ErrorCode) -> CoreError {
    GitError::new(code, message_for(code)).into()
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
        ErrorCode::UnknownRevision => "The repository does not contain that commit.",
        ErrorCode::BranchExists => "A branch with that name already exists.",
        ErrorCode::BranchNotFullyMerged => {
            "The branch has commits that no other branch contains; delete it anyway only if they are not needed."
        }
        ErrorCode::BranchCheckedOutElsewhere => {
            "The branch is checked out in another worktree of this repository."
        }
        ErrorCode::LocalChangesWouldBeOverwritten => {
            "git refused because local changes to the files it names would be overwritten."
        }
        ErrorCode::OperationInProgress => {
            "A merge, rebase or similar operation is in progress; finish or abort it first."
        }
        ErrorCode::AuthenticationRequired => "The remote needs credentials that git could not get.",
        ErrorCode::NetworkUnavailable => "git could not reach the remote.",
        ErrorCode::ChangedSinceListed => {
            "The changes are no longer as listed; look at them again before you retry."
        }
        ErrorCode::IdentityUnknown => {
            "git does not know who you are: set your name and email in your git configuration."
        }
        ErrorCode::NothingToCommit => "Nothing is staged to commit.",
        ErrorCode::HookFailed => "A git hook of this repository stopped the commit.",
        ErrorCode::Conflicts => {
            "Some files have conflicts; resolve them in your editor and stage them, or abort."
        }
        ErrorCode::NotFastForward => {
            "The branch and its upstream have diverged; choose whether to rebase or merge."
        }
        ErrorCode::PushRejected => {
            "The remote refused the push; if it has commits your branch lacks, pull first."
        }
        ErrorCode::NoUpstream => "The branch has no upstream to pull from.",
        ErrorCode::StalePushLease => {
            "The remote branch moved since you looked at it; fetch, review and try again."
        }
        ErrorCode::RefNotOnRemote => "The remote has no such pull or merge request.",
        ErrorCode::HeadNotLocal => {
            "The head commit of the pull or merge request is not in this clone; fetch it first."
        }
        _ => "git failed.",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn refusal(code: ErrorCode, detail: &str) -> CoreError {
        GitError::new(code, message_for(code))
            .with_detail(detail)
            .into()
    }

    fn message_of(error: CoreError) -> String {
        match error {
            CoreError::Git(error) => error.message,
            other => panic!("not a refusal of git: {other:?}"),
        }
    }

    #[test]
    fn should_name_ssh_agent_only_for_ssh_refusals() {
        // Arrange
        let publickey = refusal(
            ErrorCode::AuthenticationRequired,
            "git@example.test: Permission denied (publickey).",
        );
        let host_key = refusal(
            ErrorCode::AuthenticationRequired,
            "Host key verification failed.",
        );
        let https = refusal(
            ErrorCode::AuthenticationRequired,
            "fatal: Authentication failed for 'https://example.test/'",
        );
        let network = refusal(
            ErrorCode::NetworkUnavailable,
            "Permission denied (publickey) and Connection timed out",
        );

        // Act
        let messages = [publickey, host_key, https, network]
            .map(|error| message_of(without_ssh_prompts(error)));

        // Assert
        assert_eq!(messages[0], SSH_AGENT_MESSAGE);
        assert_eq!(messages[1], SSH_AGENT_MESSAGE);
        assert_eq!(messages[2], message_for(ErrorCode::AuthenticationRequired));
        assert_eq!(messages[3], message_for(ErrorCode::NetworkUnavailable));
    }

    #[test]
    fn should_classify_and_keep_both_streams_of_a_network_command() {
        // Arrange
        let output = RunOutput {
            exit_code: 1,
            stdout: "CONFLICT (content): Merge conflict in f.txt".to_string(),
            stderr: "From ../origin".to_string(),
            duration: std::time::Duration::ZERO,
        };

        // Act
        let error = network_failed(&output);

        // Assert
        let CoreError::Git(error) = error else {
            panic!("not a refusal of git");
        };
        assert_eq!(error.code, ErrorCode::Conflicts);
        assert_eq!(
            error.detail.as_deref(),
            Some("From ../origin\nCONFLICT (content): Merge conflict in f.txt")
        );
    }
}
