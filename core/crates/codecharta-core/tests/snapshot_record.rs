mod support;

use std::ffi::OsString;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;

use codecharta_core::CoreError;
use codecharta_core::analysis::launcher::{LaunchOverride, TargetOs};
use codecharta_core::analysis::runner::RunHooks;
use codecharta_core::analysis::service::{
    AnalysisConfig, AnalysisDeps, AnalysisService, JobFailure, JobRequest,
};
use codecharta_core::git::GitService;
use codecharta_core::git::runner::ProcessFuture;
use codecharta_core::process::ProcessRunner;
use codecharta_core::process::env::hardened_env;
use codecharta_core::snapshots::hosting::HostingCli;
use codecharta_core::snapshots::record::{HostingProvider, SnapshotRecord};
use codecharta_core_api::ids::{JobId, SnapshotId};
use codecharta_core_api::methods::analysis::{AnalysisErrorCode, AnalysisTarget, TargetKind};
use codecharta_core_api::methods::projects::{
    AnalyserName, AnalysisProfile, FolderRef, UpdateProjectParams,
};
use codecharta_core_api::methods::snapshots::{SnapshotRef, SnapshotSource};
use codecharta_core_api::methods::tools::{ToolId, ToolState, ToolStatus, ToolsReport};
use codecharta_core_api::values::CommitSha;
use tokio_util::sync::CancellationToken;

use support::fake_ccsh::{FakeScenario, SCENARIO_VARIABLE, fake_ccsh, write_scenario};
use support::{StoreWorkspace, folder_ref, read_pid_file};

const TIMEOUT: Duration = Duration::from_secs(20);
const HOSTING_BUDGET: Duration = Duration::from_millis(200);
const FAKE_MAP_CHECKSUM: &str = "d41d8cd98f00b204e9800998ecf8427e";
const POLL: Duration = Duration::from_millis(20);
const JOB: &str = "job-1";

struct NoHostingCli;

impl HostingCli for NoHostingCli {
    fn run<'call>(
        &'call self,
        tool: ToolId,
        _cwd: &'call Path,
        _args: Vec<OsString>,
        _cancel: &'call CancellationToken,
    ) -> ProcessFuture<'call> {
        Box::pin(async move { Err(CoreError::ToolNotFound { tool }) })
    }
}

fn tool(tool: ToolId, version: &str) -> ToolStatus {
    ToolStatus {
        tool,
        is_required: true,
        state: ToolState::Ok,
        path: None,
        source: None,
        version: Some(version.to_string()),
        minimum_version: None,
        problem: None,
    }
}

fn config() -> AnalysisConfig {
    AnalysisConfig {
        tools: ToolsReport {
            checked_at: "2026-11-19T00:00:00Z".to_string(),
            tools: vec![tool(ToolId::Ccsh, "2.4.0"), tool(ToolId::Java, "25")],
            can_use_git: true,
            can_analyse: true,
        },
        os: TargetOs::current(),
        launch_override: Some(LaunchOverride::Executable(fake_ccsh())),
        timeout: TIMEOUT,
        hosting_budget: HOSTING_BUDGET,
    }
}

struct Bench {
    workspace: StoreWorkspace,
    scenario_dir: tempfile::TempDir,
}

impl Bench {
    fn new() -> Self {
        Self {
            workspace: StoreWorkspace::new(),
            scenario_dir: tempfile::tempdir().expect("a scenario folder"),
        }
    }

    fn head(&self) -> String {
        self.workspace.repo.git(&["rev-parse", "HEAD"])
    }

    fn file(&self, name: &str) -> PathBuf {
        self.scenario_dir.path().join(name)
    }

    async fn git_folder(&self) -> FolderRef {
        let project = self
            .workspace
            .project_of(&[self.workspace.repo.path()])
            .await;
        folder_ref(&project, 0)
    }

    async fn execute(
        &self,
        folder: &FolderRef,
        target: AnalysisTarget,
        scenario: &FakeScenario,
        cancel: &CancellationToken,
    ) -> Result<SnapshotId, JobFailure> {
        let scenario_file = write_scenario(self.scenario_dir.path(), scenario);
        let variable = (
            OsString::from(SCENARIO_VARIABLE),
            scenario_file.into_os_string(),
        );
        let runner = ProcessRunner::new(hardened_env(std::env::vars_os().chain([variable]), &[]));
        let git = GitService::new(&self.workspace.git, self.workspace.repo.data_dir());
        let service = AnalysisService::new(
            AnalysisDeps {
                snapshots: self.workspace.snapshots(),
                git: &git,
                runner: &runner,
                hosting: &NoHostingCli,
            },
            config(),
        );
        let job = JobRequest {
            id: JobId::try_from(JOB).expect("a valid job id"),
            folder: folder.clone(),
            target,
            force: false,
        };
        let hooks = RunHooks {
            on_progress: Box::new(|_| {}),
        };
        service.execute(&job, &hooks, cancel).await
    }

