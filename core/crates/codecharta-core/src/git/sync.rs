use std::collections::BTreeMap;

use codecharta_core_api::error::ErrorCode;
use codecharta_core_api::methods::git::{
    GitAbortableOperation, GitLocalBranch, GitOperationResult, GitPullMode, GitPushParams, GitRefs,
    OperationInProgress,
};
use codecharta_core_api::values::{CommitSha, FullRefName, Revision};

use super::branch::{ensure_no_operation_in_progress, local_branch};
use super::command::{BRANCH_LIMITS, GitCommand, QUERY_LIMITS};
use super::error::refused;
use super::locator::locate;
use super::operation::{Mutation, OperationContext};
use super::service::{GitFolder, GitService};
use crate::error::{CoreError, CoreResult};

const FETCH_ALL_ARGS: [&str; 5] = [
    "fetch",
    "--all",
    "--progress",
    "--no-recurse-submodules",
    "--no-auto-maintenance",
];
const PRUNE: &str = "--prune";
/// An empty `--refmap` keeps git from also updating remote-tracking branches, and `--no-tags` from
/// following tags, so nothing but the named destinations is written.
const FETCH_REFSPECS_ARGS: [&str; 7] = [
    "fetch",
    "--progress",
    "--no-recurse-submodules",
    "--no-auto-maintenance",
    "--no-tags",
    "--refmap=",
    "--no-write-fetch-head",
];
const END_OF_OPTIONS: &str = "--end-of-options";
const PULL: &str = "pull";
const PULL_OPTIONS: [&str; 2] = ["--progress", "--no-recurse-submodules"];
const FAST_FORWARD_ONLY: [&str; 1] = ["--ff-only"];
const REBASE: [&str; 1] = ["--rebase"];
const MERGE: [&str; 2] = ["--no-rebase", "--no-edit"];
/// `--porcelain` puts every refused ref and its reason on stdout, where the classifier finds them.
const PUSH_ARGS: [&str; 3] = ["push", "--progress", "--porcelain"];
const SET_UPSTREAM: &str = "-u";
/// Always with the remote ref and the commit the user saw there, never bare and never `--force`.
const FORCE_WITH_LEASE_OPTION: &str = "--force-with-lease=";
const ABORT: &str = "--abort";
const MERGE_SUBCOMMAND: &str = "merge";
const REBASE_SUBCOMMAND: &str = "rebase";
const LOCAL_BRANCHES_PREFIX: &str = "refs/heads/";
/// The only refs the core writes into a user's repository besides what the user asks git to do (D5).
pub const CODECHARTA_REFS_PREFIX: &str = "refs/codecharta/";
/// `for-each-ref` matches a pattern without its slash from the start up to a slash: only that namespace.
const PRIVATE_REFS_PATTERN: &str = "refs/codecharta";
const LIST_PRIVATE_REFS_ARGS: [&str; 3] =
    ["for-each-ref", "--format=%(refname)", PRIVATE_REFS_PATTERN];
const UPDATE_REFS_FROM_STDIN_ARGS: [&str; 2] = ["update-ref", "--stdin"];
const FULL_REF_PREFIX: &str = "refs/";
const FORCE_PREFIX: &str = "+";
const REFSPEC_SEPARATOR: &str = ":";

/// One `[+]<source>:<destination>` of a fetch: `source` is a full ref name on the remote, `destination`
/// lies under `refs/codecharta/`. Only `new` makes one, so no other destination can reach git.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Refspec {
    force: bool,
    source: String,
    destination: FullRefName,
}

impl Refspec {
    pub fn new(force: bool, source: &str, destination: &str) -> CoreResult<Self> {
        let source = full_ref(source)?;
        let destination = full_ref(destination)?;
        if !destination.starts_with(CODECHARTA_REFS_PREFIX) {
            return Err(CoreError::BadRequest(format!(
                "A fetch may write only refs under {CODECHARTA_REFS_PREFIX}."
            )));
        }
        Ok(Self {
            force,
            source,
            destination: FullRefName::try_from(destination)
                .map_err(|error| CoreError::BadRequest(error.to_string()))?,
        })
    }

    pub fn destination(&self) -> &FullRefName {
        &self.destination
    }

    fn text(&self) -> String {
        let force = if self.force { FORCE_PREFIX } else { "" };
        format!(
            "{force}{}{REFSPEC_SEPARATOR}{}",
            self.source, self.destination
        )
    }
}

