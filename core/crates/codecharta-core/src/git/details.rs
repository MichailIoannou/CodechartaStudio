use codecharta_core_api::error::ErrorCode;
use codecharta_core_api::methods::git::{ChangedFilesMode, GitChangedFiles, GitCommitDetails};
use codecharta_core_api::values::CommitSha;

use super::command::{DETAILS_LIMITS, GitCommand};
use super::error::GitError;
use super::parse::changed_files::{
    ChangedFileList, DIFF_TREE_ARGS, NAME_STATUS_ARG, NUMSTAT_ARG, join_changed_files,
    parse_name_status, parse_numstat,
};
use super::parse::log::{DETAILS_FORMAT, parse_details};
use super::query::merge_base;
use super::runner::FolderGit;
use crate::error::CoreResult;

const SHOW_ARGS: [&str; 3] = ["show", "-s", "-z"];
const END_OF_OPTIONS: &str = "--end-of-options";
const ROOT_ARGS: [&str; 2] = ["--root", "--no-commit-id"];
const AS_COMMIT: &str = "^{commit}";

/// Two commits whose files are compared; `to` alone for a root commit.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ChangedFilesRequest {
    pub from: CommitSha,
    pub to: CommitSha,
    pub mode: ChangedFilesMode,
}

/// A merge commit is compared with its first parent, a root commit with nothing.
pub async fn commit_details(at: FolderGit<'_>, sha: &CommitSha) -> CoreResult<GitCommitDetails> {
    let commit = as_commit(sha.as_str());
    let show_args = [&SHOW_ARGS[..], &[DETAILS_FORMAT, END_OF_OPTIONS, &commit]].concat();
    let text = parse_details(&at.run(&show_args, DETAILS_LIMITS).await?)?;
    let parent = text.summary.parents.first().cloned();
    let list = read_changed_files(at, parent.as_deref(), sha.as_str()).await?;
    Ok(GitCommitDetails {
        summary: text.summary,
        committer_name: text.committer_name,
        committer_email: text.committer_email,
        message: text.message,
        compared_to_parent: parent,
        files: list.files,
        are_files_truncated: list.are_files_truncated,
        totals: list.totals,
    })
}

/// `sinceMergeBase` compares `to` with the merge base, which the answer names as `from`.
pub async fn changed_files(
    at: FolderGit<'_>,
    request: &ChangedFilesRequest,
) -> CoreResult<GitChangedFiles> {
    let from = match request.mode {
        ChangedFilesMode::Direct => request.from.to_string(),
        ChangedFilesMode::SinceMergeBase => merge_base(at, &request.from, &request.to)
            .await?
            .ok_or_else(no_common_history)?,
    };
    let to = request.to.as_str();
    let list = read_changed_files(at, Some(&from), to).await?;
    Ok(GitChangedFiles {
        from,
        to: to.to_string(),
        files: list.files,
        are_files_truncated: list.are_files_truncated,
        totals: list.totals,
    })
}

fn no_common_history() -> crate::error::CoreError {
    GitError::new(
        ErrorCode::UnknownRevision,
        "The two commits have no common history.",
    )
    .into()
}

async fn read_changed_files(
    at: FolderGit<'_>,
    from: Option<&str>,
    to: &str,
) -> CoreResult<ChangedFileList> {
    let names = diff_command(at, from, to, NAME_STATUS_ARG);
    let counts = diff_command(at, from, to, NUMSTAT_ARG);
    let (names, counts) = tokio::join!(
        at.git.run(&names, at.cancel),
        at.git.run(&counts, at.cancel)
    );
    Ok(join_changed_files(
        parse_name_status(&names?)?,
        &parse_numstat(&counts?)?,
    ))
}

fn diff_command(at: FolderGit<'_>, from: Option<&str>, to: &str, list_arg: &str) -> GitCommand {
    let to = as_commit(to);
    let mut args: Vec<&str> = DIFF_TREE_ARGS.to_vec();
    let from = from.map(as_commit);
    match &from {
        Some(from) => args.extend([list_arg, from, &to]),
        None => args.extend(ROOT_ARGS.iter().copied().chain([list_arg, &to])),
    }
    at.read(&args, DETAILS_LIMITS)
}

/// A validated sha that names a tag or tree is refused instead of being read as something else.
fn as_commit(sha: &str) -> String {
    format!("{sha}{AS_COMMIT}")
}
