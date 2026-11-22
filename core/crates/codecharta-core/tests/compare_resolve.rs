mod support;

use codecharta_core::compare::{CommitComparison, SideLookup, SizeLimits, side_status};
use codecharta_core::git::{GitFolder, GitService};
use codecharta_core::snapshots::nearest::{
    ResolutionCache, ResolutionFolder, ResolutionRequest, resolve_snapshot,
};
use codecharta_core::{CoreError, CoreResult};
use codecharta_core_api::error::ErrorCode;
use codecharta_core_api::ids::{FolderId, ProjectId, SnapshotId};
use codecharta_core_api::methods::analysis::{AnalysisTarget, TargetKind};
use codecharta_core_api::methods::compare::{
    BaseMode, CompareIntent, ComparedCommit, ComparisonOrigin, RefInput, RefLabel, RefLabelKind,
    ResolveComparisonParams, ResolveStatus, ResolvedComparison, SideInput, SideStatus,
};
use codecharta_core_api::methods::hosting::HostingProvider;
use codecharta_core_api::methods::projects::FolderRef;
use codecharta_core_api::methods::snapshots::{
    SnapshotRef, SnapshotRelation, SnapshotSource, SnapshotSummary,
};
use codecharta_core_api::values::{BranchName, CommitSha, FullCommit, Revision, TypedRevision};
use tokio_util::sync::CancellationToken;

use support::TempRepo;

const PROFILE: &str = "c0ffee00";
const FINISHED_AT: &str = "2026-11-19T00:00:00Z";
const SHORT_COMMIT_LENGTH: usize = 7;
const DEFAULT_BRANCH: &str = "main";

/// Snapshots held in memory and resolved like the store's, so a test needs no store.
struct InMemorySides<'test> {
    git: &'test GitService<'test>,
    folder: GitFolder,
    snapshots: Vec<SnapshotSummary>,
}

