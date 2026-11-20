mod support;

use codecharta_core::compare::{
    CommitComparison, SideFolders, SideLookup, SizeLimits, SnapshotSideFolders, side_status,
};
use codecharta_core::git::{GitFolder, GitService};
use codecharta_core::snapshots::nearest::{
    ResolutionCache, ResolutionFolder, ResolutionRequest, resolve_snapshot,
};
use codecharta_core::{CoreError, CoreResult};
use codecharta_core_api::error::ErrorCode;
use codecharta_core_api::ids::{FolderId, ProjectId, SnapshotId};
use codecharta_core_api::methods::analysis::{AnalysisTarget, TargetKind};
use codecharta_core_api::methods::compare::{
    BaseMode, CompareIntent, ComparisonOrigin, RefInput, RefLabel, RefLabelKind,
    ResolveComparisonParams, ResolveStatus, ResolvedComparison, SideInput, SideKind, SideStatus,
};
use codecharta_core_api::methods::projects::FolderRef;
use codecharta_core_api::methods::snapshots::{SnapshotRef, SnapshotSource, SnapshotSummary};
use codecharta_core_api::values::{CommitSha, FullCommit, TypedRevision};
use tokio_util::sync::CancellationToken;

use support::TempRepo;

/// Two clones of one repository, as folders `f-1` (the repository) and `f-2` (the fork); the snapshots are
/// only the working-tree and imported ones a test names, so a commit side is never analysed.
struct TwoFolders<'test> {
    git: &'test GitService<'test>,
    base: GitFolder,
    head: GitFolder,
    snapshots: Vec<SnapshotSummary>,
}

impl SideLookup for TwoFolders<'_> {
    async fn status_of(
        &self,
        folder: &FolderRef,
        commit: &CommitSha,
        cancel: &CancellationToken,
    ) -> CoreResult<SideStatus> {
        let clone = if *folder == folder_ref("f-1") {
            &self.base
        } else {
            &self.head
        };
        let target = AnalysisTarget::Commit {
            sha: commit.clone(),
        };
        let request = ResolutionRequest {
            folder: ResolutionFolder::Git(clone),
            target: &target,
            snapshots: &[],
            current_profile_hash: None,
        };
        resolve_snapshot(self.git, &ResolutionCache::default(), &request, cancel)
            .await
            .map(side_status)
    }

    fn snapshot(&self, snapshot: &SnapshotRef) -> CoreResult<SnapshotSummary> {
        self.snapshots
            .iter()
            .find(|candidate| candidate.snapshot_ref == *snapshot)
            .cloned()
            .ok_or_else(|| CoreError::NotFound(snapshot.snapshot_id.to_string()))
    }
}

fn folder_ref(folder_id: &str) -> FolderRef {
    FolderRef {
        project_id: ProjectId::try_from("p-1").expect("a project id"),
        folder_id: FolderId::try_from(folder_id).expect("a folder id"),
    }
}

fn across(base: &str, head: &str, base_mode: BaseMode) -> ResolveComparisonParams {
    let side = |folder_id: &str, name: &str| SideInput {
        folder: folder_ref(folder_id),
        rev: RefInput::Rev {
            name: TypedRevision::try_from(name).expect("a typed revision"),
        },
    };
    ResolveComparisonParams {
        intent: CompareIntent::Explicit {
            base: side("f-1", base),
            head: side("f-2", head),
            base_mode,
        },
        shown_commit: None,
    }
}

async fn resolve_across(
    repo: &TempRepo,
    fork: &TempRepo,
    params: &ResolveComparisonParams,
) -> ResolvedComparison {
    let process = repo.runner();
    let git = GitService::new(&process, repo.data_dir());
    let sides = TwoFolders {
        git: &git,
        base: GitFolder::at(repo.path()),
        head: GitFolder::at(fork.path()),
        snapshots: Vec::new(),
    };
    let comparison = CommitComparison {
        git: &git,
        sides: &sides,
        limits: SizeLimits::default(),
        default_branch: None,
    };
    let folders = SideFolders {
        base: &sides.base,
        head: &sides.head,
    };
    comparison
        .resolve_across(&folders, params, &CancellationToken::new())
        .await
        .expect("the comparison resolves")
}

fn commits_of(comparison: &ResolvedComparison) -> (String, String) {
    let commit_of =
        |commit: &Option<CommitSha>| commit.as_ref().map(ToString::to_string).unwrap_or_default();
    (
        commit_of(&comparison.base.requested.commit),
        commit_of(&comparison.head.requested.commit),
    )
}

fn pair(base: &str, head: &str) -> (String, String) {
    (base.trim().to_string(), head.trim().to_string())
}

#[tokio::test]
async fn should_compare_the_same_commit_of_two_folders() {
    // Arrange
    let repo = TempRepo::new();
    let commit = repo.commit_file("a.txt", "1", "Only");
    let fork = repo.clone_full();

    // Act
    let comparison =
        resolve_across(&repo, &fork, &across("main", "main", BaseMode::MergeBase)).await;

    // Assert
    assert_eq!(comparison.status, ResolveStatus::Ready);
    assert_eq!(comparison.origin, ComparisonOrigin::Folders);
    assert_eq!(commits_of(&comparison), pair(&commit, &commit));
    assert_eq!(comparison.base.requested.folder, folder_ref("f-1"));
    assert_eq!(comparison.head.requested.folder, folder_ref("f-2"));
}

