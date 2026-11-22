mod support;

use codecharta_core::analysis::batch::{MAX_BATCH_JOBS, expand_batch};
use codecharta_core::git::{GitFolder, GitService};
use codecharta_core::{CoreError, CoreResult};
use codecharta_core_api::error::ErrorCode;
use codecharta_core_api::methods::analysis::BatchSelection;
use codecharta_core_api::values::CommitSha;
use tokio_util::sync::CancellationToken;

use support::TempRepo;

const MISSING_SHA: &str = "0123456789abcdef0123456789abcdef01234567";

fn sha(text: &str) -> CommitSha {
    CommitSha::try_from(text.trim()).expect("a full sha")
}

async fn expand(repo: &TempRepo, selection: &BatchSelection) -> CoreResult<Vec<CommitSha>> {
    let runner = repo.runner();
    let git = GitService::new(&runner, repo.data_dir());
    let folder = GitFolder::at(repo.path());
    expand_batch(&git, &folder, selection, &CancellationToken::new()).await
}

fn last_commits(tip: &str, count: u16, first_parent_only: bool) -> BatchSelection {
    BatchSelection::LastCommits {
        tip_sha: sha(tip),
        count,
        first_parent_only,
    }
}

#[tokio::test]
async fn should_expand_the_last_n_first_parent_commits() {
    // Arrange
    let repo = TempRepo::new();
    let root = repo.commit("Root", &[("a.txt", "a")]);
    repo.branch("side");
    let main = repo.commit("Main", &[("main.txt", "main")]);
    repo.checkout("side");
    let side = repo.commit("Side", &[("side.txt", "side")]);
    repo.checkout("main");
    let merge = repo.merge(&["side"], "Merge side");

    // Act
    let first_parent = expand(&repo, &last_commits(&merge, 3, true)).await.unwrap();
    let every_parent = expand(&repo, &last_commits(&merge, 4, false))
        .await
        .unwrap();
    let fewer = expand(&repo, &last_commits(&merge, 2, true)).await.unwrap();

    // Assert
    assert_eq!(first_parent, [sha(&merge), sha(&main), sha(&root)]);
    assert_eq!(every_parent.len(), 4);
    assert!(every_parent.contains(&sha(&side)));
    assert_eq!(fewer, [sha(&merge), sha(&main)]);
}

#[tokio::test]
async fn should_peel_annotated_tags() {
    // Arrange
    let repo = TempRepo::new();
    let first = repo.commit("First", &[("a.txt", "a")]);
    repo.tag("v1-light", false);
    repo.tag("v1-annotated", true);
    let second = repo.commit("Second", &[("b.txt", "b")]);
    repo.tag("v2", true);

    // Act
    let commits = expand(&repo, &BatchSelection::Tags).await.unwrap();

    // Assert
    assert_eq!(commits, [sha(&second), sha(&first)]);
}

#[tokio::test]
async fn should_refuse_more_commits_than_a_batch_holds_and_unknown_commits() {
    // Arrange
    let repo = TempRepo::new();
    let head = repo.commit("Root", &[("a.txt", "a")]);
    let too_many = u16::try_from(MAX_BATCH_JOBS + 1).expect("the limit fits");
    let unknown = BatchSelection::Commits {
        shas: vec![sha(&head), sha(MISSING_SHA)],
    };

    // Act
    let refused = expand(&repo, &last_commits(&head, too_many, true)).await;
    let none = expand(&repo, &last_commits(&head, 0, true)).await;
    let missing = expand(&repo, &unknown).await;

    // Assert
    assert_eq!(refused.unwrap_err().code(), ErrorCode::BadRequest);
    assert_eq!(none.unwrap_err().code(), ErrorCode::BadRequest);
    assert!(
        matches!(&missing, Err(CoreError::NotACommit { commit }) if commit == MISSING_SHA),
        "{missing:?}"
    );
}
