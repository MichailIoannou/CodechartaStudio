mod support;

use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use codecharta_core::analysis::argv::{AnalyseArgvInput, build_analyse_argv};
use codecharta_core::analysis::launcher::{
    CcshLaunch, LaunchOptions, LaunchOverride, TargetOs, resolve_ccsh_launch,
};
use codecharta_core::analysis::output::{CcshRunResult, RunEnd, classify_failure, parse_map_line};
use codecharta_core::analysis::profile::validate_profile;
use codecharta_core::analysis::runner::{CcshRun, RunHooks, run_ccsh};
use codecharta_core::process::ProcessRunner;
use codecharta_core::process::env::hardened_env;
use codecharta_core_api::methods::analysis::{AnalysisErrorCode, JobError, JobProgress};
use codecharta_core_api::methods::projects::AnalysisProfile;
use codecharta_core_api::methods::tools::ToolsReport;
use codecharta_core_api::values::CommitSha;
use tokio_util::sync::CancellationToken;

use support::fake_ccsh::{FakeScenario, SCENARIO_VARIABLE, fake_ccsh, write_scenario};
use support::{is_gone_soon, read_pid_file};

const SHA: &str = "0123456789abcdef0123456789abcdef01234567";
const TIMEOUT: Duration = Duration::from_secs(20);
const SHORT_TIMEOUT: Duration = Duration::from_millis(300);
const STOPPED_WITHIN: Duration = Duration::from_secs(8);
const PROGRESS_PAUSE_MS: u64 = 20;
const JDK_WARNING: &str = "WARNING: Final field lineComments in class de.maibornwolff.codecharta.analysers.importers.tokei.TokeiLanguage has been mutated reflectively\n";

struct Job {
    _root: tempfile::TempDir,
    repo: PathBuf,
    dir: PathBuf,
}

impl Job {
    fn new() -> Self {
        let root = tempfile::tempdir().expect("a temp folder");
        let repo = root.path().join("repo");
        let dir = root.path().join("store").join(".tmp-job");
        std::fs::create_dir_all(&repo).expect("the repo folder");
        std::fs::create_dir_all(&dir).expect("the job folder");
        Self {
            _root: root,
            repo,
            dir,
        }
    }

    fn log_file(&self) -> PathBuf {
        self.dir.join("run.log")
    }

    fn launch(&self, scenario: &FakeScenario) -> CcshLaunch {
        let options = LaunchOptions {
            worktree_temp_dir: None,
            launch_override: Some(LaunchOverride::Executable(fake_ccsh())),
        };
        let mut launch = resolve_ccsh_launch(&empty_report(), TargetOs::current(), &options)
            .expect("the override resolves");
        let scenario_file = write_scenario(&self.dir.join("scenario"), scenario);
        launch.env.insert(
            SCENARIO_VARIABLE.to_string(),
            scenario_file.to_string_lossy().into_owned(),
        );
        launch
    }

    fn argv(&self) -> Vec<OsString> {
        let profile =
            validate_profile(&AnalysisProfile::default()).expect("the default profile is valid");
        let commit = CommitSha::try_from(SHA).expect("a valid sha");
        build_analyse_argv(&AnalyseArgvInput {
            folder_path: &self.repo,
            output_base: &self.dir.join("map"),
            profile: &profile,
            commit: Some(&commit),
        })
        .expect("the argv builds")
    }

    async fn run(
        &self,
        scenario: &FakeScenario,
        timeout: Duration,
        cancel: &CancellationToken,
    ) -> Result<CcshRunResult, JobError> {
        self.run_with_hooks(scenario, timeout, cancel, no_hooks())
            .await
    }

    async fn run_with_hooks(
        &self,
        scenario: &FakeScenario,
        timeout: Duration,
        cancel: &CancellationToken,
        hooks: RunHooks,
    ) -> Result<CcshRunResult, JobError> {
        let launch = self.launch(scenario);
        let argv = self.argv();
        let log_file = self.log_file();
        let run = CcshRun {
            launch: &launch,
            argv: &argv,
            cwd: &self.dir,
            log_file: &log_file,
            timeout,
        };
        run_ccsh(&runner(), &run, &hooks, cancel).await
    }
}

