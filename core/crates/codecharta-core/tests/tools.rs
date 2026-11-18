mod support;

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use codecharta_core::config::settings::SETTINGS_FILE_NAME;
use codecharta_core::process::ProcessRunner;
use codecharta_core::process::env::hardened_env;
use codecharta_core::tools::{SearchLocations, ToolRunOptions, Tools, ToolsSetup};
use codecharta_core::{CoreError, SettingsStore};
use codecharta_core_api::methods::tools::{ToolId, ToolSource, ToolState, ToolStatus, ToolsReport};
use tempfile::TempDir;
use tokio_util::sync::CancellationToken;

use support::{answer_version_with, args, install_fake_command};

const GIT_ANSWER: &str = "git version 2.45.0\n";
const NEWER_GIT_ANSWER: &str = "git version 2.50.1\n";
const OLD_GIT_ANSWER: &str = "git version 2.30.9\n";
const CCSH_ANSWER: &str = "version \"2.4.0\"\n";
const JAVA_BANNER: &str = "openjdk version \"25\" 2025-09-16 LTS\n";
const RUN_TIMEOUT: Duration = Duration::from_secs(20);

struct Fixture {
    root: TempDir,
    tools: Tools,
    settings: Arc<SettingsStore>,
}

impl Fixture {
    fn new() -> Self {
        let root = tempfile::tempdir().expect("a temporary folder");
        let settings = Arc::new(
            SettingsStore::load(root.path().join(SETTINGS_FILE_NAME)).expect("settings load"),
        );
        let tools = Tools::new(ToolsSetup {
            settings: Arc::clone(&settings),
            runner: Arc::new(ProcessRunner::new(hardened_env(std::env::vars_os(), &[]))),
            locations: SearchLocations::only(vec![root.path().join("bin")]),
        });
        Self {
            root,
            tools,
            settings,
        }
    }

    fn bin(&self) -> PathBuf {
        self.root.path().join("bin")
    }

    fn install(&self, folder: &Path, name: &str, stdout: &str, stderr: &str) -> PathBuf {
        let executable = install_fake_command(folder, name);
        answer_version_with(&executable, stdout, stderr);
        executable
    }

    fn install_git_ccsh_and_java(&self) {
        self.install(&self.bin(), "git", GIT_ANSWER, "");
        self.install(&self.bin(), "ccsh", CCSH_ANSWER, "");
        self.install(&self.bin(), "java", "", JAVA_BANNER);
    }

    async fn doctor(&self, refresh: bool) -> ToolsReport {
        self.tools
            .doctor(refresh, &CancellationToken::new(), &|_, _| {})
            .await
            .expect("the doctor answers")
    }
}

fn status_of(report: &ToolsReport, tool: ToolId) -> &ToolStatus {
    report
        .tools
        .iter()
        .find(|status| status.tool == tool)
        .expect("every tool is in the report")
}

#[tokio::test]
async fn should_report_missing_tools() {
    // Arrange
    let fixture = Fixture::new();

    // Act
    let report = fixture.doctor(true).await;

    // Assert
    let states: Vec<ToolState> = report.tools.iter().map(|status| status.state).collect();
    assert_eq!(states, [ToolState::Missing; 5]);
    assert!(!report.can_use_git);
    assert!(!report.can_analyse);
}

#[tokio::test]
async fn should_report_too_old_below_minimum() {
    // Arrange
    let fixture = Fixture::new();
    fixture.install(&fixture.bin(), "git", OLD_GIT_ANSWER, "");

    // Act
    let report = fixture.doctor(true).await;

    // Assert
    let git = status_of(&report, ToolId::Git);
    assert_eq!(git.state, ToolState::TooOld);
    assert_eq!(git.version.as_deref(), Some("2.30.9"));
    assert_eq!(git.minimum_version.as_deref(), Some("2.31.0"));
    assert!(!report.can_use_git);
}

#[tokio::test]
async fn should_report_failed_on_unreadable_version() {
    // Arrange
    let fixture = Fixture::new();
    fixture.install(&fixture.bin(), "git", "something else entirely\n", "");

    // Act
    let report = fixture.doctor(true).await;

    // Assert
    let git = status_of(&report, ToolId::Git);
    assert_eq!(git.state, ToolState::Failed);
    assert_eq!(git.source, Some(ToolSource::Path));
    assert_eq!(
        git.problem.as_deref(),
        Some("It did not answer with a version.")
    );
}

