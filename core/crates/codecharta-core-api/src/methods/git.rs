use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::methods::projects::{FolderRef, GitRemote};
use crate::registry::{Audience, Event, method};
use crate::values::{
    BranchName, CommitBody, CommitSha, CommitSubject, FullRefName, LogCursor, LogFilterText,
    RepoRelativePath, Revision, WorkingTreePath,
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct GitRepositoryInfo {
    /// Stable for every folder and worktree of one repository: its canonical common git folder.
    pub repository_id: String,
    pub root_path: String,
    /// The folder relative to `rootPath`, with `/` separators and no trailing one; empty at the root.
    pub folder_prefix: String,
    pub is_shallow: bool,
    pub is_linked_worktree: bool,
    pub git_version: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum GitHead {
    /// `commit` is null on a branch without commits.
    Branch {
        name: String,
        commit: Option<String>,
    },
    Detached {
        commit: String,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct GitUpstream {
    pub ref_name: String,
    pub name: String,
    pub ahead: Option<u32>,
    pub behind: Option<u32>,
    /// The upstream is configured but its remote-tracking branch no longer exists.
    pub is_gone: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub enum OperationInProgress {
    Merge,
    Rebase,
    CherryPick,
    Revert,
    Bisect,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct StatusCounts {
    pub staged: u32,
    pub unstaged: u32,
    pub untracked: u32,
    pub conflicted: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct GitStatus {
    pub head: GitHead,
    pub upstream: Option<GitUpstream>,
    pub counts: StatusCounts,
    pub operation_in_progress: Option<OperationInProgress>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct GitLastCommit {
    pub subject: String,
    pub committed_at: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct GitLocalBranch {
    pub ref_name: String,
    pub name: String,
    pub commit: String,
    pub is_current: bool,
    pub upstream: Option<GitUpstream>,
    /// The path of the other worktree that has this branch checked out.
    pub checked_out_in_other_worktree: Option<String>,
    pub last_commit: GitLastCommit,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct GitRemoteBranch {
    pub ref_name: String,
    pub remote: String,
    /// `<remote>/<branchName>`, as git shows it.
    pub name: String,
    pub branch_name: String,
    pub commit: String,
    pub last_commit: GitLastCommit,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct GitTag {
    pub ref_name: String,
    pub name: String,
    /// The commit the tag points at, peeled through an annotated tag.
    pub commit: String,
    pub is_annotated: bool,
    pub created_at: i64,
}

/// Remote urls come without credentials.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct GitRefs {
    /// Changes whenever a ref or the head moves.
    pub fingerprint: String,
    pub head: GitHead,
    pub local_branches: Vec<GitLocalBranch>,
    pub remote_branches: Vec<GitRemoteBranch>,
    pub tags: Vec<GitTag>,
    pub remotes: Vec<GitRemote>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub enum ChangedPart {
    Status,
    Refs,
    WorkingTree,
}

/// A client names a repository only by its project folder; the core finds the path.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GitRepoParams {
    pub repo: FolderRef,
}

/// One commit of a project folder's repository: `git.commitDetails`, `git.refsAt`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GitCommitParams {
    pub repo: FolderRef,
    pub sha: CommitSha,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GitResolveCommitParams {
    pub repo: FolderRef,
    pub revision: Revision,
}

/// Counts the commits reachable from `to` but not from `from`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GitRevListCountParams {
    pub repo: FolderRef,
    pub from: CommitSha,
    pub to: CommitSha,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GitMergeBaseParams {
    pub repo: FolderRef,
    pub left: CommitSha,
    pub right: CommitSha,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GitIsAncestorParams {
    pub repo: FolderRef,
    pub ancestor: CommitSha,
    pub descendant: CommitSha,
}

/// At most 200 candidates.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GitMeasureDistancesParams {
    pub repo: FolderRef,
    pub target: CommitSha,
    pub candidates: Vec<CommitSha>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GitChangedFilesParams {
    pub repo: FolderRef,
    pub from: CommitSha,
    pub to: CommitSha,
    pub mode: ChangedFilesMode,
}

/// The core saw a repository change: a read found a new refs fingerprint, or an operation ended.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryChanged {
    pub repo: FolderRef,
    pub repository_id: String,
    pub parts: Vec<ChangedPart>,
    pub fingerprint: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitSummary {
    pub sha: String,
    /// The first parent first; empty for a root commit.
    pub parents: Vec<String>,
    pub author_name: String,
    pub author_email: String,
    /// Unix seconds.
    pub authored_at: i64,
    /// Unix seconds.
    pub committed_at: i64,
    pub subject: String,
}

/// The commits a log starts from: every branch, remote branch and tag plus the head, the head alone, or
/// the named refs.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum GitLogScope {
    All,
    Head,
    Refs { ref_names: Vec<FullRefName> },
}

/// `text` and `author` match as plain text, ignoring case; `path` is relative to the repository root.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GitLogFilter {
    pub text: Option<LogFilterText>,
    pub author: Option<LogFilterText>,
    pub path: Option<RepoRelativePath>,
}

/// Without `cursor` a new log starts at the first page; with it, the page the cursor names follows, and
/// `scope` and `filter` are those of the first page.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GitLogParams {
    pub repo: FolderRef,
    pub scope: GitLogScope,
    pub filter: Option<GitLogFilter>,
    pub cursor: Option<LogCursor>,
}

/// Children come before their parents, newest first otherwise.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct GitLogPage {
    pub commits: Vec<GitCommitSummary>,
    /// Null on the last page.
    pub next_cursor: Option<String>,
    /// A filtered log leaves commits out, so its parents do not draw a connected graph.
    pub is_graph_available: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub enum GitFileChange {
    Added,
    Modified,
    Deleted,
    Renamed,
    Copied,
    TypeChanged,
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct GitChangedFile {
    pub change: GitFileChange,
    /// Relative to the repository root, with `/` separators.
    pub path: String,
    /// The path before a rename or copy.
    pub previous_path: Option<String>,
    /// Null for a binary file.
    pub insertions: Option<u32>,
    /// Null for a binary file.
    pub deletions: Option<u32>,
}

/// Counts every changed file, also those a truncated list leaves out.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ChangeTotals {
    pub files_changed: u32,
    pub insertions: u32,
    pub deletions: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitDetails {
    #[serde(flatten)]
    pub summary: GitCommitSummary,
    pub committer_name: String,
    pub committer_email: String,
    /// The whole message without trailing newlines.
    pub message: String,
    /// The first parent the files are compared with; null for a root commit.
    pub compared_to_parent: Option<String>,
    pub files: Vec<GitChangedFile>,
    pub are_files_truncated: bool,
    pub totals: ChangeTotals,
}

/// `sinceMergeBase` compares `to` with the newest commit both `from` and `to` contain.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub enum ChangedFilesMode {
    Direct,
    SinceMergeBase,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct GitChangedFiles {
    /// The commit compared with: the requested one, or the merge base for `sinceMergeBase`.
    pub from: String,
    pub to: String,
    pub files: Vec<GitChangedFile>,
    pub are_files_truncated: bool,
    pub totals: ChangeTotals,
}

/// How far a candidate commit is from a target: `onlyInCandidate == 0` means the candidate is an ancestor
/// of the target, which is then `onlyInTarget` commits ahead.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitDistance {
    pub sha: String,
    pub only_in_candidate: u32,
    pub only_in_target: u32,
}

/// The distances of the candidates the repository contains, in the order they were asked for.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitDistances {
    pub distances: Vec<GitCommitDistance>,
}

/// Short names of the local branches and tags pointing at a commit.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct RefsAt {
    pub branches: Vec<String>,
    pub tags: Vec<String>,
}

/// What a branch operation left behind: the repository's status and refs read right after it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct GitOperationResult {
    pub status: GitStatus,
    pub refs: GitRefs,
    /// A note for the user about the outcome; null when there is nothing to add.
    pub message: Option<String>,
}

/// `updatedRefs` counts the branches, remote branches and tags the fetch added, moved or removed.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct GitFetchResult {
    pub updated_refs: u32,
    pub refs: GitRefs,
}

/// Fetches every remote; `prune` also removes remote branches the remotes no longer have.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GitFetchParams {
    pub repo: FolderRef,
    pub prune: bool,
}

/// `local` switches to an existing local branch (`refs/heads/…`); `trackRemote` creates `localName` from
/// a remote branch (`refs/remotes/…`), tracking it, and switches to it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum GitSwitchTarget {
    Local {
        ref_name: FullRefName,
    },
    TrackRemote {
        remote_ref_name: FullRefName,
        local_name: BranchName,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GitSwitchParams {
    pub repo: FolderRef,
    pub target: GitSwitchTarget,
}

/// Creates the branch `name` at `startPoint` without an upstream; `checkout` also switches to it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GitBranchCreateParams {
    pub repo: FolderRef,
    pub name: BranchName,
    pub start_point: CommitSha,
    pub checkout: bool,
}

/// Renames the local branch `refName` (`refs/heads/…`); its upstream stays.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GitBranchRenameParams {
    pub repo: FolderRef,
    pub ref_name: FullRefName,
    pub new_name: BranchName,
}

/// `local` deletes a local branch; an unmerged one only with `force`, after `BRANCH_NOT_FULLY_MERGED` and a
/// second confirmation. `remote` deletes the branch on its remote, named by its remote-tracking ref.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum GitBranchDeleteTarget {
    Local { ref_name: FullRefName, force: bool },
    Remote { remote_ref_name: FullRefName },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GitBranchDeleteParams {
    pub repo: FolderRef,
    pub target: GitBranchDeleteTarget,
}

/// Makes the remote branch `upstreamRefName` (`refs/remotes/…`) the upstream of the local branch
/// `refName`; null removes its upstream.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GitSetUpstreamParams {
    pub repo: FolderRef,
    pub ref_name: FullRefName,
    pub upstream_ref_name: Option<FullRefName>,
}

/// The group of the changes panel an entry belongs to; a file changed in the index and in the working
/// tree is listed once as `staged` and once as `unstaged`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub enum GitEntryKind {
    Staged,
    Unstaged,
    Untracked,
    Conflicted,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct GitWorkingTreeEntry {
    /// Relative to the repository root, with `/` separators.
    pub path: String,
    /// The path before a rename or copy.
    pub previous_path: Option<String>,
    pub kind: GitEntryKind,
    /// `modified` for a conflicted entry, whose kind of conflict is `conflict`.
    pub change: GitFileChange,
    /// git's two-letter conflict code (`UU`, `AA`, `DU`, …) of a conflicted entry.
    pub conflict: Option<String>,
}

/// The changes of the whole repository, whichever folder of it the project names; at most 5000 entries,
/// untracked files listed one by one.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct GitWorkingTree {
    pub status: GitStatus,
    pub entries: Vec<GitWorkingTreeEntry>,
    pub are_entries_truncated: bool,
}

