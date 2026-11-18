use std::ffi::OsString;
use std::future::Future;
use std::path::Path;
use std::pin::Pin;
use std::time::Duration;

use codecharta_core_api::methods::tools::{ToolId, ToolState};
use tokio_util::sync::CancellationToken;

use super::command::{GitCommand, GitInvocation, invocation_of};
use super::error::command_failed;
use crate::error::{CoreError, CoreResult};
use crate::process::RunOutput;
use crate::tools::{ToolRunOptions, Tools};

pub const GIT_TIMEOUT: Duration = Duration::from_secs(15);

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
                ..ToolRunOptions::new(invocation.limits.timeout)
            };
            Tools::run(self, ToolId::Git, invocation.args, options, cancel).await
        })
    }
}

/// Runs git commands through the process runner and turns a refusal of git into a classified error.
pub struct GitCli<'core> {
    process: &'core dyn GitProcess,
    data_dir: &'core Path,
}

impl<'core> GitCli<'core> {
    pub fn new(process: &'core dyn GitProcess, data_dir: &'core Path) -> Self {
        Self { process, data_dir }
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

    /// The exit code is the caller's business.
    pub async fn run_raw(
        &self,
        command: &GitCommand,
        cancel: &CancellationToken,
    ) -> CoreResult<RunOutput> {
        let invocation = invocation_of(command, self.data_dir);
        self.process.execute(invocation, cancel).await
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
