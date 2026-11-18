mod support;

use std::path::PathBuf;
use std::time::{Duration, Instant};

use codecharta_core::CoreError;
use codecharta_core::process::env::hardened_env;
use codecharta_core::process::{OutputChunk, OutputMode, ProcessRunner, RunRequest};
use codecharta_core_api::methods::tools::ToolId;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

use support::{TempRepo, args, fake_tool, is_gone_soon, read_pid_file};

const TIMEOUT: Duration = Duration::from_secs(20);
const SHORT_TIMEOUT: Duration = Duration::from_millis(300);
const CANCEL_AFTER: Duration = Duration::from_millis(300);
const STOPPED_WITHIN: Duration = Duration::from_secs(5);
const LONG_SLEEP_MS: &str = "60000";
const SMALL_CAP_BYTES: u64 = 1000;
const FLOOD_BYTES: &str = "1000000";
const CHUNK_CAPACITY: usize = 64;
const MULTIBYTE_TEXT: &str = "aä€😀z";
const STDIN_TIMEOUT: Duration = Duration::from_secs(5);

fn runner() -> ProcessRunner {
    ProcessRunner::new(hardened_env(std::env::vars_os(), &[]))
}

fn fake_request(arguments: &[&str]) -> RunRequest {
    RunRequest::new(ToolId::Ccsh, fake_tool(), args(arguments), TIMEOUT)
}

async fn run(request: RunRequest) -> Result<codecharta_core::process::RunOutput, CoreError> {
    runner().run(request, &CancellationToken::new()).await
}

async fn stream(request_arguments: &[&str]) -> Vec<OutputChunk> {
    let (sender, mut receiver) = mpsc::channel(CHUNK_CAPACITY);
    let mut request = fake_request(request_arguments);
    request.output = OutputMode::Stream(sender);
    run(request).await.expect("the streamed run succeeds");
    let mut chunks = Vec::new();
    while let Some(chunk) = receiver.recv().await {
        chunks.push(chunk);
    }
    chunks
}

fn stdout_text(chunks: &[OutputChunk]) -> String {
    chunks
        .iter()
        .filter_map(|chunk| match chunk {
            OutputChunk::Stdout(text) => Some(text.as_str()),
            OutputChunk::Stderr(_) => None,
        })
        .collect()
}

fn echoed(stdout: &str) -> Vec<String> {
    serde_json::from_str(stdout.trim_end()).expect("echo-args prints a JSON array")
}

#[tokio::test]
async fn should_return_exit_code_and_output() {
    // Arrange
    let request = fake_request(&["echo-args", "hello"]);

    // Act
    let output = run(request).await.unwrap();

    // Assert
    assert_eq!(output.exit_code, 0);
    assert_eq!(echoed(&output.stdout), ["hello"]);
    assert_eq!(output.stderr, "");
}

#[tokio::test]
async fn should_report_non_zero_exit_without_error() {
    // Arrange
    let request = fake_request(&["exit", "3"]);

    // Act
    let output = run(request).await.unwrap();

    // Assert
    assert_eq!(output.exit_code, 3);
    assert_eq!(output.stderr.trim_end(), "exiting with 3");
}

#[tokio::test]
async fn should_fail_tool_not_found_for_a_missing_program() {
    // Arrange
    let folder = tempfile::tempdir().unwrap();
    let request = RunRequest::new(
        ToolId::Git,
        folder.path().join("missing"),
        Vec::new(),
        TIMEOUT,
    );

    // Act
    let result = run(request).await;

    // Assert
    assert!(
        matches!(result, Err(CoreError::ToolNotFound { tool: ToolId::Git })),
        "{result:?}"
    );
}

#[tokio::test]
async fn should_refuse_a_relative_program() {
    // Arrange
    let request = RunRequest::new(ToolId::Git, PathBuf::from("git"), Vec::new(), TIMEOUT);

    // Act
    let result = run(request).await;

    // Assert
    assert!(
        matches!(result, Err(CoreError::BadRequest(_))),
        "{result:?}"
    );
}