#[tokio::test]
async fn should_prefer_the_custom_path() {
    // Arrange
    let fixture = Fixture::new();
    fixture.install(&fixture.bin(), "git", GIT_ANSWER, "");
    let custom = fixture.install(
        &fixture.root.path().join("custom"),
        "git",
        NEWER_GIT_ANSWER,
        "",
    );

    // Act
    let report = fixture
        .tools
        .set_path(ToolId::Git, custom.clone())
        .await
        .unwrap();

    // Assert
    let git = status_of(&report, ToolId::Git);
    assert_eq!(git.source, Some(ToolSource::Custom));
    assert_eq!(git.version.as_deref(), Some("2.50.1"));
    assert_eq!(git.path.as_deref(), custom.to_str());
    let cleared = fixture.tools.clear_path(ToolId::Git).await.unwrap();
    assert_eq!(
        status_of(&cleared, ToolId::Git).version.as_deref(),
        Some("2.45.0")
    );
}

#[tokio::test]
async fn should_refuse_a_custom_path_that_is_not_the_tool() {
    // Arrange
    let fixture = Fixture::new();
    let not_git = fixture.install(
        &fixture.root.path().join("custom"),
        "notepad",
        "Hello\n",
        "",
    );

    // Act
    let result = fixture.tools.set_path(ToolId::Git, not_git).await;

    // Assert
    assert!(
        matches!(
            result,
            Err(CoreError::ToolFailed {
                tool: ToolId::Git,
                ..
            })
        ),
        "{result:?}"
    );
    assert!(fixture.settings.get().tool_paths.is_empty());
}

#[tokio::test]
async fn should_set_java_home_for_ccsh_outside_path() {
    // Arrange
    let fixture = Fixture::new();
    fixture.install(&fixture.bin(), "git", GIT_ANSWER, "");
    fixture.install(&fixture.bin(), "ccsh", CCSH_ANSWER, "");
    let java_home = fixture.root.path().join("jdk");
    let java = fixture.install(&java_home.join("bin"), "java", "", JAVA_BANNER);
    fixture.tools.set_path(ToolId::Java, java).await.unwrap();

    // Act
    let output = fixture
        .tools
        .run(
            ToolId::Ccsh,
            args(&["print-env", "JAVA_HOME"]),
            ToolRunOptions::new(RUN_TIMEOUT),
            &CancellationToken::new(),
        )
        .await
        .unwrap();

    // Assert
    assert_eq!(output.stdout.trim_end(), java_home.to_str().unwrap());
}

#[tokio::test]
async fn should_reuse_the_cached_report() {
    // Arrange
    let fixture = Fixture::new();
    let git = fixture.install(&fixture.bin(), "git", GIT_ANSWER, "");
    let first = fixture.doctor(false).await;
    answer_version_with(&git, NEWER_GIT_ANSWER, "");

    // Act
    let cached = fixture.doctor(false).await;
    let refreshed = fixture.doctor(true).await;

    // Assert
    assert_eq!(cached, first);
    let git = status_of(&refreshed, ToolId::Git);
    assert_eq!(git.version.as_deref(), Some("2.50.1"), "{git:?}");
}

#[tokio::test]
async fn should_allow_analysis_only_with_git_ccsh_and_java() {
    // Arrange
    let fixture = Fixture::new();
    fixture.install(&fixture.bin(), "git", GIT_ANSWER, "");
    fixture.install(&fixture.bin(), "ccsh", CCSH_ANSWER, "");
    let without_java = fixture.doctor(true).await;
    fixture.install_git_ccsh_and_java();

    // Act
    let with_java = fixture.doctor(true).await;

    // Assert
    assert!(without_java.can_use_git && !without_java.can_analyse);
    assert!(with_java.can_use_git && with_java.can_analyse);
}

#[tokio::test]
async fn should_report_progress_for_every_tool() {
    // Arrange
    let fixture = Fixture::new();
    fixture.install_git_ccsh_and_java();
    let calls = std::sync::Mutex::new(Vec::new());

    // Act
    fixture
        .tools
        .doctor(true, &CancellationToken::new(), &|done, total| {
            calls.lock().unwrap().push((done, total))
        })
        .await
        .unwrap();

    // Assert
    let mut calls = calls.into_inner().unwrap();
    calls.sort_unstable();
    assert_eq!(calls, [(1, 5), (2, 5), (3, 5), (4, 5), (5, 5)]);
}

#[tokio::test]
async fn should_not_run_a_missing_tool() {
    // Arrange
    let fixture = Fixture::new();

    // Act
    let result = fixture
        .tools
        .run(
            ToolId::Gh,
            args(&["pr", "list"]),
            ToolRunOptions::new(RUN_TIMEOUT),
            &CancellationToken::new(),
        )
        .await;

    // Assert
    assert!(
        matches!(result, Err(CoreError::ToolNotFound { tool: ToolId::Gh })),
        "{result:?}"
    );
}