/// One file's unified diff, cut after 2 MiB.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct GitDiff {
    pub path: String,
    pub text: String,
    pub is_binary: bool,
    pub is_truncated: bool,
}

/// A path of the working-tree listing and how it was listed.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GitDiffFileParams {
    pub repo: FolderRef,
    pub path: WorkingTreePath,
    pub kind: GitEntryKind,
}

/// `paths` stages 1 to 1000 paths listed as unstaged, untracked or conflicted (a conflicted one counts as
/// resolved then); `all` stages every change.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum GitStageTarget {
    Paths { paths: Vec<WorkingTreePath> },
    All,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GitStageParams {
    pub repo: FolderRef,
    pub target: GitStageTarget,
}

/// 1 to 1000 paths listed as staged.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GitUnstageParams {
    pub repo: FolderRef,
    pub paths: Vec<WorkingTreePath>,
}

/// A row of the working-tree listing as the user saw it when confirming the discard.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DiscardEntry {
    pub path: WorkingTreePath,
    pub kind: GitEntryKind,
    pub change: GitFileChange,
}

/// 1 to 1000 rows. A staged row returns its file to the last commit, so the file's unstaged row must be
/// named too; an unstaged row returns the file to its staged state. Files the last commit does not have
/// go to the recycle bin. Fails with `CHANGED_SINCE_LISTED`, changing nothing, when a row is no longer
/// listed as named.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GitDiscardParams {
    pub repo: FolderRef,
    pub entries: Vec<DiscardEntry>,
}

