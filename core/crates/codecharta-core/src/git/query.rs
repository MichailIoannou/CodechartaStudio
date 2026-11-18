use std::ops::ControlFlow;
use std::path::Path;

use codecharta_core_api::error::ErrorCode;
use codecharta_core_api::methods::git::{GitCommitDistance, GitCommitSummary, RefsAt};
use codecharta_core_api::values::{CommitSha, Revision};
use tokio_util::sync::CancellationToken;

use super::command::{DETAILS_LIMITS, GitCommand, QUERY_LIMITS, REV_LIST_LIMITS};
use super::error::{GitError, command_failed, message_for, parse_failed};
use super::parse::log::{SUMMARY_FORMAT, commit_sha, parse_log};
use super::runner::GitCli;
use crate::error::{CoreError, CoreResult};

pub const MAX_DISTANCE_CANDIDATES: usize = 200;
pub const REV_LIST_BATCH: usize = 1000;
const MERGE_BASE: &str = "merge-base";
const IS_ANCESTOR: &str = "--is-ancestor";
const NO_ANSWER_EXIT_CODE: i32 = 1;
const RESOLVE_ARGS: [&str; 4] = ["rev-parse", "--verify", "--quiet", "--end-of-options"];
const SUMMARY_ARGS: [&str; 3] = ["show", "-s", "-z"];
const END_OF_OPTIONS: &str = "--end-of-options";
const AS_COMMIT: &str = "^{commit}";
const COUNT_ARGS: [&str; 2] = ["rev-list", "--count"];
const DISTANCE_ARGS: [&str; 3] = ["rev-list", "--left-right", "--count"];
const POINTS_AT_FORMAT: &str = "--format=%(refname)";
const BRANCHES_PREFIX: &str = "refs/heads/";
const TAGS_PREFIX: &str = "refs/tags/";
const REV_LIST_ARGS: [&str; 3] = ["rev-list", "--date-order", "--stdin"];
const FIRST_PARENT_ARG: &str = "--first-parent";
const EXCLUDE_MARK: char = '^';
const LINE_END: char = '\n';
const COUNT_SEPARATOR: char = '\t';
const WHAT: &str = "a commit query";

/// The commits a streamed rev-list walks: reachable from `include`, not from `exclude`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RevListRequest {
    pub include: Vec<CommitSha>,
    pub exclude: Vec<CommitSha>,
    pub first_parent: bool,
    pub max_count: Option<u32>,
}

pub type ShaSink<'sink> = dyn FnMut(&[CommitSha]) -> ControlFlow<()> + Send + 'sink;

pub async fn resolve_commit(
    git: &GitCli<'_>,
    folder: &Path,
    revision: &Revision,
    cancel: &CancellationToken,
) -> CoreResult<GitCommitSummary> {
    let peeled = format!("{revision}{AS_COMMIT}");
    let args = [&RESOLVE_ARGS[..], &[peeled.as_str()]].concat();
    let output = git
        .run_raw(&GitCommand::read(folder, &args, QUERY_LIMITS), cancel)
        .await?;
    match output.exit_code {
        0 => summary_of_commit(git, folder, output.stdout.trim(), cancel).await,
        NO_ANSWER_EXIT_CODE => Err(unknown_revision()),
        _ => Err(command_failed(&output)),
    }
}

async fn summary_of_commit(
    git: &GitCli<'_>,
    folder: &Path,
    sha: &str,
    cancel: &CancellationToken,
) -> CoreResult<GitCommitSummary> {
    let sha = commit_sha(sha)?;
    let args = [&SUMMARY_ARGS[..], &[SUMMARY_FORMAT, END_OF_OPTIONS, &sha]].concat();
    let command = GitCommand::read(folder, &args, DETAILS_LIMITS);
    parse_log(&git.run(&command, cancel).await?)?
        .into_iter()
        .next()
        .ok_or_else(|| parse_failed(WHAT))
}

fn unknown_revision() -> CoreError {
    let code = ErrorCode::UnknownRevision;
    GitError::new(code, message_for(code)).into()
}

