use std::path::Path;

use codecharta_core_api::error::ErrorCode;
use codecharta_core_api::methods::git::{
    GitCommitSummary, GitHead, GitLogFilter, GitLogPage, GitLogParams, GitLogScope, GitRefs,
};
use codecharta_core_api::values::{FullRefName, LogCursor};
use tokio_util::sync::CancellationToken;

use super::command::{GitCommand, LOG_LIMITS, QUERY_LIMITS};
use super::error::{GitError, command_failed};
use super::locator::Repository;
use super::memory::GitMemory;
use super::parse::log::{SUMMARY_FORMAT, commit_sha, parse_log};
use super::read::read_refs;
use super::runner::GitCli;
use crate::error::{CoreError, CoreResult};
use crate::ids::new_log_session_id;

pub const PAGE_SIZE: usize = 500;
const CURSOR_SEPARATOR: char = '_';
const PATHS_SEPARATOR: &str = "--";
const LINE_END: char = '\n';
const NO_MATCH_EXIT_CODE: i32 = 1;
const HEAD_COMMIT_ARGS: [&str; 4] = ["rev-parse", "--verify", "--quiet", "HEAD"];
const LOG_ARGS: [&str; 4] = ["log", "-z", "--no-decorate", "--date-order"];
const TEXT_MATCH_ARGS: [&str; 2] = ["--regexp-ignore-case", "--fixed-strings"];
const STDIN_ARG: &str = "--stdin";

/// A log a client pages through: the commits it started from and its filter, fixed when the first page
/// was read, so later pages stay the same while branches move.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LogSession {
    pub tips: Vec<String>,
    pub filter: Option<GitLogFilter>,
}

/// `GitLogParams` without the folder, which the caller has resolved already.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LogRequest {
    pub scope: GitLogScope,
    pub filter: Option<GitLogFilter>,
    pub cursor: Option<LogCursor>,
}

impl From<GitLogParams> for LogRequest {
    fn from(params: GitLogParams) -> Self {
        Self {
            scope: params.scope,
            filter: params.filter,
            cursor: params.cursor,
        }
    }
}

struct PagePosition {
    session_id: String,
    session: LogSession,
    offset: usize,
}

pub async fn log_page(
    git: &GitCli<'_>,
    memory: &GitMemory,
    repository: &Repository,
    request: &LogRequest,
    cancel: &CancellationToken,
) -> CoreResult<GitLogPage> {
    let Some(position) = position_of(git, memory, repository, request, cancel).await? else {
        return Ok(empty_page());
    };
    let root = Path::new(&repository.info.root_path);
    let mut commits = read_commits(git, root, &position, cancel).await?;
    let has_more = commits.len() > PAGE_SIZE;
    commits.truncate(PAGE_SIZE);
    Ok(GitLogPage {
        commits,
        next_cursor: has_more.then(|| cursor_of(&position.session_id, position.offset + PAGE_SIZE)),
        is_graph_available: position.session.filter.is_none(),
    })
}

/// `None` when the log has nothing to start from, such as a repository without commits.
async fn position_of(
    git: &GitCli<'_>,
    memory: &GitMemory,
    repository: &Repository,
    request: &LogRequest,
    cancel: &CancellationToken,
) -> CoreResult<Option<PagePosition>> {
    let repository_id = &repository.info.repository_id;
    if let Some(cursor) = &request.cursor {
        return resume(memory, repository_id, cursor).map(Some);
    }
    let tips = tips_of(git, repository, &request.scope, cancel).await?;
    if tips.is_empty() {
        return Ok(None);
    }
    let session = LogSession {
        tips,
        filter: request.filter.clone().filter(is_filtering),
    };
    let session_id = new_log_session_id()?;
    memory.remember_session(repository_id, session_id.clone(), session.clone());
    Ok(Some(PagePosition {
        session_id,
        session,
        offset: 0,
    }))
}

fn resume(memory: &GitMemory, repository_id: &str, cursor: &LogCursor) -> CoreResult<PagePosition> {
    let malformed = || CoreError::BadRequest("The cursor is not one of a log page.".to_string());
    let (session_id, offset) = cursor
        .as_str()
        .rsplit_once(CURSOR_SEPARATOR)
        .ok_or_else(malformed)?;
    let offset = offset.parse().map_err(|_| malformed())?;
    let session = memory
        .session(repository_id, session_id)
        .ok_or_else(session_expired)?;
    Ok(PagePosition {
        session_id: session_id.to_string(),
        session,
        offset,
    })
}

fn session_expired() -> CoreError {
    GitError::new(
        ErrorCode::LogSessionExpired,
        "The history changed or was read too long ago; start again from the first page.",
    )
    .into()
}

fn cursor_of(session_id: &str, offset: usize) -> String {
    format!("{session_id}{CURSOR_SEPARATOR}{offset}")
}

fn empty_page() -> GitLogPage {
    GitLogPage {
        commits: Vec::new(),
        next_cursor: None,
        is_graph_available: true,
    }
}

fn is_filtering(filter: &GitLogFilter) -> bool {
    filter.text.is_some() || filter.author.is_some() || filter.path.is_some()
}

