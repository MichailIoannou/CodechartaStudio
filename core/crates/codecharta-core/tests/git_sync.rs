mod support;

use std::ffi::OsString;
use std::path::PathBuf;

use codecharta_core::CoreError;
use codecharta_core::git::askpass::AskpassHelpers;
use codecharta_core::git::command::GitInvocation;
use codecharta_core::git::error::SSH_AGENT_MESSAGE;
use codecharta_core::git::sync::PushRequest;
use codecharta_core_api::error::ErrorCode;
use codecharta_core_api::methods::git::{
    GitAbortableOperation, GitOperationResult, GitPullMode, OperationInProgress,
};
use codecharta_core_api::values::{CommitSha, FullRefName};
use tokio_util::sync::CancellationToken;

use support::git_operations::{OperationsHarness, code_of, context, detail_of, project_folder};
use support::{RecordingGit, TempRepo};

const MAIN: &str = "refs/heads/main";
const ORIGIN: &str = "origin";
const ASKPASS_ENDPOINT: &str = "codecharta-askpass-test";
const FORCE_WITH_LEASE_OPTION: &str = "--force-with-lease=";
const SSH_REFUSING_KEYS: &str =
    "sh -c 'echo \"git@example.test: Permission denied (publickey).\" >&2; exit 255'";

/// A clone with a bare origin, and a second clone of that origin to move it behind the first one's back.
fn repo_with_other_clone() -> (TempRepo, TempRepo) {
    let repo = TempRepo::new();
    repo.commit_file("a.txt", "a\n", "Root");
    let repo = repo.with_bare_origin();
    let other = repo.clone_of_origin();
    (repo, other)
}

/// Commits `file` in `clone` and pushes it to origin; answers the commit.
fn push_from(clone: &TempRepo, file: &str, content: &str) -> String {
    let sha = clone.commit_file(file, content, &format!("Change {file}"));
    clone.git(&["push", "--quiet", ORIGIN, "HEAD:refs/heads/main"]);
    sha
}

fn origin_main(repo: &TempRepo) -> String {
    repo.git(&["ls-remote", ORIGIN, MAIN])
        .split_whitespace()
        .next()
        .unwrap_or_default()
        .to_string()
}

fn head_of(repo: &TempRepo) -> String {
    repo.git(&["rev-parse", "HEAD"])
}

fn push_request(branch: &str, set_upstream: bool, expected: Option<&str>) -> PushRequest {
    PushRequest {
        branch_ref_name: FullRefName::try_from(branch).expect("a full ref name"),
        remote: ORIGIN.to_string(),
        set_upstream,
        force_with_lease_expected: expected.map(|sha| CommitSha::try_from(sha).expect("a sha")),
    }
}

fn helpers(ssh: Option<PathBuf>) -> AskpassHelpers {
    AskpassHelpers {
        git: std::env::temp_dir().join("codecharta-core"),
        ssh,
    }
}

fn message_of(result: Result<GitOperationResult, CoreError>) -> String {
    match result.expect_err("the operation is refused") {
        CoreError::Git(error) => error.message,
        other => panic!("not a refusal of git: {other:?}"),
    }
}

fn has_arg(invocation: &GitInvocation, wanted: &str) -> bool {
    invocation.args.iter().any(|arg| arg == wanted)
}

fn args_of(invocation: &GitInvocation) -> Vec<String> {
    invocation
        .args
        .iter()
        .map(|arg: &OsString| arg.to_string_lossy().into_owned())
        .collect()
}

#[tokio::test]
async fn should_fast_forward_on_pull() {
    // Arrange
    let (repo, other) = repo_with_other_clone();
    let pushed = push_from(&other, "b.txt", "b\n");
    let (runner, harness) = (repo.runner(), OperationsHarness::default());
    let service = harness.service(&runner, repo.data_dir());
    let cancel = CancellationToken::new();

    // Act
    let pulled = service
        .pull(
            &project_folder(repo.path()),
            GitPullMode::FfOnly,
            &context(&cancel),
        )
        .await
        .unwrap();

    // Assert
    assert_eq!(head_of(&repo), pushed);
    assert_eq!(pulled.refs.local_branches[0].commit, pushed);
}

