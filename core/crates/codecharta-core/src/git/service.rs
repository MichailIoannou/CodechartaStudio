use std::future::Future;
use std::ops::Deref;
use std::path::{Path, PathBuf};

use codecharta_core_api::methods::git::{
    GitChangedFiles, GitCommitDetails, GitCommitDistance, GitCommitSummary, GitHead, GitLogPage,
    GitRefs, GitRepositoryInfo, GitStatus, GitUpstream, OperationInProgress, RefsAt,
};
use codecharta_core_api::methods::projects::{FolderRef, GitRemote};
use codecharta_core_api::values::{CommitSha, Revision};
use tokio_util::sync::CancellationToken;

use super::changes::RepositoryChanges;
use super::command::{GitCommand, QUERY_LIMITS, UserEnvironment};
use super::details::{ChangedFilesRequest, changed_files, changed_paths, commit_details};
use super::locator::{Repository, locate};
use super::log::{LogContext, LogRequest, log_page};
use super::memory::{GitMemory, QueryKey, Remembered};
use super::operation::Operations;
use super::parse::changed_files::NameStatus;
use super::parse::status::{StatusSummary, StatusUpstream, operation_in_progress};
use super::query::check_candidate_count;
use super::query::{self, RevListRequest, ShaSink, WalkSink};
use super::read::{read_refs, remotes, status_summary};
use super::runner::{FolderGit, GitCli, GitProcess};
use super::worktrees::{self, WorktreeEntry};
use crate::error::CoreResult;

const REMOTE_BRANCHES_PREFIX: &str = "refs/remotes/";
const LOCAL_BRANCHES_PREFIX: &str = "refs/heads/";

/// A folder git runs in. `repo` names the project folder it came from; a folder given by path alone (the
/// command line) has none.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GitFolder {
    pub path: PathBuf,
    pub repo: Option<FolderRef>,
}

impl GitFolder {
    pub fn at(path: &Path) -> Self {
        Self {
            path: path.to_path_buf(),
            repo: None,
        }
    }
}

/// The memory of one service on its own (tests, one command line call), or the core's shared one.
pub(super) enum Memory<'core> {
    Own(Box<GitMemory>),
    Shared(&'core GitMemory),
}

impl Deref for Memory<'_> {
    type Target = GitMemory;

    fn deref(&self) -> &GitMemory {
        match self {
            Memory::Own(memory) => memory,
            Memory::Shared(memory) => memory,
        }
    }
}

/// The read-only git operations of the core.
pub struct GitService<'core> {
    pub(super) git: GitCli<'core>,
    pub(super) changes: Option<&'core RepositoryChanges>,
    pub(super) memory: Memory<'core>,
    pub(super) operations: Option<Operations<'core>>,
}

impl<'core> GitService<'core> {
    pub fn new(process: &'core dyn GitProcess, data_dir: &'core Path) -> Self {
        Self {
            git: GitCli::new(process, data_dir),
            changes: None,
            operations: None,
            memory: Memory::Own(Box::default()),
        }
    }

    /// Log sessions and cached answers then outlive this service.
    pub fn with_memory(self, memory: &'core GitMemory) -> Self {
        Self {
            memory: Memory::Shared(memory),
            ..self
        }
    }

    /// Mutations then keep the user's locale and network commands the user's credential choices.
    pub fn with_user_environment(self, user: UserEnvironment) -> Self {
        Self {
            git: self.git.with_user_environment(user),
            ..self
        }
    }

    /// Reads of project folders then report a new refs fingerprint through `changes`.
    pub fn with_changes(self, changes: &'core RepositoryChanges) -> Self {
        Self {
            changes: Some(changes),
            ..self
        }
    }

    pub async fn repository_info(
        &self,
        folder: &GitFolder,
        cancel: &CancellationToken,
    ) -> CoreResult<GitRepositoryInfo> {
        Ok(locate(&self.git, &folder.path, cancel).await?.info)
    }