#[tokio::test]
async fn should_fall_back_to_tip_when_no_clone_has_both_commits() {
    // Arrange
    let repo = TempRepo::new();
    repo.commit_file("a.txt", "1", "Shared");
    let fork = repo.clone_full();
    let upstream = repo.commit_file("a.txt", "2", "Upstream");
    let forked = fork.commit_file("b.txt", "1", "Fork");

    // Act
    let comparison =
        resolve_across(&repo, &fork, &across("main", "main", BaseMode::MergeBase)).await;

    // Assert
    assert_eq!(comparison.status, ResolveStatus::Ready);
    assert_eq!(comparison.base_mode, BaseMode::Tip);
    assert_eq!(comparison.base_tip, None);
    assert_eq!(commits_of(&comparison), pair(&upstream, &forked));
}

#[tokio::test]
async fn should_take_the_merge_base_from_the_clone_that_has_both_commits() {
    // Arrange
    let repo = TempRepo::new();
    let shared = repo.commit_file("a.txt", "1", "Shared");
    let fork = repo.clone_full();
    let upstream = repo.commit_file("a.txt", "2", "Upstream");
    let forked = fork.commit_file("b.txt", "1", "Fork");
    fork.git(&["fetch", "--quiet", "origin"]);

    // Act
    let comparison =
        resolve_across(&repo, &fork, &across("main", "main", BaseMode::MergeBase)).await;

    // Assert
    assert_eq!(comparison.status, ResolveStatus::Ready);
    assert_eq!(comparison.base_mode, BaseMode::MergeBase);
    assert_eq!(commits_of(&comparison), pair(&shared, &forked));
    assert_eq!(comparison.base.requested.folder, folder_ref("f-2"));
    let tip = comparison.base_tip.expect("the base tip");
    assert_eq!(tip.commit.expect("a commit").as_str(), upstream.trim());
    assert_eq!(tip.folder, folder_ref("f-1"));
}

#[tokio::test]
async fn should_compare_the_tips_of_two_folders_in_tip_mode() {
    // Arrange
    let repo = TempRepo::new();
    let older = repo.commit_file("a.txt", "1", "Shared");
    let fork = repo.clone_full();
    let forked = fork.commit_file("b.txt", "1", "Fork");

    // Act
    let comparison = resolve_across(&repo, &fork, &across("main", "main", BaseMode::Tip)).await;

    // Assert
    assert_eq!(comparison.status, ResolveStatus::Ready);
    assert_eq!(comparison.base_mode, BaseMode::Tip);
    assert_eq!(commits_of(&comparison), pair(&older, &forked));
    assert_eq!(comparison.base.requested.folder, folder_ref("f-1"));
}

const WORKING_TREE_ID: &str = "s-working-tree";
const IMPORTED_ID: &str = "s-imported";

/// A snapshot of folder `f-1` without a commit to compare: the working tree analysed on top of `head`, or
/// an imported map.
fn snapshot_of(snapshot_id: &str, source: SnapshotSource, head: Option<&str>) -> SnapshotSummary {
    let folder = folder_ref("f-1");
    let is_imported = source == SnapshotSource::Imported;
    SnapshotSummary {
        snapshot_ref: SnapshotRef {
            project_id: folder.project_id,
            folder_id: folder.folder_id,
            snapshot_id: SnapshotId::try_from(snapshot_id).expect("a snapshot id"),
        },
        source,
        created_at: "2026-11-19T00:00:00Z".to_string(),
        commit: head.map(|head| FullCommit::try_from(head.trim()).expect("a full commit")),
        short_commit: None,
        subject: None,
        commit_date: None,
        dirty: !is_imported,
        original_file_name: is_imported.then(|| "export.cc.json".to_string()),
        file_modified_at: None,
        map_bytes: 10,
        checksum: Some(format!("checksum-{snapshot_id}")),
        profile_hash: None,
        target: (!is_imported).then_some(TargetKind::WorkingTree),
        finished_at: None,
        duration_ms: None,
        not_in_map: Vec::new(),
    }
}

fn side_input(rev: RefInput) -> SideInput {
    SideInput {
        folder: folder_ref("f-1"),
        rev,
    }
}

fn commit_input(name: &str) -> RefInput {
    RefInput::Rev {
        name: TypedRevision::try_from(name).expect("a typed revision"),
    }
}

fn snapshot_id(text: &str) -> SnapshotId {
    SnapshotId::try_from(text).expect("a snapshot id")
}

fn working_tree_input() -> RefInput {
    RefInput::WorkingTree {
        snapshot_id: snapshot_id(WORKING_TREE_ID),
    }
}