#[tokio::test]
async fn should_fail_with_not_fast_forward_and_leave_the_repository_unchanged() {
    // Arrange
    let (repo, other) = repo_with_other_clone();
    push_from(&other, "b.txt", "b\n");
    let local = repo.commit_file("c.txt", "c\n", "Local");
    let (runner, harness) = (repo.runner(), OperationsHarness::default());
    let service = harness.service(&runner, repo.data_dir());
    let cancel = CancellationToken::new();

    // Act
    let refused = service
        .pull(
            &project_folder(repo.path()),
            GitPullMode::FfOnly,
            &context(&cancel),
        )
        .await;

    // Assert
    assert_eq!(code_of(refused), ErrorCode::NotFastForward);
    assert_eq!(head_of(&repo), local);
    assert_eq!(repo.git(&["status", "--porcelain"]), "");
}

#[tokio::test]
async fn should_rebase_or_merge_when_asked() {
    // Arrange
    let (repo, other) = repo_with_other_clone();
    let merging = repo.clone_of_origin();
    let pushed = push_from(&other, "b.txt", "b\n");
    repo.commit_file("c.txt", "c\n", "Rebased");
    let merged_local = merging.commit_file("d.txt", "d\n", "Merged");
    let harness = OperationsHarness::default();
    let (repo_runner, merging_runner) = (repo.runner(), merging.runner());
    let rebasing_service = harness.service(&repo_runner, repo.data_dir());
    let merging_service = harness.service(&merging_runner, merging.data_dir());
    let cancel = CancellationToken::new();

    // Act
    rebasing_service
        .pull(
            &project_folder(repo.path()),
            GitPullMode::Rebase,
            &context(&cancel),
        )
        .await
        .unwrap();
    merging_service
        .pull(
            &project_folder(merging.path()),
            GitPullMode::Merge,
            &context(&cancel),
        )
        .await
        .unwrap();

    // Assert
    assert_eq!(repo.git(&["rev-parse", "HEAD^"]), pushed);
    assert_eq!(
        merging.git(&["rev-list", "--parents", "-n", "1", "HEAD"]),
        format!("{} {merged_local} {pushed}", head_of(&merging))
    );
}

#[tokio::test]
async fn should_leave_the_operation_in_progress_on_conflicts() {
    // Arrange
    let (repo, other) = repo_with_other_clone();
    push_from(&other, "a.txt", "remote\n");
    repo.commit_file("a.txt", "local\n", "Local");
    let (runner, harness) = (repo.runner(), OperationsHarness::default());
    let service = harness.service(&runner, repo.data_dir());
    let cancel = CancellationToken::new();
    let folder = project_folder(repo.path());

    // Act
    let refused = service
        .pull(&folder, GitPullMode::Merge, &context(&cancel))
        .await;

    // Assert
    let status = service.status(&folder, &cancel).await.unwrap();
    assert!(detail_of(refused).contains("CONFLICT"));
    assert_eq!(
        status.operation_in_progress,
        Some(OperationInProgress::Merge)
    );
    assert_eq!(status.counts.conflicted, 1);
}

#[tokio::test]
async fn should_abort_a_merge_and_a_rebase() {
    // Arrange
    let (repo, other) = repo_with_other_clone();
    push_from(&other, "a.txt", "remote\n");
    let local = repo.commit_file("a.txt", "local\n", "Local");
    let (runner, harness) = (repo.runner(), OperationsHarness::default());
    let service = harness.service(&runner, repo.data_dir());
    let cancel = CancellationToken::new();
    let folder = project_folder(repo.path());

    // Act
    let merging = service
        .pull(&folder, GitPullMode::Merge, &context(&cancel))
        .await;
    let after_merge = service
        .abort_operation(&folder, GitAbortableOperation::Merge, &context(&cancel))
        .await
        .unwrap();
    let rebasing = service
        .pull(&folder, GitPullMode::Rebase, &context(&cancel))
        .await;
    let rebasing_status = service.status(&folder, &cancel).await.unwrap();
    let after_rebase = service
        .abort_operation(&folder, GitAbortableOperation::Rebase, &context(&cancel))
        .await
        .unwrap();

    // Assert
    assert_eq!(code_of(merging), ErrorCode::Conflicts);
    assert_eq!(code_of(rebasing), ErrorCode::Conflicts);
    assert_eq!(
        rebasing_status.operation_in_progress,
        Some(OperationInProgress::Rebase)
    );
    for result in [&after_merge, &after_rebase] {
        assert_eq!(result.status.operation_in_progress, None);
        assert_eq!(result.refs.local_branches[0].commit, local);
    }
    assert_eq!(repo.git(&["status", "--porcelain"]), "");
}

