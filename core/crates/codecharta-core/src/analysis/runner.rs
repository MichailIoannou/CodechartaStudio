use std::ffi::OsString;
use std::path::Path;
use std::time::Duration;

use codecharta_core_api::methods::analysis::{AnalysisErrorCode, JobError, JobProgress};
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

use super::launcher::CcshLaunch;
use super::output::{CcshRunResult, RunEnd, classify_start_failure, strip_control_characters};
use super::progress::ProgressParser;
use super::run_log::RunLog;
use crate::error::CoreError;
use crate::process::runner::{MAX_OUTPUT_CEILING_BYTES, NO_EXIT_CODE};
use crate::process::{OutputChunk, OutputMode, ProcessRunner, RunOutput, RunRequest};

pub const ANALYSIS_TIMEOUT: Duration = Duration::from_secs(30 * 60);
/// Only the end of each stream is kept in memory; `run.log` has all of it.
pub const MAX_CAPTURED_BYTES: usize = 256 * 1024;
/// ccsh printed its interactive menu or did not know the subcommand: it now waits for input forever.
const INTERACTIVE_MARKERS: [&str; 2] = ["Select an analyser to execute", "Unknown command:"];
const CHUNK_BUFFER: usize = 64;

pub type ProgressHook = Box<dyn Fn(JobProgress) + Send + Sync>;

pub struct RunHooks {
    pub on_progress: ProgressHook,
}

pub struct CcshRun<'run> {
    pub launch: &'run CcshLaunch,
    pub argv: &'run [OsString],
    /// The job's temp folder, so a stray default output never lands in the repository.
    pub cwd: &'run Path,
    pub log_file: &'run Path,
    pub timeout: Duration,
}

pub async fn run_ccsh(
    runner: &ProcessRunner,
    run: &CcshRun<'_>,
    hooks: &RunHooks,
    cancel: &CancellationToken,
) -> Result<CcshRunResult, JobError> {
    run.launch.check_arguments(run.argv)?;
    let log = RunLog::create(run.log_file).map_err(|error| {
        JobError::new(
            AnalysisErrorCode::StoreWriteFailed,
            format!("Could not write {}: {error}", run.log_file.display()),
        )
    })?;
    let (sender, receiver) = mpsc::channel(CHUNK_BUFFER);
    let stop = cancel.child_token();
    let (finished, capture) = tokio::join!(
        runner.run(request_for(run, sender), &stop),
        capture_output(receiver, log, hooks, &stop)
    );
    let end = run_end(finished, capture.saw_interactive_marker)?;
    Ok(CcshRunResult {
        end,
        stdout: capture.stdout.text,
        stderr: capture.stderr.text,
    })
}

fn request_for(run: &CcshRun<'_>, sender: mpsc::Sender<OutputChunk>) -> RunRequest {
    let args = run
        .launch
        .prefix_args
        .iter()
        .chain(run.argv)
        .cloned()
        .collect();
    let env = run
        .launch
        .env
        .iter()
        .map(|(name, value)| (OsString::from(name), OsString::from(value)))
        .collect();
    RunRequest {
        cwd: Some(run.cwd.to_path_buf()),
        env,
        max_output_bytes: MAX_OUTPUT_CEILING_BYTES,
        output: OutputMode::Stream(sender),
        ..RunRequest::new(
            run.launch.tool(),
            run.launch.command.clone(),
            args,
            run.timeout,
        )
    }
}

fn run_end(
    finished: Result<RunOutput, CoreError>,
    saw_interactive_marker: bool,
) -> Result<RunEnd, JobError> {
    if saw_interactive_marker {
        return Ok(RunEnd::InteractiveTrap);
    }
    match finished {
        Ok(output) if output.exit_code == NO_EXIT_CODE => Ok(RunEnd::Signalled),
        Ok(output) => Ok(RunEnd::Exited {
            code: output.exit_code,
        }),
        Err(CoreError::Cancelled) => Ok(RunEnd::Cancelled),
        Err(CoreError::Timeout { .. }) => Ok(RunEnd::TimedOut),
        Err(CoreError::OutputTooLarge { .. }) => Ok(RunEnd::OutputTooLarge),
        Err(error) => Err(classify_start_failure(&error)),
    }
}

#[derive(Default)]
struct CappedText {
    text: String,
}

impl CappedText {
    fn push(&mut self, chunk: &str) {
        self.text.push_str(chunk);
        let Some(excess) = self.text.len().checked_sub(MAX_CAPTURED_BYTES) else {
            return;
        };
        let cut = (excess..=self.text.len())
            .find(|index| self.text.is_char_boundary(*index))
            .unwrap_or(self.text.len());
        self.text.drain(..cut);
    }
}

#[derive(Default)]
struct Capture {
    stdout: CappedText,
    stderr: CappedText,
    saw_interactive_marker: bool,
}

async fn capture_output(
    mut receiver: mpsc::Receiver<OutputChunk>,
    mut log: RunLog,
    hooks: &RunHooks,
    stop: &CancellationToken,
) -> Capture {
    let mut capture = Capture::default();
    let mut progress = ProgressParser::new();
    while let Some(chunk) = receiver.recv().await {
        match chunk {
            OutputChunk::Stdout(text) => {
                let cleaned = strip_control_characters(&text);
                log.stdout(&cleaned);
                capture.stdout.push(&cleaned);
                if !capture.saw_interactive_marker && has_interactive_marker(&capture.stdout.text) {
                    capture.saw_interactive_marker = true;
                    stop.cancel();
                }
            }
            OutputChunk::Stderr(text) => {
                log.stderr(&text);
                capture.stderr.push(&text);
                if let Some(percent) = progress.push(&text) {
                    (hooks.on_progress)(JobProgress::Determinate { percent });
                }
            }
        }
    }
    log.finish();
    capture
}

fn has_interactive_marker(stdout: &str) -> bool {
    INTERACTIVE_MARKERS
        .iter()
        .any(|marker| stdout.contains(marker))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_keep_only_the_end_of_a_long_stream_on_a_char_boundary() {
        // Arrange
        let mut captured = CappedText::default();
        let filler = "x".repeat(MAX_CAPTURED_BYTES - 1);

        // Act
        captured.push(&filler);
        captured.push("ä€end");

        // Assert
        assert!(captured.text.len() <= MAX_CAPTURED_BYTES);
        assert!(captured.text.ends_with("ä€end"));
        assert!(!captured.text.starts_with('\u{fffd}'));
    }

    #[test]
    fn should_map_runner_outcomes_to_run_ends() {
        // Arrange
        let output = |exit_code| {
            Ok(RunOutput {
                exit_code,
                stdout: String::new(),
                stderr: String::new(),
                duration: Duration::ZERO,
            })
        };
        let outcomes = [
            (output(1), false),
            (output(NO_EXIT_CODE), false),
            (Err(CoreError::Cancelled), false),
            (Err(CoreError::Cancelled), true),
            (Err(CoreError::Timeout { after_ms: 1 }), false),
            (Err(CoreError::OutputTooLarge { limit_bytes: 1 }), false),
        ];

        // Act
        let ends: Vec<RunEnd> = outcomes
            .into_iter()
            .map(|(finished, marker)| run_end(finished, marker).unwrap())
            .collect();

        // Assert
        assert_eq!(
            ends,
            [
                RunEnd::Exited { code: 1 },
                RunEnd::Signalled,
                RunEnd::Cancelled,
                RunEnd::InteractiveTrap,
                RunEnd::TimedOut,
                RunEnd::OutputTooLarge,
            ]
        );
    }
}