#[tokio::test]
async fn should_write_stdin_and_close_it() {
    // Arrange
    let mut request = fake_request(&["echo-stdin"]);
    request.stdin = Some(format!("first line\n{MULTIBYTE_TEXT}\n"));
    request.timeout = STDIN_TIMEOUT;

    // Act
    let output = run(request).await.unwrap();

    // Assert
    assert_eq!(output.exit_code, 0);
    assert_eq!(output.stdout, format!("first line\n{MULTIBYTE_TEXT}\n"));
}

#[tokio::test]
async fn should_keep_stdin_closed_without_text() {
    // Arrange
    let mut request = fake_request(&["echo-stdin"]);
    request.timeout = STDIN_TIMEOUT;

    // Act
    let output = run(request).await.unwrap();

    // Assert
    assert_eq!(output.exit_code, 0);
    assert_eq!(output.stdout, "");
}

#[tokio::test]
async fn should_time_out_and_kill() {
    // Arrange
    let mut request = fake_request(&["sleep", LONG_SLEEP_MS]);
    request.timeout = SHORT_TIMEOUT;
    let started = Instant::now();

    // Act
    let result = run(request).await;

    // Assert
    assert!(
        matches!(result, Err(CoreError::Timeout { .. })),
        "{result:?}"
    );
    assert!(started.elapsed() < STOPPED_WITHIN);
}

#[tokio::test]
async fn should_cancel_and_kill() {
    // Arrange
    let cancel = CancellationToken::new();
    let canceller = cancel.clone();
    tokio::spawn(async move {
        tokio::time::sleep(CANCEL_AFTER).await;
        canceller.cancel();
    });
    let started = Instant::now();

    // Act
    let result = runner()
        .run(fake_request(&["sleep", LONG_SLEEP_MS]), &cancel)
        .await;

    // Assert
    assert!(matches!(result, Err(CoreError::Cancelled)), "{result:?}");
    assert!(started.elapsed() < STOPPED_WITHIN);
}

#[tokio::test]
async fn should_not_spawn_when_already_cancelled() {
    // Arrange
    let folder = tempfile::tempdir().unwrap();
    let pid_file = folder.path().join("pid");
    let request = fake_request(&["spawn-grandchild", pid_file.to_str().unwrap()]);
    let cancel = CancellationToken::new();
    cancel.cancel();

    // Act
    let result = runner().run(request, &cancel).await;

    // Assert
    assert!(matches!(result, Err(CoreError::Cancelled)), "{result:?}");
    assert!(!pid_file.exists());
}

#[tokio::test]
async fn should_stop_at_the_output_cap() {
    // Arrange
    let mut request = fake_request(&["flood", FLOOD_BYTES]);
    request.max_output_bytes = SMALL_CAP_BYTES;

    // Act
    let result = run(request).await;

    // Assert
    assert!(
        matches!(
            result,
            Err(CoreError::OutputTooLarge {
                limit_bytes: SMALL_CAP_BYTES
            })
        ),
        "{result:?}"
    );
}

#[tokio::test]
async fn should_stream_chunks() {
    // Arrange
    let arguments = ["echo-args", "streamed"];

    // Act
    let chunks = stream(&arguments).await;

    // Assert
    assert!(!chunks.is_empty());
    assert_eq!(echoed(&stdout_text(&chunks)), ["streamed"]);
}

#[tokio::test]
async fn should_not_split_multibyte_characters() {
    // Arrange
    let arguments = ["utf8-split"];

    // Act
    let chunks = stream(&arguments).await;

    // Assert
    assert!(
        chunks.len() > 1,
        "the text arrives in several chunks: {chunks:?}"
    );
    assert_eq!(stdout_text(&chunks), MULTIBYTE_TEXT);
}

#[tokio::test]
async fn should_kill_grandchildren_too() {
    // Arrange
    let folder = tempfile::tempdir().unwrap();
    let pid_file = folder.path().join("grandchild.pid");
    let mut request = fake_request(&["spawn-grandchild", pid_file.to_str().unwrap()]);
    request.timeout = Duration::from_secs(2);

    // Act
    let result = run(request).await;

    // Assert
    assert!(
        matches!(result, Err(CoreError::Timeout { .. })),
        "{result:?}"
    );
    assert!(is_gone_soon(read_pid_file(&pid_file)));
}

