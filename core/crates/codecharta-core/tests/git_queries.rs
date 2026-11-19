mod support;

use std::ops::ControlFlow;

use codecharta_core::git::query::{MAX_DISTANCE_CANDIDATES, REV_LIST_BATCH, RevListRequest};
use codecharta_core::git::{GitFolder, GitService};
use codecharta_core_api::error::ErrorCode;
use codecharta_core_api::methods::git::GitCommitDistance;
use codecharta_core_api::values::{CommitSha, Revision};
use tokio_util::sync::CancellationToken;

use support::TempRepo;

const UNKNOWN_SHA: &str = "0123456789abcdef0123456789abcdef01234567";
const STREAMED_COMMITS: u32 = 2500;
const LONG_HISTORY: u32 = 5000;

fn sha(text: &str) -> CommitSha {
    CommitSha::try_from(text).expect("a full sha")
}

fn folder(repo: &TempRepo) -> GitFolder {
    GitFolder::at(repo.path())
}

fn cancel() -> CancellationToken {
    CancellationToken::new()
}

/// Root, then `side` with one commit and `main` with one commit; answers (root, main, side).
fn diverged() -> (TempRepo, String, String, String) {
    let repo = TempRepo::new();
    let root = repo.commit("Root", &[("a.txt", "a")]);
    repo.branch("side");
    let main = repo.commit("Main", &[("main.txt", "main")]);
    repo.checkout("side");
    let side = repo.commit("Side", &[("side.txt", "side")]);
    repo.checkout("main");
    (repo, root, main, side)
}

fn request(include: &[&str], exclude: &[&str]) -> RevListRequest {
    RevListRequest {
        include: include.iter().map(|text| sha(text)).collect(),
        exclude: exclude.iter().map(|text| sha(text)).collect(),
        first_parent: false,
        max_count: None,
    }
}

async fn streamed(repo: &TempRepo, request: &RevListRequest) -> Vec<Vec<CommitSha>> {
    let runner = repo.runner();
    let service = GitService::new(&runner, repo.data_dir());
    let mut batches = Vec::new();
    service
        .rev_list(&folder(repo), request, &cancel(), &mut |batch| {
            batches.push(batch.to_vec());
            ControlFlow::Continue(())
        })
        .await
        .expect("the walk succeeds");
    batches
}

fn texts(batches: &[Vec<CommitSha>]) -> Vec<&str> {
    batches.iter().flatten().map(CommitSha::as_str).collect()
}

#[tokio::test]
async fn should_count_commits_between_two_commits_and_zero_for_the_same() {
    // Arrange
    let repo = TempRepo::new();
    let first = repo.commit("One", &[("a.txt", "1")]);
    repo.commit("Two", &[("a.txt", "2")]);
    let third = repo.commit("Three", &[("a.txt", "3")]);
    let runner = repo.runner();
    let service = GitService::new(&runner, repo.data_dir());

    // Act
    let between = service
        .rev_list_count(&folder(&repo), &sha(&first), &sha(&third), &cancel())
        .await
        .unwrap();
    let same = service
        .rev_list_count(&folder(&repo), &sha(&third), &sha(&third), &cancel())
        .await
        .unwrap();

    // Assert
    assert_eq!((between, same), (2, 0));
}

#[tokio::test]
async fn should_find_the_merge_base_and_none_for_unrelated_histories() {
    // Arrange
    let (repo, root, main, side) = diverged();
    repo.git(&["checkout", "--quiet", "--orphan", "other"]);
    repo.git(&["rm", "-r", "--quiet", "--force", "."]);
    let other = repo.commit("Other root", &[("b.txt", "b")]);
    let runner = repo.runner();
    let service = GitService::new(&runner, repo.data_dir());

    // Act
    let base = service
        .merge_base(&folder(&repo), &sha(&main), &sha(&side), &cancel())
        .await
        .unwrap();
    let unrelated = service
        .merge_base(&folder(&repo), &sha(&main), &sha(&other), &cancel())
        .await
        .unwrap();

    // Assert
    assert_eq!(base, Some(root));
    assert_eq!(unrelated, None);
}