fn runner() -> ProcessRunner {
    ProcessRunner::new(hardened_env(std::env::vars_os(), &[]))
}

fn empty_report() -> ToolsReport {
    ToolsReport {
        checked_at: "2026-11-19T00:00:00Z".to_string(),
        tools: Vec::new(),
        can_use_git: false,
        can_analyse: false,
    }
}

fn no_hooks() -> RunHooks {
    RunHooks {
        on_progress: Box::new(|_| {}),
    }
}

fn files_bar(parsed: u32, total: u32) -> String {
    let percent = parsed * 100 / total;
    format!(
        "\r  {percent}% [{}>{}] {parsed}/{total} Files, ETA: N/A parsed file: f{parsed}.java",
        "=".repeat(percent as usize),
        " ".repeat((100 - percent) as usize)
    )
}

fn hanging(pid_file: Option<&Path>) -> FakeScenario {
    FakeScenario {
        hang: true,
        pid_file: pid_file.map(Path::to_path_buf),
        ..FakeScenario::default()
    }
}

#[tokio::test]
async fn should_resolve_with_exit_code_and_captured_output() {
    // Arrange
    let job = Job::new();
    let scenario = FakeScenario {
        stdout: vec!["Checking if RawTextParser is applicable...".to_string()],
        stderr_chunks: vec![JDK_WARNING.to_string()],
        write_map: true,
        ..FakeScenario::default()
    };

    // Act
    let result = job
        .run(&scenario, TIMEOUT, &CancellationToken::new())
        .await
        .unwrap();

    // Assert
    assert_eq!(result.end, RunEnd::Exited { code: 0 });
    let map = parse_map_line(&result.stdout).unwrap();
    assert_eq!(map, job.dir.join("0123456.map.cc.json.gz"));
    assert!(map.is_file());
    assert!(result.stdout.starts_with("Checking if RawTextParser"));
    assert_eq!(result.stderr, JDK_WARNING);
}

#[tokio::test]
async fn should_report_the_exit_code_of_a_failed_run() {
    // Arrange
    let job = Job::new();
    let scenario = FakeScenario {
        stdout: vec!["--without does not know x.".to_string()],
        exit_code: 1,
        ..FakeScenario::default()
    };

    // Act
    let result = job
        .run(&scenario, TIMEOUT, &CancellationToken::new())
        .await
        .unwrap();

    // Assert
    assert_eq!(result.end, RunEnd::Exited { code: 1 });
    let error = classify_failure(&result).unwrap();
    assert_eq!(error.code, AnalysisErrorCode::AnalysisFailed);
    assert_eq!(error.message, "--without does not know x.");
}

#[tokio::test]
async fn should_stream_progress_to_the_hook() {
    // Arrange
    let job = Job::new();
    let scenario = FakeScenario {
        stderr_chunks: vec![
            JDK_WARNING.to_string(),
            files_bar(10, 100),
            files_bar(50, 100),
            files_bar(20, 100),
            files_bar(100, 100),
            "\nCreated Project with 100 leaves.\n".to_string(),
        ],
        delay_ms: PROGRESS_PAUSE_MS,
        write_map: true,
        ..FakeScenario::default()
    };
    let reported = Arc::new(Mutex::new(Vec::new()));
    let sink = Arc::clone(&reported);
    let hooks = RunHooks {
        on_progress: Box::new(move |progress| sink.lock().unwrap().push(progress)),
    };

    // Act
    let result = job
        .run_with_hooks(&scenario, TIMEOUT, &CancellationToken::new(), hooks)
        .await
        .unwrap();

    // Assert
    assert_eq!(result.end, RunEnd::Exited { code: 0 });
    let percents: Vec<JobProgress> = reported.lock().unwrap().clone();
    assert_eq!(
        percents,
        [10, 50, 99].map(|percent| JobProgress::Determinate { percent })
    );
}