/// Commits the staged changes with `subject`, a blank line and `body` (empty for none) as its message,
/// kept as written apart from surrounding whitespace, so a body line starting with `#` stays. During a
/// merge the commit concludes it. `amend` replaces the last commit, also with nothing staged. The user's
/// configured identity only: without one the commit fails with `IDENTITY_UNKNOWN`; a failing hook gives
/// `HOOK_FAILED` with its output as the detail.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GitCreateCommitParams {
    pub repo: FolderRef,
    pub subject: CommitSubject,
    pub body: CommitBody,
    pub amend: bool,
}

method!(
    GitRepositoryInfoMethod,
    "git.repositoryInfo",
    Renderer,
    GitRepoParams,
    GitRepositoryInfo
);
method!(
    GitStatusMethod,
    "git.status",
    Renderer,
    GitRepoParams,
    GitStatus
);
method!(
    GitBranchesMethod,
    "git.branches",
    Renderer,
    GitRepoParams,
    GitRefs
);
method!(
    GitRefsFingerprintMethod,
    "git.refsFingerprint",
    Renderer,
    GitRepoParams,
    String
);

method!(GitLogMethod, "git.log", Renderer, GitLogParams, GitLogPage);
method!(
    GitCommitDetailsMethod,
    "git.commitDetails",
    Renderer,
    GitCommitParams,
    GitCommitDetails
);
method!(
    GitResolveCommitMethod,
    "git.resolveCommit",
    Renderer,
    GitResolveCommitParams,
    GitCommitSummary
);
method!(
    GitRevListCountMethod,
    "git.revListCount",
    Renderer,
    GitRevListCountParams,
    u64
);
method!(
    GitMergeBaseMethod,
    "git.mergeBase",
    Renderer,
    GitMergeBaseParams,
    Option<String>
);
method!(
    GitIsAncestorMethod,
    "git.isAncestor",
    Renderer,
    GitIsAncestorParams,
    bool
);
method!(
    GitMeasureDistancesMethod,
    "git.measureDistances",
    Renderer,
    GitMeasureDistancesParams,
    GitCommitDistances
);
method!(
    GitRefsAtMethod,
    "git.refsAt",
    Renderer,
    GitCommitParams,
    RefsAt
);
method!(
    GitChangedFilesMethod,
    "git.changedFiles",
    Renderer,
    GitChangedFilesParams,
    GitChangedFiles
);
method!(
    GitFetchMethod,
    "git.fetch",
    Renderer,
    GitFetchParams,
    GitFetchResult
);
method!(
    GitSwitchMethod,
    "git.switch",
    Renderer,
    GitSwitchParams,
    GitOperationResult
);
method!(
    GitBranchCreateMethod,
    "git.branchCreate",
    Renderer,
    GitBranchCreateParams,
    GitOperationResult
);
method!(
    GitBranchRenameMethod,
    "git.branchRename",
    Renderer,
    GitBranchRenameParams,
    GitOperationResult
);
method!(
    GitBranchDeleteMethod,
    "git.branchDelete",
    Renderer,
    GitBranchDeleteParams,
    GitOperationResult
);
method!(
    GitSetUpstreamMethod,
    "git.setUpstream",
    Renderer,
    GitSetUpstreamParams,
    GitOperationResult
);