    fn record(&self, folder: &FolderRef, id: &SnapshotId) -> SnapshotRecord {
        self.workspace
            .snapshots()
            .read(&SnapshotRef {
                project_id: folder.project_id.clone(),
                folder_id: folder.folder_id.clone(),
                snapshot_id: id.clone(),
            })
            .expect("the record is readable")
    }

    fn entries(&self, folder: &FolderRef) -> Vec<String> {
        let folder_dir = self.workspace.snapshots_dir(folder);
        if folder_dir.exists() {
            names_in(&folder_dir)
        } else {
            Vec::new()
        }
    }

    fn snapshot_files(&self, folder: &FolderRef, id: &SnapshotId) -> Vec<String> {
        names_in(&self.workspace.snapshots_dir(folder).join(id.as_str()))
    }
}

fn names_in(dir: &Path) -> Vec<String> {
    let mut names: Vec<String> = fs::read_dir(dir)
        .expect("the folder is readable")
        .map(|entry| {
            let entry = entry.expect("the entry is readable");
            entry.file_name().to_string_lossy().into_owned()
        })
        .collect();
    names.sort();
    names
}

fn commit_target(sha: &str) -> AnalysisTarget {
    AnalysisTarget::Commit {
        sha: CommitSha::try_from(sha).expect("a full sha"),
    }
}

fn failed_code(result: Result<SnapshotId, JobFailure>) -> AnalysisErrorCode {
    match result {
        Err(JobFailure::Failed(error)) => error.code,
        other => panic!("expected a failure, got {other:?}"),
    }
}

async fn wait_for_file(file: &Path) {
    while !file.exists() {
        tokio::time::sleep(POLL).await;
    }
}

#[tokio::test]
async fn should_produce_a_complete_commit_snapshot() {
    // Arrange
    let bench = Bench::new();
    bench
        .workspace
        .repo
        .add_remote("origin", "https://user:token@github.com/owner/repo.git");
    let folder = bench.git_folder().await;
    let head = bench.head();

    // Act
    let id = bench
        .execute(
            &folder,
            commit_target(&head),
            &FakeScenario::writing_map(),
            &CancellationToken::new(),
        )
        .await
        .expect("the analysis succeeds");

    // Assert
    let record = bench.record(&folder, &id);
    let analysis = record.analysis.as_ref().expect("an analysis block");
    assert!(id.as_str().starts_with(&format!("{head}-")));
    assert_eq!(id.as_str(), format!("{head}-{}", analysis.profile_hash));
    assert_eq!(record.source, SnapshotSource::Analysed);
    let git = record.git.as_ref().expect("a git block");
    assert_eq!(git.commit.as_str(), head);
    assert!(git.tree.is_some());
    assert!(!git.dirty);
    assert_eq!(git.remotes[0].url, "https://github.com/owner/repo.git");
    let hosting = record.hosting.as_ref().expect("a hosting block");
    assert_eq!(hosting.provider, HostingProvider::Github);
    assert_eq!(hosting.repository, "owner/repo");
    assert!(hosting.pull_requests.is_empty());
    assert_eq!(analysis.exit_code, 0);
    assert_eq!(analysis.ccsh_version, "2.4.0");
    assert_eq!(analysis.java_version.as_deref(), Some("25"));
    assert_eq!(analysis.target, Some(TargetKind::Commit));
    assert_eq!(record.map.checksum.as_deref(), Some(FAKE_MAP_CHECKSUM));
    assert_eq!(record.map.root_name.as_deref(), Some("root"));
    assert!(record.map.bytes > 0);
    assert_eq!(
        bench.snapshot_files(&folder, &id),
        ["map.cc.json.gz", "run.log", "snapshot.json"]
    );
}