#[tokio::test]
async fn should_pass_arguments_with_spaces_and_metacharacters_unchanged() {
    // Arrange
    let unusual = [
        "with space",
        "a&b|c",
        "$HOME",
        "*",
        "'single'",
        "\"double\"",
        "line\nbreak",
        "ünïcödé",
        "",
    ];
    let mut arguments = vec!["echo-args"];
    arguments.extend(unusual);

    // Act
    let output = run(fake_request(&arguments)).await.unwrap();

    // Assert
    assert_eq!(echoed(&output.stdout), unusual);
}

#[tokio::test]
async fn should_run_git_in_a_temp_repo() {
    // Arrange
    let repo = TempRepo::new();
    let commit = repo.commit_file("README.md", "hello", "Add a readme");
    let mut request = RunRequest::new(
        ToolId::Git,
        repo.git_executable().to_path_buf(),
        args(&["rev-parse", "HEAD"]),
        TIMEOUT,
    );
    request.cwd = Some(repo.path().to_path_buf());
    request.env = repo.env();

    // Act
    let output = run(request).await.unwrap();

    // Assert
    assert_eq!(output.exit_code, 0);
    assert_eq!(output.stdout.trim_end(), commit);
}

#[tokio::test]
async fn should_kill_running_children_on_kill_all() {
    // Arrange
    let runner = std::sync::Arc::new(runner());
    let running = std::sync::Arc::clone(&runner);
    let handle = tokio::spawn(async move {
        running
            .run(
                fake_request(&["sleep", LONG_SLEEP_MS]),
                &CancellationToken::new(),
            )
            .await
    });
    tokio::time::sleep(CANCEL_AFTER).await;

    // Act
    runner.kill_all().await;
    let result = tokio::time::timeout(STOPPED_WITHIN, handle)
        .await
        .unwrap()
        .unwrap();

    // Assert
    assert_ne!(result.unwrap().exit_code, 0);
}

#[cfg(windows)]
mod batch_files {
    use std::ffi::OsString;

    use super::*;

    /// Mirrors the ccsh wrapper of the npm package: a `.cmd` that hands `%*` to the real program.
    fn cmd_wrapper(folder: &std::path::Path) -> PathBuf {
        support::install_fake_tool(folder, "cc-fake-tool");
        let wrapper = folder.join("ccsh.cmd");
        std::fs::write(&wrapper, "@echo off\r\n\"%~dp0cc-fake-tool.exe\" %*\r\n")
            .expect("the wrapper can be written");
        wrapper
    }

    #[tokio::test]
    async fn should_pass_arguments_unchanged_through_a_cmd_file() {
        // Arrange
        let folder = tempfile::tempdir().unwrap();
        let unusual = [
            "with space",
            "a&b",
            "a^b",
            "(paren)",
            "a|b",
            r"C:\dir with space\",
        ];
        let mut arguments = vec!["echo-args"];
        arguments.extend(unusual);
        let request = RunRequest::new(
            ToolId::Ccsh,
            cmd_wrapper(folder.path()),
            args(&arguments),
            TIMEOUT,
        );

        // Act
        let output = run(request).await.unwrap();

        // Assert
        assert_eq!(echoed(&output.stdout), unusual);
    }

    #[tokio::test]
    async fn should_kill_java_like_grandchild_of_a_cmd_file() {
        // Arrange
        let folder = tempfile::tempdir().unwrap();
        let pid_file = folder.path().join("grandchild.pid");
        let arguments: Vec<OsString> = args(&["spawn-grandchild", pid_file.to_str().unwrap()]);
        let mut request =
            RunRequest::new(ToolId::Ccsh, cmd_wrapper(folder.path()), arguments, TIMEOUT);
        request.timeout = Duration::from_secs(2);

        // Act
        let result = run(request).await;

        // Assert
        assert!(
            matches!(result, Err(CoreError::Timeout { .. })),
            "{result:?}"
        );
        assert!(is_gone_soon(read_pid_file(&pid_file)));
    }
}
