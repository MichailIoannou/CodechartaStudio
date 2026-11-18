use std::ffi::OsString;
use std::future::Future;
use std::ops::ControlFlow;
use std::path::Path;
use std::pin::Pin;
use std::time::{Duration, Instant};

use codecharta_core_api::methods::tools::{ToolId, ToolState};
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

use super::command::{GitCommand, GitInvocation, Limits, UserEnvironment, invocation_of};
use super::error::command_failed;
use super::progress::{ProgressReporter, ProgressSink};
use crate::error::{CoreError, CoreResult};
use crate::process::lines::LineSplitter;
use crate::process::{OutputChunk, OutputMode, RunOutput};
use crate::tools::{ToolRunOptions, Tools};

pub const GIT_TIMEOUT: Duration = Duration::from_secs(15);
/// Output chunks a streamed command may run ahead of the code reading its lines.
const STREAM_CHUNK_BUFFER: usize = 64;

/// A finished git command; a non-zero exit is an answer, not an error.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GitOutput {
    pub exit_code: i32,
    pub stdout: String,
}

impl GitOutput {
    pub fn succeeded(&self) -> bool {
        self.exit_code == 0
    }
}

pub type GitFuture<'call> = Pin<Box<dyn Future<Output = CoreResult<GitOutput>> + Send + 'call>>;

/// Runs the system git in a folder. Every argument a caller derives from input is validated first, so
/// none can start with `-`.
pub trait GitRunner: Send + Sync {
    fn run<'call>(&'call self, cwd: &'call Path, args: &'call [&'call str]) -> GitFuture<'call>;
}

impl GitRunner for Tools {
    fn run<'call>(&'call self, cwd: &'call Path, args: &'call [&'call str]) -> GitFuture<'call> {
        Box::pin(async move {
            let options = ToolRunOptions {
                cwd: Some(cwd.to_path_buf()),
                ..ToolRunOptions::new(GIT_TIMEOUT)
            };
            let args = args.iter().map(OsString::from).collect();
            let output =
                Tools::run(self, ToolId::Git, args, options, &CancellationToken::new()).await?;
            Ok(GitOutput {
                exit_code: output.exit_code,
                stdout: output.stdout,
            })
        })
    }
}

pub type ProcessFuture<'call> = Pin<Box<dyn Future<Output = CoreResult<RunOutput>> + Send + 'call>>;
pub type VersionFuture<'call> = Pin<Box<dyn Future<Output = CoreResult<String>> + Send + 'call>>;

/// The process runner as git sees it: the version of the git it would run, and one prepared invocation.
pub trait GitProcess: Send + Sync {
    /// The version even when it is below the minimum, so the caller can say so.
    fn version(&self) -> VersionFuture<'_>;

    fn execute<'call>(
        &'call self,
        invocation: GitInvocation,
        cancel: &'call CancellationToken,
    ) -> ProcessFuture<'call>;

    /// Sends the output to `chunks` as it arrives; the answer then holds no text. This default collects
    /// first and sends afterwards, which is enough for a process that does not really run git.
    fn stream<'call>(
        &'call self,
        invocation: GitInvocation,
        chunks: mpsc::Sender<OutputChunk>,
        cancel: &'call CancellationToken,
    ) -> ProcessFuture<'call> {
        Box::pin(async move {
            let output = self.execute(invocation, cancel).await?;
            for chunk in [
                OutputChunk::Stdout(output.stdout),
                OutputChunk::Stderr(output.stderr),
            ] {
                if chunks.send(chunk).await.is_err() {
                    break;
                }
            }
            Ok(RunOutput {
                stdout: String::new(),
                stderr: String::new(),
                ..output
            })
        })
    }
}

