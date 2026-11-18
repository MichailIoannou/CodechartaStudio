use std::path::PathBuf;
use std::process::ExitCode;
use std::time::{Duration, UNIX_EPOCH};

use clap::{Args, Subcommand};
use codecharta_core::git::GitFolder;
use codecharta_core::git::log::LogRequest;
use codecharta_core::projects::ProjectRepository;
use codecharta_core::recycle::SystemRecycler;
use codecharta_core::store::Store;
use codecharta_core::timestamps;
use codecharta_core::{Core, CoreError, CoreResult};
use codecharta_core_api::ids::{FolderId, ProjectId};
use codecharta_core_api::methods::git::{
    GitCommitSummary, GitHead, GitLogScope, GitRefs, GitStatus, GitUpstream,
};
use codecharta_core_api::methods::projects::FolderRef;
use codecharta_core_api::values::{FullRefName, LogCursor};
use tokio_util::sync::CancellationToken;

use super::arguments::{parse_folder_id, parse_project_id};
use super::output::{exit_code_of, print_json};

const SHORT_SHA_LENGTH: usize = 7;
const CURRENT_MARK: &str = "*";
const OTHER_MARK: &str = " ";
const DEFAULT_LOG_LIMIT: usize = 50;
const BRANCHES_PREFIX: &str = "refs/heads/";
/// `YYYY-MM-DD` at the start of an RFC 3339 timestamp.
const DATE_LENGTH: usize = 10;

#[derive(Debug, Subcommand)]
pub enum GitCommand {
    /// Print the branch, its upstream distance and the counts of changed files
    Status {
        #[command(flatten)]
        target: GitTarget,
        /// Print the status as JSON
        #[arg(long)]
        json: bool,
    },
    /// List local branches, remote branches and tags; `*` marks the current branch
    Branches {
        #[command(flatten)]
        target: GitTarget,
        /// Print the refs as JSON
        #[arg(long)]
        json: bool,
    },
    /// Print the newest commits, children before parents: short sha, date, author and subject
    Log {
        #[command(flatten)]
        target: GitTarget,
        /// How many commits to print
        #[arg(long, default_value_t = DEFAULT_LOG_LIMIT)]
        limit: usize,
        /// Only the history of this local branch, instead of every branch, remote branch and tag
        #[arg(long)]
        branch: Option<String>,
        /// Print the commits as JSON
        #[arg(long)]
        json: bool,
    },
}

/// A project folder from the store, or any folder by path.
#[derive(Debug, Args)]
#[group(required = true, multiple = true)]
pub struct GitTarget {
    #[arg(long, value_parser = parse_project_id, requires = "folder", conflicts_with = "path")]
    project: Option<ProjectId>,
    #[arg(long, value_parser = parse_folder_id, requires = "project", conflicts_with = "path")]
    folder: Option<FolderId>,
    #[arg(long)]
    path: Option<PathBuf>,
}

pub fn run_git(core: &Core, runtime: &tokio::runtime::Runtime, command: GitCommand) -> ExitCode {
    let printed = match command {
        GitCommand::Status { target, json } => runtime
            .block_on(status(core, &target))
            .and_then(|status| print_status(&status, json)),
        GitCommand::Branches { target, json } => runtime
            .block_on(branches(core, &target))
            .and_then(|refs| print_branches(&refs, json)),
        GitCommand::Log {
            target,
            limit,
            branch,
            json,
        } => scope_of(branch.as_deref())
            .and_then(|scope| runtime.block_on(log(core, &target, scope, limit)))
            .and_then(|commits| print_log(&commits, json)),
    };
    exit_code_of(printed)
}

async fn status(core: &Core, target: &GitTarget) -> CoreResult<GitStatus> {
    let folder = git_folder(core, target)?;
    core.git()?.status(&folder, &CancellationToken::new()).await
}

async fn branches(core: &Core, target: &GitTarget) -> CoreResult<GitRefs> {
    let folder = git_folder(core, target)?;
    core.git()?.refs(&folder, &CancellationToken::new()).await
}