#[tokio::test]
async fn should_produce_a_dirty_working_tree_snapshot_bound_to_head() {
    // Arrange
    let bench = Bench::new();
    let folder = bench.git_folder().await;
    bench.workspace.repo.write_file("untracked.txt", "new");

    // Act
    let id = bench
        .execute(
            &folder,
            AnalysisTarget::WorkingTree,
            &FakeScenario::writing_map(),
            &CancellationToken::new(),
        )
        .await
        .expect("the analysis succeeds");

    // Assert
    let record = bench.record(&folder, &id);
    assert!(id.as_str().starts_with("worktree-"), "{id}");
    let git = record.git.expect("a git block");
    assert_eq!(git.commit.as_str(), bench.head());
    assert!(git.dirty);
    let analysis = record.analysis.expect("an analysis block");
    assert_eq!(analysis.target, Some(TargetKind::WorkingTree));
}

#[tokio::test]
async fn should_produce_a_snapshot_with_git_null_for_a_plain_folder() {
    // Arrange
    let bench = Bench::new();
    let plain = tempfile::tempdir().expect("a plain folder");
    fs::write(plain.path().join("a.txt"), "a").expect("a file is written");
    let project = bench.workspace.project_of(&[plain.path()]).await;
    let folder = folder_ref(&project, 0);

    // Act
    let id = bench
        .execute(
            &folder,
            AnalysisTarget::WorkingTree,
            &FakeScenario::writing_map(),
            &CancellationToken::new(),
        )
        .await
        .expect("the analysis succeeds");

    // Assert
    let record = bench.record(&folder, &id);
    assert!(id.as_str().starts_with("worktree-"), "{id}");
    assert_eq!(record.git, None);
    assert_eq!(record.hosting, None);
    assert_eq!(record.map.root_name.as_deref(), Some("root"));
}

#[tokio::test]
async fn should_fail_with_head_moved_when_head_changes_during_the_run() {
    // Arrange
    let bench = Bench::new();
    let folder = bench.git_folder().await;
    let pid_file = bench.file("pid");
    let release = bench.file("release");
    let scenario = FakeScenario {
        pid_file: Some(pid_file.clone()),
        wait_for_file: Some(release.clone()),
        ..FakeScenario::writing_map()
    };
    let move_head = async {
        wait_for_file(&pid_file).await;
        bench.workspace.repo.commit_file("b.txt", "b", "Moved");
        fs::write(&release, "go").expect("the release file is written");
    };
    let cancel = CancellationToken::new();

    // Act
    let (result, ()) = tokio::join!(
        bench.execute(&folder, AnalysisTarget::WorkingTree, &scenario, &cancel),
        move_head
    );

    // Assert
    assert_eq!(failed_code(result), AnalysisErrorCode::HeadMoved);
    assert_eq!(bench.entries(&folder), [format!(".failed-{JOB}")]);
}

#[tokio::test]
async fn should_leave_no_temp_folder_after_success_failure_or_cancel() {
    // Arrange
    let bench = Bench::new();
    let folder = bench.git_folder().await;
    let head = bench.head();
    let pid_file = bench.file("pid");
    let hanging = FakeScenario {
        hang: true,
        pid_file: Some(pid_file.clone()),
        ..FakeScenario::default()
    };
    let failing = FakeScenario {
        exit_code: 1,
        ..FakeScenario::default()
    };
    let cancel = CancellationToken::new();
    let cancel_when_started = async {
        wait_for_file(&pid_file).await;
        read_pid_file(&pid_file);
        cancel.cancel();
    };

    // Act
    let (cancelled, ()) = tokio::join!(
        bench.execute(&folder, commit_target(&head), &hanging, &cancel),
        cancel_when_started
    );
    let after_cancel = bench.entries(&folder);
    let failed = bench
        .execute(
            &folder,
            AnalysisTarget::WorkingTree,
            &failing,
            &CancellationToken::new(),
        )
        .await;
    let succeeded = bench
        .execute(
            &folder,
            commit_target(&head),
            &FakeScenario::writing_map(),
            &CancellationToken::new(),
        )
        .await
        .expect("the analysis succeeds");

    // Assert
    assert!(
        matches!(cancelled, Err(JobFailure::Cancelled)),
        "{cancelled:?}"
    );
    assert!(after_cancel.is_empty(), "{after_cancel:?}");
    assert_eq!(failed_code(failed), AnalysisErrorCode::AnalysisFailed);
    assert_eq!(
        bench.entries(&folder),
        [format!(".failed-{JOB}"), succeeded.to_string()]
    );
    let worktrees = bench
        .workspace
        .repo
        .git(&["worktree", "list", "--porcelain"]);
    assert_eq!(worktrees.matches("worktree ").count(), 1, "{worktrees}");
}