method!(
    GitWorkingTreeMethod,
    "git.workingTree",
    Renderer,
    GitRepoParams,
    GitWorkingTree
);
method!(
    GitDiffFileMethod,
    "git.diffFile",
    Renderer,
    GitDiffFileParams,
    GitDiff
);
method!(
    GitStageMethod,
    "git.stage",
    Renderer,
    GitStageParams,
    GitWorkingTree
);
method!(
    GitUnstageMethod,
    "git.unstage",
    Renderer,
    GitUnstageParams,
    GitWorkingTree
);
method!(
    GitDiscardMethod,
    "git.discard",
    Renderer,
    GitDiscardParams,
    GitWorkingTree
);
method!(
    GitCommitMethod,
    "git.commit",
    Renderer,
    GitCreateCommitParams,
    GitOperationResult
);

pub struct RepositoryChangedEvent;

impl Event for RepositoryChangedEvent {
    const NAME: &'static str = "repository.changed";
    const AUDIENCE: Audience = Audience::Renderer;
    type Params = RepositoryChanged;
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn should_refuse_unknown_fields_next_to_the_repo() {
        // Arrange
        let repo = json!({ "projectId": "p-0123456789abcdef", "folderId": "f-0123456789abcdef" });
        let params = json!({ "repo": repo, "path": "/etc" });

        // Act
        let parsed = serde_json::from_value::<GitRepoParams>(params);

        // Assert
        assert!(parsed.is_err());
        assert!(serde_json::from_value::<GitRepoParams>(json!({ "repo": repo })).is_ok());
    }

