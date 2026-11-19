mod support;

use codecharta_core::CoreResult;
use codecharta_core::compare::{CommitComparison, SideLookup, SizeLimits, side_status};
use codecharta_core::git::{GitFolder, GitService};
use codecharta_core::snapshots::nearest::{
    ResolutionCache, ResolutionFolder, ResolutionRequest, resolve_snapshot,
};
use codecharta_core_api::error::ErrorCode;
use codecharta_core_api::ids::{FolderId, ProjectId, SnapshotId};
use codecharta_core_api::methods::analysis::{AnalysisTarget, TargetKind};
use codecharta_core_api::methods::compare::{
    BaseMode, CompareIntent, ComparedCommit, RefLabel, RefLabelKind, ResolveComparisonParams,
    ResolveStatus, ResolvedComparison, SideStatus,
};
use codecharta_core_api::methods::projects::FolderRef;
use codecharta_core_api::methods::snapshots::{
    SnapshotRef, SnapshotRelation, SnapshotSource, SnapshotSummary,
};
use codecharta_core_api::values::{CommitSha, FullCommit, Revision};
use tokio_util::sync::CancellationToken;

use support::TempRepo;

const PROFILE: &str = "c0ffee00";
const FINISHED_AT: &str = "2026-11-19T00:00:00Z";
const SHORT_COMMIT_LENGTH: usize = 7;

/// Snapshots held in memory and resolved like the store's, so a test needs no store.
struct InMemorySides<'test> {
    git: &'test GitService<'test>,
    folder: GitFolder,
    snapshots: Vec<SnapshotSummary>,
}

impl SideLookup for InMemorySides<'_> {
    async fn status_of(
        &self,
        side: &ComparedCommit,
        cancel: &CancellationToken,
    ) -> CoreResult<SideStatus> {
        let target = AnalysisTarget::Commit {
            sha: side.commit.clone(),
        };
        let request = ResolutionRequest {
            folder: ResolutionFolder::Git(&self.folder),
            target: &target,
            snapshots: &self.snapshots,
            current_profile_hash: Some(PROFILE),
        };
        resolve_snapshot(self.git, &ResolutionCache::default(), &request, cancel)
            .await
            .map(side_status)
    }
}

fn folder_ref() -> FolderRef {
    FolderRef {
        project_id: ProjectId::try_from("p-1").expect("a project id"),
        folder_id: FolderId::try_from("f-1").expect("a folder id"),
    }
}

fn revision(text: &str) -> Revision {
    Revision::try_from(text.trim()).expect("a revision")
}

fn sha(text: &str) -> CommitSha {
    CommitSha::try_from(text.trim()).expect("a full sha")
}

fn commits(a: &str, b: &str) -> ResolveComparisonParams {
    ResolveComparisonParams {
        intent: CompareIntent::Commits {
            folder: folder_ref(),
            a: revision(a),
            b: revision(b),
        },
        shown_commit: None,
    }
}

fn with_parent(commit: &str) -> ResolveComparisonParams {
    ResolveComparisonParams {
        intent: CompareIntent::WithParent {
            folder: folder_ref(),
            commit: revision(commit),
        },
        shown_commit: None,
    }
}

fn with_current(commit: &str, shown: Option<&str>) -> ResolveComparisonParams {
    ResolveComparisonParams {
        intent: CompareIntent::WithCurrent {
            folder: folder_ref(),
            commit: revision(commit),
        },
        shown_commit: shown.map(sha),
    }
}

/// An analysed snapshot of `commit` with the current profile.
fn analysed(repo: &TempRepo, commit: &str) -> SnapshotSummary {
    let commit = commit.trim();
    SnapshotSummary {
        snapshot_ref: SnapshotRef {
            project_id: folder_ref().project_id,
            folder_id: folder_ref().folder_id,
            snapshot_id: SnapshotId::try_from(format!("{commit}-{PROFILE}"))
                .expect("a snapshot id"),
        },
        source: SnapshotSource::Analysed,
        created_at: FINISHED_AT.to_string(),
        commit: Some(FullCommit::try_from(commit).expect("a full commit")),
        short_commit: Some(commit[..SHORT_COMMIT_LENGTH].to_string()),
        subject: None,
        commit_date: Some(
            repo.git(&["show", "-s", "--format=%cI", commit])
                .trim()
                .to_string(),
        ),
        dirty: false,
        original_file_name: None,
        file_modified_at: None,
        map_bytes: 10,
        checksum: Some(format!("checksum{}", &commit[..SHORT_COMMIT_LENGTH])),
        profile_hash: Some(PROFILE.to_string()),
        target: Some(TargetKind::Commit),
        finished_at: Some(FINISHED_AT.to_string()),
        duration_ms: Some(1_000),
        not_in_map: Vec::new(),
    }
}

