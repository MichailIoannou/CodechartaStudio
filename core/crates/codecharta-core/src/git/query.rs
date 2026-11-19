use std::ops::ControlFlow;

use codecharta_core_api::error::ErrorCode;
use codecharta_core_api::methods::git::{GitCommitDistance, GitCommitSummary, RefsAt};
use codecharta_core_api::values::{CommitSha, Revision};

use super::command::{DETAILS_LIMITS, QUERY_LIMITS, REV_LIST_LIMITS};
use super::error::{GitError, command_failed, message_for, parse_failed};
use super::parse::log::{SUMMARY_FORMAT, commit_sha, parse_log};
use super::runner::FolderGit;
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
const AS_TREE: &str = "^{tree}";
const COUNT_ARGS: [&str; 2] = ["rev-list", "--count"];
const DISTANCE_ARGS: [&str; 3] = ["rev-list", "--left-right", "--count"];
const POINTS_AT_FORMAT: &str = "--format=%(refname)";
const BRANCHES_PREFIX: &str = "refs/heads/";
const TAGS_PREFIX: &str = "refs/tags/";
const DATE_ORDER_ARGS: [&str; 3] = ["rev-list", "--date-order", "--stdin"];
const PARENTS_ARGS: [&str; 3] = ["rev-list", "--parents", "--stdin"];
const FIRST_PARENT_ARG: &str = "--first-parent";
const PARENT_SEPARATOR: char = ' ';
const MERGE_PARENTS: usize = 2;
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

/// One commit of a walk that names parents; a merge has more than one.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WalkedCommit {
    pub sha: CommitSha,
    pub is_merge: bool,
}

pub type BatchSink<'sink, Item> = dyn FnMut(&[Item]) -> ControlFlow<()> + Send + 'sink;
pub type ShaSink<'sink> = BatchSink<'sink, CommitSha>;
pub type WalkSink<'sink> = BatchSink<'sink, WalkedCommit>;

pub async fn resolve_commit(
    at: FolderGit<'_>,
    revision: &Revision,
) -> CoreResult<GitCommitSummary> {
    let peeled = format!("{revision}{AS_COMMIT}");
    let args = [&RESOLVE_ARGS[..], &[peeled.as_str()]].concat();
    let output = at.run_raw(&args, QUERY_LIMITS).await?;
    match output.exit_code {
        0 => summary_of_commit(at, output.stdout.trim()).await,
        NO_ANSWER_EXIT_CODE => Err(unknown_revision()),
        _ => Err(command_failed(&output)),
    }
}

async fn summary_of_commit(at: FolderGit<'_>, sha: &str) -> CoreResult<GitCommitSummary> {
    let sha = commit_sha(sha)?;
    let args = [&SUMMARY_ARGS[..], &[SUMMARY_FORMAT, END_OF_OPTIONS, &sha]].concat();
    parse_log(&at.run(&args, DETAILS_LIMITS).await?)?
        .into_iter()
        .next()
        .ok_or_else(|| parse_failed(WHAT))
}

fn unknown_revision() -> CoreError {
    let code = ErrorCode::UnknownRevision;
    GitError::new(code, message_for(code)).into()
}

/// The tree a commit records; two commits with the same tree have the same files.
pub async fn tree_of(at: FolderGit<'_>, sha: &CommitSha) -> CoreResult<String> {
    let peeled = format!("{sha}{AS_TREE}");
    let args = [&RESOLVE_ARGS[..], &[peeled.as_str()]].concat();
    let output = at.run_raw(&args, QUERY_LIMITS).await?;
    match output.exit_code {
        0 => Ok(output.stdout.trim().to_string()),
        NO_ANSWER_EXIT_CODE => Err(unknown_revision()),
        _ => Err(command_failed(&output)),
    }
}

/// The commits reachable from `to` but not from `from`.
pub async fn rev_list_count(
    at: FolderGit<'_>,
    from: &CommitSha,
    to: &CommitSha,
) -> CoreResult<u64> {
    let range = format!("{from}..{to}");
    let args = [&COUNT_ARGS[..], &[range.as_str()]].concat();
    let stdout = at.run(&args, QUERY_LIMITS).await?;
    stdout.trim().parse().map_err(|_| parse_failed(WHAT))
}

/// `None` when the two commits share no history.
pub async fn merge_base(
    at: FolderGit<'_>,
    left: &CommitSha,
    right: &CommitSha,
) -> CoreResult<Option<String>> {
    let output = at
        .run_raw(&[MERGE_BASE, left.as_str(), right.as_str()], QUERY_LIMITS)
        .await?;
    match output.exit_code {
        0 => commit_sha(output.stdout.trim()).map(Some),
        NO_ANSWER_EXIT_CODE if output.stdout.trim().is_empty() => Ok(None),
        _ => Err(command_failed(&output)),
    }
}

pub async fn is_ancestor(
    at: FolderGit<'_>,
    ancestor: &CommitSha,
    descendant: &CommitSha,
) -> CoreResult<bool> {
    let args = [
        MERGE_BASE,
        IS_ANCESTOR,
        ancestor.as_str(),
        descendant.as_str(),
    ];
    let output = at.run_raw(&args, QUERY_LIMITS).await?;
    match output.exit_code {
        0 => Ok(true),
        NO_ANSWER_EXIT_CODE => Ok(false),
        _ => Err(command_failed(&output)),
    }
}

