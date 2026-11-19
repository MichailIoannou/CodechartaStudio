mod support;

use std::time::{Duration, Instant};

use codecharta_core::git::operation::OperationContext;
use codecharta_core::git::sync::{FetchRefspecsRequest, Refspec};
use codecharta_core_api::error::ErrorCode;
use codecharta_core_api::methods::git::GitFetchResult;
use tokio_util::sync::CancellationToken;

use support::TempRepo;
use support::git_operations::{OperationsHarness, ProgressLog, code_of, context, project_folder};

const CANCEL_AFTER: Duration = Duration::from_millis(500);
const SLOW_UPLOAD_PACK: &str = "sleep 30; git-upload-pack";
const CANCELLED_WITHIN: Duration = Duration::from_secs(10);

fn remote_branch_names(result: &GitFetchResult) -> Vec<String> {
    result
        .refs
        .remote_branches
        .iter()
        .map(|branch| branch.name.clone())
        .collect()
}

/// A clone with a bare origin that also has `gone`, then a second clone pushes `fresh` and deletes `gone`
/// behind its back.
fn repo_behind_its_origin() -> (TempRepo, String) {
    let repo = TempRepo::new();
    repo.commit_file("a.txt", "a", "Root");
    let repo = repo.with_bare_origin();
    repo.git(&["push", "--quiet", "origin", "HEAD:refs/heads/gone"]);
    let other = repo.clone_of_origin();
    let fresh = other.commit_file("fresh.txt", "fresh", "Fresh");
    other.git(&["push", "--quiet", "origin", "HEAD:refs/heads/fresh"]);
    other.git(&["push", "--quiet", "origin", "--delete", "gone"]);
    (repo, fresh)
}

#[tokio::test]
async fn should_fetch_a_new_remote_branch_and_prune_a_deleted_one_only_when_asked() {
    // Arrange
    let (repo, _) = repo_behind_its_origin();
    let (runner, harness) = (repo.runner(), OperationsHarness::default());
    let service = harness.service(&runner, repo.data_dir());
    let cancel = CancellationToken::new();
    let folder = project_folder(repo.path());

    // Act
    let kept = service
        .fetch(&folder, false, &context(&cancel))
        .await
        .unwrap();
    let pruned = service
        .fetch(&folder, true, &context(&cancel))
        .await
        .unwrap();

    // Assert
    assert_eq!(kept.updated_refs, 1);
    assert!(remote_branch_names(&kept).contains(&"origin/fresh".to_string()));
    assert!(remote_branch_names(&kept).contains(&"origin/gone".to_string()));
    assert_eq!(pruned.updated_refs, 1);
    assert!(!remote_branch_names(&pruned).contains(&"origin/gone".to_string()));
}

#[tokio::test]
async fn should_report_fetch_progress() {
    // Arrange
    let (repo, _) = repo_behind_its_origin();
    let (runner, harness) = (repo.runner(), OperationsHarness::default());
    let service = harness.service(&runner, repo.data_dir());
    let cancel = CancellationToken::new();
    let log = ProgressLog::default();
    let report = |update| log.push(update);
    let context = OperationContext {
        cancel: &cancel,
        request_id: None,
        progress: &report,
    };

    // Act
    service
        .fetch(&project_folder(repo.path()), false, &context)
        .await
        .unwrap();

    // Assert
    let updates = log.updates();
    assert!(!updates.is_empty());
    assert!(
        updates
            .iter()
            .all(|update| !update.message.starts_with("remote: "))
    );
}

#[tokio::test]
async fn should_abort_a_running_fetch_when_cancelled() {
    // Arrange
    let (repo, _) = repo_behind_its_origin();
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
    let result = service
        .fetch(&project_folder(repo.path()), false, &context(&cancel))
        .await;

    // Assert
    assert_eq!(code_of(result), ErrorCode::Cancelled);
    assert!(started.elapsed() < CANCELLED_WITHIN);
    assert!(
        repo.try_git(&[
            "rev-parse",
            "--verify",
            "--quiet",
            "refs/remotes/origin/fresh"
        ])
        .is_none()
    );
}

#[tokio::test]
async fn should_write_refs_codecharta_and_refuse_other_destinations() {
    // Arrange
    let (repo, fresh) = repo_behind_its_origin();
    let (runner, harness) = (repo.runner(), OperationsHarness::default());
    let service = harness.service(&runner, repo.data_dir());
    let cancel = CancellationToken::new();
    let folder = project_folder(repo.path());
    let request = |remote: &str| FetchRefspecsRequest {
        remote: remote.to_string(),
        refspecs: vec![Refspec::new(true, "refs/heads/fresh", "refs/codecharta/pr/7").unwrap()],
    };

    // Act
    let fetched = service
        .fetch_refspecs(&folder, &request("origin"), &context(&cancel))
        .await
        .unwrap();
    let unknown_remote = service
        .fetch_refspecs(&folder, &request("elsewhere"), &context(&cancel))
        .await;
    let elsewhere = Refspec::new(true, "refs/heads/fresh", "refs/heads/fresh");

    // Assert
    assert_eq!(repo.git(&["rev-parse", "refs/codecharta/pr/7"]), fresh);
    assert!(!remote_branch_names(&fetched).contains(&"origin/fresh".to_string()));
    assert_eq!(code_of(unknown_remote), ErrorCode::NotFound);
    assert_eq!(code_of(elsewhere), ErrorCode::BadRequest);
    assert!(
        repo.try_git(&["rev-parse", "--verify", "--quiet", "refs/heads/fresh"])
            .is_none()
    );
}
