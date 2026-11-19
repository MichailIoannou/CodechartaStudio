mod support;

use codecharta_core::CoreResult;
use codecharta_core::git::{GitFolder, GitService};
use codecharta_core_api::methods::git::{
    GitHead, GitStatus, GitUpstream, OperationInProgress, StatusCounts,
};
use tokio_util::sync::CancellationToken;

use support::TempRepo;

async fn status_of(repo: &TempRepo) -> CoreResult<GitStatus> {
    let runner = repo.runner();
    GitService::new(&runner, repo.data_dir())
        .status(&GitFolder::at(repo.path()), &CancellationToken::new())
        .await
}

#[tokio::test]
async fn should_report_clean_after_commit() {
    // Arrange
    let repo = TempRepo::new();
    let commit = repo.commit("Add a", &[("a.txt", "a")]);

    // Act
    let status = status_of(&repo).await.unwrap();

    // Assert
    assert_eq!(
        status,
        GitStatus {
            head: GitHead::Branch {
                name: "main".to_string(),
                commit: Some(commit),
            },
            upstream: None,
            counts: StatusCounts::default(),
            operation_in_progress: None,
        }
    );
}

#[tokio::test]
async fn should_report_a_merge_in_progress() {
    // Arrange
    let repo = TempRepo::new();
    repo.commit("Base", &[("a.txt", "base")]);
    repo.branch("other");
    repo.checkout("other");
    repo.commit("Other", &[("a.txt", "other")]);
    repo.checkout("main");
    repo.commit("Main", &[("a.txt", "main")]);
    assert!(
        repo.try_git(&["merge", "--quiet", "--no-edit", "other"])
            .is_none()
    );

    // Act
    let status = status_of(&repo).await.unwrap();

    // Assert
    assert_eq!(
        status.operation_in_progress,
        Some(OperationInProgress::Merge)
    );
    assert_eq!(status.counts.conflicted, 1);
}

#[tokio::test]
async fn should_report_the_upstream_with_its_full_ref_name() {
    // Arrange
    let repo = TempRepo::new();
    repo.commit("Add a", &[("a.txt", "a")]);
    let repo = repo.with_bare_origin();
    repo.commit("Add b", &[("b.txt", "b")]);

    // Act
    let status = status_of(&repo).await.unwrap();

    // Assert
    assert_eq!(
        status.upstream,
        Some(GitUpstream {
            ref_name: "refs/remotes/origin/main".to_string(),
            name: "origin/main".to_string(),
            ahead: Some(1),
            behind: Some(0),
            is_gone: false,
        })
    );
}