    pub async fn status(
        &self,
        folder: &GitFolder,
        cancel: &CancellationToken,
    ) -> CoreResult<GitStatus> {
        let repository = locate(&self.git, &folder.path, cancel).await?;
        let summary = status_summary(&self.git, &folder.path, cancel).await?;
        let upstream = match &summary.upstream {
            Some(upstream) => Some(self.upstream_of(folder, &summary, upstream, cancel).await?),
            None => None,
        };
        Ok(GitStatus {
            head: summary.head,
            upstream,
            counts: summary.counts,
            operation_in_progress: in_progress(&repository),
        })
    }

    pub async fn refs(
        &self,
        folder: &GitFolder,
        cancel: &CancellationToken,
    ) -> CoreResult<GitRefs> {
        let repository = locate(&self.git, &folder.path, cancel).await?;
        let refs = read_refs(&self.git, &repository, &folder.path, cancel).await?;
        if let (Some(changes), Some(repo)) = (self.changes, &folder.repo) {
            let repository_id = &repository.info.repository_id;
            changes.observe_fingerprint(repo, repository_id, &refs.fingerprint);
        }
        Ok(refs)
    }

    pub async fn refs_fingerprint(
        &self,
        folder: &GitFolder,
        cancel: &CancellationToken,
    ) -> CoreResult<String> {
        Ok(self.refs(folder, cancel).await?.fingerprint)
    }

    /// A page of commits; without a cursor a new log starts, whose later pages the cursor names.
    pub async fn log(
        &self,
        folder: &GitFolder,
        request: &LogRequest,
        cancel: &CancellationToken,
    ) -> CoreResult<GitLogPage> {
        let repository = locate(&self.git, &folder.path, cancel).await?;
        let context = LogContext {
            at_root: FolderGit {
                git: &self.git,
                folder: Path::new(&repository.info.root_path),
                cancel,
            },
            memory: &self.memory,
            repository: &repository,
        };
        log_page(context, request).await
    }

    /// The commit with its message and the files it changed against its first parent; remembered per
    /// sha, since a commit never changes.
    pub async fn commit_details(
        &self,
        folder: &GitFolder,
        sha: &CommitSha,
        cancel: &CancellationToken,
    ) -> CoreResult<GitCommitDetails> {
        let repository_id = self.repository_id(folder, cancel).await?;
        if let Some(details) = self.memory.details(&repository_id, sha.as_str()) {
            return Ok(details);
        }
        let details = commit_details(self.at(folder, cancel), sha).await?;
        self.memory
            .remember_details(&repository_id, sha.to_string(), details.clone());
        Ok(details)
    }

    pub async fn changed_files(
        &self,
        folder: &GitFolder,
        request: &ChangedFilesRequest,
        cancel: &CancellationToken,
    ) -> CoreResult<GitChangedFiles> {
        let key = QueryKey::ChangedFiles {
            from: request.from.to_string(),
            to: request.to.to_string(),
            mode: request.mode,
        };
        let ask = changed_files(self.at(folder, cancel), request);
        self.remembered(folder, cancel, key, ask).await
    }

    /// The files between two commits with paths relative to `folder`, all of them; for comparisons.
    pub async fn changed_paths(
        &self,
        folder: &GitFolder,
        from: &CommitSha,
        to: &CommitSha,
        cancel: &CancellationToken,
    ) -> CoreResult<Vec<NameStatus>> {
        changed_paths(self.at(folder, cancel), from, to).await
    }

    /// Not remembered: `HEAD` and refs move.
    pub async fn resolve_commit(
        &self,
        folder: &GitFolder,
        revision: &Revision,
        cancel: &CancellationToken,
    ) -> CoreResult<GitCommitSummary> {
        query::resolve_commit(self.at(folder, cancel), revision).await
    }