    #[test]
    fn should_tag_heads_by_kind_with_camel_case_fields() {
        // Arrange
        let heads = [
            GitHead::Branch {
                name: "main".to_string(),
                commit: None,
            },
            GitHead::Detached {
                commit: "0123456789abcdef0123456789abcdef01234567".to_string(),
            },
        ];

        // Act
        let json = serde_json::to_value(heads).unwrap();

        // Assert
        assert_eq!(
            json,
            json!([
                { "kind": "branch", "name": "main", "commit": null },
                { "kind": "detached", "commit": "0123456789abcdef0123456789abcdef01234567" }
            ])
        );
    }

    #[test]
    fn should_tag_switch_and_delete_targets_by_kind_and_refuse_unknown_fields() {
        // Arrange
        let track = json!({
            "kind": "trackRemote",
            "remoteRefName": "refs/remotes/origin/feature",
            "localName": "feature"
        });
        let delete = json!({ "kind": "local", "refName": "refs/heads/old", "force": false });
        let smuggled = json!({ "kind": "local", "refName": "refs/heads/main", "args": "--force" });

        // Act
        let switch_target = serde_json::from_value::<GitSwitchTarget>(track);
        let delete_target = serde_json::from_value::<GitBranchDeleteTarget>(delete);
        let refused = serde_json::from_value::<GitSwitchTarget>(smuggled);

        // Assert
        assert_eq!(
            switch_target.unwrap(),
            GitSwitchTarget::TrackRemote {
                remote_ref_name: FullRefName::try_from("refs/remotes/origin/feature").unwrap(),
                local_name: BranchName::try_from("feature").unwrap(),
            }
        );
        assert_eq!(
            delete_target.unwrap(),
            GitBranchDeleteTarget::Local {
                ref_name: FullRefName::try_from("refs/heads/old").unwrap(),
                force: false,
            }
        );
        assert!(refused.is_err());
    }

    #[test]
    fn should_tag_stage_targets_and_refuse_a_path_leaving_the_repository() {
        // Arrange
        let repo = json!({ "projectId": "p-0123456789abcdef", "folderId": "f-0123456789abcdef" });
        let all = json!({ "repo": repo, "target": { "kind": "all" } });
        let escaping = json!({ "repo": repo, "target": { "kind": "paths", "paths": ["../x"] } });
        let discard = json!({
            "repo": repo,
            "entries": [{ "path": "a b.txt", "kind": "untracked", "change": "added" }]
        });

        // Act
        let stage_all = serde_json::from_value::<GitStageParams>(all);
        let refused = serde_json::from_value::<GitStageParams>(escaping);
        let discarded = serde_json::from_value::<GitDiscardParams>(discard);

        // Assert
        assert_eq!(stage_all.unwrap().target, GitStageTarget::All);
        assert!(refused.is_err());
        assert_eq!(
            discarded.unwrap().entries,
            vec![DiscardEntry {
                path: WorkingTreePath::try_from("a b.txt").unwrap(),
                kind: GitEntryKind::Untracked,
                change: GitFileChange::Added,
            }]
        );
    }

    #[test]
    fn should_read_commit_params_and_refuse_a_multi_line_subject_or_unknown_fields() {
        // Arrange
        let repo = json!({ "projectId": "p-0123456789abcdef", "folderId": "f-0123456789abcdef" });
        let commit = json!({ "repo": repo, "subject": "Fix", "body": "# kept", "amend": false });
        let multi_line = json!({ "repo": repo, "subject": "a\nb", "body": "", "amend": false });
        let smuggled = json!({
            "repo": repo, "subject": "Fix", "body": "", "amend": false, "noVerify": true
        });

        // Act
        let parsed = serde_json::from_value::<GitCreateCommitParams>(commit);
        let refused = [multi_line, smuggled]
            .map(|params| serde_json::from_value::<GitCreateCommitParams>(params).is_err());

        // Assert
        let parsed = parsed.unwrap();
        assert_eq!(parsed.subject.as_str(), "Fix");
        assert_eq!(parsed.body.as_str(), "# kept");
        assert_eq!(refused, [true, true]);
    }
}