async fn tips_of(
    git: &GitCli<'_>,
    repository: &Repository,
    scope: &GitLogScope,
    cancel: &CancellationToken,
) -> CoreResult<Vec<String>> {
    let root = Path::new(&repository.info.root_path);
    let tips = match scope {
        GitLogScope::Head => head_commit(git, root, cancel).await?.into_iter().collect(),
        GitLogScope::All => all_tips(&read_refs(git, repository, root, cancel).await?),
        GitLogScope::Refs { ref_names } => {
            named_tips(&read_refs(git, repository, root, cancel).await?, ref_names)?
        }
    };
    Ok(without_duplicates(tips))
}

async fn head_commit(
    git: &GitCli<'_>,
    root: &Path,
    cancel: &CancellationToken,
) -> CoreResult<Option<String>> {
    let command = GitCommand::read(root, &HEAD_COMMIT_ARGS, QUERY_LIMITS);
    let output = git.run_raw(&command, cancel).await?;
    match output.exit_code {
        0 => commit_sha(output.stdout.trim()).map(Some),
        NO_MATCH_EXIT_CODE => Ok(None),
        _ => Err(command_failed(&output)),
    }
}

fn all_tips(refs: &GitRefs) -> Vec<String> {
    let mut tips: Vec<String> = ref_commits(refs)
        .map(|(_, commit)| commit.to_string())
        .collect();
    tips.extend(head_of(&refs.head));
    tips
}

fn named_tips(refs: &GitRefs, ref_names: &[FullRefName]) -> CoreResult<Vec<String>> {
    ref_names
        .iter()
        .map(|wanted| {
            ref_commits(refs)
                .find(|(ref_name, _)| *ref_name == wanted.as_str())
                .map(|(_, commit)| commit.to_string())
                .ok_or_else(|| {
                    CoreError::BadRequest(format!("{wanted} is not a ref of this repository."))
                })
        })
        .collect()
}

fn ref_commits(refs: &GitRefs) -> impl Iterator<Item = (&str, &str)> {
    let local = refs
        .local_branches
        .iter()
        .map(|branch| (branch.ref_name.as_str(), branch.commit.as_str()));
    let remote = refs
        .remote_branches
        .iter()
        .map(|branch| (branch.ref_name.as_str(), branch.commit.as_str()));
    let tags = refs
        .tags
        .iter()
        .map(|tag| (tag.ref_name.as_str(), tag.commit.as_str()));
    local.chain(remote).chain(tags)
}

fn head_of(head: &GitHead) -> Option<String> {
    match head {
        GitHead::Branch { commit, .. } => commit.clone(),
        GitHead::Detached { commit } => Some(commit.clone()),
    }
}

fn without_duplicates(tips: Vec<String>) -> Vec<String> {
    let mut unique = Vec::with_capacity(tips.len());
    for tip in tips {
        if !unique.contains(&tip) {
            unique.push(tip);
        }
    }
    unique
}

/// One commit more than a page, so its presence tells whether another page follows.
async fn read_commits(
    git: &GitCli<'_>,
    root: &Path,
    position: &PagePosition,
    cancel: &CancellationToken,
) -> CoreResult<Vec<GitCommitSummary>> {
    let args = page_args(position.session.filter.as_ref(), position.offset);
    let args: Vec<&str> = args.iter().map(String::as_str).collect();
    let command = GitCommand::read(root, &args, LOG_LIMITS).with_stdin(stdin_of(&position.session));
    parse_log(&git.run(&command, cancel).await?)
}

pub fn page_args(filter: Option<&GitLogFilter>, offset: usize) -> Vec<String> {
    let mut args: Vec<String> = LOG_ARGS.iter().map(ToString::to_string).collect();
    args.push(SUMMARY_FORMAT.to_string());
    args.push(format!("--max-count={}", PAGE_SIZE + 1));
    args.push(format!("--skip={offset}"));
    if let Some(filter) = filter {
        args.extend(text_match_args(filter));
    }
    args.push(STDIN_ARG.to_string());
    args
}

fn text_match_args(filter: &GitLogFilter) -> Vec<String> {
    if filter.text.is_none() && filter.author.is_none() {
        return Vec::new();
    }
    let mut args: Vec<String> = TEXT_MATCH_ARGS.iter().map(ToString::to_string).collect();
    args.extend(filter.text.iter().map(|text| format!("--grep={text}")));
    args.extend(
        filter
            .author
            .iter()
            .map(|author| format!("--author={author}")),
    );
    args
}

/// One tip per line, then the path after `--`. Every git call has literal pathspecs and the log runs at
/// the repository root, so the path is taken as written, relative to the root.
pub fn stdin_of(session: &LogSession) -> String {
    let mut stdin = String::new();
    for tip in &session.tips {
        stdin.push_str(tip);
        stdin.push(LINE_END);
    }
    if let Some(path) = session
        .filter
        .as_ref()
        .and_then(|filter| filter.path.as_ref())
    {
        stdin.push_str(PATHS_SEPARATOR);
        stdin.push(LINE_END);
        stdin.push_str(path.as_str());
        stdin.push(LINE_END);
    }
    stdin
}
