mod support;

use codecharta_core::CoreResult;
use codecharta_core::git::{GitFolder, GitService};
use codecharta_core_api::methods::git::{GitHead, GitRefs};
use tokio_util::sync::CancellationToken;

use support::TempRepo;

async fn refs_of(repo: &TempRepo) -> CoreResult<GitRefs> {
    let runner = repo.runner();
    GitService::new(&runner, repo.data_dir())
        .refs(&GitFolder::at(repo.path()), &CancellationToken::new())
        .await
}

async fn fingerprint_of(repo: &TempRepo) -> String {
    let runner = repo.runner();
    GitService::new(&runner, repo.data_dir())
        .refs_fingerprint(&GitFolder::at(repo.path()), &CancellationToken::new())
        .await
        .expect("the fingerprint is read")
}

#[tokio::test]
async fn should_mark_the_current_branch() {
    // Arrange
    let repo = TempRepo::new();
    let first = repo.commit("Add a", &[("a.txt", "a")]);
    repo.branch("feature");
    repo.checkout("feature");
    repo.tag("v1", true);
    let repo = repo.with_bare_origin();

    // Act
    let refs = refs_of(&repo).await.unwrap();

    // Assert
    let current: Vec<(&str, bool)> = refs
        .local_branches
        .iter()
        .map(|branch| (branch.name.as_str(), branch.is_current))
        .collect();
    assert_eq!(current, [("feature", true), ("main", false)]);
    assert_eq!(
        refs.head,
        GitHead::Branch {
            name: "feature".to_string(),
            commit: Some(first.clone()),
        }
    );
    assert_eq!(refs.remote_branches[0].name, "origin/feature");
    assert_eq!(refs.tags[0].commit, first);
    assert_eq!(refs.remotes[0].name, "origin");
}

#[tokio::test]
async fn should_change_the_fingerprint_when_a_branch_moves_and_keep_it_otherwise() {
    // Arrange
    let repo = TempRepo::new();
    repo.commit("Add a", &[("a.txt", "a")]);
    repo.branch("feature");
    let before = fingerprint_of(&repo).await;
    let unchanged = fingerprint_of(&repo).await;

    // Act
    repo.git(&["branch", "--force", "feature", "HEAD"]);
    let still_unchanged = fingerprint_of(&repo).await;
    repo.commit("Add b", &[("b.txt", "b")]);
    let after = fingerprint_of(&repo).await;

    // Assert
    assert_eq!(before, unchanged);
    assert_eq!(before, still_unchanged);
    assert_ne!(before, after);
}

#[tokio::test]
async fn should_list_no_refs_in_a_repository_without_commits() {
    // Arrange
    let repo = TempRepo::new();

    // Act
    let refs = refs_of(&repo).await.unwrap();

    // Assert
    assert!(refs.local_branches.is_empty());
    assert!(refs.remotes.is_empty());
    assert_eq!(
        refs.head,
        GitHead::Branch {
            name: "main".to_string(),
            commit: None,
        }
    );
}
