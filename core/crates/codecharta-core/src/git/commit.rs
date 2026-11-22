use std::ffi::OsString;
use std::fs;
use std::io::Write;
use std::path::Path;

use codecharta_core_api::error::ErrorCode;
use codecharta_core_api::methods::git::{
    GitCreateCommitParams, GitOperationResult, OperationInProgress, StatusCounts,
};
use codecharta_core_api::values::{CommitBody, CommitSubject};
use tempfile::TempPath;

use super::command::{COMMIT_LIMITS, GitCommand};
use super::error::{GitError, message_for, refused};
use super::failure::classify;
use super::locator::locate;
use super::operation::{Mutation, OperationContext};
use super::read::status_summary;
use super::service::{GitFolder, GitService};
use crate::error::{CoreError, CoreResult};
use crate::process::RunOutput;

/// Commit messages wait below the core's data folder, never inside the user's repository.
pub const MESSAGE_FOLDER_NAME: &str = "git-messages";
const MESSAGE_FILE_PREFIX: &str = "message-";
const MESSAGE_FILE_SUFFIX: &str = ".txt";
/// Without a configured name and email git would invent an identity from the system account (G11).
const CONFIGURED_IDENTITY_ONLY: [&str; 2] = ["-c", "user.useConfigOnly=true"];
/// `whitespace` keeps lines starting with `#`, which the default cleanup would drop as comments.
const COMMIT: [&str; 2] = ["commit", "--cleanup=whitespace"];
const AMEND: &str = "--amend";
const MESSAGE_FILE_OPTION: &str = "-F";
const LINE_END: &str = "\n";
const WINDOWS_LINE_END: &str = "\r\n";
const PARAGRAPH_BREAK: &str = "\n\n";

/// Refusals of `git commit` in git's English, checked in stderr and stdout before the general rules.
const COMMIT_FAILURES: [(&str, ErrorCode); 7] = [
    ("Author identity unknown", ErrorCode::IdentityUnknown),
    ("Please tell me who you are", ErrorCode::IdentityUnknown),
    ("nothing to commit", ErrorCode::NothingToCommit),
    ("no changes added to commit", ErrorCode::NothingToCommit),
    ("You have nothing to amend", ErrorCode::NothingToCommit),
    ("unmerged files", ErrorCode::Conflicts),
    ("gpg failed to sign", ErrorCode::CommandFailed),
];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CommitRequest {
    pub subject: CommitSubject,
    pub body: CommitBody,
    pub amend: bool,
}

impl From<GitCreateCommitParams> for CommitRequest {
    fn from(params: GitCreateCommitParams) -> Self {
        Self {
            subject: params.subject,
            body: params.body,
            amend: params.amend,
        }
    }
}

impl GitService<'_> {
    /// Hooks and gpg run as they would in a terminal; a hook that fails stops the commit.
    pub async fn commit(
        &self,
        folder: &GitFolder,
        request: CommitRequest,
        context: &OperationContext<'_>,
    ) -> CoreResult<GitOperationResult> {
        let repository = locate(&self.git, &folder.path, context.cancel).await?;
        let mutation = self.mutation(folder, &repository, context)?;
        let settled = self.operate(&mutation, commit(&mutation, &request));
        Ok(settled.await?.into_operation_result())
    }
}

async fn commit(mutation: &Mutation<'_>, request: &CommitRequest) -> CoreResult<()> {
    let summary = status_summary(mutation.git, mutation.root(), mutation.context.cancel).await?;
    check_preconditions(
        mutation.operation_in_progress(),
        &summary.counts,
        request.amend,
    )?;
    let message = write_message(mutation.git.data_dir(), &message_text(request))?;
    let command = commit_command(mutation.root(), request.amend, &message);
    let output = mutation
        .git
        .run_raw(&command, mutation.context.cancel)
        .await?;
    if output.exit_code == 0 {
        Ok(())
    } else {
        Err(commit_failed(&output))
    }
}

/// A merge is concluded by a commit, even one without staged changes; any other operation is finished
/// outside the app first.
fn check_preconditions(
    operation: Option<OperationInProgress>,
    counts: &StatusCounts,
    amend: bool,
) -> CoreResult<()> {
    let is_concluding_merge = match operation {
        None => false,
        Some(OperationInProgress::Merge) if !amend => true,
        Some(_) => return Err(refused(ErrorCode::OperationInProgress)),
    };
    if counts.conflicted > 0 {
        return Err(refused(ErrorCode::Conflicts));
    }
    if counts.staged == 0 && !amend && !is_concluding_merge {
        return Err(refused(ErrorCode::NothingToCommit));
    }
    Ok(())
}

/// The subject, then the body as its own paragraph, with LF line ends.
fn message_text(request: &CommitRequest) -> String {
    let subject = request.subject.as_str();
    let body = request.body.as_str().replace(WINDOWS_LINE_END, LINE_END);
    if body.trim().is_empty() {
        format!("{subject}{LINE_END}")
    } else {
        format!("{subject}{PARAGRAPH_BREAK}{body}{LINE_END}")
    }
}

/// The file is deleted when the returned path is dropped, whether git succeeded, failed or was
/// cancelled.
fn write_message(data_dir: &Path, text: &str) -> CoreResult<TempPath> {
    let folder = std::path::absolute(data_dir.join(MESSAGE_FOLDER_NAME))
        .and_then(|folder| fs::create_dir_all(&folder).map(|()| folder))
        .map_err(|source| message_error(source, data_dir))?;
    let mut file = tempfile::Builder::new()
        .prefix(MESSAGE_FILE_PREFIX)
        .suffix(MESSAGE_FILE_SUFFIX)
        .tempfile_in(&folder)
        .map_err(|source| message_error(source, &folder))?;
    file.write_all(text.as_bytes())
        .map_err(|source| message_error(source, &folder))?;
    Ok(file.into_temp_path())
}