fn scope_of(branch: Option<&str>) -> CoreResult<GitLogScope> {
    let Some(branch) = branch else {
        return Ok(GitLogScope::All);
    };
    let ref_name = FullRefName::try_from(format!("{BRANCHES_PREFIX}{branch}"))
        .map_err(|error| CoreError::BadRequest(error.to_string()))?;
    Ok(GitLogScope::Refs {
        ref_names: vec![ref_name],
    })
}

/// Pages through the log until `limit` commits are read or the history ends.
async fn log(
    core: &Core,
    target: &GitTarget,
    scope: GitLogScope,
    limit: usize,
) -> CoreResult<Vec<GitCommitSummary>> {
    let folder = git_folder(core, target)?;
    let git = core.git()?;
    let mut request = LogRequest {
        scope,
        filter: None,
        cursor: None,
    };
    let mut commits = Vec::new();
    while commits.len() < limit {
        let page = git
            .log(&folder, &request, &CancellationToken::new())
            .await?;
        commits.extend(page.commits);
        let Some(cursor) = page.next_cursor else {
            break;
        };
        request.cursor = Some(next_cursor(cursor)?);
    }
    commits.truncate(limit);
    Ok(commits)
}

fn next_cursor(cursor: String) -> CoreResult<LogCursor> {
    LogCursor::try_from(cursor).map_err(|error| CoreError::Internal(error.to_string()))
}

fn print_log(commits: &[GitCommitSummary], json: bool) -> CoreResult<()> {
    if json {
        return print_json(&commits);
    }
    for commit in commits {
        println!("{}", log_line(commit));
    }
    Ok(())
}

/// `1a2b3c4 2023-11-14 Ada Author Subject`, dated by the committer.
fn log_line(commit: &GitCommitSummary) -> String {
    format!(
        "{} {} {} {}",
        short(&commit.sha),
        date_of(commit.committed_at),
        commit.author_name,
        commit.subject
    )
}

fn date_of(unix_seconds: i64) -> String {
    let seconds = u64::try_from(unix_seconds).unwrap_or_default();
    let timestamp = timestamps::of(UNIX_EPOCH + Duration::from_secs(seconds));
    timestamp.chars().take(DATE_LENGTH).collect()
}

/// A project folder is looked up in a read-only store, so this works while the app runs.
fn git_folder(core: &Core, target: &GitTarget) -> CoreResult<GitFolder> {
    if let Some(path) = &target.path {
        let absolute = std::path::absolute(path).map_err(|source| CoreError::Io {
            context: format!("Could not resolve the path {}", path.display()),
            source,
        })?;
        return Ok(GitFolder::at(&absolute));
    }
    let (Some(project_id), Some(folder_id)) = (target.project.clone(), target.folder.clone())
    else {
        return Err(CoreError::BadRequest(
            "Name a folder with --path or with --project and --folder.".to_string(),
        ));
    };
    let store = Store::open_read_only(&core.paths().store_root())?;
    ProjectRepository::new(&store, core.tools(), &SystemRecycler).git_folder(&FolderRef {
        project_id,
        folder_id,
    })
}

fn print_status(status: &GitStatus, json: bool) -> CoreResult<()> {
    if json {
        return print_json(status);
    }
    println!("{}", status_line(status));
    Ok(())
}

/// `main ↑1 ↓0 · 2 staged, 1 unstaged, 0 untracked`, plus conflicts and a stopped operation when there are.
fn status_line(status: &GitStatus) -> String {
    let counts = &status.counts;
    let mut line = format!(
        "{}{} · {} staged, {} unstaged, {} untracked",
        head_text(&status.head),
        status
            .upstream
            .as_ref()
            .map(upstream_text)
            .unwrap_or_default(),
        counts.staged,
        counts.unstaged,
        counts.untracked
    );
    if counts.conflicted > 0 {
        line.push_str(&format!(", {} conflicted", counts.conflicted));
    }
    if let Some(operation) = status.operation_in_progress {
        line.push_str(&format!(" · {operation:?} in progress").to_lowercase());
    }
    line
}

fn head_text(head: &GitHead) -> String {
    match head {
        GitHead::Branch { name, .. } => name.clone(),
        GitHead::Detached { commit } => format!("(detached at {})", short(commit)),
    }
}