/// The commits reachable from `to` but not from `from`.
pub async fn rev_list_count(
    git: &GitCli<'_>,
    folder: &Path,
    from: &CommitSha,
    to: &CommitSha,
    cancel: &CancellationToken,
) -> CoreResult<u64> {
    let range = format!("{from}..{to}");
    let args = [&COUNT_ARGS[..], &[range.as_str()]].concat();
    let stdout = git
        .run(&GitCommand::read(folder, &args, QUERY_LIMITS), cancel)
        .await?;
    stdout.trim().parse().map_err(|_| parse_failed(WHAT))
}

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

pub async fn is_ancestor(
    git: &GitCli<'_>,
    folder: &Path,
    ancestor: &CommitSha,
    descendant: &CommitSha,
    cancel: &CancellationToken,
) -> CoreResult<bool> {
    let args = [
        MERGE_BASE,
        IS_ANCESTOR,
        ancestor.as_str(),
        descendant.as_str(),
    ];
    let output = git
        .run_raw(&GitCommand::read(folder, &args, QUERY_LIMITS), cancel)
        .await?;
    match output.exit_code {
        0 => Ok(true),
        NO_ANSWER_EXIT_CODE => Ok(false),
        _ => Err(command_failed(&output)),
    }
}

/// Four candidates at a time; a candidate the repository does not contain is left out.
pub async fn measure_distances(
    git: &GitCli<'_>,
    folder: &Path,
    target: &CommitSha,
    candidates: &[CommitSha],
    cancel: &CancellationToken,
) -> CoreResult<Vec<GitCommitDistance>> {
    if candidates.len() > MAX_DISTANCE_CANDIDATES {
        return Err(CoreError::BadRequest(format!(
            "At most {MAX_DISTANCE_CANDIDATES} candidates can be measured at once."
        )));
    }
    let query = DistanceQuery {
        git,
        folder,
        target,
        cancel,
    };
    let mut distances = Vec::with_capacity(candidates.len());
    for group in candidates.chunks(PARALLEL_DISTANCES) {
        let measured = tokio::join!(
            query.measure(group.first()),
            query.measure(group.get(1)),
            query.measure(group.get(2)),
            query.measure(group.get(3)),
        );
        for result in [measured.0, measured.1, measured.2, measured.3] {
            distances.extend(result?);
        }
    }
    Ok(distances)
}

/// The number of `measure` calls joined in `measure_distances`.
const PARALLEL_DISTANCES: usize = 4;

struct DistanceQuery<'query, 'core> {
    git: &'query GitCli<'core>,
    folder: &'query Path,
    target: &'query CommitSha,
    cancel: &'query CancellationToken,
}

impl DistanceQuery<'_, '_> {
    /// Nothing for an empty slot or a candidate the repository does not contain.
    async fn measure(
        &self,
        candidate: Option<&CommitSha>,
    ) -> CoreResult<Option<GitCommitDistance>> {
        match candidate {
            Some(candidate) => self.distance(candidate).await,
            None => Ok(None),
        }
    }

    async fn distance(&self, candidate: &CommitSha) -> CoreResult<Option<GitCommitDistance>> {
        let range = format!("{candidate}...{}", self.target);
        let args = [&DISTANCE_ARGS[..], &[range.as_str()]].concat();
        let command = GitCommand::read(self.folder, &args, QUERY_LIMITS);
        match self.git.run(&command, self.cancel).await {
            Ok(counts) => distance_of(candidate, &counts).map(Some),
            Err(error) if error.code() == ErrorCode::UnknownRevision => Ok(None),
            Err(error) => Err(error),
        }
    }
}

/// `<only in candidate>\t<only in target>`.
fn distance_of(candidate: &CommitSha, counts: &str) -> CoreResult<GitCommitDistance> {
    let (only_in_candidate, only_in_target) = counts
        .trim()
        .split_once(COUNT_SEPARATOR)
        .ok_or_else(|| parse_failed(WHAT))?;
    Ok(GitCommitDistance {
        sha: candidate.to_string(),
        only_in_candidate: only_in_candidate.parse().map_err(|_| parse_failed(WHAT))?,
        only_in_target: only_in_target.parse().map_err(|_| parse_failed(WHAT))?,
    })
}