/// Four candidates at a time; a candidate the repository does not contain is left out.
pub async fn measure_distances(
    at: FolderGit<'_>,
    target: &CommitSha,
    candidates: &[CommitSha],
) -> CoreResult<Vec<GitCommitDistance>> {
    check_candidate_count(candidates)?;
    let mut distances = Vec::with_capacity(candidates.len());
    for group in candidates.chunks(PARALLEL_DISTANCES) {
        let measured = tokio::join!(
            measure(at, target, group.first()),
            measure(at, target, group.get(1)),
            measure(at, target, group.get(2)),
            measure(at, target, group.get(3)),
        );
        for result in [measured.0, measured.1, measured.2, measured.3] {
            distances.extend(result?);
        }
    }
    Ok(distances)
}

pub fn check_candidate_count(candidates: &[CommitSha]) -> CoreResult<()> {
    if candidates.len() > MAX_DISTANCE_CANDIDATES {
        return Err(CoreError::BadRequest(format!(
            "At most {MAX_DISTANCE_CANDIDATES} candidates can be measured at once."
        )));
    }
    Ok(())
}

/// The number of `measure` calls joined in `measure_distances`.
const PARALLEL_DISTANCES: usize = 4;

/// Nothing for an empty slot.
async fn measure(
    at: FolderGit<'_>,
    target: &CommitSha,
    candidate: Option<&CommitSha>,
) -> CoreResult<Option<GitCommitDistance>> {
    match candidate {
        Some(candidate) => distance(at, target, candidate).await,
        None => Ok(None),
    }
}

/// Nothing for a candidate the repository does not contain.
pub async fn distance(
    at: FolderGit<'_>,
    target: &CommitSha,
    candidate: &CommitSha,
) -> CoreResult<Option<GitCommitDistance>> {
    let range = format!("{candidate}...{target}");
    let args = [&DISTANCE_ARGS[..], &[range.as_str()]].concat();
    match at.run(&args, QUERY_LIMITS).await {
        Ok(counts) => distance_of(candidate, &counts).map(Some),
        Err(error) if error.code() == ErrorCode::UnknownRevision => Ok(None),
        Err(error) => Err(error),
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

pub async fn refs_at(at: FolderGit<'_>, sha: &CommitSha) -> CoreResult<RefsAt> {
    let points_at = format!("--points-at={sha}");
    let args = [
        "for-each-ref",
        points_at.as_str(),
        POINTS_AT_FORMAT,
        BRANCHES_PREFIX,
        TAGS_PREFIX,
    ];
    let stdout = at.run(&args, QUERY_LIMITS).await?;
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
    at: FolderGit<'_>,
    request: &RevListRequest,
    sink: &mut ShaSink<'_>,
) -> CoreResult<u64> {
    let walk = Walk {
        request,
        leading_args: &DATE_ORDER_ARGS,
        parse: |line| CommitSha::try_from(line).ok(),
    };
    stream_walk(at, &walk, sink).await
}

/// Like `rev_list`, telling merge commits apart, in git's default order: newest commit date first,
/// without `rev_list`'s promise of children before parents, so git answers without first walking the
/// whole history (`--date-order` takes about 0.4 s for the first line of 100 000 commits). A walk that
/// met no merge commit yet has followed one line of parents, whatever the dates.
pub async fn rev_list_with_parents(
    at: FolderGit<'_>,
    request: &RevListRequest,
    sink: &mut WalkSink<'_>,
) -> CoreResult<u64> {
    let walk = Walk {
        request,
        leading_args: &PARENTS_ARGS,
        parse: walked_commit,
    };
    stream_walk(at, &walk, sink).await
}

/// `<sha> <parent>…`, as `--parents` prints a commit.
fn walked_commit(line: &str) -> Option<WalkedCommit> {
    let mut fields = line.split(PARENT_SEPARATOR);
    let sha = CommitSha::try_from(fields.next()?).ok()?;
    Some(WalkedCommit {
        sha,
        is_merge: fields.count() >= MERGE_PARENTS,
    })
}

struct Walk<'request, Item> {
    request: &'request RevListRequest,
    leading_args: &'static [&'static str],
    parse: fn(&str) -> Option<Item>,
}

async fn stream_walk<Item: Send>(
    at: FolderGit<'_>,
    walk: &Walk<'_, Item>,
    sink: &mut BatchSink<'_, Item>,
) -> CoreResult<u64> {
    if walk.request.include.is_empty() {
        return Ok(0);
    }
    let args = rev_list_args(walk.request, walk.leading_args);
    let args: Vec<&str> = args.iter().map(String::as_str).collect();
    let command = at
        .read(&args, REV_LIST_LIMITS)
        .with_stdin(rev_list_stdin(walk.request));
    let mut batcher = Batcher::new(sink, walk.parse);
    at.git
        .stream_lines(&command, at.cancel, &mut |line| batcher.take(line))
        .await?;
    batcher.finish()
}

fn rev_list_args(request: &RevListRequest, leading_args: &[&str]) -> Vec<String> {
    let mut args: Vec<String> = leading_args.iter().map(ToString::to_string).collect();
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

struct Batcher<'sink, 'call, Item> {
    sink: &'call mut BatchSink<'sink, Item>,
    parse: fn(&str) -> Option<Item>,
    batch: Vec<Item>,
    delivered: u64,
    is_stopped: bool,
    is_malformed: bool,
}

impl<'sink, 'call, Item> Batcher<'sink, 'call, Item> {
    fn new(sink: &'call mut BatchSink<'sink, Item>, parse: fn(&str) -> Option<Item>) -> Self {
        Self {
            sink,
            parse,
            batch: Vec::with_capacity(REV_LIST_BATCH),
            delivered: 0,
            is_stopped: false,
            is_malformed: false,
        }
    }

    fn take(&mut self, line: &str) -> ControlFlow<()> {
        let Some(item) = (self.parse)(line) else {
            self.is_malformed = true;
            return ControlFlow::Break(());
        };
        self.batch.push(item);
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
