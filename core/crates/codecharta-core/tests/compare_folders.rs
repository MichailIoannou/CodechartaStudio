mod support;

use codecharta_core::CoreResult;
use codecharta_core::compare::{
    CommitComparison, SideFolders, SideLookup, SizeLimits, side_status,
};
use codecharta_core::git::{GitFolder, GitService};
use codecharta_core::snapshots::nearest::{
    ResolutionCache, ResolutionFolder, ResolutionRequest, resolve_snapshot,
};
use codecharta_core_api::ids::{FolderId, ProjectId};
use codecharta_core_api::methods::analysis::AnalysisTarget;
use codecharta_core_api::methods::compare::{
    BaseMode, CompareIntent, ComparedCommit, ComparisonOrigin, RefInput, ResolveComparisonParams,
    ResolveStatus, ResolvedComparison, SideInput, SideStatus,
};
use codecharta_core_api::methods::projects::FolderRef;
use codecharta_core_api::values::TypedRevision;
use tokio_util::sync::CancellationToken;

use support::TempRepo;

/// Two clones of one repository, as folders `f-1` (the repository) and `f-2` (the fork), without snapshots.
struct TwoFolders<'test> {
    git: &'test GitService<'test>,
    base: GitFolder,
    head: GitFolder,
}

impl SideLookup for TwoFolders<'_> {
    async fn status_of(
        &self,
        side: &ComparedCommit,
        cancel: &CancellationToken,
    ) -> CoreResult<SideStatus> {
        let folder = if side.folder == folder_ref("f-1") {
            &self.base
        } else {
            &self.head
        };
        let target = AnalysisTarget::Commit {
            sha: side.commit.clone(),
        };
        let request = ResolutionRequest {
            folder: ResolutionFolder::Git(folder),
            target: &target,
            snapshots: &[],
            current_profile_hash: None,
        };
        resolve_snapshot(self.git, &ResolutionCache::default(), &request, cancel)
            .await
            .map(side_status)
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
    (
        comparison.base.requested.commit.to_string(),
        comparison.head.requested.commit.to_string(),
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
    assert_eq!(tip.commit.as_str(), upstream.trim());
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
