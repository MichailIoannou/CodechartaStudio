use std::path::Path;
use std::sync::Mutex;

use codecharta_core::CoreError;
use codecharta_core::git::GitProcess;
use codecharta_core::git::changes::RepositoryChanges;
use codecharta_core::git::memory::GitMemory;
use codecharta_core::git::operation::{OperationContext, Operations};
use codecharta_core::git::parse::progress::ProgressUpdate;
use codecharta_core::git::queue::OperationQueue;
use codecharta_core::git::{GitFolder, GitService};
use codecharta_core::prompt::PromptBroker;
use codecharta_core_api::error::ErrorCode;
use codecharta_core_api::ids::{FolderId, ProjectId};
use codecharta_core_api::methods::git::RepositoryChanged;
use codecharta_core_api::methods::projects::FolderRef;
use tokio::sync::broadcast;
use tokio_util::sync::CancellationToken;

/// What the core shares between git operations, owned by one test.
#[derive(Default)]
pub struct OperationsHarness {
    queue: OperationQueue,
    prompts: PromptBroker,
    changes: RepositoryChanges,
    memory: GitMemory,
}

impl OperationsHarness {
    pub fn service<'test>(
        &'test self,
        process: &'test dyn GitProcess,
        data_dir: &'test Path,
    ) -> GitService<'test> {
        GitService::new(process, data_dir)
            .with_memory(&self.memory)
            .with_changes(&self.changes)
            .with_operations(Operations {
                queue: &self.queue,
                prompts: &self.prompts,
            })
    }

    pub fn subscribe(&self) -> broadcast::Receiver<RepositoryChanged> {
        self.changes.subscribe()
    }
}

/// A project folder, so operations announce their changes.
pub fn project_folder(path: &Path) -> GitFolder {
    GitFolder {
        path: path.to_path_buf(),
        repo: Some(FolderRef {
            project_id: ProjectId::try_from("p-0123456789abcdef").expect("a project id"),
            folder_id: FolderId::try_from("f-0123456789abcdef").expect("a folder id"),
        }),
    }
}

/// Collects the progress an operation reports.
#[derive(Default)]
pub struct ProgressLog {
    updates: Mutex<Vec<ProgressUpdate>>,
}

impl ProgressLog {
    pub fn push(&self, update: ProgressUpdate) {
        self.updates.lock().expect("not poisoned").push(update);
    }

    pub fn updates(&self) -> Vec<ProgressUpdate> {
        self.updates.lock().expect("not poisoned").clone()
    }
}

pub fn ignore_progress(_update: ProgressUpdate) {}

pub fn context(cancel: &CancellationToken) -> OperationContext<'_> {
    OperationContext {
        cancel,
        request_id: None,
        progress: &ignore_progress,
    }
}

pub fn code_of<T: std::fmt::Debug>(result: Result<T, CoreError>) -> ErrorCode {
    result.expect_err("the operation is refused").code()
}

/// git's own text of a refused operation.
pub fn detail_of<T: std::fmt::Debug>(result: Result<T, CoreError>) -> String {
    match result.expect_err("the operation is refused") {
        CoreError::Git(error) => error.detail.unwrap_or_default(),
        other => panic!("not a refusal of git: {other:?}"),
    }
}
