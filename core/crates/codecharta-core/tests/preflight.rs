mod support;

use std::collections::BTreeMap;
use std::io;
use std::path::{Path, PathBuf};

use codecharta_core::analysis::preflight::{
    DiskPlaces, DiskSpace, PreflightContext, PreflightSubject, run_preflight,
};
use codecharta_core::git::{GitFolder, GitService};
use codecharta_core_api::methods::analysis::{
    AnalysisErrorCode, AnalysisTarget, PreflightResult, ProblemCode, Severity, WarningCode,
};
use codecharta_core_api::methods::projects::{AnalysisProfile, FolderKind};
use codecharta_core_api::methods::tools::{ToolId, ToolState, ToolStatus, ToolsReport};
use codecharta_core_api::values::{CommitSha, ExcludePattern};

use support::TempRepo;

const MIB: u64 = 1024 * 1024;
const PLENTY: u64 = 100 * 1024 * MIB;
const UNKNOWN_SHA: &str = "0123456789abcdef0123456789abcdef01234567";

/// Free space per folder; a folder that is not listed has plenty.
#[derive(Default)]
struct StubDiskSpace {
    available: BTreeMap<PathBuf, u64>,
}

impl StubDiskSpace {
    fn with(folder: &Path, bytes: u64) -> Self {
        Self {
            available: BTreeMap::from([(folder.to_path_buf(), bytes)]),
        }
    }
}

impl DiskSpace for StubDiskSpace {
    fn available(&self, path: &Path) -> io::Result<u64> {
        Ok(self.available.get(path).copied().unwrap_or(PLENTY))
    }
}

fn status(tool: ToolId, state: ToolState) -> ToolStatus {
    ToolStatus {
        tool,
        is_required: true,
        state,
        path: None,
        source: None,
        version: None,
        minimum_version: None,
        problem: None,
    }
}

fn report_of(tools: Vec<ToolStatus>) -> ToolsReport {
    ToolsReport {
        checked_at: "2026-11-19T00:00:00Z".to_string(),
        tools,
        can_use_git: true,
        can_analyse: true,
    }
}

const REQUIRED_TOOLS: [ToolId; 3] = [ToolId::Git, ToolId::Ccsh, ToolId::Java];

fn tools_with(tool: ToolId, state: ToolState) -> ToolsReport {
    let state_of = |id: ToolId| if id == tool { state } else { ToolState::Ok };
    report_of(
        REQUIRED_TOOLS
            .into_iter()
            .map(|id| status(id, state_of(id)))
            .collect(),
    )
}

fn healthy_tools() -> ToolsReport {
    report_of(
        REQUIRED_TOOLS
            .into_iter()
            .map(|id| status(id, ToolState::Ok))
            .collect(),
    )
}

struct Bench {
    repo: TempRepo,
    places: DiskPlaces,
    head: CommitSha,
    _store: tempfile::TempDir,
    _temp: tempfile::TempDir,
}

impl Bench {
    fn new() -> Self {
        let repo = TempRepo::new();
        let head = repo.commit_file("a.txt", "a", "Add a");
        let store = tempfile::tempdir().expect("a store folder");
        let temp = tempfile::tempdir().expect("a temp folder");
        Self {
            places: DiskPlaces {
                store: store.path().to_path_buf(),
                temp: temp.path().to_path_buf(),
            },
            head: CommitSha::try_from(head.as_str()).expect("a commit sha"),
            repo,
            _store: store,
            _temp: temp,
        }
    }

    fn commit_target(&self) -> AnalysisTarget {
        AnalysisTarget::Commit {
            sha: self.head.clone(),
        }
    }

    async fn check(&self, case: Case<'_>) -> PreflightResult {
        let runner = self.repo.runner();
        let git = GitService::new(&runner, self.repo.data_dir());
        let folder = GitFolder::at(case.folder.unwrap_or(self.repo.path()));
        let context = PreflightContext {
            tools: &case.tools,
            git: &git,
            disk: &case.disk,
            places: &self.places,
        };
        let subject = PreflightSubject {
            folder: &folder,
            kind: case.kind,
            profile: &case.profile,
            target: &case.target,
            largest_snapshot_bytes: case.largest_snapshot_bytes,
        };
        run_preflight(&context, &subject).await
    }
}

struct Case<'case> {
    tools: ToolsReport,
    disk: StubDiskSpace,
    folder: Option<&'case Path>,
    kind: FolderKind,
    profile: AnalysisProfile,
    target: AnalysisTarget,
    largest_snapshot_bytes: u64,
}

