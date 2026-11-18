use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::methods::projects::{FolderRef, GitRemote};
use crate::registry::{Audience, Event, method};

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
