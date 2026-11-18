use std::path::Path;

use codecharta_core_api::values::CommitSha;
use tokio_util::sync::CancellationToken;

use super::command::{GitCommand, QUERY_LIMITS};
use super::error::command_failed;
use super::parse::log::commit_sha;
use super::runner::GitCli;
use crate::error::CoreResult;

const MERGE_BASE: &str = "merge-base";
const NO_ANSWER_EXIT_CODE: i32 = 1;

/// `None` when the two commits share no history.
pub async fn merge_base(
    git: &GitCli<'_>,
    folder: &Path,
    left: &CommitSha,
    right: &CommitSha,
    cancel: &CancellationToken,
) -> CoreResult<Option<String>> {
    let args = [MERGE_BASE, left.as_str(), right.as_str()];
    let output = git
        .run_raw(&GitCommand::read(folder, &args, QUERY_LIMITS), cancel)
        .await?;
    match output.exit_code {
        0 => commit_sha(output.stdout.trim()).map(Some),
        NO_ANSWER_EXIT_CODE if output.stdout.trim().is_empty() => Ok(None),
        _ => Err(command_failed(&output)),
    }
}