async fn resolve_with_snapshots(
    repo: &TempRepo,
    base: RefInput,
    head: RefInput,
) -> CoreResult<ResolvedComparison> {
    let process = repo.runner();
    let git = GitService::new(&process, repo.data_dir());
    let head_commit = repo.git(&["rev-parse", "HEAD"]);
    let sides = TwoFolders {
        git: &git,
        base: GitFolder::at(repo.path()),
        head: GitFolder::at(repo.path()),
        snapshots: vec![
            snapshot_of(
                WORKING_TREE_ID,
                SnapshotSource::Analysed,
                Some(&head_commit),
            ),
            snapshot_of(IMPORTED_ID, SnapshotSource::Imported, None),
        ],
    };
    let comparison = CommitComparison {
        git: &git,
        sides: &sides,
        limits: SizeLimits::default(),
        default_branch: None,
    };
    let folders = SnapshotSideFolders {
        base: Some(&sides.base),
        head: None,
    };
    let params = ResolveComparisonParams {
        intent: CompareIntent::Explicit {
            base: side_input(base),
            head: side_input(head),
            base_mode: BaseMode::MergeBase,
        },
        shown_commit: None,
    };
    comparison
        .resolve_with_snapshots(&folders, &params, &CancellationToken::new())
        .await
}

#[tokio::test]
async fn should_compare_a_commit_snapshot_with_the_working_tree_snapshot() {
    // Arrange
    let repo = TempRepo::new();
    let commit = repo.commit_file("a.txt", "1", "Only");

    // Act
    let comparison = resolve_with_snapshots(&repo, commit_input("main"), working_tree_input())
        .await
        .expect("the comparison resolves");

    // Assert
    assert_eq!(comparison.status, ResolveStatus::Ready);
    assert_eq!(comparison.origin, ComparisonOrigin::Commits);
    assert_eq!(comparison.base.requested.kind, SideKind::Commit);
    assert_eq!(commits_of(&comparison), pair(&commit, ""));
    let head = &comparison.head;
    assert_eq!(head.requested.kind, SideKind::WorkingTree);
    assert_eq!(
        head.requested.snapshot_id,
        Some(snapshot_id(WORKING_TREE_ID))
    );
    assert_eq!(
        head.requested.label,
        RefLabel {
            kind: RefLabelKind::WorkingTree,
            name: "working tree".to_string(),
        }
    );
    assert!(matches!(head.status, SideStatus::Exact { ref snapshot }
        if snapshot.snapshot_ref.snapshot_id.as_str() == WORKING_TREE_ID));
}

#[tokio::test]
async fn should_compare_against_an_imported_snapshot() {
    // Arrange
    let repo = TempRepo::new();
    repo.commit_file("a.txt", "1", "Only");
    let imported = RefInput::Imported {
        snapshot_id: snapshot_id(IMPORTED_ID),
    };

    // Act
    let comparison = resolve_with_snapshots(&repo, commit_input("main"), imported)
        .await
        .expect("the comparison resolves");

    // Assert
    assert_eq!(comparison.status, ResolveStatus::Ready);
    assert_eq!(comparison.head.requested.kind, SideKind::Imported);
    assert_eq!(
        comparison.head.requested.label,
        RefLabel {
            kind: RefLabelKind::Imported,
            name: "export.cc.json".to_string(),
        }
    );
    assert!(!comparison.preflight.identical_checksums);
}

#[tokio::test]
async fn should_not_compute_a_merge_base_for_a_side_without_a_commit() {
    // Arrange
    let repo = TempRepo::new();
    repo.commit_file("a.txt", "1", "Only");

    // Act
    let comparison = resolve_with_snapshots(&repo, commit_input("main"), working_tree_input())
        .await
        .expect("the comparison resolves");

    // Assert
    assert_eq!(comparison.base_mode, BaseMode::Tip);
    assert_eq!(comparison.base_tip, None);
}

#[tokio::test]
async fn should_refuse_a_snapshot_of_another_kind_and_an_unknown_one() {
    // Arrange
    let repo = TempRepo::new();
    repo.commit_file("a.txt", "1", "Only");
    let not_imported = RefInput::Imported {
        snapshot_id: snapshot_id(WORKING_TREE_ID),
    };
    let unknown = RefInput::WorkingTree {
        snapshot_id: snapshot_id("s-unknown"),
    };

    // Act
    let wrong_kind = resolve_with_snapshots(&repo, commit_input("main"), not_imported).await;
    let missing = resolve_with_snapshots(&repo, commit_input("main"), unknown).await;

    // Assert
    assert_eq!(
        wrong_kind.expect_err("not an import").code(),
        ErrorCode::BadRequest
    );
    assert_eq!(
        missing.expect_err("no such snapshot").code(),
        ErrorCode::NotFound
    );
}

#[tokio::test]
async fn should_report_the_same_snapshot_on_both_sides() {
    // Arrange
    let repo = TempRepo::new();
    repo.commit_file("a.txt", "1", "Only");

    // Act
    let comparison = resolve_with_snapshots(&repo, working_tree_input(), working_tree_input())
        .await
        .expect("the comparison resolves");

    // Assert
    assert_eq!(comparison.status, ResolveStatus::SameCommit);
}