#[tokio::test]
async fn should_write_run_log() {
    // Arrange
    let job = Job::new();
    let scenario = FakeScenario {
        stdout: vec!["Creating git.log file...\u{e}\u{e}".to_string()],
        stderr_chunks: vec![
            JDK_WARNING.to_string(),
            files_bar(10, 100),
            files_bar(60, 100),
            "\nCreated Project with 100 leaves.\n".to_string(),
        ],
        write_map: true,
        ..FakeScenario::default()
    };

    // Act
    job.run(&scenario, TIMEOUT, &CancellationToken::new())
        .await
        .unwrap();

    // Assert
    let log = std::fs::read_to_string(job.log_file()).unwrap();
    assert!(log.contains("Creating git.log file...\n"), "{log}");
    assert!(log.contains(JDK_WARNING.trim_end()), "{log}");
    assert!(log.contains("60/100 Files"), "{log}");
    assert!(!log.contains("10/100 Files"), "{log}");
    assert!(log.contains("Created Project with 100 leaves.\n"), "{log}");
    assert!(log.contains("Map: "), "{log}");
    assert!(!log.contains('\r') && !log.contains('\u{e}'), "{log:?}");
}

#[tokio::test]
async fn should_kill_a_hanging_run_on_cancel_and_report_cancelled() {
    // Arrange
    let job = Job::new();
    let pid_file = job.dir.join("fake.pid");
    let scenario = hanging(Some(&pid_file));
    let cancel = CancellationToken::new();
    let canceller = cancel.clone();
    let pid_path = pid_file.clone();
    let cancelling = tokio::task::spawn_blocking(move || {
        let pid = read_pid_file(&pid_path);
        canceller.cancel();
        pid
    });
    let started = Instant::now();

    // Act
    let result = job.run(&scenario, TIMEOUT, &cancel).await.unwrap();

    // Assert
    let pid = cancelling.await.unwrap();
    assert_eq!(result.end, RunEnd::Cancelled);
    assert!(started.elapsed() < STOPPED_WITHIN);
    assert!(is_gone_soon(pid));
    assert_eq!(classify_failure(&result), None);
}

#[tokio::test]
async fn should_time_out() {
    // Arrange
    let job = Job::new();

    // Act
    let result = job
        .run(&hanging(None), SHORT_TIMEOUT, &CancellationToken::new())
        .await
        .unwrap();

    // Assert
    assert_eq!(result.end, RunEnd::TimedOut);
    assert_eq!(
        classify_failure(&result).map(|error| error.code),
        Some(AnalysisErrorCode::Timeout)
    );
}

#[tokio::test]
async fn should_flag_the_interactive_marker() {
    // Arrange
    let job = Job::new();
    let scenario = FakeScenario {
        stdout: vec!["Select an analyser to execute".to_string()],
        ..hanging(None)
    };
    let started = Instant::now();

    // Act
    let result = job
        .run(&scenario, TIMEOUT, &CancellationToken::new())
        .await
        .unwrap();

    // Assert
    assert_eq!(result.end, RunEnd::InteractiveTrap);
    assert!(started.elapsed() < STOPPED_WITHIN);
    assert_eq!(
        classify_failure(&result).map(|error| error.code),
        Some(AnalysisErrorCode::InteractiveTrap)
    );
}

#[tokio::test]
async fn should_report_a_missing_executable_as_ccsh_not_found() {
    // Arrange
    let job = Job::new();
    let mut launch = job.launch(&FakeScenario::default());
    launch.command = job.dir.join("no-such-ccsh");
    let argv = job.argv();
    let log_file = job.log_file();
    let run = CcshRun {
        launch: &launch,
        argv: &argv,
        cwd: &job.dir,
        log_file: &log_file,
        timeout: TIMEOUT,
    };

    // Act
    let error = run_ccsh(&runner(), &run, &no_hooks(), &CancellationToken::new())
        .await
        .unwrap_err();

    // Assert
    assert_eq!(error.code, AnalysisErrorCode::CcshNotFound);
}