    /// The commits reachable from `to` but not from `from`.
    pub async fn rev_list_count(
        &self,
        folder: &GitFolder,
        from: &CommitSha,
        to: &CommitSha,
        cancel: &CancellationToken,
    ) -> CoreResult<u64> {
        let key = QueryKey::Count {
            from: from.to_string(),
            to: to.to_string(),
        };
        let ask = query::rev_list_count(self.at(folder, cancel), from, to);
        self.remembered(folder, cancel, key, ask).await
    }

    pub async fn merge_base(
        &self,
        folder: &GitFolder,
        left: &CommitSha,
        right: &CommitSha,
        cancel: &CancellationToken,
    ) -> CoreResult<Option<String>> {
        let key = QueryKey::MergeBase {
            left: left.to_string(),
            right: right.to_string(),
        };
        let ask = query::merge_base(self.at(folder, cancel), left, right);
        self.remembered(folder, cancel, key, ask).await
    }

    pub async fn is_ancestor(
        &self,
        folder: &GitFolder,
        ancestor: &CommitSha,
        descendant: &CommitSha,
        cancel: &CancellationToken,
    ) -> CoreResult<bool> {
        let key = QueryKey::IsAncestor {
            ancestor: ancestor.to_string(),
            descendant: descendant.to_string(),
        };
        let ask = query::is_ancestor(self.at(folder, cancel), ancestor, descendant);
        self.remembered(folder, cancel, key, ask).await
    }

    /// Only candidates without a remembered distance are measured; unknown candidates are left out and
    /// not remembered, since a fetch may bring them.
    pub async fn measure_distances(
        &self,
        folder: &GitFolder,
        target: &CommitSha,
        candidates: &[CommitSha],
        cancel: &CancellationToken,
    ) -> CoreResult<Vec<GitCommitDistance>> {
        check_candidate_count(candidates)?;
        let repository_id = self.repository_id(folder, cancel).await?;
        let mut known = self.memory.distances(&repository_id, target, candidates);
        let missing: Vec<CommitSha> = candidates
            .iter()
            .filter(|candidate| !known.contains_key(candidate.as_str()))
            .cloned()
            .collect();
        for distance in query::measure_distances(self.at(folder, cancel), target, &missing).await? {
            self.memory
                .remember_distance(&repository_id, target, distance.clone());
            known.insert(distance.sha.clone(), distance);
        }
        Ok(candidates
            .iter()
            .filter_map(|candidate| known.get(candidate.as_str()).cloned())
            .collect())
    }

    /// The tree a commit records.
    pub async fn tree_of(
        &self,
        folder: &GitFolder,
        sha: &CommitSha,
        cancel: &CancellationToken,
    ) -> CoreResult<String> {
        query::tree_of(self.at(folder, cancel), sha).await
    }

    /// The remotes, with credentials stripped from their urls.
    pub async fn remotes(
        &self,
        folder: &GitFolder,
        cancel: &CancellationToken,
    ) -> CoreResult<Vec<GitRemote>> {
        remotes(&self.git, &folder.path, cancel).await
    }

    pub async fn worktrees(
        &self,
        folder: &GitFolder,
        cancel: &CancellationToken,
    ) -> CoreResult<Vec<WorktreeEntry>> {
        worktrees::list_worktrees(&self.git, &folder.path, cancel).await
    }

    /// Removes the worktree and its folder, even when it is locked.
    pub async fn remove_worktree(
        &self,
        folder: &GitFolder,
        worktree: &Path,
        cancel: &CancellationToken,
    ) -> CoreResult<()> {
        worktrees::remove_worktree(&self.git, &folder.path, worktree, cancel).await
    }

    pub async fn prune_worktrees(
        &self,
        folder: &GitFolder,
        cancel: &CancellationToken,
    ) -> CoreResult<()> {
        worktrees::prune_worktrees(&self.git, &folder.path, cancel).await
    }

