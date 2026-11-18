mod support;

use codecharta_core::git::log::LogRequest;
use codecharta_core::git::memory::GitMemory;
use codecharta_core::git::{GitFolder, GitService};
use codecharta_core_api::methods::git::GitLogScope;
use codecharta_core_api::values::{CommitSha, LogCursor};
use tokio_util::sync::CancellationToken;

use support::{RecordingGit, TempRepo};

const SHOW: &str = "show";
const MERGE_BASE: &str = "merge-base";
const LOG: &str = "log";
const LONG_HISTORY: u32 = 1200;

fn sha(text: &str) -> CommitSha {
    CommitSha::try_from(text).expect("a full sha")
}

fn cancel() -> CancellationToken {
    CancellationToken::new()
}

async fn repository_id(service: &GitService<'_>, folder: &GitFolder) -> String {
    service
        .repository_info(folder, &cancel())
        .await
        .expect("the repository is found")
        .repository_id
}

#[tokio::test]
async fn should_run_git_once_for_two_identical_detail_requests_and_again_after_clearing() {
    // Arrange
    let repo = TempRepo::new();
    let commit = repo.commit("Root", &[("a.txt", "a")]);
    let runner = RecordingGit::new(repo.runner());
    let memory = GitMemory::default();
    let service = GitService::new(&runner, repo.data_dir()).with_memory(&memory);
    let folder = GitFolder::at(repo.path());

    // Act
    let first = service
        .commit_details(&folder, &sha(&commit), &cancel())
        .await
        .unwrap();
    let second = service
        .commit_details(&folder, &sha(&commit), &cancel())
        .await
        .unwrap();
    let runs_before_clearing = runner.runs_of(SHOW).len();
    memory.forget_repository(&repository_id(&service, &folder).await);
    service
        .commit_details(&folder, &sha(&commit), &cancel())
        .await
        .unwrap();

    // Assert
    assert_eq!(first, second);
    assert_eq!(runs_before_clearing, 1);
    assert_eq!(runner.runs_of(SHOW).len(), 2);
}

#[tokio::test]
async fn should_clear_the_query_cache_after_a_fetch_in_a_shallow_repository() {
    // Arrange
    let origin = TempRepo::new();
    let root = origin.commit("Root", &[("a.txt", "a")]);
    origin.branch("side");
    let main = origin.commit("Main", &[("main.txt", "main")]);
    origin.checkout("side");
    let side = origin.commit("Side", &[("side.txt", "side")]);
    origin.checkout("main");
    let clone = origin.clone_shallow();
    clone.git(&[
        "fetch",
        "--quiet",
        "--depth",
        "1",
        "origin",
        "side:refs/remotes/origin/side",
    ]);
    let runner = RecordingGit::new(clone.runner());
    let memory = GitMemory::default();
    let service = GitService::new(&runner, clone.data_dir()).with_memory(&memory);
    let folder = GitFolder::at(clone.path());
    let (main, side, token) = (sha(&main), sha(&side), cancel());
    let merge_base = || service.merge_base(&folder, &main, &side, &token);
    let shallow = merge_base().await.unwrap();

    // Act
    clone.git(&["fetch", "--quiet", "--unshallow", "origin"]);
    let remembered = merge_base().await.unwrap();
    memory.fetched(&repository_id(&service, &folder).await, true);
    let after_fetch = merge_base().await.unwrap();

    // Assert
    assert_eq!(shallow, None);
    assert_eq!(remembered, None);
    assert_eq!(after_fetch, Some(root));
    assert_eq!(runner.runs_of(MERGE_BASE).len(), 2);
}

#[tokio::test]
async fn should_serve_a_page_read_before_from_memory() {
    // Arrange
    let repo = TempRepo::new();
    repo.linear_history(LONG_HISTORY);
    let runner = RecordingGit::new(repo.runner());
    let service = GitService::new(&runner, repo.data_dir());
    let folder = GitFolder::at(repo.path());
    let first_page = LogRequest {
        scope: GitLogScope::Head,
        filter: None,
        cursor: None,
    };
    let first = service.log(&folder, &first_page, &cancel()).await.unwrap();
    let cursor = LogCursor::try_from(first.next_cursor.clone().unwrap()).unwrap();
    let second_page = LogRequest {
        cursor: Some(cursor),
        ..first_page
    };

    // Act
    let second = service.log(&folder, &second_page, &cancel()).await.unwrap();
    let again = service.log(&folder, &second_page, &cancel()).await.unwrap();

    // Assert
    assert_eq!(second, again);
    assert_eq!(runner.runs_of(LOG).len(), 2);
}

#[tokio::test]
async fn should_measure_only_candidates_without_a_remembered_distance() {
    // Arrange
    let repo = TempRepo::new();
    let first = repo.commit("One", &[("a.txt", "1")]);
    let second = repo.commit("Two", &[("a.txt", "2")]);
    let third = repo.commit("Three", &[("a.txt", "3")]);
    let runner = RecordingGit::new(repo.runner());
    let service = GitService::new(&runner, repo.data_dir());
    let folder = GitFolder::at(repo.path());
    service
        .measure_distances(&folder, &sha(&third), &[sha(&first)], &cancel())
        .await
        .unwrap();

    // Act
    let distances = service
        .measure_distances(
            &folder,
            &sha(&third),
            &[sha(&second), sha(&first)],
            &cancel(),
        )
        .await
        .unwrap();

    // Assert
    let measured: Vec<(&str, u32)> = distances
        .iter()
        .map(|distance| (distance.sha.as_str(), distance.only_in_target))
        .collect();
    assert_eq!(measured, [(second.as_str(), 1), (first.as_str(), 2)]);
    assert_eq!(runner.runs_of("--left-right").len(), 2);
}