/// A well-formed full ref name: no option, no expression, nothing `check-ref-format` would refuse.
fn full_ref(text: &str) -> CoreResult<String> {
    let invalid = || CoreError::BadRequest("A refspec names full, well-formed refs.".to_string());
    let revision = Revision::try_from(text).map_err(|_| invalid())?;
    if !revision.as_str().starts_with(FULL_REF_PREFIX) {
        return Err(invalid());
    }
    Ok(revision.into())
}

/// `remote` is the name of a configured remote, never a url.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FetchRefspecsRequest {
    pub remote: String,
    pub refspecs: Vec<Refspec>,
}

/// `remote` is the name of a configured remote, never a url; `force_with_lease_expected` is the commit
/// the user saw on the remote branch.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PushRequest {
    pub branch_ref_name: FullRefName,
    pub remote: String,
    pub set_upstream: bool,
    pub force_with_lease_expected: Option<CommitSha>,
}

impl From<GitPushParams> for PushRequest {
    fn from(params: GitPushParams) -> Self {
        Self {
            branch_ref_name: params.branch_ref_name,
            remote: params.remote,
            set_upstream: params.set_upstream,
            force_with_lease_expected: params.force_with_lease_expected,
        }
    }
}

impl GitService<'_> {
    /// A pull fetches too, so it ends like a fetch.
    pub async fn pull(
        &self,
        folder: &GitFolder,
        mode: GitPullMode,
        context: &OperationContext<'_>,
    ) -> CoreResult<GitOperationResult> {
        let repository = locate(&self.git, &folder.path, context.cancel).await?;
        let mutation = self.mutation(folder, &repository, context)?;
        let settled = self.operate(&mutation, pull(&mutation, mode)).await;
        let info = &repository.info;
        self.memory.fetched(&info.repository_id, info.is_shallow);
        Ok(settled?.into_operation_result())
    }

    pub async fn push(
        &self,
        folder: &GitFolder,
        request: &PushRequest,
        context: &OperationContext<'_>,
    ) -> CoreResult<GitOperationResult> {
        let repository = locate(&self.git, &folder.path, context.cancel).await?;
        let mutation = self.mutation(folder, &repository, context)?;
        let settled = self.operate(&mutation, push(&mutation, request));
        Ok(settled.await?.into_operation_result())
    }

    pub async fn abort_operation(
        &self,
        folder: &GitFolder,
        operation: GitAbortableOperation,
        context: &OperationContext<'_>,
    ) -> CoreResult<GitOperationResult> {
        let repository = locate(&self.git, &folder.path, context.cancel).await?;
        let mutation = self.mutation(folder, &repository, context)?;
        let settled = self.operate(&mutation, abort(&mutation, operation));
        Ok(settled.await?.into_operation_result())
    }
}

/// The current branch from its upstream; conflicts leave the merge or rebase in progress.
async fn pull(mutation: &Mutation<'_>, mode: GitPullMode) -> CoreResult<()> {
    ensure_no_operation_in_progress(mutation)?;
    let refs = mutation.refs().await?;
    let branch = current_branch(&refs)?;
    if branch.upstream.is_none() {
        return Err(refused(ErrorCode::NoUpstream));
    }
    mutation.run_network(&pull_args(mode)).await.map(drop)
}

fn current_branch(refs: &GitRefs) -> CoreResult<&GitLocalBranch> {
    refs.local_branches
        .iter()
        .find(|branch| branch.is_current)
        .ok_or_else(|| {
            CoreError::NotAllowed(
                "A pull needs a checked-out branch; switch to one first.".to_string(),
            )
        })
}

fn pull_args(mode: GitPullMode) -> Vec<&'static str> {
    let mode_args: &[&str] = match mode {
        GitPullMode::FfOnly => &FAST_FORWARD_ONLY,
        GitPullMode::Rebase => &REBASE,
        GitPullMode::Merge => &MERGE,
    };
    [&[PULL], mode_args, PULL_OPTIONS.as_slice()].concat()
}