async fn resolve_with(
    repo: &TempRepo,
    params: &ResolveComparisonParams,
    snapshots: Vec<SnapshotSummary>,
) -> CoreResult<ResolvedComparison> {
    let process = repo.runner();
    let git = GitService::new(&process, repo.data_dir());
    let folder = GitFolder::at(repo.path());
    let sides = InMemorySides {
        git: &git,
        folder: folder.clone(),
        snapshots,
    };
    let comparison = CommitComparison {
        git: &git,
        sides: &sides,
        limits: SizeLimits::default(),
    };
    comparison
        .resolve(&folder, params, &CancellationToken::new())
        .await
}

async fn resolve(repo: &TempRepo, params: &ResolveComparisonParams) -> ResolvedComparison {
    resolve_with(repo, params, Vec::new())
        .await
        .expect("the comparison resolves")
}

fn base_and_head(comparison: &ResolvedComparison) -> (String, String) {
    (
        comparison.base.requested.commit.to_string(),
        comparison.head.requested.commit.to_string(),
    )
}

fn pair(base: &str, head: &str) -> (String, String) {
    (base.trim().to_string(), head.trim().to_string())
}

#[tokio::test]
async fn should_take_the_ancestor_as_base() {
    // Arrange
    let repo = TempRepo::new();
    let older = repo.commit_file("a.txt", "1", "First");
    let newer = repo.commit_file("a.txt", "2", "Second");

    // Act
    let comparison = resolve(&repo, &commits(&newer, &older)).await;
    let by_branch = resolve(&repo, &commits(&older, "refs/heads/main")).await;

    // Assert
    assert_eq!(comparison.status, ResolveStatus::Ready);
    assert_eq!(comparison.base_mode, BaseMode::Tip);
    assert_eq!(base_and_head(&comparison), pair(&older, &newer));
    assert_eq!(
        comparison.base.requested.label,
        RefLabel {
            kind: RefLabelKind::Commit,
            name: older.trim()[..SHORT_COMMIT_LENGTH].to_string(),
        }
    );
    assert_eq!(comparison.base.requested.folder, folder_ref());
    assert_eq!(base_and_head(&by_branch), pair(&older, &newer));
    assert_eq!(
        by_branch.head.requested.label,
        RefLabel {
            kind: RefLabelKind::Branch,
            name: "main".to_string(),
        }
    );
}

#[tokio::test]
async fn should_take_the_older_commit_as_base_when_diverged() {
    // Arrange
    let repo = TempRepo::new();
    repo.commit_file("a.txt", "1", "Start");
    repo.branch("side");
    let older = repo.commit_file("main.txt", "1", "On main");
    repo.checkout("side");
    let newer = repo.commit_file("side.txt", "1", "On side");

    // Act
    let comparison = resolve(&repo, &commits(&newer, &older)).await;
    let swapped = resolve(&repo, &commits(&older, &newer)).await;

    // Assert
    assert_eq!(comparison.status, ResolveStatus::Ready);
    assert_eq!(base_and_head(&comparison), pair(&older, &newer));
    assert_eq!(base_and_head(&swapped), pair(&older, &newer));
}

#[tokio::test]
async fn should_report_same_commit() {
    // Arrange
    let repo = TempRepo::new();
    let commit = repo.commit_file("a.txt", "1", "Only");

    // Act
    let comparison = resolve(&repo, &commits(&commit, "HEAD")).await;

    // Assert
    assert_eq!(comparison.status, ResolveStatus::SameCommit);
    assert_eq!(base_and_head(&comparison), pair(&commit, &commit));
}

