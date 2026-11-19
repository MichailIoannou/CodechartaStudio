use std::collections::HashMap;
use std::ffi::OsString;
use std::path::PathBuf;
use std::process::{ExitStatus, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::time::{Duration, Instant};

use codecharta_core_api::methods::tools::ToolId;
use tokio::io::AsyncWriteExt;
use tokio::process::{Child, Command};
use tokio_util::sync::CancellationToken;

use super::env::{AskpassSetup, EnvVars, child_env};
use super::launch::{check_args, check_batch_args, is_batch_file};
use super::output::{OutputMode, OutputReaders};
use super::tree::ProcessTree;
use crate::error::{CoreError, CoreResult};

const MEBIBYTE: u64 = 1024 * 1024;
pub const DEFAULT_MAX_OUTPUT_BYTES: u64 = 16 * MEBIBYTE;
pub const MAX_OUTPUT_CEILING_BYTES: u64 = 256 * MEBIBYTE;
const TERMINATE_GRACE: Duration = Duration::from_secs(3);
/// Exit code reported for a child that ended by a signal and has no exit code of its own.
pub const NO_EXIT_CODE: i32 = -1;
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

pub struct RunRequest {
    pub tool: ToolId,
    pub program: PathBuf,
    pub args: Vec<OsString>,
    pub cwd: Option<PathBuf>,
    pub env: EnvVars,
    /// Variables of the base environment the child must not inherit.
    pub env_remove: Vec<OsString>,
    pub timeout: Duration,
    pub max_output_bytes: u64,
    pub askpass: Option<AskpassSetup>,
    pub output: OutputMode,
    /// Written to the child's stdin, which is then closed; without it the child's stdin is closed at once.
    pub stdin: Option<String>,
}

impl RunRequest {
    pub fn new(tool: ToolId, program: PathBuf, args: Vec<OsString>, timeout: Duration) -> Self {
        Self {
            tool,
            program,
            args,
            cwd: None,
            env: Vec::new(),
            env_remove: Vec::new(),
            timeout,
            max_output_bytes: DEFAULT_MAX_OUTPUT_BYTES,
            askpass: None,
            output: OutputMode::Collect,
            stdin: None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RunOutput {
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
    pub duration: Duration,
}

/// The only place in the workspace that starts a child process.
#[derive(Debug, Default)]
pub struct ProcessRunner {
    base_env: EnvVars,
    live_trees: Mutex<HashMap<u64, Arc<ProcessTree>>>,
    next_tree_id: AtomicU64,
}

impl ProcessRunner {
    pub fn new(base_env: EnvVars) -> Self {
        Self {
            base_env,
            ..Self::default()
        }
    }

    pub async fn run(
        &self,
        request: RunRequest,
        cancel: &CancellationToken,
    ) -> CoreResult<RunOutput> {
        validate(&request)?;
        if cancel.is_cancelled() {
            return Err(CoreError::Cancelled);
        }
        let started = Instant::now();
        let mut child = self.spawn(&request)?;
        let tree = Arc::new(ProcessTree::attach(&child)?);
        feed_stdin(&mut child, request.stdin.clone());
        let _registration = LiveTree::register(self, Arc::clone(&tree));
        let result = supervise(&mut child, &tree, &request, cancel).await;
        log_finished(&request, &result, started.elapsed());
        result.map(|(exit_code, stdout, stderr)| RunOutput {
            exit_code,
            stdout,
            stderr,
            duration: started.elapsed(),
        })
    }

    pub async fn kill_all(&self) {
        let trees: Vec<Arc<ProcessTree>> = self.lock_trees().values().cloned().collect();
        for tree in trees {
            if let Err(error) = tree.kill() {
                tracing::warn!("could not kill a child process tree: {error}");
            }
        }
    }

    fn spawn(&self, request: &RunRequest) -> CoreResult<Child> {
        let mut command = Command::new(&request.program);
        command
            .args(&request.args)
            .env_clear()
            .envs(child_env(
                &self.base_env,
                &request.env_remove,
                &request.env,
                request.askpass.as_ref(),
            ))
            .stdin(if request.stdin.is_some() {
                Stdio::piped()
            } else {
                Stdio::null()
            })
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);
        if let Some(cwd) = &request.cwd {
            command.current_dir(cwd);
        }
        isolate(&mut command);
        command
            .spawn()
            .map_err(|error| spawn_error(request.tool, error))
    }

    fn lock_trees(&self) -> MutexGuard<'_, HashMap<u64, Arc<ProcessTree>>> {
        self.live_trees
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
    }
}

/// A child that stops reading early (a stopped stream) makes the write fail; that is its choice, not an error.
fn feed_stdin(child: &mut Child, text: Option<String>) {
    let (Some(mut pipe), Some(text)) = (child.stdin.take(), text) else {
        return;
    };
    tokio::spawn(async move {
        if let Err(error) = pipe.write_all(text.as_bytes()).await {
            tracing::debug!("the child process stopped reading its input: {error}");
        }
    });
}

struct LiveTree<'runner> {
    runner: &'runner ProcessRunner,
    id: u64,
}

impl<'runner> LiveTree<'runner> {
    fn register(runner: &'runner ProcessRunner, tree: Arc<ProcessTree>) -> Self {
        let id = runner.next_tree_id.fetch_add(1, Ordering::Relaxed);
        runner.lock_trees().insert(id, tree);
        Self { runner, id }
    }
}

impl Drop for LiveTree<'_> {
    fn drop(&mut self) {
        self.runner.lock_trees().remove(&self.id);
    }
}

