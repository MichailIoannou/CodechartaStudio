//! Runs the ccsh that `cd analysis && ./gradlew installDist` builds against a temporary repository. Without
//! that build, or without java on `PATH`, the test returns early and says so on stderr.

mod support;

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use codecharta_core::analysis::argv::{AnalyseArgvInput, build_analyse_argv};
use codecharta_core::analysis::launcher::{
    LaunchMode, LaunchOptions, TargetOs, resolve_ccsh_launch,
};
use codecharta_core::analysis::output::{RunEnd, parse_map_line, parse_not_in_map};
use codecharta_core::analysis::profile::validate_profile;
use codecharta_core::analysis::runner::{CcshRun, RunHooks, run_ccsh};
use codecharta_core::process::ProcessRunner;
use codecharta_core::process::env::hardened_env;
use codecharta_core_api::methods::projects::AnalysisProfile;
use codecharta_core_api::methods::tools::{ToolId, ToolState, ToolStatus, ToolsReport};
use codecharta_core_api::values::CommitSha;
use tokio_util::sync::CancellationToken;

use support::TempRepo;

const REAL_RUN_TIMEOUT: Duration = Duration::from_secs(300);
const INSTALLED_BIN: &str = "../../../analysis/build/install/codecharta-analysis/bin";
const SHORT_HASH_MIN_LENGTH: usize = 4;

fn installed_ccsh() -> Option<PathBuf> {
    let script = if cfg!(windows) { "ccsh.bat" } else { "ccsh" };
    let ccsh = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join(INSTALLED_BIN)
        .join(script);
    ccsh.is_file().then_some(ccsh)
}

fn java_on_path() -> Option<PathBuf> {
    let file_name = format!("java{}", std::env::consts::EXE_SUFFIX);
    std::env::split_paths(&std::env::var_os("PATH")?)
        .map(|folder| folder.join(&file_name))
        .find(|candidate| candidate.is_file())
}

fn ok_status(tool: ToolId, path: &Path) -> ToolStatus {
    ToolStatus {
        tool,
        is_required: true,
        state: ToolState::Ok,
        path: Some(path.to_string_lossy().into_owned()),
        source: None,
        version: None,
        minimum_version: None,
        problem: None,
    }
}

#[tokio::test]
async fn should_analyse_a_real_repository_with_the_installed_ccsh() {
    // Arrange
    let (Some(ccsh), Some(java)) = (installed_ccsh(), java_on_path()) else {
        eprintln!("skipped: no ccsh in {INSTALLED_BIN} or no java on PATH");
        return;
    };
    let repo = TempRepo::new();
    let sha = repo.commit(
        "add sources",
        &[
            (
                "src/Main.java",
                "class Main {\n  void run() { if (true) { } }\n}\n",
            ),
            ("README.md", "# demo\n"),
        ],
    );
    let jobs = tempfile::tempdir().unwrap();
    let job_dir = jobs.path().join("job dir");
    let worktree_temp = job_dir.join("tmp");
    std::fs::create_dir_all(&worktree_temp).unwrap();
    let tools = ToolsReport {
        checked_at: "2026-11-19T00:00:00Z".to_string(),
        tools: vec![
            ok_status(ToolId::Ccsh, &ccsh),
            ok_status(ToolId::Java, &java),
        ],
        can_use_git: true,
        can_analyse: true,
    };
    let launch = resolve_ccsh_launch(
        &tools,
        TargetOs::current(),
        &LaunchOptions {
            worktree_temp_dir: Some(worktree_temp.clone()),
            launch_override: None,
        },
    )
    .unwrap();
    let profile = validate_profile(&AnalysisProfile::default()).unwrap();
    let commit = CommitSha::try_from(sha.as_str()).unwrap();
    let argv = build_analyse_argv(&AnalyseArgvInput {
        folder_path: repo.path(),
        output_base: &job_dir.join("map"),
        profile: &profile,
        commit: Some(&commit),
    })
    .unwrap();
    let log_file = job_dir.join("run.log");
    let reported = Arc::new(Mutex::new(Vec::new()));
    let sink = Arc::clone(&reported);
    let hooks = RunHooks {
        on_progress: Box::new(move |progress| sink.lock().unwrap().push(progress)),
    };
    let run = CcshRun {
        launch: &launch,
        argv: &argv,
        cwd: &job_dir,
        log_file: &log_file,
        timeout: REAL_RUN_TIMEOUT,
    };

    // Act
    let runner = ProcessRunner::new(hardened_env(std::env::vars_os(), &[]));
    let result = run_ccsh(&runner, &run, &hooks, &CancellationToken::new())
        .await
        .unwrap();

    // Assert
    assert_eq!(launch.mode, LaunchMode::JavaDirect);
    assert_eq!(result.end, RunEnd::Exited { code: 0 }, "{}", result.stdout);
    let map = parse_map_line(&result.stdout).unwrap();
    let prefix = map
        .file_name()
        .unwrap()
        .to_string_lossy()
        .split('.')
        .next()
        .unwrap()
        .to_string();
    assert!(
        prefix.len() >= SHORT_HASH_MIN_LENGTH && sha.starts_with(&prefix),
        "{prefix}"
    );
    assert!(map.is_file(), "{}", map.display());
    assert_eq!(map.parent(), Some(job_dir.as_path()));
    let leftovers: Vec<_> = std::fs::read_dir(&worktree_temp)
        .unwrap()
        .flatten()
        .map(|entry| entry.file_name())
        .collect();
    eprintln!(
        "real ccsh: map {}, not in map {:?}, progress {:?}, left in the worktree temp dir {:?}",
        map.display(),
        parse_not_in_map(&result.stdout),
        reported.lock().unwrap(),
        leftovers
    );
    assert!(
        std::fs::read_to_string(&log_file)
            .unwrap()
            .contains("Map: ")
    );
}
