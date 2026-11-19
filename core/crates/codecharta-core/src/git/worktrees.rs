use std::path::{Path, PathBuf};
use std::time::Duration;

use tokio_util::sync::CancellationToken;

use super::command::{GitCommand, QUERY_LIMITS, WORKING_TREE_LIMITS};
use super::runner::GitCli;
use crate::error::CoreResult;

const LIST_ARGS: [&str; 3] = ["worktree", "list", "--porcelain"];
/// `-f` twice also removes a worktree that is locked, as one is while `git worktree add` runs.
const REMOVE_ARGS: [&str; 4] = ["worktree", "remove", "-f", "-f"];
const PRUNE_ARGS: [&str; 2] = ["worktree", "prune"];
const WORKTREE_PREFIX: &str = "worktree ";
const HEAD_PREFIX: &str = "HEAD ";
/// Windows may hold a file of a just-killed process open for a moment.
pub const REMOVE_ATTEMPTS: u32 = 3;
pub const REMOVE_RETRY_PAUSE: Duration = Duration::from_millis(500);

/// One entry of `git worktree list --porcelain`; `head` is `None` for a bare entry.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorktreeEntry {
    pub path: PathBuf,
    pub head: Option<String>,
}

pub fn parse_worktree_list(stdout: &str) -> Vec<WorktreeEntry> {
    let mut entries: Vec<WorktreeEntry> = Vec::new();
    for line in stdout.lines() {
        if let Some(path) = line.strip_prefix(WORKTREE_PREFIX) {
            entries.push(WorktreeEntry {
                path: PathBuf::from(path),
                head: None,
            });
        } else if let (Some(head), Some(entry)) =
            (line.strip_prefix(HEAD_PREFIX), entries.last_mut())
        {
            entry.head = Some(head.to_string());
        }
    }
    entries
}

pub async fn list_worktrees(
    git: &GitCli<'_>,
    folder: &Path,
    cancel: &CancellationToken,
) -> CoreResult<Vec<WorktreeEntry>> {
    let command = GitCommand::read(folder, &LIST_ARGS, QUERY_LIMITS);
    Ok(parse_worktree_list(&git.run(&command, cancel).await?))
}

/// Tries `REMOVE_ATTEMPTS` times; the last failure is the answer.
pub async fn remove_worktree(
    git: &GitCli<'_>,
    folder: &Path,
    worktree: &Path,
    cancel: &CancellationToken,
) -> CoreResult<()> {
    let worktree = worktree.to_string_lossy();
    let args = [&REMOVE_ARGS[..], &[worktree.as_ref()]].concat();
    let command = GitCommand::mutating(folder, &args, WORKING_TREE_LIMITS);
    let mut attempt = 1;
    loop {
        match git.run(&command, cancel).await {
            Ok(_) => return Ok(()),
            Err(error) if attempt >= REMOVE_ATTEMPTS => return Err(error),
            Err(error) => tracing::debug!("removing {worktree} failed, trying again: {error}"),
        }
        attempt += 1;
        tokio::time::sleep(REMOVE_RETRY_PAUSE).await;
    }
}

pub async fn prune_worktrees(
    git: &GitCli<'_>,
    folder: &Path,
    cancel: &CancellationToken,
) -> CoreResult<()> {
    let command = GitCommand::mutating(folder, &PRUNE_ARGS, WORKING_TREE_LIMITS);
    git.run(&command, cancel).await.map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_parse_paths_and_heads_of_the_worktree_list() {
        // Arrange
        let stdout = "worktree /repo\nHEAD 155dda6ad4c3de095d77eb5ea3b8bb1c97d50e86\nbranch refs/heads/main\n\nworktree /tmp/codecharta-worktree-1143\nHEAD 155dda6ad4c3de095d77eb5ea3b8bb1c97d50e86\ndetached\nlocked initializing\n\nworktree /bare\nbare\n";

        // Act
        let entries = parse_worktree_list(stdout);

        // Assert
        let head = Some("155dda6ad4c3de095d77eb5ea3b8bb1c97d50e86".to_string());
        assert_eq!(
            entries,
            [
                WorktreeEntry {
                    path: PathBuf::from("/repo"),
                    head: head.clone(),
                },
                WorktreeEntry {
                    path: PathBuf::from("/tmp/codecharta-worktree-1143"),
                    head,
                },
                WorktreeEntry {
                    path: PathBuf::from("/bare"),
                    head: None,
                },
            ]
        );
    }
}