impl SideLookup for InMemorySides<'_> {
    async fn status_of(
        &self,
        _folder: &FolderRef,
        commit: &CommitSha,
        cancel: &CancellationToken,
    ) -> CoreResult<SideStatus> {
        let target = AnalysisTarget::Commit {
            sha: commit.clone(),
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

    fn snapshot(&self, snapshot: &SnapshotRef) -> CoreResult<SnapshotSummary> {
        Err(CoreError::NotFound(snapshot.snapshot_id.to_string()))
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
        default_branch: Some(DEFAULT_BRANCH),
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
        commit_of(&comparison.base.requested),
        commit_of(&comparison.head.requested),
    )
}

fn commit_of(side: &ComparedCommit) -> String {
    side.commit
        .as_ref()
        .map(ToString::to_string)
        .expect("a commit side")
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
    assert_eq!((nearest.behind, nearest.ahead), (2, 0));
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

fn branch(name: &str, target: Option<&str>, base_mode: BaseMode) -> ResolveComparisonParams {
    ResolveComparisonParams {
        intent: CompareIntent::Branch {
            folder: folder_ref(),
            branch: revision(&format!("refs/heads/{name}")),
            target: target.map(|target| revision(&format!("refs/heads/{target}"))),
            base_mode,
        },
        shown_commit: None,
    }
}

/// `main`: root, fork point, a later commit; `feature` leaves at the fork point with one commit. `main` is
/// checked out.
struct BranchHistory {
    repo: TempRepo,
    fork_point: String,
    main_tip: String,
    feature_tip: String,
}

fn branch_history() -> BranchHistory {
    let repo = TempRepo::new();
    repo.commit_file("a.txt", "0", "Root");
    let fork_point = repo.commit_file("a.txt", "1", "Fork point");
    repo.branch("feature");
    let main_tip = repo.commit_file("a.txt", "2", "Later on main");
    repo.checkout("feature");
    let feature_tip = repo.commit_file("f.txt", "1", "Feature");
    repo.checkout("main");
    BranchHistory {
        repo,
        fork_point: fork_point.trim().to_string(),
        main_tip: main_tip.trim().to_string(),
        feature_tip: feature_tip.trim().to_string(),
    }
}

#[tokio::test]
async fn should_use_the_merge_base_by_default() {
    // Arrange
    let history = branch_history();

    // Act
    let comparison = resolve(&history.repo, &branch("feature", None, BaseMode::MergeBase)).await;

    // Assert
    assert_eq!(comparison.status, ResolveStatus::Ready);
    assert_eq!(comparison.origin, ComparisonOrigin::Branches);
    assert_eq!(comparison.base_mode, BaseMode::MergeBase);
    assert_eq!(
        base_and_head(&comparison),
        pair(&history.fork_point, &history.feature_tip)
    );
    let tip = comparison.base_tip.expect("the target tip");
    assert_eq!(
        tip.commit.as_ref().expect("a commit").as_str(),
        history.main_tip
    );
    assert_eq!(tip.label.name, "main");
    assert_eq!(comparison.head.requested.label.name, "feature");
}

#[tokio::test]
async fn should_keep_the_target_name_when_the_merge_base_is_its_tip() {
    // Arrange
    let history = branch_history();
    history.repo.branch("released");
    history
        .repo
        .git(&["branch", "-f", "released", &history.fork_point]);

    // Act
    let comparison = resolve(
        &history.repo,
        &branch("feature", Some("released"), BaseMode::MergeBase),
    )
    .await;

    // Assert
    assert_eq!(comparison.status, ResolveStatus::Ready);
    assert_eq!(
        comparison
            .base
            .requested
            .commit
            .as_ref()
            .expect("a commit")
            .as_str(),
        history.fork_point
    );
    assert_eq!(
        comparison.base.requested.label,
        RefLabel {
            kind: RefLabelKind::Branch,
            name: "released".to_string(),
        }
    );
}

#[tokio::test]
async fn should_use_the_target_tip_in_tip_mode() {
    // Arrange
    let history = branch_history();

    // Act
    let comparison = resolve(
        &history.repo,
        &branch("feature", Some("main"), BaseMode::Tip),
    )
    .await;

    // Assert
    assert_eq!(comparison.status, ResolveStatus::Ready);
    assert_eq!(comparison.base_mode, BaseMode::Tip);
    assert_eq!(comparison.base_tip, None);
    assert_eq!(
        base_and_head(&comparison),
        pair(&history.main_tip, &history.feature_tip)
    );
    assert_eq!(comparison.base.requested.label.name, "main");
}

#[tokio::test]
async fn should_target_the_default_branch_when_the_current_branch_is_compared() {
    // Arrange
    let history = branch_history();
    history.repo.checkout("feature");

    // Act
    let comparison = resolve(&history.repo, &branch("feature", None, BaseMode::Tip)).await;
    let from_main = resolve(&history.repo, &branch("main", None, BaseMode::Tip)).await;

    // Assert
    assert_eq!(
        base_and_head(&comparison),
        pair(&history.main_tip, &history.feature_tip)
    );
    assert_eq!(
        base_and_head(&from_main),
        pair(&history.feature_tip, &history.main_tip)
    );
}

#[tokio::test]
async fn should_report_a_branch_that_is_already_merged() {
    // Arrange
    let history = branch_history();
    history.repo.branch("done");
    history
        .repo
        .git(&["branch", "-f", "done", &history.fork_point]);

    // Act
    let comparison = resolve(
        &history.repo,
        &branch("done", Some("main"), BaseMode::MergeBase),
    )
    .await;

    // Assert
    assert_eq!(
        comparison.status,
        ResolveStatus::AlreadyMerged {
            target: "main".to_string()
        }
    );
}

fn explicit(base: &str, head: &str, base_mode: BaseMode) -> ResolveComparisonParams {
    let side = |name: &str| SideInput {
        folder: folder_ref(),
        rev: RefInput::Rev {
            name: TypedRevision::try_from(name).expect("a typed revision"),
        },
    };
    ResolveComparisonParams {
        intent: CompareIntent::Explicit {
            base: side(base),
            head: side(head),
            base_mode,
        },
        shown_commit: None,
    }
}

#[tokio::test]
async fn should_resolve_a_tag_and_a_unique_prefix() {
    // Arrange
    let repo = TempRepo::new();
    let tagged = repo.commit_file("a.txt", "1", "Release");
    repo.tag("v1.0", true);
    let newer = repo.commit_file("a.txt", "2", "Later");
    let prefix = &newer.trim()[..SHORT_COMMIT_LENGTH];

    // Act
    let comparison = resolve(&repo, &explicit("v1.0", prefix, BaseMode::MergeBase)).await;
    let reversed = resolve(&repo, &explicit(prefix, "v1.0", BaseMode::MergeBase)).await;

    // Assert
    assert_eq!(comparison.status, ResolveStatus::Ready);
    assert_eq!(comparison.origin, ComparisonOrigin::Branches);
    assert_eq!(comparison.base_mode, BaseMode::MergeBase);
    assert_eq!(base_and_head(&comparison), pair(&tagged, &newer));
    assert_eq!(
        comparison.base_tip.expect("the tag tip").label,
        RefLabel {
            kind: RefLabelKind::Tag,
            name: "v1.0".to_string(),
        }
    );
    assert_eq!(reversed.origin, ComparisonOrigin::Commits);
    assert_eq!(reversed.base_mode, BaseMode::Tip);
    assert_eq!(base_and_head(&reversed), pair(&newer, &tagged));
}

#[tokio::test]
async fn should_reject_an_unknown_ref() {
    // Arrange
    let repo = TempRepo::new();
    repo.commit_file("a.txt", "1", "Only");

    // Act
    let unknown = resolve_with(
        &repo,
        &explicit("main", "nowhere", BaseMode::Tip),
        Vec::new(),
    )
    .await;
    let unknown_prefix =
        resolve_with(&repo, &explicit("main", "ffff", BaseMode::Tip), Vec::new()).await;

    // Assert
    assert_eq!(
        unknown.expect_err("no such branch").code(),
        ErrorCode::UnknownRevision
    );
    assert_eq!(
        unknown_prefix.expect_err("no such commit").code(),
        ErrorCode::UnknownRevision
    );
}

#[tokio::test]
async fn should_reject_an_ambiguous_prefix() {
    // Arrange
    let repo = TempRepo::new();
    repo.linear_history(1_000);
    let mut commits: Vec<String> = repo
        .git(&["rev-list", "HEAD"])
        .lines()
        .map(|line| line[..4].to_string())
        .collect();
    commits.sort();
    let shared = commits
        .windows(2)
        .find(|neighbours| neighbours[0] == neighbours[1])
        .map(|neighbours| neighbours[0].clone())
        .expect("two of a thousand commits share four leading digits");

    // Act
    let result = resolve_with(&repo, &explicit("main", &shared, BaseMode::Tip), Vec::new()).await;

    // Assert
    assert_eq!(
        result.expect_err("an ambiguous prefix").code(),
        ErrorCode::UnknownRevision
    );
}

const UNKNOWN_SHA: &str = "ffffffffffffffffffffffffffffffffffffffff";

/// What the renderer knows of pull request #7 on `origin` against `main`.
#[derive(Default)]
struct KnownPullRequest<'test> {
    base_ref_name: Option<&'test str>,
    base_commit: Option<&'test str>,
    head_commit: Option<&'test str>,
    merge_commit: Option<&'test str>,
}

fn change_request(known: KnownPullRequest<'_>) -> ResolveComparisonParams {
    ResolveComparisonParams {
        intent: CompareIntent::ChangeRequest {
            folder: folder_ref(),
            provider: HostingProvider::Github,
            number: 7,
            remote: "origin".to_string(),
            base_ref_name: BranchName::try_from(known.base_ref_name.unwrap_or("main"))
                .expect("a branch name"),
            base_commit: known.base_commit.map(sha),
            head_commit: known.head_commit.map(sha),
            merge_commit: known.merge_commit.map(sha),
        },
        shown_commit: None,
    }
}

/// Root, then `first` on main; `feature` branches off `first` with one commit; main moves on to
/// `second`, which origin has as `main`.
struct PullRequestHistory {
    repo: TempRepo,
    root: String,
    first: String,
    feature: String,
    second: String,
}

fn pull_request_history() -> PullRequestHistory {
    let repo = TempRepo::new();
    let root = repo.commit_file("a.txt", "0", "Root");
    let first = repo.commit_file("a.txt", "1", "First");
    repo.branch("feature");
    repo.checkout("feature");
    let feature = repo.commit_file("f.txt", "1", "Feature");
    repo.checkout("main");
    let second = repo.commit_file("a.txt", "2", "Second");
    let repo = repo.with_bare_origin();
    PullRequestHistory {
        repo,
        root: root.trim().to_string(),
        first: first.trim().to_string(),
        feature: feature.trim().to_string(),
        second: second.trim().to_string(),
    }
}

#[tokio::test]
async fn should_use_the_merge_base_of_the_recorded_base_and_the_head() {
    // Arrange
    let history = pull_request_history();
    let known = KnownPullRequest {
        base_commit: Some(&history.root),
        head_commit: Some(&history.feature),
        ..KnownPullRequest::default()
    };

    // Act
    let comparison = resolve(&history.repo, &change_request(known)).await;

    // Assert
    assert_eq!(comparison.status, ResolveStatus::Ready);
    assert_eq!(comparison.base_mode, BaseMode::MergeBase);
    assert_eq!(
        base_and_head(&comparison),
        pair(&history.root, &history.feature)
    );
    assert_eq!(
        comparison.head.requested.label,
        RefLabel {
            kind: RefLabelKind::PullRequest,
            name: "#7".to_string(),
        }
    );
    let tip = comparison
        .base_tip
        .expect("the tip the merge base came from");
    assert_eq!(
        tip.commit.as_ref().expect("a commit").as_str(),
        history.root
    );
    assert_eq!(tip.label.name, "main");
}

#[tokio::test]
async fn should_fall_back_to_the_base_branch_tip() {
    // Arrange
    let history = pull_request_history();
    let known = KnownPullRequest {
        base_commit: Some(UNKNOWN_SHA),
        head_commit: Some(&history.feature),
        ..KnownPullRequest::default()
    };
    let unknown_branch = KnownPullRequest {
        base_ref_name: Some("gone"),
        head_commit: Some(&history.feature),
        ..KnownPullRequest::default()
    };

    // Act
    let comparison = resolve(&history.repo, &change_request(known)).await;
    let not_local = resolve_with(&history.repo, &change_request(unknown_branch), Vec::new()).await;

    // Assert
    assert_eq!(comparison.status, ResolveStatus::Ready);
    assert_eq!(
        base_and_head(&comparison),
        pair(&history.first, &history.feature)
    );
    let tip = comparison.base_tip.expect("the remote branch tip");
    assert_eq!(
        tip.commit.as_ref().expect("a commit").as_str(),
        history.second
    );
    assert_eq!(tip.label.name, "origin/main");
    assert_eq!(
        not_local.expect_err("origin has no gone").code(),
        ErrorCode::UnknownRevision
    );
}

#[tokio::test]
async fn should_ask_to_fetch_a_head_that_is_not_local() {
    // Arrange
    let history = pull_request_history();
    let unknown_head = KnownPullRequest {
        head_commit: Some(UNKNOWN_SHA),
        ..KnownPullRequest::default()
    };

    // Act
    let listed = resolve_with(&history.repo, &change_request(unknown_head), Vec::new()).await;
    let unfetched = resolve_with(
        &history.repo,
        &change_request(KnownPullRequest::default()),
        Vec::new(),
    )
    .await;
    history
        .repo
        .git(&["update-ref", "refs/codecharta/pr/7", &history.feature]);
    let fetched = resolve(&history.repo, &change_request(KnownPullRequest::default())).await;

    // Assert
    assert_eq!(
        listed.expect_err("the head is not local").code(),
        ErrorCode::HeadNotLocal
    );
    assert_eq!(
        unfetched.expect_err("nothing was fetched").code(),
        ErrorCode::HeadNotLocal
    );
    assert_eq!(
        fetched
            .head
            .requested
            .commit
            .as_ref()
            .expect("a commit")
            .as_str(),
        history.feature
    );
    assert_eq!(
        fetched
            .base
            .requested
            .commit
            .as_ref()
            .expect("a commit")
            .as_str(),
        history.first
    );
}

#[tokio::test]
async fn should_report_a_merged_pull_request_whose_base_equals_its_head() {
    // Arrange
    let history = pull_request_history();
    let merge = history.repo.merge(&["feature"], "Merge #7");
    history.repo.git(&["push", "--quiet", "origin", "main"]);
    let without_merge_commit = KnownPullRequest {
        head_commit: Some(&history.feature),
        ..KnownPullRequest::default()
    };
    let with_merge_commit = KnownPullRequest {
        head_commit: Some(&history.feature),
        merge_commit: Some(merge.trim()),
        ..KnownPullRequest::default()
    };

    // Act
    let merged = resolve(&history.repo, &change_request(without_merge_commit)).await;
    let before_merge = resolve(&history.repo, &change_request(with_merge_commit)).await;

    // Assert
    assert_eq!(
        merged.status,
        ResolveStatus::AlreadyMerged {
            target: "main".to_string()
        }
    );
    assert_eq!(
        base_and_head(&merged),
        pair(&history.feature, &history.feature)
    );
    assert_eq!(before_merge.status, ResolveStatus::Ready);
    assert_eq!(
        base_and_head(&before_merge),
        pair(&history.first, &history.feature)
    );
}

#[tokio::test]
async fn should_refuse_a_remote_that_is_not_configured() {
    // Arrange
    let history = pull_request_history();
    let mut params = change_request(KnownPullRequest {
        head_commit: Some(&history.feature),
        ..KnownPullRequest::default()
    });
    if let CompareIntent::ChangeRequest { remote, .. } = &mut params.intent {
        *remote = "elsewhere".to_string();
    }

    // Act
    let result = resolve_with(&history.repo, &params, Vec::new()).await;

    // Assert
    assert_eq!(
        result.expect_err("no such remote").code(),
        ErrorCode::NotFound
    );
}