#[tokio::test]
async fn should_refuse_to_abort_an_operation_that_is_not_in_progress() {
    // Arrange
    let (repo, _) = repo_with_other_clone();
    let (runner, harness) = (repo.runner(), OperationsHarness::default());
    let service = harness.service(&runner, repo.data_dir());
    let cancel = CancellationToken::new();

    // Act
    let refused = service
        .abort_operation(
            &project_folder(repo.path()),
            GitAbortableOperation::Rebase,
            &context(&cancel),
        )
        .await;

    // Assert
    assert_eq!(code_of(refused), ErrorCode::NotAllowed);
}

#[tokio::test]
async fn should_refuse_to_pull_without_an_upstream_or_a_branch() {
    // Arrange
    let repo = TempRepo::new();
    repo.commit_file("a.txt", "a\n", "Root");
    let (runner, harness) = (repo.runner(), OperationsHarness::default());
    let service = harness.service(&runner, repo.data_dir());
    let cancel = CancellationToken::new();
    let folder = project_folder(repo.path());

    // Act
    let without_upstream = service
        .pull(&folder, GitPullMode::FfOnly, &context(&cancel))
        .await;
    repo.git(&["switch", "--quiet", "--detach"]);
    let detached = service
        .pull(&folder, GitPullMode::FfOnly, &context(&cancel))
        .await;

    // Assert
    assert_eq!(code_of(without_upstream), ErrorCode::NoUpstream);
    assert_eq!(code_of(detached), ErrorCode::NotAllowed);
}

#[tokio::test]
async fn should_set_the_upstream_on_the_first_push() {
    // Arrange
    let (repo, _) = repo_with_other_clone();
    repo.git(&["switch", "--quiet", "-c", "feature"]);
    let feature = repo.commit_file("f.txt", "f\n", "Feature");
    let (runner, harness) = (repo.runner(), OperationsHarness::default());
    let service = harness.service(&runner, repo.data_dir());
    let cancel = CancellationToken::new();

    // Act
    let pushed = service
        .push(
            &project_folder(repo.path()),
            &push_request("refs/heads/feature", true, None),
            &context(&cancel),
        )
        .await
        .unwrap();

    // Assert
    let upstream = pushed.status.upstream.expect("an upstream");
    assert_eq!(upstream.ref_name, "refs/remotes/origin/feature");
    assert_eq!(upstream.ahead, Some(0));
    assert!(
        repo.git(&["ls-remote", ORIGIN, "refs/heads/feature"])
            .starts_with(&feature)
    );
}

#[tokio::test]
async fn should_fail_with_push_rejected_when_the_remote_is_ahead() {
    // Arrange
    let (repo, other) = repo_with_other_clone();
    let remote = push_from(&other, "b.txt", "b\n");
    repo.commit_file("c.txt", "c\n", "Local");
    let (runner, harness) = (repo.runner(), OperationsHarness::default());
    let service = harness.service(&runner, repo.data_dir());
    let cancel = CancellationToken::new();

    // Act
    let refused = service
        .push(
            &project_folder(repo.path()),
            &push_request(MAIN, false, None),
            &context(&cancel),
        )
        .await;

    // Assert
    assert_eq!(code_of(refused), ErrorCode::PushRejected);
    assert_eq!(origin_main(&repo), remote);
}

#[tokio::test]
async fn should_force_with_lease_only_with_the_expected_sha() {
    // Arrange
    let (repo, other) = repo_with_other_clone();
    let remote = push_from(&other, "b.txt", "b\n");
    repo.git(&["fetch", "--quiet"]);
    let local = repo.commit_file("c.txt", "c\n", "Local");
    let runner = RecordingGit::new(repo.runner());
    let harness = OperationsHarness::default();
    let service = harness.service(&runner, repo.data_dir());
    let cancel = CancellationToken::new();

    // Act
    service
        .push(
            &project_folder(repo.path()),
            &push_request(MAIN, false, Some(&remote)),
            &context(&cancel),
        )
        .await
        .unwrap();

    // Assert
    assert_eq!(origin_main(&repo), local);
    let pushes = runner.runs_of("push");
    assert_eq!(pushes.len(), 1);
    assert!(has_arg(
        &pushes[0],
        &format!("{FORCE_WITH_LEASE_OPTION}{MAIN}:{remote}")
    ));
}

#[tokio::test]
async fn should_fail_with_stale_push_lease_when_the_remote_moved() {
    // Arrange
    let (repo, other) = repo_with_other_clone();
    let seen = push_from(&other, "b.txt", "b\n");
    repo.git(&["fetch", "--quiet"]);
    let moved = push_from(&other, "b.txt", "moved\n");
    repo.commit_file("c.txt", "c\n", "Local");
    let (runner, harness) = (repo.runner(), OperationsHarness::default());
    let service = harness.service(&runner, repo.data_dir());
    let cancel = CancellationToken::new();

    // Act
    let refused = service
        .push(
            &project_folder(repo.path()),
            &push_request(MAIN, false, Some(&seen)),
            &context(&cancel),
        )
        .await;

    // Assert
    assert_eq!(code_of(refused), ErrorCode::StalePushLease);
    assert_eq!(origin_main(&repo), moved);
}

