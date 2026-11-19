use std::future::Future;
use std::path::Path;

use codecharta_core_api::methods::git::{
    GitBranchDeleteTarget, GitFetchResult, GitOperationResult, GitRefs, GitStatus, GitSwitchTarget,
    OperationInProgress,
};
use codecharta_core_api::protocol::RequestId;
use tokio_util::sync::CancellationToken;

use super::branch::{self, BranchCreateRequest, BranchRenameRequest, SetUpstreamRequest};
use super::command::{BRANCH_LIMITS, GitCommand, NETWORK_LIMITS};
use super::error::command_failed;
use super::locator::{Repository, locate};
use super::progress::ProgressSink;
use super::queue::OperationQueue;
use super::read::read_refs;
use super::runner::{FolderGit, GitCli};
use super::service::{GitFolder, GitService, in_progress};
use super::sync::{self, FetchRefspecsRequest, count_updated_refs};
use crate::error::{CoreError, CoreResult};
use crate::process::RunOutput;
use crate::prompt::{PromptBroker, SessionRequest};
use crate::recycle::Recycler;

/// One mutating request: its cancellation, the JSON-RPC id its credential prompts name, and where git's
/// progress goes.
pub struct OperationContext<'call> {
    pub cancel: &'call CancellationToken,
    pub request_id: Option<RequestId>,
    pub progress: ProgressSink<'call>,
}

/// What every mutating operation of the core shares: the per-repository queue, the credential prompts and
/// the recycle bin discarded files go to.
#[derive(Clone, Copy)]
pub struct Operations<'core> {
    pub queue: &'core OperationQueue,
    pub prompts: &'core PromptBroker,
    pub recycler: &'core dyn Recycler,
}

/// One operation's access to its repository. Its commands run only inside the queue.
pub struct Mutation<'call> {
    pub git: &'call GitCli<'call>,
    pub folder: &'call GitFolder,
    pub repository: &'call Repository,
    pub prompts: &'call PromptBroker,
    pub recycler: &'call dyn Recycler,
    pub context: &'call OperationContext<'call>,
}

impl Mutation<'_> {
    /// Refs as they are now, inside the queue, to check a request against.
    pub async fn refs(&self) -> CoreResult<GitRefs> {
        read_refs(
            self.git,
            self.repository,
            &self.folder.path,
            self.context.cancel,
        )
        .await
    }

    pub fn operation_in_progress(&self) -> Option<OperationInProgress> {
        in_progress(self.repository)
    }

    pub fn reads(&self) -> FolderGit<'_> {
        FolderGit {
            git: self.git,
            folder: &self.folder.path,
            cancel: self.context.cancel,
        }
    }

    /// A local mutation that must succeed.
    pub async fn run(&self, args: &[&str]) -> CoreResult<String> {
        let command = GitCommand::mutating(&self.folder.path, args, BRANCH_LIMITS);
        self.run_command(&command).await
    }

    pub async fn run_command(&self, command: &GitCommand) -> CoreResult<String> {
        self.git.run(command, self.context.cancel).await
    }

    /// Paths of the working tree are relative to this folder.
    pub fn root(&self) -> &Path {
        Path::new(&self.repository.info.root_path)
    }

    /// A command that talks to a remote: it may ask for credentials through a prompt session of this
    /// operation, and reports git's progress.
    pub async fn run_network(&self, args: &[&str]) -> CoreResult<RunOutput> {
        let session = self.prompts.open_session(SessionRequest {
            request_id: self.context.request_id.clone(),
            repository_label: Some(self.repository_label()),
        })?;
        let askpass = session.askpass().cloned();
        let command = GitCommand::network(&self.folder.path, args, NETWORK_LIMITS, askpass);
        let output = self
            .git
            .run_reporting(&command, self.context.cancel, self.context.progress)
            .await;
        session.settle(output.and_then(succeeded))
    }

    fn repository_label(&self) -> String {
        let root = self.root();
        root.file_name()
            .map_or_else(|| root.to_string_lossy(), |name| name.to_string_lossy())
            .into_owned()
    }
}

fn succeeded(output: RunOutput) -> CoreResult<RunOutput> {
    if output.exit_code == 0 {
        Ok(output)
    } else {
        Err(command_failed(&output))
    }
}

/// An operation's own answer with the status and refs read right after it.
pub struct Settled<T> {
    pub value: T,
    pub status: GitStatus,
    pub refs: GitRefs,
}

impl Settled<()> {
    pub(super) fn into_operation_result(self) -> GitOperationResult {
        GitOperationResult {
            status: self.status,
            refs: self.refs,
            message: None,
        }
    }
}

impl<'core> GitService<'core> {
    /// Mutating operations then wait their turn in this queue and prompt through this broker.
    pub fn with_operations(self, operations: Operations<'core>) -> Self {
        Self {
            operations: Some(operations),
            ..self
        }
    }

    /// Fetches every remote; the answer counts the refs that changed.
    pub async fn fetch(
        &self,
        folder: &GitFolder,
        prune: bool,
        context: &OperationContext<'_>,
    ) -> CoreResult<GitFetchResult> {
        let repository = locate(&self.git, &folder.path, context.cancel).await?;
        let mutation = self.mutation(folder, &repository, context)?;
        let fetched = self.operate(&mutation, sync::fetch(&mutation, prune)).await;
        self.fetch_result(&repository, fetched)
    }