#[tokio::test]
async fn should_answer_ancestry_both_ways() {
    // Arrange
    let (repo, root, main, side) = diverged();
    let runner = repo.runner();
    let service = GitService::new(&runner, repo.data_dir());
    let is_ancestor = |ancestor: &str, descendant: &str| {
        let (ancestor, descendant) = (sha(ancestor), sha(descendant));
        let service = &service;
        let folder = folder(&repo);
        async move {
            service
                .is_ancestor(&folder, &ancestor, &descendant, &cancel())
                .await
        }
    };

    // Act
    let answers = [
        is_ancestor(&root, &main).await.unwrap(),
        is_ancestor(&main, &root).await.unwrap(),
        is_ancestor(&main, &side).await.unwrap(),
    ];
    let unknown = is_ancestor(UNKNOWN_SHA, &main).await;

    // Assert
    assert_eq!(answers, [true, false, false]);
    assert_eq!(unknown.unwrap_err().code(), ErrorCode::UnknownRevision);
}

#[tokio::test]
async fn should_omit_an_unknown_candidate_from_the_distances() {
    // Arrange
    let (repo, root, main, side) = diverged();
    let runner = repo.runner();
    let service = GitService::new(&runner, repo.data_dir());
    let candidates = [
        sha(&root),
        sha(UNKNOWN_SHA),
        sha(&side),
        sha(&main),
        sha(&root),
    ];

    // Act
    let distances = service
        .measure_distances(&folder(&repo), &sha(&main), &candidates, &cancel())
        .await
        .unwrap();

    // Assert
    let distance = |candidate: &str, only_in_candidate, only_in_target| GitCommitDistance {
        sha: candidate.to_string(),
        only_in_candidate,
        only_in_target,
    };
    assert_eq!(
        distances,
        [
            distance(&root, 0, 1),
            distance(&side, 1, 1),
            distance(&main, 0, 0),
            distance(&root, 0, 1),
        ]
    );
}

#[tokio::test]
async fn should_refuse_more_than_the_allowed_candidates() {
    // Arrange
    let repo = TempRepo::new();
    let head = repo.commit("Root", &[("a.txt", "a")]);
    let runner = repo.runner();
    let service = GitService::new(&runner, repo.data_dir());
    let candidates = vec![sha(&head); MAX_DISTANCE_CANDIDATES + 1];

    // Act
    let error = service
        .measure_distances(&folder(&repo), &sha(&head), &candidates, &cancel())
        .await
        .unwrap_err();

    // Assert
    assert_eq!(error.code(), ErrorCode::BadRequest);
}

#[tokio::test]
async fn should_list_the_refs_at_a_commit() {
    // Arrange
    let repo = TempRepo::new();
    let head = repo.commit("Root", &[("a.txt", "a")]);
    repo.branch("feature/x");
    repo.tag("v1", true);
    repo.tag("light", false);
    repo.commit("Later", &[("b.txt", "b")]);
    let runner = repo.runner();
    let service = GitService::new(&runner, repo.data_dir());

    // Act
    let refs = service
        .refs_at(&folder(&repo), &sha(&head), &cancel())
        .await
        .unwrap();

    // Assert
    assert_eq!(refs.branches, ["feature/x"]);
    assert_eq!(refs.tags, ["light", "v1"]);
}

#[tokio::test]
async fn should_resolve_head_and_a_full_ref_and_reject_head_tilde_one() {
    // Arrange
    let (repo, _root, main, side) = diverged();
    let runner = repo.runner();
    let service = GitService::new(&runner, repo.data_dir());
    let resolve = |revision: &str| {
        let revision = Revision::try_from(revision).expect("a valid revision");
        let service = &service;
        let folder = folder(&repo);
        async move { service.resolve_commit(&folder, &revision, &cancel()).await }
    };

    // Act
    let head = resolve("HEAD").await.unwrap();
    let side_ref = resolve("refs/heads/side").await.unwrap();
    let missing = resolve("refs/heads/missing").await;

    // Assert
    assert_eq!(head.sha, main);
    assert_eq!(head.subject, "Main");
    assert_eq!(side_ref.sha, side);
    assert_eq!(missing.unwrap_err().code(), ErrorCode::UnknownRevision);
    assert!(Revision::try_from("HEAD~1").is_err());
}