#[tokio::test]
async fn should_keep_the_log_of_a_failed_run() {
    // Arrange
    let bench = Bench::new();
    let folder = bench.git_folder().await;
    let scenario = FakeScenario {
        stdout: vec!["ccsh analyse failed: boom".to_string()],
        exit_code: 1,
        ..FakeScenario::default()
    };

    // Act
    let result = bench
        .execute(
            &folder,
            AnalysisTarget::WorkingTree,
            &scenario,
            &CancellationToken::new(),
        )
        .await;

    // Assert
    match result {
        Err(JobFailure::Failed(error)) => assert!(error.message.contains("boom"), "{error:?}"),
        other => panic!("expected a failure, got {other:?}"),
    }
    let failed_dir = bench
        .workspace
        .snapshots_dir(&folder)
        .join(format!(".failed-{JOB}"));
    assert_eq!(names_in(&failed_dir), ["run.log"]);
    let log = bench
        .workspace
        .snapshots()
        .read_failed_log(&folder, &JobId::try_from(JOB).unwrap())
        .expect("the log is readable");
    assert!(log.contains("ccsh analyse failed: boom"), "{log}");
}

#[tokio::test]
async fn should_reuse_a_map_for_an_identical_tree_when_git_is_left_out() {
    // Arrange
    let bench = Bench::new();
    let folder = bench.git_folder().await;
    bench
        .workspace
        .projects()
        .update(UpdateProjectParams {
            project_id: folder.project_id.clone(),
            name: None,
            description: None,
            analysis_profile: Some(AnalysisProfile {
                without: vec![AnalyserName::Git],
                ..AnalysisProfile::default()
            }),
        })
        .await
        .expect("the profile is updated");
    let first = bench.head();
    let first_id = bench
        .execute(
            &folder,
            commit_target(&first),
            &FakeScenario::writing_map(),
            &CancellationToken::new(),
        )
        .await
        .expect("the first analysis succeeds");
    let second = bench.workspace.repo.commit("Same tree", &[]);
    let would_fail = FakeScenario {
        exit_code: 1,
        ..FakeScenario::default()
    };

    // Act
    let second_id = bench
        .execute(
            &folder,
            commit_target(&second),
            &would_fail,
            &CancellationToken::new(),
        )
        .await
        .expect("the map is reused without running ccsh");

    // Assert
    let record = bench.record(&folder, &second_id);
    assert_eq!(record.git.expect("a git block").commit.as_str(), second);
    let analysis = record.analysis.expect("an analysis block");
    assert_eq!(analysis.reused_from.as_ref(), Some(&first_id));
    assert_eq!(record.map.checksum.as_deref(), Some(FAKE_MAP_CHECKSUM));
    let first_map = bench
        .workspace
        .snapshots_dir(&folder)
        .join(first_id.as_str());
    let second_map = bench
        .workspace
        .snapshots_dir(&folder)
        .join(second_id.as_str());
    assert_eq!(
        fs::read(first_map.join("map.cc.json.gz")).unwrap(),
        fs::read(second_map.join("map.cc.json.gz")).unwrap()
    );
}

#[tokio::test]
async fn should_mark_a_running_commit_analysis_for_the_recovery() {
    // Arrange
    let bench = Bench::new();
    let folder = bench.git_folder().await;
    let head = bench.head();
    let pid_file = bench.file("pid");
    let release = bench.file("release");
    let scenario = FakeScenario {
        pid_file: Some(pid_file.clone()),
        wait_for_file: Some(release.clone()),
        ..FakeScenario::writing_map()
    };
    let read_marker = async {
        wait_for_file(&pid_file).await;
        let staging = bench
            .entries(&folder)
            .into_iter()
            .find(|name| name.starts_with(".incoming-"))
            .expect("the run has a staging folder");
        let staging_dir = bench.workspace.snapshots_dir(&folder).join(staging);
        let job: serde_json::Value = serde_json::from_slice(
            &fs::read(staging_dir.join("job.json")).expect("the job file is written"),
        )
        .expect("the job file is JSON");
        fs::write(&release, "go").expect("the release file is written");
        job
    };
    let cancel = CancellationToken::new();

    // Act
    let (result, job) = tokio::join!(
        bench.execute(&folder, commit_target(&head), &scenario, &cancel),
        read_marker
    );

    // Assert
    let id = result.expect("the analysis succeeds");
    assert_eq!(job["sha"], serde_json::json!(head));
    assert_eq!(
        job["repositoryPath"],
        serde_json::json!(bench.workspace.repo.path())
    );
    assert_eq!(job["pid"], serde_json::json!(std::process::id()));
    assert_eq!(
        bench.snapshot_files(&folder, &id),
        ["map.cc.json.gz", "run.log", "snapshot.json"]
    );
}
