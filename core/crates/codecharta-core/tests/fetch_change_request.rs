mod support;

use std::path::Path;
use std::time::{Duration, Instant};

use codecharta_core::hosting::{fetch_change_request_head, remove_fetched_refs};
use codecharta_core_api::error::ErrorCode;
use codecharta_core_api::methods::hosting::{FetchChangeRequestHeadParams, HostingProvider};
use tokio_util::sync::CancellationToken;

use support::TempRepo;
use support::git_operations::{OperationsHarness, code_of, context, project_folder};

const PULL_REQUEST: u64 = 7;
const CANCEL_AFTER: Duration = Duration::from_millis(500);
const SLOW_UPLOAD_PACK: &str = "sleep 30; git-upload-pack";
const CANCELLED_WITHIN: Duration = Duration::from_secs(10);

/// A clone whose bare origin carries `refs/pull/7/head` (a commit the clone does not have) and a tag.
fn repo_with_a_pull_request_on_its_origin() -> (TempRepo, String) {
    let repo = TempRepo::new();
    repo.commit_file("a.txt", "a", "Root");
    let repo = repo.with_bare_origin();
    let contributor = repo.clone_of_origin();
    let head = contributor.commit_file("b.txt", "b", "Pull request");
    contributor.git(&["push", "--quiet", "origin", "HEAD:refs/heads/contribution"]);
    let origin = repo.origin_path().to_string_lossy().into_owned();
    let pull_ref = format!("refs/pull/{PULL_REQUEST}/head");
    repo.git(&["--git-dir", &origin, "update-ref", &pull_ref, head.trim()]);
    repo.git(&[
        "--git-dir",
        &origin,
        "update-ref",
        "-d",
        "refs/heads/contribution",
    ]);
    repo.git(&["--git-dir", &origin, "tag", "v1", head.trim()]);
    (repo, head.trim().to_string())
}

fn params(remote: &str, number: u64) -> FetchChangeRequestHeadParams {
    FetchChangeRequestHeadParams {
        folder: project_folder(Path::new("."))
            .repo
            .expect("a project folder"),
        remote: remote.to_string(),
        provider: HostingProvider::Github,
        number,
    }
}

fn refs_except_private(repo: &TempRepo) -> String {
    repo.git(&["for-each-ref", "--format=%(refname)"])
        .lines()
        .filter(|name| !name.starts_with("refs/codecharta/"))
        .collect::<Vec<_>>()
        .join("\n")
}

#[tokio::test]
async fn should_fetch_the_head_into_the_private_namespace() {
    // Arrange
    let (repo, head) = repo_with_a_pull_request_on_its_origin();
    let (runner, harness) = (repo.runner(), OperationsHarness::default());
    let service = harness.service(&runner, repo.data_dir());
    let cancel = CancellationToken::new();

    // Act
    let fetched = fetch_change_request_head(
        &service,
        &project_folder(repo.path()),
        &params("origin", PULL_REQUEST),
        &context(&cancel),
    )
    .await
    .unwrap();

    // Assert
    assert_eq!(fetched.git_ref.as_str(), "refs/codecharta/pr/7");
    assert_eq!(fetched.commit.as_str(), head);
    assert_eq!(
        repo.git(&["rev-parse", "refs/codecharta/pr/7"]).trim(),
        head
    );
}

#[tokio::test]
async fn should_report_a_number_that_does_not_exist_on_the_remote() {
    // Arrange
    let (repo, _) = repo_with_a_pull_request_on_its_origin();
    let (runner, harness) = (repo.runner(), OperationsHarness::default());
    let service = harness.service(&runner, repo.data_dir());
    let cancel = CancellationToken::new();

    // Act
    let missing = fetch_change_request_head(
        &service,
        &project_folder(repo.path()),
        &params("origin", 99),
        &context(&cancel),
    )
    .await;

    // Assert
    assert_eq!(code_of(missing), ErrorCode::RefNotOnRemote);
    assert!(
        repo.try_git(&["rev-parse", "--verify", "--quiet", "refs/codecharta/pr/99"])
            .is_none()
    );
}