async fn push(mutation: &Mutation<'_>, request: &PushRequest) -> CoreResult<()> {
    let refs = mutation.refs().await?;
    let branch = local_branch(&refs, &request.branch_ref_name)?;
    ensure_remote(&refs, &request.remote)?;
    let destination = push_destination(&refs, branch, &request.remote);
    let args = push_args(&branch.ref_name, &destination, request);
    let args: Vec<&str> = args.iter().map(String::as_str).collect();
    mutation.run_network(&args).await.map(drop)
}

/// The branch's upstream on that remote, or a branch of the same name there.
fn push_destination(refs: &GitRefs, branch: &GitLocalBranch, remote: &str) -> String {
    let upstream = branch.upstream.as_ref().and_then(|upstream| {
        refs.remote_branches
            .iter()
            .find(|tracking| tracking.ref_name == upstream.ref_name && tracking.remote == remote)
    });
    let name = upstream.map_or(branch.name.as_str(), |tracking| {
        tracking.branch_name.as_str()
    });
    format!("{LOCAL_BRANCHES_PREFIX}{name}")
}

fn push_args(source: &str, destination: &str, request: &PushRequest) -> Vec<String> {
    let mut args: Vec<String> = PUSH_ARGS.iter().map(ToString::to_string).collect();
    if request.set_upstream {
        args.push(SET_UPSTREAM.to_string());
    }
    if let Some(expected) = &request.force_with_lease_expected {
        args.push(format!("{FORCE_WITH_LEASE_OPTION}{destination}:{expected}"));
    }
    args.extend([
        END_OF_OPTIONS.to_string(),
        request.remote.clone(),
        format!("{source}{REFSPEC_SEPARATOR}{destination}"),
    ]);
    args
}

async fn abort(mutation: &Mutation<'_>, operation: GitAbortableOperation) -> CoreResult<()> {
    let (expected, subcommand) = match operation {
        GitAbortableOperation::Merge => (OperationInProgress::Merge, MERGE_SUBCOMMAND),
        GitAbortableOperation::Rebase => (OperationInProgress::Rebase, REBASE_SUBCOMMAND),
    };
    if mutation.operation_in_progress() != Some(expected) {
        return Err(CoreError::NotAllowed(format!(
            "No {subcommand} is in progress to abort."
        )));
    }
    mutation.run(&[subcommand, ABORT]).await.map(drop)
}

fn ensure_remote(refs: &GitRefs, remote: &str) -> CoreResult<()> {
    if refs
        .remotes
        .iter()
        .any(|configured| configured.name == remote)
    {
        Ok(())
    } else {
        Err(CoreError::NotFound(format!(
            "There is no remote {remote:?}."
        )))
    }
}

/// Answers the refs as they were before, to count what the fetch changed.
pub async fn fetch(mutation: &Mutation<'_>, prune: bool) -> CoreResult<GitRefs> {
    let before = mutation.refs().await?;
    let mut args = FETCH_ALL_ARGS.to_vec();
    if prune {
        args.push(PRUNE);
    }
    mutation.run_network(&args).await?;
    Ok(before)
}

pub async fn fetch_refspecs(
    mutation: &Mutation<'_>,
    request: &FetchRefspecsRequest,
) -> CoreResult<GitRefs> {
    if request.refspecs.is_empty() {
        return Err(CoreError::BadRequest(
            "Name at least one refspec.".to_string(),
        ));
    }
    let before = mutation.refs().await?;
    ensure_remote(&before, &request.remote)?;
    let refspecs: Vec<String> = request.refspecs.iter().map(Refspec::text).collect();
    let mut args = FETCH_REFSPECS_ARGS.to_vec();
    args.extend([END_OF_OPTIONS, request.remote.as_str()]);
    args.extend(refspecs.iter().map(String::as_str));
    mutation.run_network(&args).await?;
    Ok(before)
}

/// Deletes every ref under `refs/codecharta/` in one transaction and answers how many there were.
pub async fn remove_private_refs(mutation: &Mutation<'_>) -> CoreResult<u32> {
    let listed = mutation
        .reads()
        .run(&LIST_PRIVATE_REFS_ARGS, QUERY_LIMITS)
        .await?;
    let private_refs: Vec<&str> = listed
        .lines()
        .filter(|name| name.starts_with(CODECHARTA_REFS_PREFIX))
        .collect();
    if private_refs.is_empty() {
        return Ok(0);
    }
    let deletions: String = private_refs
        .iter()
        .map(|name| format!("delete {name}\n"))
        .collect();
    let command = GitCommand::mutating(
        &mutation.folder.path,
        &UPDATE_REFS_FROM_STDIN_ARGS,
        BRANCH_LIMITS,
    )
    .with_stdin(deletions);
    mutation.run_command(&command).await?;
    Ok(u32::try_from(private_refs.len()).unwrap_or(u32::MAX))
}