fn upstream_text(upstream: &GitUpstream) -> String {
    match (upstream.ahead, upstream.behind) {
        (Some(ahead), Some(behind)) => format!(" ↑{ahead} ↓{behind}"),
        _ => " (upstream gone)".to_string(),
    }
}

fn print_branches(refs: &GitRefs, json: bool) -> CoreResult<()> {
    if json {
        return print_json(refs);
    }
    for line in branch_lines(refs) {
        println!("{line}");
    }
    Ok(())
}

/// One line per ref, like `git branch -a` with tags: `* main  1a2b3c4`.
fn branch_lines(refs: &GitRefs) -> Vec<String> {
    let local = refs.local_branches.iter().map(|branch| {
        let mark = if branch.is_current {
            CURRENT_MARK
        } else {
            OTHER_MARK
        };
        format!("{mark} {}  {}", branch.name, short(&branch.commit))
    });
    let remote = refs.remote_branches.iter().map(|branch| {
        format!(
            "{OTHER_MARK} remotes/{}  {}",
            branch.name,
            short(&branch.commit)
        )
    });
    let tags = refs
        .tags
        .iter()
        .map(|tag| format!("{OTHER_MARK} tags/{}  {}", tag.name, short(&tag.commit)));
    local.chain(remote).chain(tags).collect()
}

fn short(commit: &str) -> &str {
    commit.get(..SHORT_SHA_LENGTH).unwrap_or(commit)
}

#[cfg(test)]
mod tests {
    use codecharta_core_api::methods::git::{OperationInProgress, StatusCounts};

    use super::*;

    const COMMIT: &str = "0123456789abcdef0123456789abcdef01234567";

    #[test]
    fn should_write_the_status_line_with_upstream_distance() {
        // Arrange
        let status = GitStatus {
            head: GitHead::Branch {
                name: "main".to_string(),
                commit: Some(COMMIT.to_string()),
            },
            upstream: Some(GitUpstream {
                ref_name: "refs/remotes/origin/main".to_string(),
                name: "origin/main".to_string(),
                ahead: Some(1),
                behind: Some(0),
                is_gone: false,
            }),
            counts: StatusCounts {
                staged: 2,
                unstaged: 1,
                untracked: 0,
                conflicted: 0,
            },
            operation_in_progress: None,
        };

        // Act
        let line = status_line(&status);

        // Assert
        assert_eq!(line, "main ↑1 ↓0 · 2 staged, 1 unstaged, 0 untracked");
    }

    #[test]
    fn should_write_a_log_line_with_short_sha_date_author_and_subject() {
        // Arrange
        let commit = GitCommitSummary {
            sha: COMMIT.to_string(),
            parents: Vec::new(),
            author_name: "Ada Author".to_string(),
            author_email: "ada@example.test".to_string(),
            authored_at: 1_700_000_000,
            committed_at: 1_700_000_000,
            subject: "Add a".to_string(),
        };

        // Act
        let line = log_line(&commit);

        // Assert
        assert_eq!(line, "0123456 2023-11-14 Ada Author Add a");
    }

    #[test]
    fn should_refuse_a_branch_name_that_makes_no_ref_name() {
        // Arrange
        let branch = "bad\nname";

        // Act
        let scope = scope_of(Some(branch));

        // Assert
        assert!(matches!(scope, Err(CoreError::BadRequest(_))));
        assert_eq!(scope_of(None).unwrap(), GitLogScope::All);
    }

    #[test]
    fn should_name_conflicts_and_a_stopped_merge_on_a_detached_head() {
        // Arrange
        let status = GitStatus {
            head: GitHead::Detached {
                commit: COMMIT.to_string(),
            },
            upstream: None,
            counts: StatusCounts {
                conflicted: 1,
                ..StatusCounts::default()
            },
            operation_in_progress: Some(OperationInProgress::Merge),
        };

        // Act
        let line = status_line(&status);

        // Assert
        assert_eq!(
            line,
            "(detached at 0123456) · 0 staged, 0 unstaged, 0 untracked, 1 conflicted · merge in progress"
        );
    }
}
