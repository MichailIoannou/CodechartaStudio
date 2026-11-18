use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::methods::projects::{FolderRef, GitRemote};
use crate::registry::{Audience, Event, method};
use crate::values::{FullRefName, LogCursor, LogFilterText, RepoRelativePath};

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

/// The core saw a repository change: a read found a new refs fingerprint.
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

/// Short names of the local branches and tags pointing at a commit.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct RefsAt {
    pub branches: Vec<String>,
    pub tags: Vec<String>,
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
}