#[tokio::test]
async fn should_stream_rev_list_batches_in_date_order() {
    // Arrange
    let repo = TempRepo::new();
    let head = repo.linear_history(STREAMED_COMMITS);
    let expected = repo.git(&["rev-list", "--date-order", "HEAD"]);

    // Act
    let batches = streamed(&repo, &request(&[&head], &[])).await;

    // Assert
    let sizes: Vec<usize> = batches.iter().map(Vec::len).collect();
    assert_eq!(sizes, [REV_LIST_BATCH, REV_LIST_BATCH, 500]);
    assert_eq!(texts(&batches), expected.lines().collect::<Vec<_>>());
}

#[tokio::test]
async fn should_stop_rev_list_when_the_sink_breaks() {
    // Arrange
    let repo = TempRepo::new();
    let head = repo.linear_history(LONG_HISTORY);
    let runner = repo.runner();
    let service = GitService::new(&runner, repo.data_dir());
    let mut calls = 0;

    // Act
    let delivered = service
        .rev_list(
            &folder(&repo),
            &request(&[&head], &[]),
            &cancel(),
            &mut |_| {
                calls += 1;
                ControlFlow::Break(())
            },
        )
        .await
        .unwrap();

    // Assert
    assert_eq!(calls, 1);
    assert_eq!(delivered, REV_LIST_BATCH as u64);
}

#[tokio::test]
async fn should_honour_excluded_shas() {
    // Arrange
    let (repo, root, main, side) = diverged();

    // Act
    let batches = streamed(&repo, &request(&[&main, &side], &[&root])).await;

    // Assert
    let mut walked = texts(&batches);
    walked.sort_unstable();
    let mut expected = vec![main.as_str(), side.as_str()];
    expected.sort_unstable();
    assert_eq!(walked, expected);
}

#[tokio::test]
async fn should_honour_first_parent() {
    // Arrange
    let (repo, root, main, _side) = diverged();
    let merge = repo.merge(&["side"], "Merge side");
    let first_parent = RevListRequest {
        first_parent: true,
        ..request(&[&merge], &[])
    };

    // Act
    let batches = streamed(&repo, &first_parent).await;

    // Assert
    assert_eq!(
        texts(&batches),
        [merge.as_str(), main.as_str(), root.as_str()]
    );
}

#[tokio::test]
async fn should_tell_merge_commits_apart_in_a_walk_with_parents() {
    // Arrange
    let (repo, root, main, side) = diverged();
    let merge = repo.merge(&["side"], "Merge side");
    let runner = repo.runner();
    let service = GitService::new(&runner, repo.data_dir());
    let mut walked = Vec::new();

    // Act
    service
        .rev_list_with_parents(
            &folder(&repo),
            &request(&[&merge], &[]),
            &cancel(),
            &mut |batch| {
                walked.extend(batch.iter().cloned());
                ControlFlow::Continue(())
            },
        )
        .await
        .expect("the walk succeeds");

    // Assert
    let merges: Vec<&str> = walked
        .iter()
        .filter(|commit| commit.is_merge)
        .map(|commit| commit.sha.as_str())
        .collect();
    let mut shas: Vec<&str> = walked.iter().map(|commit| commit.sha.as_str()).collect();
    shas.sort_unstable();
    let mut expected = vec![merge.as_str(), main.as_str(), side.as_str(), root.as_str()];
    expected.sort_unstable();
    assert_eq!(merges, [merge.as_str()]);
    assert_eq!(shas, expected);
}