pub async fn refs_at(
    git: &GitCli<'_>,
    folder: &Path,
    sha: &CommitSha,
    cancel: &CancellationToken,
) -> CoreResult<RefsAt> {
    let points_at = format!("--points-at={sha}");
    let args = [
        "for-each-ref",
        points_at.as_str(),
        POINTS_AT_FORMAT,
        BRANCHES_PREFIX,
        TAGS_PREFIX,
    ];
    let stdout = git
        .run(&GitCommand::read(folder, &args, QUERY_LIMITS), cancel)
        .await?;
    let short_names = |prefix: &str| -> Vec<String> {
        stdout
            .lines()
            .filter_map(|ref_name| ref_name.strip_prefix(prefix))
            .map(str::to_string)
            .collect()
    };
    Ok(RefsAt {
        branches: short_names(BRANCHES_PREFIX),
        tags: short_names(TAGS_PREFIX),
    })
}

/// Hands the walked commits to `sink` in batches of `REV_LIST_BATCH` as git prints them, newest first
/// with children before parents; `Break` stops git. Answers how many commits the sink got.
pub async fn rev_list(
    git: &GitCli<'_>,
    folder: &Path,
    request: &RevListRequest,
    cancel: &CancellationToken,
    sink: &mut ShaSink<'_>,
) -> CoreResult<u64> {
    if request.include.is_empty() {
        return Ok(0);
    }
    let args = rev_list_args(request);
    let args: Vec<&str> = args.iter().map(String::as_str).collect();
    let command =
        GitCommand::read(folder, &args, REV_LIST_LIMITS).with_stdin(rev_list_stdin(request));
    let mut batcher = ShaBatcher::new(sink);
    git.stream_lines(&command, cancel, &mut |line| batcher.take(line))
        .await?;
    batcher.finish()
}

fn rev_list_args(request: &RevListRequest) -> Vec<String> {
    let mut args: Vec<String> = REV_LIST_ARGS.iter().map(ToString::to_string).collect();
    if request.first_parent {
        args.push(FIRST_PARENT_ARG.to_string());
    }
    args.extend(
        request
            .max_count
            .map(|count| format!("--max-count={count}")),
    );
    args
}

fn rev_list_stdin(request: &RevListRequest) -> String {
    let included = request.include.iter().map(ToString::to_string);
    let excluded = request
        .exclude
        .iter()
        .map(|sha| format!("{EXCLUDE_MARK}{sha}"));
    included
        .chain(excluded)
        .map(|line| format!("{line}{LINE_END}"))
        .collect()
}

struct ShaBatcher<'sink, 'call> {
    sink: &'call mut ShaSink<'sink>,
    batch: Vec<CommitSha>,
    delivered: u64,
    is_stopped: bool,
    is_malformed: bool,
}

impl<'sink, 'call> ShaBatcher<'sink, 'call> {
    fn new(sink: &'call mut ShaSink<'sink>) -> Self {
        Self {
            sink,
            batch: Vec::with_capacity(REV_LIST_BATCH),
            delivered: 0,
            is_stopped: false,
            is_malformed: false,
        }
    }

    fn take(&mut self, line: &str) -> ControlFlow<()> {
        let Ok(sha) = CommitSha::try_from(line) else {
            self.is_malformed = true;
            return ControlFlow::Break(());
        };
        self.batch.push(sha);
        if self.batch.len() < REV_LIST_BATCH {
            return ControlFlow::Continue(());
        }
        self.deliver()
    }

    fn deliver(&mut self) -> ControlFlow<()> {
        self.delivered += self.batch.len() as u64;
        let flow = (self.sink)(&self.batch);
        self.batch.clear();
        self.is_stopped = flow.is_break();
        flow
    }

    fn finish(mut self) -> CoreResult<u64> {
        if self.is_malformed {
            return Err(parse_failed(WHAT));
        }
        if !self.is_stopped && !self.batch.is_empty() {
            let _the_walk_is_over_either_way = self.deliver();
        }
        Ok(self.delivered)
    }
}