impl Case<'_> {
    fn of(target: AnalysisTarget) -> Self {
        Self {
            tools: healthy_tools(),
            disk: StubDiskSpace::default(),
            folder: None,
            kind: FolderKind::Git,
            profile: AnalysisProfile::default(),
            target,
            largest_snapshot_bytes: 0,
        }
    }
}

fn codes(result: &PreflightResult) -> Vec<(ProblemCode, Severity)> {
    result
        .problems
        .iter()
        .map(|problem| (problem.code, problem.severity))
        .collect()
}

fn error(code: AnalysisErrorCode) -> (ProblemCode, Severity) {
    (ProblemCode::Error(code), Severity::Error)
}

fn warning(code: WarningCode) -> (ProblemCode, Severity) {
    (ProblemCode::Warning(code), Severity::Warning)
}

#[tokio::test]
async fn should_pass_a_commit_of_a_healthy_repository() {
    // Arrange
    let bench = Bench::new();

    // Act
    let result = bench.check(Case::of(bench.commit_target())).await;

    // Assert
    assert!(result.ok, "{result:?}");
    assert!(result.problems.is_empty(), "{result:?}");
}

#[tokio::test]
async fn should_report_a_missing_ccsh() {
    // Arrange
    let bench = Bench::new();
    let case = Case {
        tools: tools_with(ToolId::Ccsh, ToolState::Missing),
        ..Case::of(AnalysisTarget::WorkingTree)
    };

    // Act
    let result = bench.check(case).await;

    // Assert
    assert!(!result.ok);
    assert_eq!(codes(&result), [error(AnalysisErrorCode::CcshNotFound)]);
    assert!(result.problems[0].hint.is_some());
}

#[tokio::test]
async fn should_report_a_too_old_ccsh() {
    // Arrange
    let bench = Bench::new();
    let case = Case {
        tools: tools_with(ToolId::Ccsh, ToolState::TooOld),
        ..Case::of(AnalysisTarget::WorkingTree)
    };

    // Act
    let result = bench.check(case).await;

    // Assert
    assert_eq!(codes(&result), [error(AnalysisErrorCode::CcshTooOld)]);
}

#[tokio::test]
async fn should_report_a_missing_java() {
    // Arrange
    let bench = Bench::new();
    let case = Case {
        tools: tools_with(ToolId::Java, ToolState::Failed),
        ..Case::of(AnalysisTarget::WorkingTree)
    };

    // Act
    let result = bench.check(case).await;

    // Assert
    assert_eq!(codes(&result), [error(AnalysisErrorCode::JavaNotFound)]);
}

#[tokio::test]
async fn should_report_a_too_old_java() {
    // Arrange
    let bench = Bench::new();
    let case = Case {
        tools: tools_with(ToolId::Java, ToolState::TooOld),
        ..Case::of(AnalysisTarget::WorkingTree)
    };

    // Act
    let result = bench.check(case).await;

    // Assert
    assert_eq!(codes(&result), [error(AnalysisErrorCode::JavaTooOld)]);
}

#[tokio::test]
async fn should_report_a_missing_git_for_a_git_folder_only() {
    // Arrange
    let bench = Bench::new();
    let plain = tempfile::tempdir().expect("a plain folder");
    let git_case = Case {
        tools: tools_with(ToolId::Git, ToolState::Missing),
        ..Case::of(bench.commit_target())
    };
    let plain_case = Case {
        tools: tools_with(ToolId::Git, ToolState::Missing),
        folder: Some(plain.path()),
        kind: FolderKind::Plain,
        ..Case::of(AnalysisTarget::WorkingTree)
    };

    // Act
    let git_result = bench.check(git_case).await;
    let plain_result = bench.check(plain_case).await;

    // Assert
    assert_eq!(codes(&git_result), [error(AnalysisErrorCode::GitNotFound)]);
    assert!(plain_result.ok, "{plain_result:?}");
}

#[tokio::test]
async fn should_report_a_missing_folder() {
    // Arrange
    let bench = Bench::new();
    let gone = bench.repo.path().join("gone");
    let case = Case {
        folder: Some(&gone),
        ..Case::of(bench.commit_target())
    };

    // Act
    let result = bench.check(case).await;

    // Assert
    assert_eq!(codes(&result), [error(AnalysisErrorCode::FolderMissing)]);
}