impl GitProcess for Tools {
    fn version(&self) -> VersionFuture<'_> {
        Box::pin(async move {
            let report = self
                .doctor(false, &CancellationToken::new(), &|_, _| {})
                .await?;
            let git = report
                .tools
                .into_iter()
                .find(|status| status.tool == ToolId::Git)
                .ok_or(CoreError::ToolNotFound { tool: ToolId::Git })?;
            match (git.state, git.version) {
                (ToolState::Ok | ToolState::TooOld, Some(version)) => Ok(version),
                (ToolState::Missing, _) => Err(CoreError::ToolNotFound { tool: ToolId::Git }),
                _ => Err(CoreError::ToolFailed {
                    tool: ToolId::Git,
                    message: git.problem.unwrap_or_default(),
                }),
            }
        })
    }

    fn execute<'call>(
        &'call self,
        invocation: GitInvocation,
        cancel: &'call CancellationToken,
    ) -> ProcessFuture<'call> {
        Box::pin(async move {
            let options = ToolRunOptions {
                cwd: Some(invocation.cwd),
                env: invocation.env,
                env_remove: invocation.removed_env,
                max_output_bytes: Some(invocation.limits.max_stdout_bytes),
                stdin: invocation.stdin,
                askpass: invocation.askpass,
                ..ToolRunOptions::new(invocation.limits.timeout)
            };
            Tools::run(self, ToolId::Git, invocation.args, options, cancel).await
        })
    }

    fn stream<'call>(
        &'call self,
        invocation: GitInvocation,
        chunks: mpsc::Sender<OutputChunk>,
        cancel: &'call CancellationToken,
    ) -> ProcessFuture<'call> {
        Box::pin(async move {
            let options = ToolRunOptions {
                cwd: Some(invocation.cwd),
                env: invocation.env,
                env_remove: invocation.removed_env,
                max_output_bytes: Some(invocation.limits.max_stdout_bytes),
                stdin: invocation.stdin,
                askpass: invocation.askpass,
                output: OutputMode::Stream(chunks),
                ..ToolRunOptions::new(invocation.limits.timeout)
            };
            Tools::run(self, ToolId::Git, invocation.args, options, cancel).await
        })
    }
}

/// What reading a streamed command's output saw: its stderr, and whether the reader stopped it.
struct StreamedOutput {
    stderr: String,
    is_stopped_by_reader: bool,
}

/// Runs git commands through the process runner and turns a refusal of git into a classified error.
pub struct GitCli<'core> {
    process: &'core dyn GitProcess,
    data_dir: &'core Path,
    user: UserEnvironment,
}

impl<'core> GitCli<'core> {
    pub fn new(process: &'core dyn GitProcess, data_dir: &'core Path) -> Self {
        Self {
            process,
            data_dir,
            user: UserEnvironment::default(),
        }
    }

    pub fn with_user_environment(self, user: UserEnvironment) -> Self {
        Self { user, ..self }
    }

    pub async fn version(&self) -> CoreResult<String> {
        self.process.version().await
    }

    /// The standard output of a command that must succeed.
    pub async fn run(
        &self,
        command: &GitCommand,
        cancel: &CancellationToken,
    ) -> CoreResult<String> {
        let output = self.run_raw(command, cancel).await?;
        if output.exit_code != 0 {
            return Err(command_failed(&output));
        }
        Ok(output.stdout)
    }

    /// Hands every stdout line to `on_line` as git prints it; `Break` stops git, which is then no error.
    pub async fn stream_lines(
        &self,
        command: &GitCommand,
        cancel: &CancellationToken,
        on_line: &mut (dyn FnMut(&str) -> ControlFlow<()> + Send),
    ) -> CoreResult<()> {
        let (sender, receiver) = mpsc::channel(STREAM_CHUNK_BUFFER);
        let stop = cancel.child_token();
        let invocation = invocation_of(command, self.data_dir, &self.user);
        let (run, streamed) = tokio::join!(
            self.process.stream(invocation, sender, &stop),
            read_lines(receiver, on_line, &stop)
        );
        match run {
            Err(CoreError::Cancelled)
                if streamed.is_stopped_by_reader && !cancel.is_cancelled() =>
            {
                Ok(())
            }
            Err(error) => Err(error),
            Ok(output) if output.exit_code != 0 => Err(command_failed(&RunOutput {
                stderr: streamed.stderr,
                ..output
            })),
            Ok(_) => Ok(()),
        }
    }