/// Branches, remote branches and tags that appeared, disappeared or point elsewhere.
pub fn count_updated_refs(before: &GitRefs, after: &GitRefs) -> u32 {
    let (before, after) = (commits_by_ref(before), commits_by_ref(after));
    let changed = before
        .iter()
        .filter(|(name, commit)| after.get(*name) != Some(*commit))
        .count();
    let added = after
        .keys()
        .filter(|name| !before.contains_key(*name))
        .count();
    u32::try_from(changed + added).unwrap_or(u32::MAX)
}

fn commits_by_ref(refs: &GitRefs) -> BTreeMap<&str, &str> {
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
    local.chain(remote).chain(tags).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_refuse_refspecs_writing_outside_refs_codecharta() {
        // Arrange
        let destinations = [
            "refs/heads/stolen",
            "refs/remotes/origin/main",
            "refs/codecharta",
            "refs/codecharta/../heads/main",
            "refs/codecharta/pr/1:refs/heads/x",
            "--upload-pack=evil",
            "HEAD",
        ];

        // Act
        let refused: Vec<bool> = destinations
            .iter()
            .map(|destination| Refspec::new(true, "refs/pull/1/head", destination).is_err())
            .collect();

        // Assert
        assert_eq!(refused, vec![true; destinations.len()]);
    }

    fn push_request(set_upstream: bool, expected: Option<&str>) -> PushRequest {
        PushRequest {
            branch_ref_name: FullRefName::try_from("refs/heads/feature").unwrap(),
            remote: "origin".to_string(),
            set_upstream,
            force_with_lease_expected: expected.map(|sha| CommitSha::try_from(sha).unwrap()),
        }
    }

    #[test]
    fn should_push_with_a_lease_on_the_destination_and_the_expected_sha_only() {
        // Arrange
        let expected = "0123456789abcdef0123456789abcdef01234567";
        let (source, destination) = ("refs/heads/feature", "refs/heads/upstream");

        // Act
        let plain = push_args(source, destination, &push_request(false, None));
        let leased = push_args(source, destination, &push_request(true, Some(expected)));

        // Assert
        assert_eq!(
            plain,
            [
                "push",
                "--progress",
                "--porcelain",
                "--end-of-options",
                "origin",
                "refs/heads/feature:refs/heads/upstream"
            ]
        );
        assert_eq!(
            leased[3..6],
            [
                "-u".to_string(),
                format!("--force-with-lease=refs/heads/upstream:{expected}"),
                "--end-of-options".to_string()
            ]
        );
        assert!(
            !plain
                .iter()
                .chain(&leased)
                .any(|arg| arg == "--force" || arg == "-f")
        );
    }

    #[test]
    fn should_pull_fast_forward_only_unless_rebase_or_merge_is_asked() {
        // Arrange
        let modes = [GitPullMode::FfOnly, GitPullMode::Rebase, GitPullMode::Merge];

        // Act
        let args = modes.map(pull_args);

        // Assert
        assert_eq!(
            args,
            [
                vec!["pull", "--ff-only", "--progress", "--no-recurse-submodules"],
                vec!["pull", "--rebase", "--progress", "--no-recurse-submodules"],
                vec![
                    "pull",
                    "--no-rebase",
                    "--no-edit",
                    "--progress",
                    "--no-recurse-submodules"
                ],
            ]
        );
    }

    #[test]
    fn should_write_a_forced_refspec_from_full_ref_names() {
        // Arrange
        let source = "refs/pull/12/head";

        // Act
        let forced = Refspec::new(true, source, "refs/codecharta/pr/12").unwrap();
        let plain = Refspec::new(false, source, "refs/codecharta/pr/12").unwrap();
        let refused = Refspec::new(false, "-x", "refs/codecharta/pr/12");

        // Assert
        assert_eq!(forced.text(), "+refs/pull/12/head:refs/codecharta/pr/12");
        assert_eq!(plain.text(), "refs/pull/12/head:refs/codecharta/pr/12");
        assert!(refused.is_err());
    }
}