#[tokio::test]
async fn should_never_pass_force_to_git() {
    // Arrange
    let (repo, other) = repo_with_other_clone();
    let remote = push_from(&other, "b.txt", "b\n");
    repo.git(&["fetch", "--quiet"]);
    repo.commit_file("c.txt", "c\n", "Local");
    let runner = RecordingGit::new(repo.runner());
    let harness = OperationsHarness::default();
    let service = harness.service(&runner, repo.data_dir());
    let cancel = CancellationToken::new();
    let folder = project_folder(repo.path());

    // Act
    let rejected = service
        .push(&folder, &push_request(MAIN, false, None), &context(&cancel))
        .await;
    service
        .push(
            &folder,
            &push_request(MAIN, true, Some(&remote)),
            &context(&cancel),
        )
        .await
        .unwrap();

    // Assert
    assert_eq!(code_of(rejected), ErrorCode::PushRejected);
    let args: Vec<String> = runner.invocations().iter().flat_map(args_of).collect();
    assert!(
        !args
            .iter()
            .any(|arg| arg == "--force" || arg == "-f" || arg == "--force-with-lease")
    );
    let leases: Vec<&String> = args.iter().filter(|arg| arg.contains("force")).collect();
    assert_eq!(
        leases,
        [&format!("{FORCE_WITH_LEASE_OPTION}{MAIN}:{remote}")]
    );
}

#[tokio::test]
async fn should_pass_askpass_and_progress_to_every_network_command() {
    // Arrange
    let (repo, other) = repo_with_other_clone();
    push_from(&other, "b.txt", "b\n");
    let runner = RecordingGit::new(repo.runner());
    let harness = OperationsHarness::default();
    harness.attach_askpass(ASKPASS_ENDPOINT, helpers(None));
    let service = harness.service(&runner, repo.data_dir());
    let cancel = CancellationToken::new();
    let folder = project_folder(repo.path());

    // Act
    service
        .pull(&folder, GitPullMode::FfOnly, &context(&cancel))
        .await
        .unwrap();
    repo.commit_file("c.txt", "c\n", "Local");
    service
        .push(&folder, &push_request(MAIN, false, None), &context(&cancel))
        .await
        .unwrap();

    // Assert
    let network: Vec<GitInvocation> = [runner.runs_of("pull"), runner.runs_of("push")].concat();
    assert_eq!(network.len(), 2);
    for invocation in &network {
        let askpass = invocation.askpass.as_ref().expect("the askpass setup");
        assert_eq!(askpass.endpoint, ASKPASS_ENDPOINT);
        assert!(has_arg(invocation, "--progress"));
    }
    assert!(
        runner
            .invocations()
            .iter()
            .filter(|invocation| !network.contains(invocation))
            .all(|invocation| invocation.askpass.is_none())
    );
}

#[tokio::test]
async fn should_name_ssh_agent_when_ssh_cannot_ask_for_a_passphrase() {
    // Arrange
    let repo = TempRepo::new();
    repo.commit_file("a.txt", "a\n", "Root");
    repo.add_remote(ORIGIN, "git@example.test:repo.git");
    repo.git(&["config", "core.sshCommand", SSH_REFUSING_KEYS]);
    let runner = repo.runner();
    let (without_ssh_helper, with_ssh_helper) =
        (OperationsHarness::default(), OperationsHarness::default());
    without_ssh_helper.attach_askpass(ASKPASS_ENDPOINT, helpers(None));
    with_ssh_helper.attach_askpass(ASKPASS_ENDPOINT, helpers(Some(std::env::temp_dir())));
    let cancel = CancellationToken::new();
    let folder = project_folder(repo.path());
    let request = push_request(MAIN, false, None);

    // Act
    let unaskable = without_ssh_helper
        .service(&runner, repo.data_dir())
        .push(&folder, &request, &context(&cancel))
        .await;
    let askable = with_ssh_helper
        .service(&runner, repo.data_dir())
        .push(&folder, &request, &context(&cancel))
        .await;

    // Assert
    assert_eq!(message_of(unaskable), SSH_AGENT_MESSAGE);
    assert_ne!(message_of(askable), SSH_AGENT_MESSAGE);
}