#[tokio::test]
async fn should_refuse_the_parent_of_a_root_commit() {
    // Arrange
    let repo = TempRepo::new();
    let root = repo.commit_file("a.txt", "1", "Root");

    // Act
    let result = resolve_with(&repo, &with_parent(&root), Vec::new()).await;

    // Assert
    let error = result.expect_err("a root commit has no parent");
    assert_eq!(error.code(), ErrorCode::UnknownRevision);
}

#[tokio::test]
async fn should_compare_a_commit_with_its_first_parent() {
    // Arrange
    let repo = TempRepo::new();
    let parent = repo.commit_file("a.txt", "1", "Parent");
    let child = repo.commit_file("a.txt", "2", "Child");

    // Act
    let comparison = resolve(&repo, &with_parent(&child)).await;

    // Assert
    assert_eq!(comparison.status, ResolveStatus::Ready);
    assert_eq!(base_and_head(&comparison), pair(&parent, &child));
}

#[tokio::test]
async fn should_compare_with_the_shown_commit_else_head() {
    // Arrange
    let repo = TempRepo::new();
    let first = repo.commit_file("a.txt", "1", "First");
    let second = repo.commit_file("a.txt", "2", "Second");
    let head = repo.commit_file("a.txt", "3", "Third");

    // Act
    let with_shown = resolve(&repo, &with_current(&first, Some(&second))).await;
    let with_head = resolve(&repo, &with_current(&first, None)).await;

    // Assert
    assert_eq!(base_and_head(&with_shown), pair(&first, &second));
    assert_eq!(base_and_head(&with_head), pair(&first, &head));
}

#[tokio::test]
async fn should_report_stale_by_for_the_nearest_snapshot() {
    // Arrange
    let repo = TempRepo::new();
    let analysed_commit = repo.commit_file("a.txt", "1", "Analysed");
    repo.commit_file("a.txt", "2", "Not analysed");
    let head = repo.commit_file("a.txt", "3", "Not analysed either");
    let snapshot = analysed(&repo, &analysed_commit);

    // Act
    let comparison = resolve_with(
        &repo,
        &commits(&analysed_commit, &head),
        vec![snapshot.clone()],
    )
    .await
    .expect("the comparison resolves");

    // Assert
    assert_eq!(
        comparison.base.status,
        SideStatus::Exact {
            snapshot: snapshot.clone()
        }
    );
    let SideStatus::Missing {
        nearest: Some(nearest),
    } = &comparison.head.status
    else {
        panic!("the head has no snapshot: {:?}", comparison.head.status);
    };
    assert_eq!(nearest.snapshot, snapshot);
    assert_eq!(nearest.relation, SnapshotRelation::Ancestor);
    assert_eq!(nearest.stale_by, 2);
    assert!(comparison.preflight.identical_checksums);
    assert_eq!(comparison.preflight.combined_bytes, 20);
}

#[tokio::test]
async fn should_return_no_common_ancestor_for_unrelated_histories() {
    // Arrange
    let repo = TempRepo::new();
    let older = repo.commit_file("a.txt", "1", "One history");
    repo.git(&["checkout", "--quiet", "--orphan", "other"]);
    let newer = repo.commit_file("b.txt", "1", "Another history");

    // Act
    let comparison = resolve(&repo, &commits(&older, &newer)).await;

    // Assert
    assert_eq!(comparison.status, ResolveStatus::NoCommonAncestor);
    assert_eq!(base_and_head(&comparison), pair(&older, &newer));
    assert_eq!(
        comparison.base.status,
        SideStatus::Missing { nearest: None }
    );
}

#[tokio::test]
async fn should_refuse_a_revision_the_repository_does_not_have() {
    // Arrange
    let repo = TempRepo::new();
    let commit = repo.commit_file("a.txt", "1", "Only");

    // Act
    let result = resolve_with(&repo, &commits(&commit, "refs/heads/missing"), Vec::new()).await;

    // Assert
    let error = result.expect_err("the branch does not exist");
    assert_eq!(error.code(), ErrorCode::UnknownRevision);
}