    /// Fetches into `refs/codecharta/…` only (plan 06: pull request heads, on an explicit click).
    pub async fn fetch_refspecs(
        &self,
        folder: &GitFolder,
        request: &FetchRefspecsRequest,
        context: &OperationContext<'_>,
    ) -> CoreResult<GitFetchResult> {
        let repository = locate(&self.git, &folder.path, context.cancel).await?;
        let mutation = self.mutation(folder, &repository, context)?;
        let work = sync::fetch_refspecs(&mutation, request);
        let fetched = self.operate(&mutation, work).await;
        self.fetch_result(&repository, fetched)
    }

    pub async fn switch(
        &self,
        folder: &GitFolder,
        target: &GitSwitchTarget,
        context: &OperationContext<'_>,
    ) -> CoreResult<GitOperationResult> {
        let repository = locate(&self.git, &folder.path, context.cancel).await?;
        let mutation = self.mutation(folder, &repository, context)?;
        let settled = self.operate(&mutation, branch::switch(&mutation, target));
        Ok(settled.await?.into_operation_result())
    }

    pub async fn branch_create(
        &self,
        folder: &GitFolder,
        request: &BranchCreateRequest,
        context: &OperationContext<'_>,
    ) -> CoreResult<GitOperationResult> {
        let repository = locate(&self.git, &folder.path, context.cancel).await?;
        let mutation = self.mutation(folder, &repository, context)?;
        let settled = self.operate(&mutation, branch::create(&mutation, request));
        Ok(settled.await?.into_operation_result())
    }

    pub async fn branch_rename(
        &self,
        folder: &GitFolder,
        request: &BranchRenameRequest,
        context: &OperationContext<'_>,
    ) -> CoreResult<GitOperationResult> {
        let repository = locate(&self.git, &folder.path, context.cancel).await?;
        let mutation = self.mutation(folder, &repository, context)?;
        let settled = self.operate(&mutation, branch::rename(&mutation, request));
        Ok(settled.await?.into_operation_result())
    }

    pub async fn branch_delete(
        &self,
        folder: &GitFolder,
        target: &GitBranchDeleteTarget,
        context: &OperationContext<'_>,
    ) -> CoreResult<GitOperationResult> {
        let repository = locate(&self.git, &folder.path, context.cancel).await?;
        let mutation = self.mutation(folder, &repository, context)?;
        let settled = self.operate(&mutation, branch::delete(&mutation, target));
        Ok(settled.await?.into_operation_result())
    }

    pub async fn set_upstream(
        &self,
        folder: &GitFolder,
        request: &SetUpstreamRequest,
        context: &OperationContext<'_>,
    ) -> CoreResult<GitOperationResult> {
        let repository = locate(&self.git, &folder.path, context.cancel).await?;
        let mutation = self.mutation(folder, &repository, context)?;
        let settled = self.operate(&mutation, branch::set_upstream(&mutation, request));
        Ok(settled.await?.into_operation_result())
    }

    pub(super) fn mutation<'call>(
        &'call self,
        folder: &'call GitFolder,
        repository: &'call Repository,
        context: &'call OperationContext<'call>,
    ) -> CoreResult<Mutation<'call>> {
        let operations = self.operations.ok_or_else(|| {
            CoreError::Internal("git operations need the core's queue and prompts".to_string())
        })?;
        Ok(Mutation {
            git: &self.git,
            folder,
            repository,
            prompts: operations.prompts,
            recycler: operations.recycler,
            context,
        })
    }

    /// Runs `work` in the repository's turn and ends it the same way whether it succeeded or not: logs
    /// start again, status and refs are read afresh, and the change is announced.
    pub(super) async fn operate<T>(
        &self,
        mutation: &Mutation<'_>,
        work: impl Future<Output = CoreResult<T>>,
    ) -> CoreResult<Settled<T>> {
        let repository_id = &mutation.repository.info.repository_id;
        let queue = self.operations.map(|operations| operations.queue);
        let queue = queue.ok_or_else(|| CoreError::Internal("no operation queue".to_string()))?;
        queue
            .run_exclusive(repository_id, mutation.context.cancel, async {
                let outcome = work.await;
                self.memory.forget_logs(repository_id);
                let after = self.read_after(mutation).await;
                self.announce(mutation, after.as_ref().ok());
                let value = outcome?;
                let (status, refs) = after?;
                Ok(Settled {
                    value,
                    status,
                    refs,
                })
            })
            .await
    }

    /// Read with a token of its own: a cancelled operation still answers what it left behind.
    async fn read_after(&self, mutation: &Mutation<'_>) -> CoreResult<(GitStatus, GitRefs)> {
        let cancel = CancellationToken::new();
        let folder = mutation.folder;
        let (status, refs) = tokio::join!(
            self.status(folder, &cancel),
            read_refs(&self.git, mutation.repository, &folder.path, &cancel)
        );
        Ok((status?, refs?))
    }

    fn announce(&self, mutation: &Mutation<'_>, after: Option<&(GitStatus, GitRefs)>) {
        let (Some(changes), Some(repo)) = (self.changes, &mutation.folder.repo) else {
            return;
        };
        let fingerprint = after.map(|(_, refs)| refs.fingerprint.as_str());
        changes.announce_operation(repo, &mutation.repository.info.repository_id, fingerprint);
    }

    /// A fetch into a shallow clone may change history behind its boundary, so remembered answers go too.
    fn fetch_result(
        &self,
        repository: &Repository,
        fetched: CoreResult<Settled<GitRefs>>,
    ) -> CoreResult<GitFetchResult> {
        let info = &repository.info;
        self.memory.fetched(&info.repository_id, info.is_shallow);
        let settled = fetched?;
        Ok(GitFetchResult {
            updated_refs: count_updated_refs(&settled.value, &settled.refs),
            refs: settled.refs,
        })
    }
}