fn message_error(source: std::io::Error, folder: &Path) -> CoreError {
    CoreError::Io {
        context: format!(
            "Could not write the commit message below {}",
            folder.display()
        ),
        source,
    }
}

fn commit_command(root: &Path, amend: bool, message: &Path) -> GitCommand {
    let mut args = [CONFIGURED_IDENTITY_ONLY.as_slice(), COMMIT.as_slice()].concat();
    if amend {
        args.push(AMEND);
    }
    args.push(MESSAGE_FILE_OPTION);
    let mut command = GitCommand::mutating(root, &args, COMMIT_LIMITS);
    command.args.push(OsString::from(message));
    command
}

/// git reports "nothing to commit" on stdout, a hook prints wherever it likes; both are the detail.
fn commit_failed(output: &RunOutput) -> CoreError {
    let code = classify_commit(&output.stderr, &output.stdout);
    let text = format!("{}\n{}", output.stderr.trim(), output.stdout.trim());
    GitError::new(code, message_for(code))
        .with_detail(&text)
        .into()
}

/// A failure no rule names is a hook's: git itself stays silent when a hook stops the commit.
fn classify_commit(stderr: &str, stdout: &str) -> ErrorCode {
    let output = [stderr, stdout];
    let commit_failure = COMMIT_FAILURES
        .iter()
        .find(|(text, _)| output.iter().any(|stream| stream.contains(text)));
    match commit_failure {
        Some((_, code)) => *code,
        None => match classify(stderr) {
            ErrorCode::CommandFailed => ErrorCode::HookFailed,
            code => code,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn counts(staged: u32, conflicted: u32) -> StatusCounts {
        StatusCounts {
            staged,
            conflicted,
            ..StatusCounts::default()
        }
    }

    fn request(subject: &str, body: &str) -> CommitRequest {
        CommitRequest {
            subject: CommitSubject::try_from(subject).unwrap(),
            body: CommitBody::try_from(body).unwrap(),
            amend: false,
        }
    }

    fn code_of(result: CoreResult<()>) -> ErrorCode {
        result.unwrap_err().code()
    }

    #[test]
    fn should_write_subject_and_body_as_paragraphs_with_lf_line_ends() {
        // Arrange
        let with_body = request("Subject", "# kept\r\nsecond");
        let without_body = request("Subject", " \n");

        // Act
        let texts = [message_text(&with_body), message_text(&without_body)];

        // Assert
        assert_eq!(texts, ["Subject\n\n# kept\nsecond\n", "Subject\n"]);
    }

    #[test]
    fn should_refuse_without_staged_changes_unless_amending_or_concluding_a_merge() {
        // Arrange
        let nothing_staged = counts(0, 0);

        // Act
        let plain = check_preconditions(None, &nothing_staged, false);
        let amend = check_preconditions(None, &nothing_staged, true);
        let merge = check_preconditions(Some(OperationInProgress::Merge), &nothing_staged, false);

        // Assert
        assert_eq!(code_of(plain), ErrorCode::NothingToCommit);
        assert!(amend.is_ok());
        assert!(merge.is_ok());
    }

    #[test]
    fn should_refuse_conflicts_and_every_operation_but_a_merge_without_amend() {
        // Arrange
        let staged = counts(1, 0);

        // Act
        let refusals = [
            check_preconditions(None, &counts(1, 1), false),
            check_preconditions(Some(OperationInProgress::Rebase), &staged, false),
            check_preconditions(Some(OperationInProgress::CherryPick), &staged, false),
            check_preconditions(Some(OperationInProgress::Merge), &staged, true),
        ]
        .map(code_of);

        // Assert
        assert_eq!(
            refusals,
            [
                ErrorCode::Conflicts,
                ErrorCode::OperationInProgress,
                ErrorCode::OperationInProgress,
                ErrorCode::OperationInProgress,
            ]
        );
    }

    #[test]
    fn should_classify_refusals_of_commit_and_take_any_other_failure_for_a_hook() {
        // Arrange
        let outputs = [
            (
                "Author identity unknown\n\n*** Please tell me who you are.\n",
                "",
            ),
            (
                "",
                "On branch main\nnothing to commit, working tree clean\n",
            ),
            ("fatal: You have nothing to amend.\n", ""),
            ("error: gpg failed to sign the data\n", ""),
            (
                "fatal: Unable to create '/srv/repo/.git/index.lock': File exists.\n",
                "",
            ),
            ("lint: trailing space in a.txt\n", ""),
        ];

        // Act
        let codes = outputs.map(|(stderr, stdout)| classify_commit(stderr, stdout));

        // Assert
        assert_eq!(
            codes,
            [
                ErrorCode::IdentityUnknown,
                ErrorCode::NothingToCommit,
                ErrorCode::NothingToCommit,
                ErrorCode::CommandFailed,
                ErrorCode::IndexLocked,
                ErrorCode::HookFailed,
            ]
        );
    }

    #[test]
    fn should_delete_the_message_file_when_dropped() {
        // Arrange
        let data_dir = tempfile::tempdir().unwrap();

        // Act
        let message = write_message(data_dir.path(), "Subject\n").unwrap();
        let written = fs::read_to_string(&message).unwrap();
        let file = message.to_path_buf();
        drop(message);

        // Assert
        assert_eq!(written, "Subject\n");
        assert_eq!(
            file.parent(),
            Some(data_dir.path().join(MESSAGE_FOLDER_NAME).as_path())
        );
        assert!(!file.exists());
    }
}
