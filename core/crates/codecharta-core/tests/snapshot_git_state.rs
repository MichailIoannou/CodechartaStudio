mod support;

use codecharta_core::git::{GitFolder, GitService};
use codecharta_core::snapshots::git_state::{GitReads, collect_git_state};
use codecharta_core::snapshots::record::GitRecord;
use codecharta_core_api::methods::analysis::AnalysisTarget;
use codecharta_core_api::methods::projects::GitRemote;
use codecharta_core_api::values::CommitSha;
use tokio_util::sync::CancellationToken;

use support::TempRepo;

fn commit_target(sha: &str) -> AnalysisTarget {
    AnalysisTarget::Commit {
        sha: CommitSha::try_from(sha).expect("a full sha"),
    }
}

async fn git_state_of(repo: &TempRepo, target: &AnalysisTarget) -> GitRecord {
    let runner = repo.runner();
    let service = GitService::new(&runner, repo.data_dir());
    let reads = GitReads {
        service: &service,
        runner: &runner,
    };
    collect_git_state(
        &reads,
        &GitFolder::at(repo.path()),
        target,
        &CancellationToken::new(),
    )
    .await
    .expect("the git state is collected")
}

#[tokio::test]
async fn should_describe_a_commit_with_its_parents() {
    // Arrange
    let repo = TempRepo::new();
    let first = repo.commit_file("a.txt", "a", "First");
    let second = repo.commit_file("b.txt", "b", "Second");

    // Act
    let state = git_state_of(&repo, &commit_target(&second)).await;

    // Assert
    assert_eq!(state.commit.as_str(), second);
    assert_eq!(
        state.short_commit,
        repo.git(&["rev-parse", "--short", &second])
    );
    assert_eq!(state.subject, "Second");
    assert_eq!(
        state.author_name,
        repo.git(&["show", "-s", "--format=%an", &second])
    );
    assert_eq!(
        state.author_date,
        repo.git(&["show", "-s", "--format=%aI", &second])
    );
    assert_eq!(
        state.commit_date,
        repo.git(&["show", "-s", "--format=%cI", &second])
    );
    let parents: Vec<&str> = state.parents.iter().map(|parent| parent.as_str()).collect();
    assert_eq!(parents, [first.as_str()]);
    let tree = format!("{second}^{{tree}}");
    assert_eq!(
        state.tree.as_deref(),
        Some(repo.git(&["rev-parse", &tree]).as_str())
    );
    assert!(!state.dirty);
}

#[tokio::test]
async fn should_list_branches_and_tags_pointing_at_it() {
    // Arrange
    let repo = TempRepo::new();
    let first = repo.commit_file("a.txt", "a", "First");
    repo.branch("feature");
    repo.tag("v1", false);
    repo.tag("v2", true);
    repo.commit_file("b.txt", "b", "Second");

    // Act
    let state = git_state_of(&repo, &commit_target(&first)).await;

    // Assert
    assert_eq!(state.branches_at_run, ["feature"]);
    assert_eq!(state.tags_at_run, ["v1", "v2"]);
}

#[tokio::test]
async fn should_report_detached_head() {
    // Arrange
    let repo = TempRepo::new();
    let first = repo.commit_file("a.txt", "a", "First");
    let second = repo.commit_file("b.txt", "b", "Second");
    repo.git(&["checkout", "--quiet", "--detach", &first]);

    // Act
    let state = git_state_of(&repo, &commit_target(&second)).await;

    // Assert
    let head = state.head_at_run.expect("the head is described");
    assert_eq!(head.branch, None);
    assert_eq!(head.commit.as_str(), first);
    assert_eq!(head.upstream, None);
    assert_eq!((head.ahead, head.behind), (0, 0));
}

#[tokio::test]
async fn should_report_upstream_with_ahead_and_behind() {
    // Arrange
    let repo = TempRepo::new();
    repo.commit_file("a.txt", "a", "First");
    let repo = repo.with_bare_origin();
    let other = repo.clone_of_origin();
    other.commit_file("other.txt", "other", "Other");
    other.git(&["push", "--quiet"]);
    repo.git(&["fetch", "--quiet"]);
    repo.commit_file("b.txt", "b", "Second");
    let head = repo.commit_file("c.txt", "c", "Third");

    // Act
    let state = git_state_of(&repo, &commit_target(&head)).await;

    // Assert
    let head_at_run = state.head_at_run.expect("the head is described");
    assert_eq!(head_at_run.branch.as_deref(), Some("main"));
    assert_eq!(head_at_run.commit.as_str(), head);
    assert_eq!(head_at_run.upstream.as_deref(), Some("origin/main"));
    assert_eq!((head_at_run.ahead, head_at_run.behind), (2, 1));
}

#[tokio::test]
async fn should_report_dirty_for_an_untracked_file() {
    // Arrange
    let repo = TempRepo::new();
    let head = repo.commit_file("a.txt", "a", "First");
    repo.write_file("untracked.txt", "new");

    // Act
    let working_tree = git_state_of(&repo, &AnalysisTarget::WorkingTree).await;
    let commit = git_state_of(&repo, &commit_target(&head)).await;

    // Assert
    assert!(working_tree.dirty);
    assert_eq!(working_tree.commit.as_str(), head);
    assert!(!commit.dirty);
}

#[tokio::test]
async fn should_strip_credentials_from_remote_urls() {
    // Arrange
    let repo = TempRepo::new();
    let head = repo.commit_file("a.txt", "a", "First");
    repo.add_remote("origin", "https://user:token@github.com/owner/repo.git");
    repo.add_remote("mirror", "git@gitlab.example.com:group/repo.git");

    // Act
    let state = git_state_of(&repo, &commit_target(&head)).await;

    // Assert
    let remote = |name: &str, url: &str| GitRemote {
        name: name.to_string(),
        url: url.to_string(),
    };
    assert_eq!(
        state.remotes,
        [
            remote("origin", "https://github.com/owner/repo.git"),
            remote("mirror", "git@gitlab.example.com:group/repo.git"),
        ]
    );
}