fn validate(request: &RunRequest) -> CoreResult<()> {
    if !request.program.is_absolute() {
        return Err(bad_request(
            "The program must be given as an absolute path.",
        ));
    }
    check_args(&request.args)?;
    if is_batch_file(&request.program) {
        check_batch_args(&request.args)?;
    }
    if request
        .cwd
        .as_ref()
        .is_some_and(|cwd| !cwd.is_absolute() || !cwd.is_dir())
    {
        return Err(bad_request(
            "The working folder must be an existing absolute path.",
        ));
    }
    if request.timeout.is_zero() {
        return Err(bad_request("A child process needs a timeout."));
    }
    if !(1..=MAX_OUTPUT_CEILING_BYTES).contains(&request.max_output_bytes) {
        return Err(bad_request("The output limit is out of range."));
    }
    Ok(())
}

fn bad_request(message: &str) -> CoreError {
    CoreError::BadRequest(message.to_string())
}

#[cfg(unix)]
fn isolate(command: &mut Command) {
    command.process_group(0);
}

#[cfg(windows)]
fn isolate(command: &mut Command) {
    command.creation_flags(CREATE_NO_WINDOW);
}

fn spawn_error(tool: ToolId, error: std::io::Error) -> CoreError {
    match error.kind() {
        std::io::ErrorKind::NotFound => CoreError::ToolNotFound { tool },
        std::io::ErrorKind::InvalidInput => {
            CoreError::BadRequest(format!("The arguments cannot be passed to {tool} safely."))
        }
        _ => CoreError::ToolFailed {
            tool,
            message: format!("it could not be started ({error})"),
        },
    }
}

type Finished = (i32, String, String);

async fn supervise(
    child: &mut Child,
    tree: &ProcessTree,
    request: &RunRequest,
    cancel: &CancellationToken,
) -> CoreResult<Finished> {
    let readers = OutputReaders::start(child, request.max_output_bytes, &request.output);
    let overflow = readers.overflow.clone();
    let stop_reason = tokio::select! {
        biased;
        finished = wait_for_exit(child, readers) => {
            return finished_or_overflow(finished, &overflow, request.max_output_bytes);
        }
        () = cancel.cancelled() => CoreError::Cancelled,
        () = overflow.cancelled() => CoreError::OutputTooLarge { limit_bytes: request.max_output_bytes },
        () = tokio::time::sleep(request.timeout) => CoreError::Timeout { after_ms: millis(request.timeout) },
    };
    stop_tree(child, tree).await;
    Err(stop_reason)
}

async fn wait_for_exit(
    child: &mut Child,
    readers: OutputReaders,
) -> CoreResult<(ExitStatus, String, String)> {
    let status = child.wait().await.map_err(|source| CoreError::Io {
        context: "Could not wait for a child process".to_string(),
        source,
    })?;
    let stdout = readers.stdout.await.unwrap_or_default();
    let stderr = readers.stderr.await.unwrap_or_default();
    Ok((status, stdout, stderr))
}

fn finished_or_overflow(
    finished: CoreResult<(ExitStatus, String, String)>,
    overflow: &CancellationToken,
    limit_bytes: u64,
) -> CoreResult<Finished> {
    if overflow.is_cancelled() {
        return Err(CoreError::OutputTooLarge { limit_bytes });
    }
    finished.map(|(status, stdout, stderr)| (status.code().unwrap_or(NO_EXIT_CODE), stdout, stderr))
}

/// Polite first, then forceful: the whole tree gets a grace period to end, then whatever is left is killed.
async fn stop_tree(child: &mut Child, tree: &ProcessTree) {
    if let Err(error) = tree.terminate() {
        tracing::warn!("could not terminate a child process tree: {error}");
    }
    if tokio::time::timeout(TERMINATE_GRACE, child.wait())
        .await
        .is_err()
    {
        tracing::warn!("a child process ignored the request to stop; killing it");
    }
    if let Err(error) = tree.kill() {
        tracing::warn!("could not kill a child process tree: {error}");
    }
    if let Err(error) = child.kill().await {
        tracing::debug!("the child process was already gone: {error}");
    }
}

fn millis(duration: Duration) -> u64 {
    u64::try_from(duration.as_millis()).unwrap_or(u64::MAX)
}

/// Only the program's file name, the exit code and the duration: arguments and environment may carry
/// credentials.
fn log_finished(request: &RunRequest, result: &CoreResult<Finished>, elapsed: Duration) {
    let program = request
        .program
        .file_name()
        .unwrap_or_default()
        .to_string_lossy();
    match result {
        Ok((exit_code, _, _)) => {
            tracing::debug!(%program, exit_code, duration_ms = millis(elapsed), "child process finished")
        }
        Err(error) => {
            tracing::debug!(%program, duration_ms = millis(elapsed), "child process stopped: {error}")
        }
    }
}