    /// Not remembered: refs move.
    pub async fn refs_at(
        &self,
        folder: &GitFolder,
        sha: &CommitSha,
        cancel: &CancellationToken,
    ) -> CoreResult<RefsAt> {
        query::refs_at(self.at(folder, cancel), sha).await
    }

    /// Streams the walked commits to `sink` in batches; see `query::rev_list`.
    pub async fn rev_list(
        &self,
        folder: &GitFolder,
        request: &RevListRequest,
        cancel: &CancellationToken,
        sink: &mut ShaSink<'_>,
    ) -> CoreResult<u64> {
        query::rev_list(self.at(folder, cancel), request, sink).await
    }

    /// Streams the walked commits with whether each is a merge; see `query::rev_list_with_parents`.
    pub async fn rev_list_with_parents(
        &self,
        folder: &GitFolder,
        request: &RevListRequest,
        cancel: &CancellationToken,
        sink: &mut WalkSink<'_>,
    ) -> CoreResult<u64> {
        query::rev_list_with_parents(self.at(folder, cancel), request, sink).await
    }

    /// For operations that move refs or fetch: see `GitMemory::fetched` and `GitMemory::forget_logs`.
    pub fn memory(&self) -> &GitMemory {
        &self.memory
    }

    async fn remembered<T: Remembered + Clone>(
        &self,
        folder: &GitFolder,
        cancel: &CancellationToken,
        key: QueryKey,
        ask: impl Future<Output = CoreResult<T>>,
    ) -> CoreResult<T> {
        let repository_id = self.repository_id(folder, cancel).await?;
        self.memory.remembered(&repository_id, key, ask).await
    }

    /// Everything remembered is kept per repository, so two folders of one repository share it.
    async fn repository_id(
        &self,
        folder: &GitFolder,
        cancel: &CancellationToken,
    ) -> CoreResult<String> {
        Ok(locate(&self.git, &folder.path, cancel)
            .await?
            .info
            .repository_id)
    }

    fn at<'call>(
        &'call self,
        folder: &'call GitFolder,
        cancel: &'call CancellationToken,
    ) -> FolderGit<'call> {
        FolderGit {
            git: &self.git,
            folder: &folder.path,
            cancel,
        }
    }

    /// `status` names the upstream briefly (`origin/main`); its full ref name comes from the branch's
    /// configuration, which also tells a local upstream from a remote one.
    async fn upstream_of(
        &self,
        folder: &GitFolder,
        summary: &StatusSummary,
        upstream: &StatusUpstream,
        cancel: &CancellationToken,
    ) -> CoreResult<GitUpstream> {
        let configured = match &summary.head {
            GitHead::Branch { name, .. } => self.upstream_ref_name(folder, name, cancel).await?,
            GitHead::Detached { .. } => String::new(),
        };
        let ref_name = if configured.is_empty() {
            format!("{REMOTE_BRANCHES_PREFIX}{}", upstream.name)
        } else {
            configured
        };
        Ok(GitUpstream {
            ref_name,
            name: upstream.name.clone(),
            ahead: upstream.ahead_behind.map(|(ahead, _)| ahead),
            behind: upstream.ahead_behind.map(|(_, behind)| behind),
            is_gone: upstream.ahead_behind.is_none(),
        })
    }

    async fn upstream_ref_name(
        &self,
        folder: &GitFolder,
        branch: &str,
        cancel: &CancellationToken,
    ) -> CoreResult<String> {
        let branch_ref = format!("{LOCAL_BRANCHES_PREFIX}{branch}");
        let args = ["for-each-ref", "--format=%(upstream)", branch_ref.as_str()];
        let command = GitCommand::read(&folder.path, &args, QUERY_LIMITS);
        Ok(self.git.run(&command, cancel).await?.trim().to_string())
    }
}

pub(super) fn in_progress(repository: &Repository) -> Option<OperationInProgress> {
    operation_in_progress(|marker| repository.git_dir.join(marker).exists())
}