    /// The exit code is the caller's business.
    pub async fn run_raw(
        &self,
        command: &GitCommand,
        cancel: &CancellationToken,
    ) -> CoreResult<RunOutput> {
        let invocation = invocation_of(command, self.data_dir, &self.user);
        self.process.execute(invocation, cancel).await
    }

    /// Like `run_raw`, while git's progress on stderr goes to `progress` as it is printed.
    pub async fn run_reporting(
        &self,
        command: &GitCommand,
        cancel: &CancellationToken,
        progress: ProgressSink<'_>,
    ) -> CoreResult<RunOutput> {
        let (sender, receiver) = mpsc::channel(STREAM_CHUNK_BUFFER);
        let invocation = invocation_of(command, self.data_dir, &self.user);
        let (run, collected) = tokio::join!(
            self.process.stream(invocation, sender, cancel),
            collect_reporting(receiver, ProgressReporter::new(progress))
        );
        Ok(RunOutput {
            stdout: collected.stdout,
            stderr: collected.stderr,
            ..run?
        })
    }
}

struct CollectedOutput {
    stdout: String,
    stderr: String,
}

async fn collect_reporting(
    mut receiver: mpsc::Receiver<OutputChunk>,
    mut reporter: ProgressReporter<'_>,
) -> CollectedOutput {
    let mut collected = CollectedOutput {
        stdout: String::new(),
        stderr: String::new(),
    };
    while let Some(chunk) = receiver.recv().await {
        match chunk {
            OutputChunk::Stdout(text) => collected.stdout.push_str(&text),
            OutputChunk::Stderr(text) => {
                reporter.push(&text, Instant::now());
                collected.stderr.push_str(&text);
            }
        }
    }
    collected
}

/// git in one folder for one request: the runner, the folder git runs in and the request's cancellation.
#[derive(Clone, Copy)]
pub struct FolderGit<'call> {
    pub git: &'call GitCli<'call>,
    pub folder: &'call Path,
    pub cancel: &'call CancellationToken,
}

impl FolderGit<'_> {
    pub fn read(&self, args: &[&str], limits: Limits) -> GitCommand {
        GitCommand::read(self.folder, args, limits)
    }

    /// The standard output of a read that must succeed.
    pub async fn run(&self, args: &[&str], limits: Limits) -> CoreResult<String> {
        self.git.run(&self.read(args, limits), self.cancel).await
    }

    /// A read whose exit code is the caller's business.
    pub async fn run_raw(&self, args: &[&str], limits: Limits) -> CoreResult<RunOutput> {
        self.git
            .run_raw(&self.read(args, limits), self.cancel)
            .await
    }
}