#[tokio::test]
async fn should_report_a_folder_that_is_not_a_repository_for_a_commit() {
    // Arrange
    let bench = Bench::new();
    let plain = tempfile::tempdir().expect("a plain folder");
    let case = Case {
        folder: Some(plain.path()),
        ..Case::of(bench.commit_target())
    };

    // Act
    let result = bench.check(case).await;

    // Assert
    assert_eq!(codes(&result), [error(AnalysisErrorCode::NotARepository)]);
}

#[tokio::test]
async fn should_report_an_unknown_commit() {
    // Arrange
    let bench = Bench::new();
    let target = AnalysisTarget::Commit {
        sha: CommitSha::try_from(UNKNOWN_SHA).expect("a commit sha"),
    };

    // Act
    let result = bench.check(Case::of(target)).await;

    // Assert
    assert_eq!(codes(&result), [error(AnalysisErrorCode::UnknownCommit)]);
}

#[tokio::test]
async fn should_report_an_invalid_profile() {
    // Arrange
    let bench = Bench::new();
    let profile = AnalysisProfile {
        exclude: vec![ExcludePattern::try_from("build,dist").expect("a pattern")],
        ..AnalysisProfile::default()
    };
    let case = Case {
        profile,
        ..Case::of(AnalysisTarget::WorkingTree)
    };

    // Act
    let result = bench.check(case).await;

    // Assert
    assert_eq!(codes(&result), [error(AnalysisErrorCode::InvalidProfile)]);
}

#[tokio::test]
async fn should_warn_when_the_folder_is_not_the_repository_root() {
    // Arrange
    let bench = Bench::new();
    let subfolder = bench.repo.subfolder("app");
    let case = Case {
        folder: Some(&subfolder),
        ..Case::of(bench.commit_target())
    };

    // Act
    let result = bench.check(case).await;

    // Assert
    assert!(result.ok);
    assert_eq!(codes(&result), [warning(WarningCode::NotRepoRoot)]);
}

#[tokio::test]
async fn should_warn_about_a_shallow_clone() {
    // Arrange
    let bench = Bench::new();
    bench.repo.commit_file("b.txt", "b", "Add b");
    let shallow = bench.repo.clone_shallow();
    let case = Case {
        folder: Some(shallow.path()),
        ..Case::of(AnalysisTarget::WorkingTree)
    };

    // Act
    let result = bench.check(case).await;

    // Assert
    assert!(result.ok);
    assert_eq!(codes(&result), [warning(WarningCode::ShallowClone)]);
}

#[tokio::test]
async fn should_report_a_full_store_disk_against_the_largest_snapshot() {
    // Arrange
    let bench = Bench::new();
    let above_minimum = 250 * MIB;
    let roomy_for_small_maps = Case {
        disk: StubDiskSpace::with(&bench.places.store, above_minimum),
        largest_snapshot_bytes: MIB,
        ..Case::of(AnalysisTarget::WorkingTree)
    };
    let tight_for_large_maps = Case {
        disk: StubDiskSpace::with(&bench.places.store, above_minimum),
        largest_snapshot_bytes: 100 * MIB,
        ..Case::of(AnalysisTarget::WorkingTree)
    };
    let below_minimum = Case {
        disk: StubDiskSpace::with(&bench.places.store, 150 * MIB),
        ..Case::of(AnalysisTarget::WorkingTree)
    };

    // Act
    let roomy = bench.check(roomy_for_small_maps).await;
    let tight = bench.check(tight_for_large_maps).await;
    let below = bench.check(below_minimum).await;

    // Assert
    assert!(roomy.ok, "{roomy:?}");
    assert_eq!(codes(&tight), [error(AnalysisErrorCode::DiskFull)]);
    assert_eq!(codes(&below), [error(AnalysisErrorCode::DiskFull)]);
}

#[tokio::test]
async fn should_warn_about_little_temp_space_for_a_commit_only() {
    // Arrange
    let bench = Bench::new();
    let commit_case = Case {
        disk: StubDiskSpace::with(&bench.places.temp, 512 * MIB),
        ..Case::of(bench.commit_target())
    };
    let working_tree_case = Case {
        disk: StubDiskSpace::with(&bench.places.temp, 512 * MIB),
        ..Case::of(AnalysisTarget::WorkingTree)
    };

    // Act
    let commit = bench.check(commit_case).await;
    let working_tree = bench.check(working_tree_case).await;

    // Assert
    assert!(commit.ok);
    assert_eq!(codes(&commit), [warning(WarningCode::LowDiskSpace)]);
    assert!(working_tree.problems.is_empty(), "{working_tree:?}");
}