#[tokio::test]
async fn should_not_create_a_branch_or_tag() {
    // Arrange
    let (repo, _) = repo_with_a_pull_request_on_its_origin();
    let (runner, harness) = (repo.runner(), OperationsHarness::default());
    let service = harness.service(&runner, repo.data_dir());
    let cancel = CancellationToken::new();
    let before = refs_except_private(&repo);

    // Act
    fetch_change_request_head(
        &service,
        &project_folder(repo.path()),
        &params("origin", PULL_REQUEST),
        &context(&cancel),
    )
    .await
    .unwrap();

    // Assert
    assert_eq!(refs_except_private(&repo), before);
    assert_eq!(repo.git(&["tag", "--list"]).trim(), "");
    assert!(!repo.git(&["branch", "-a"]).contains("pr/7"));
}

#[tokio::test]
async fn should_reject_a_remote_that_is_not_configured() {
    // Arrange
    let (repo, _) = repo_with_a_pull_request_on_its_origin();
    let (runner, harness) = (repo.runner(), OperationsHarness::default());
    let service = harness.service(&runner, repo.data_dir());
    let cancel = CancellationToken::new();
    let origin_url = repo.origin_path().to_string_lossy().into_owned();
    let folder = project_folder(repo.path());

    // Act
    let unknown = fetch_change_request_head(
        &service,
        &folder,
        &params("elsewhere", PULL_REQUEST),
        &context(&cancel),
    )
    .await;
    let by_url = fetch_change_request_head(
        &service,
        &folder,
        &params(&origin_url, PULL_REQUEST),
        &context(&cancel),
    )
    .await;
    let zero =
        fetch_change_request_head(&service, &folder, &params("origin", 0), &context(&cancel)).await;

    // Assert
    assert_eq!(code_of(unknown), ErrorCode::NotFound);
    assert_eq!(code_of(by_url), ErrorCode::NotFound);
    assert_eq!(code_of(zero), ErrorCode::BadRequest);
    assert!(
        repo.try_git(&["rev-parse", "--verify", "--quiet", "refs/codecharta/pr/7"])
            .is_none()
    );
}

#[tokio::test]
async fn should_remove_only_refs_under_the_private_namespace() {
    // Arrange
    let (repo, _) = repo_with_a_pull_request_on_its_origin();
    for private_ref in ["refs/codecharta/pr/7", "refs/codecharta/mr/3"] {
        repo.git(&["update-ref", private_ref, "HEAD"]);
    }
    repo.git(&["update-ref", "refs/codecharta-other/x", "HEAD"]);
    let others_before = refs_except_private(&repo);
    let (runner, harness) = (repo.runner(), OperationsHarness::default());
    let service = harness.service(&runner, repo.data_dir());
    let cancel = CancellationToken::new();
    let folder = project_folder(repo.path());

    // Act
    let removed = remove_fetched_refs(&service, &folder, &context(&cancel))
        .await
        .unwrap();
    let again = remove_fetched_refs(&service, &folder, &context(&cancel))
        .await
        .unwrap();

    // Assert
    assert_eq!(removed.removed, 2);
    assert_eq!(again.removed, 0);
    assert_eq!(repo.git(&["for-each-ref", "refs/codecharta/"]), "");
    assert_eq!(refs_except_private(&repo), others_before);
    assert!(others_before.contains("refs/codecharta-other/x"));
}

#[tokio::test]
async fn should_cancel_a_running_fetch() {
    // Arrange
    let (repo, _) = repo_with_a_pull_request_on_its_origin();
    repo.git(&["config", "remote.origin.uploadpack", SLOW_UPLOAD_PACK]);
    let (runner, harness) = (repo.runner(), OperationsHarness::default());
    let service = harness.service(&runner, repo.data_dir());
    let cancel = CancellationToken::new();
    let canceller = cancel.clone();
    tokio::spawn(async move {
        tokio::time::sleep(CANCEL_AFTER).await;
        canceller.cancel();
    });
    let started = Instant::now();

    // Act
    let result = fetch_change_request_head(
        &service,
        &project_folder(repo.path()),
        &params("origin", PULL_REQUEST),
        &context(&cancel),
    )
    .await;

    // Assert
    assert_eq!(code_of(result), ErrorCode::Cancelled);
    assert!(started.elapsed() < CANCELLED_WITHIN);
    assert!(
        repo.try_git(&["rev-parse", "--verify", "--quiet", "refs/codecharta/pr/7"])
            .is_none()
    );
}