/// Returning drops the receiver, so the output readers of a stopped command do not wait for it.
async fn read_lines(
    mut receiver: mpsc::Receiver<OutputChunk>,
    on_line: &mut (dyn FnMut(&str) -> ControlFlow<()> + Send),
    stop: &CancellationToken,
) -> StreamedOutput {
    let mut lines = LineSplitter::default();
    let mut stderr = String::new();
    while let Some(chunk) = receiver.recv().await {
        let text = match chunk {
            OutputChunk::Stderr(text) => {
                stderr.push_str(&text);
                continue;
            }
            OutputChunk::Stdout(text) => text,
        };
        if lines
            .push(&text)
            .iter()
            .any(|line| on_line(line).is_break())
        {
            stop.cancel();
            return StreamedOutput {
                stderr,
                is_stopped_by_reader: true,
            };
        }
    }
    let is_stopped_by_reader = lines.finish().is_some_and(|line| on_line(&line).is_break());
    StreamedOutput {
        stderr,
        is_stopped_by_reader,
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;
    use std::sync::Mutex;

    use codecharta_core_api::error::ErrorCode;

    use super::*;
    use crate::git::command::{CommandKind, GLOBAL_ARGS, READ_ARGS, REPOSITORY_LIMITS};
    use crate::git::error::MAX_DETAIL_CHARS;
    use crate::git::parse::progress::ProgressUpdate;

    struct RecordingProcess {
        answer: Result<RunOutput, fn() -> CoreError>,
        invocations: Mutex<Vec<GitInvocation>>,
    }

    impl RecordingProcess {
        fn answering(exit_code: i32, stderr: &str) -> Self {
            Self {
                answer: Ok(RunOutput {
                    exit_code,
                    stdout: "out".to_string(),
                    stderr: stderr.to_string(),
                    duration: Duration::ZERO,
                }),
                invocations: Mutex::default(),
            }
        }

        fn last(&self) -> GitInvocation {
            self.invocations.lock().unwrap().last().unwrap().clone()
        }
    }

    impl GitProcess for RecordingProcess {
        fn version(&self) -> VersionFuture<'_> {
            Box::pin(async { Ok("2.56.0".to_string()) })
        }

        fn execute<'call>(
            &'call self,
            invocation: GitInvocation,
            _cancel: &'call CancellationToken,
        ) -> ProcessFuture<'call> {
            self.invocations.lock().unwrap().push(invocation);
            let answer = self.answer.clone().map_err(|error| error());
            Box::pin(async move { answer })
        }
    }

    fn data_dir() -> PathBuf {
        std::env::temp_dir().join("codecharta data")
    }

    fn folder() -> PathBuf {
        std::env::temp_dir().join("repo")
    }

    fn command(kind: CommandKind) -> GitCommand {
        GitCommand {
            kind,
            ..GitCommand::read(&folder(), &["status"], REPOSITORY_LIMITS)
        }
    }

    async fn run(process: &RecordingProcess, kind: CommandKind) -> CoreResult<String> {
        let data_dir = data_dir();
        GitCli::new(process, &data_dir)
            .run(&command(kind), &CancellationToken::new())
            .await
    }

    fn value_of(invocation: &GitInvocation, name: &str) -> Option<String> {
        invocation
            .env
            .iter()
            .find(|(existing, _)| existing == name)
            .map(|(_, value)| value.to_string_lossy().into_owned())
    }

    fn texts(values: &[OsString]) -> Vec<String> {
        values
            .iter()
            .map(|value| value.to_string_lossy().into_owned())
            .collect()
    }

    #[tokio::test]
    async fn should_pass_global_and_read_args_and_read_env_on_reads() {
        // Arrange
        let process = RecordingProcess::answering(0, "");

        // Act
        let stdout = run(&process, CommandKind::Read).await.unwrap();

        // Assert
        let invocation = process.last();
        let mut expected: Vec<String> = GLOBAL_ARGS.iter().map(ToString::to_string).collect();
        expected.extend(READ_ARGS.iter().map(ToString::to_string));
        expected.extend(["-C".to_string(), folder().to_string_lossy().into_owned()]);
        expected.push("status".to_string());
        assert_eq!(texts(&invocation.args), expected);
        assert_eq!(value_of(&invocation, "LC_ALL").as_deref(), Some("C"));
        assert_eq!(
            value_of(&invocation, "GIT_OPTIONAL_LOCKS").as_deref(),
            Some("0")
        );
        assert_eq!(
            value_of(&invocation, "GIT_TERMINAL_PROMPT").as_deref(),
            Some("0")
        );
        assert_eq!(invocation.limits, REPOSITORY_LIMITS);
        assert_eq!(stdout, "out");
    }

    #[tokio::test]
    async fn should_use_mutating_env_without_lc_all() {
        // Arrange
        let process = RecordingProcess::answering(0, "");

        // Act
        run(&process, CommandKind::Mutating).await.unwrap();

        // Assert
        let invocation = process.last();
        assert_eq!(value_of(&invocation, "LC_ALL"), None);
        assert_eq!(value_of(&invocation, "LC_MESSAGES").as_deref(), Some("C"));
        assert_eq!(value_of(&invocation, "GIT_EDITOR").as_deref(), Some("true"));
        assert!(!texts(&invocation.args).contains(&"core.fsmonitor=false".to_string()));
    }

    #[tokio::test]
    async fn should_remove_git_dir_and_askpass_variables() {
        // Arrange
        let process = RecordingProcess::answering(0, "");

        // Act
        run(&process, CommandKind::Read).await.unwrap();

        // Assert
        assert_eq!(
            texts(&process.last().removed_env),
            [
                "GIT_DIR",
                "GIT_WORK_TREE",
                "GIT_INDEX_FILE",
                "CODECHARTA_ASKPASS_ENDPOINT",
                "CODECHARTA_ASKPASS_TOKEN"
            ]
        );
    }

    #[tokio::test]
    async fn should_use_data_dir_as_cwd() {
        // Arrange
        let process = RecordingProcess::answering(0, "");

        // Act
        run(&process, CommandKind::Read).await.unwrap();

        // Assert
        assert_eq!(process.last().cwd, data_dir());
    }

    #[tokio::test]
    async fn should_report_progress_and_keep_the_output_of_a_reporting_run() {
        // Arrange
        let stderr = "Receiving objects:  50% (1/2)\rReceiving objects: 100% (2/2), done.\r\n";
        let process = RecordingProcess::answering(1, stderr);
        let data_dir = data_dir();
        let reports = Mutex::new(Vec::new());
        let sink = |update: ProgressUpdate| reports.lock().unwrap().push(update);

        // Act
        let output = GitCli::new(&process, &data_dir)
            .run_reporting(
                &command(CommandKind::Network),
                &CancellationToken::new(),
                &sink,
            )
            .await
            .unwrap();

        // Assert
        assert_eq!(
            (
                output.exit_code,
                output.stdout.as_str(),
                output.stderr.as_str()
            ),
            (1, "out", stderr)
        );
        let reported = reports.lock().unwrap();
        assert_eq!(reported.len(), 1);
        assert_eq!(reported[0].message, "Receiving objects: 100% (2/2), done.");
    }

    #[tokio::test]
    async fn should_classify_a_non_zero_exit() {
        // Arrange
        let process = RecordingProcess::answering(
            128,
            "fatal: not a git repository (or any of the parent directories): .git\n",
        );

        // Act
        let error = run(&process, CommandKind::Read).await.unwrap_err();

        // Assert
        assert_eq!(error.code(), ErrorCode::NotARepository);
        assert_eq!(
            error.to_payload().details.get("detail"),
            Some(&serde_json::json!(
                "fatal: not a git repository (or any of the parent directories): .git"
            ))
        );
    }

    #[tokio::test]
    async fn should_map_missing_executable_to_git_not_found() {
        // Arrange
        let process = RecordingProcess {
            answer: Err(|| CoreError::ToolNotFound { tool: ToolId::Git }),
            invocations: Mutex::default(),
        };

        // Act
        let error = run(&process, CommandKind::Read).await.unwrap_err();

        // Assert
        assert_eq!(error.code(), ErrorCode::ToolNotFound);
        assert_eq!(
            error.to_payload().details.get("tool"),
            Some(&serde_json::json!("git"))
        );
    }

    #[tokio::test]
    async fn should_carry_detail_trimmed_to_2000_chars() {
        // Arrange
        let long = format!("  {}  ", "é".repeat(MAX_DETAIL_CHARS + 10));
        let process = RecordingProcess::answering(1, &long);

        // Act
        let error = run(&process, CommandKind::Read).await.unwrap_err();

        // Assert
        let CoreError::Git(git) = error else {
            panic!("a git error was expected");
        };
        let detail = git.detail.unwrap();
        assert_eq!(detail.chars().count(), MAX_DETAIL_CHARS);
        assert!(detail.starts_with('é'));
        assert_eq!(git.code, ErrorCode::CommandFailed);
    }
}
