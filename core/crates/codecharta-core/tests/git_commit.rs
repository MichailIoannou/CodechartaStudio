mod support;

use std::ffi::OsString;
use std::fs;
use std::path::{Path, PathBuf};

use codecharta_core::git::commit::{CommitRequest, MESSAGE_FOLDER_NAME};
use codecharta_core_api::error::ErrorCode;
use codecharta_core_api::methods::git::OperationInProgress;
use codecharta_core_api::values::{CommitBody, CommitSubject};
use tokio_util::sync::CancellationToken;

use support::git_fixture::AUTHOR_NAME;
use support::git_operations::{OperationsHarness, code_of, context, detail_of, project_folder};
use support::{RecordingGit, TempRepo, wait_until_executable};

const FAILING_HOOK: &str = "#!/bin/sh\necho 'lint: trailing space in a.txt'\nexit 1\n";
const PRE_COMMIT: &str = "pre-commit";
#[cfg(unix)]
const EXECUTABLE_MODE: u32 = 0o755;

fn request(subject: &str, body: &str, amend: bool) -> CommitRequest {
    CommitRequest {
        subject: CommitSubject::try_from(subject).expect("a subject"),
        body: CommitBody::try_from(body).expect("a body"),
        amend,
    }
}

/// `a.txt` committed on `main`.
fn committed_repo() -> TempRepo {
    let repo = TempRepo::new();
    repo.commit("Root", &[("a.txt", "a\n")]);
    repo
}

/// `a.txt` changed and staged.
fn repo_with_staged_change() -> TempRepo {
    let repo = committed_repo();
    repo.write_file("a.txt", "changed\n");
    repo.git(&["add", "--", "a.txt"]);
    repo
}

/// `a.txt` changed differently on `main` and on `other`.
fn repo_with_diverged_branches() -> TempRepo {
    let repo = committed_repo();
    repo.branch("other");
    repo.commit_file("a.txt", "main\n", "Main change");
    repo.checkout("other");
    repo.commit_file("a.txt", "other\n", "Other change");
    repo.checkout("main");
    repo
}

fn hook_path(repo: &TempRepo, name: &str) -> PathBuf {
    repo.path().join(".git").join("hooks").join(name)
}

fn install_hook(repo: &TempRepo, name: &str, script: &str) {
    let hook = hook_path(repo, name);
    fs::create_dir_all(hook.parent().expect("hooks have a folder"))
        .expect("the hooks folder can be created");
    fs::write(&hook, script).expect("the hook can be written");
    make_executable(&hook);
    wait_until_executable(&hook);
}

#[cfg(unix)]
fn make_executable(file: &Path) {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(file, fs::Permissions::from_mode(EXECUTABLE_MODE))
        .expect("the hook can be made executable");
}

/// git for Windows runs a hook through its own shell, whatever the file's permissions.
#[cfg(not(unix))]
fn make_executable(_file: &Path) {}

fn message_of_head(repo: &TempRepo) -> String {
    repo.git(&["log", "-1", "--format=%B"])
}

fn commit_count(repo: &TempRepo) -> String {
    repo.git(&["rev-list", "--count", "HEAD"])
}

fn message_folder(repo: &TempRepo) -> PathBuf {
    repo.data_dir().join(MESSAGE_FOLDER_NAME)
}

fn files_in(folder: &Path) -> Vec<PathBuf> {
    fs::read_dir(folder)
        .map(|entries| {
            entries
                .map(|entry| entry.expect("the entry can be read").path())
                .collect()
        })
        .unwrap_or_default()
}

async fn commit(repo: &TempRepo, request: CommitRequest) -> codecharta_core::CoreResult<()> {
    let (runner, harness) = (repo.runner(), OperationsHarness::default());
    let service = harness.service(&runner, repo.data_dir());
    let cancel = CancellationToken::new();
    service
        .commit(&project_folder(repo.path()), request, &context(&cancel))
        .await
        .map(drop)
}

#[tokio::test]
async fn should_commit_staged_files_with_subject_and_body() {
    // Arrange
    let repo = repo_with_staged_change();
    repo.write_file("untracked.txt", "new\n");
    let (runner, harness) = (repo.runner(), OperationsHarness::default());
    let service = harness.service(&runner, repo.data_dir());
    let cancel = CancellationToken::new();

    // Act
    let result = service
        .commit(
            &project_folder(repo.path()),
            request("Change a", "Why it changed.\n\nMore detail.", false),
            &context(&cancel),
        )
        .await
        .unwrap();

    // Assert
    assert_eq!(
        message_of_head(&repo),
        "Change a\n\nWhy it changed.\n\nMore detail."
    );
    assert_eq!(repo.git(&["log", "-1", "--format=%an"]), AUTHOR_NAME);
    assert_eq!(repo.git(&["show", "HEAD:a.txt"]), "changed");
    assert_eq!(commit_count(&repo), "2");
    assert_eq!(result.status.counts.staged, 0);
    assert_eq!(result.status.counts.untracked, 1);
}

#[tokio::test]
async fn should_keep_a_body_line_starting_with_hash() {
    // Arrange
    let repo = repo_with_staged_change();

    // Act
    commit(&repo, request("Subject", "# not a comment\nsecond", false))
        .await
        .unwrap();

    // Assert
    assert_eq!(message_of_head(&repo), "Subject\n\n# not a comment\nsecond");
}

#[tokio::test]
async fn should_amend_the_last_commit() {
    // Arrange
    let repo = committed_repo();
    let parent = repo.git(&["rev-parse", "HEAD"]);
    repo.commit_file("b.txt", "b\n", "Frist");

    // Act
    commit(&repo, request("First", "", true)).await.unwrap();

    // Assert
    assert_eq!(message_of_head(&repo), "First");
    assert_eq!(commit_count(&repo), "2");
    assert_eq!(repo.git(&["rev-parse", "HEAD^"]), parent);
    assert_eq!(repo.git(&["show", "HEAD:b.txt"]), "b");
}

#[tokio::test]
async fn should_refuse_to_commit_with_nothing_staged() {
    // Arrange
    let repo = committed_repo();
    repo.write_file("a.txt", "unstaged\n");
    let head = repo.git(&["rev-parse", "HEAD"]);

    // Act
    let refused = commit(&repo, request("Nothing", "", false)).await;

    // Assert
    assert_eq!(code_of(refused), ErrorCode::NothingToCommit);
    assert_eq!(repo.git(&["rev-parse", "HEAD"]), head);
}

#[tokio::test]
async fn should_fail_with_identity_unknown_without_identity_and_leave_the_git_config_unchanged() {
    // Arrange
    let repo = repo_with_staged_change();
    let local_config = repo.path().join(".git").join("config");
    let configs_before = (
        fs::read_to_string(&local_config).unwrap(),
        fs::read_to_string(repo.global_config()).unwrap(),
    );
    let head = repo.git(&["rev-parse", "HEAD"]);
    let (runner, harness) = (repo.runner_without_identity(), OperationsHarness::default());
    let service = harness.service(&runner, repo.data_dir());
    let cancel = CancellationToken::new();

    // Act
    let refused = service
        .commit(
            &project_folder(repo.path()),
            request("Anonymous", "", false),
            &context(&cancel),
        )
        .await;

    // Assert
    assert_eq!(code_of(refused), ErrorCode::IdentityUnknown);
    assert_eq!(repo.git(&["rev-parse", "HEAD"]), head);
    let configs_after = (
        fs::read_to_string(&local_config).unwrap(),
        fs::read_to_string(repo.global_config()).unwrap(),
    );
    assert_eq!(configs_after, configs_before);
}

#[tokio::test]
async fn should_fail_with_hook_failed_and_its_output_when_the_pre_commit_hook_exits_1() {
    // Arrange
    let repo = repo_with_staged_change();
    install_hook(&repo, PRE_COMMIT, FAILING_HOOK);
    let head = repo.git(&["rev-parse", "HEAD"]);

    // Act
    let refused = commit(&repo, request("Blocked", "", false)).await;
    let detail = detail_of(commit(&repo, request("Blocked", "", false)).await);

    // Assert
    assert_eq!(code_of(refused), ErrorCode::HookFailed);
    assert_eq!(detail, "lint: trailing space in a.txt");
    assert_eq!(repo.git(&["rev-parse", "HEAD"]), head);
}

#[tokio::test]
async fn should_conclude_a_merge() {
    // Arrange
    let repo = repo_with_diverged_branches();
    assert!(repo.try_git(&["merge", "--quiet", "other"]).is_none());
    repo.write_file("a.txt", "resolved\n");
    repo.git(&["add", "--", "a.txt"]);
    let (runner, harness) = (repo.runner(), OperationsHarness::default());
    let service = harness.service(&runner, repo.data_dir());
    let cancel = CancellationToken::new();

    // Act
    let result = service
        .commit(
            &project_folder(repo.path()),
            request("Merge other", "", false),
            &context(&cancel),
        )
        .await
        .unwrap();

    // Assert
    let parents = repo.git(&["rev-list", "--parents", "-n", "1", "HEAD"]);
    assert_eq!(parents.split(' ').count(), 3);
    assert_eq!(message_of_head(&repo), "Merge other");
    assert_eq!(result.status.operation_in_progress, None);
}

#[tokio::test]
async fn should_refuse_to_commit_with_conflicted_files() {
    // Arrange
    let repo = repo_with_diverged_branches();
    assert!(repo.try_git(&["merge", "--quiet", "other"]).is_none());

    // Act
    let refused = commit(&repo, request("Merge other", "", false)).await;

    // Assert
    assert_eq!(code_of(refused), ErrorCode::Conflicts);
}

#[tokio::test]
async fn should_refuse_to_commit_during_a_rebase() {
    // Arrange
    let repo = repo_with_diverged_branches();
    repo.checkout("other");
    assert!(repo.try_git(&["rebase", "main"]).is_none());
    let (runner, harness) = (repo.runner(), OperationsHarness::default());
    let service = harness.service(&runner, repo.data_dir());
    let cancel = CancellationToken::new();

    // Act
    let refused = service
        .commit(
            &project_folder(repo.path()),
            request("During rebase", "", false),
            &context(&cancel),
        )
        .await;

    // Assert
    assert_eq!(code_of(refused), ErrorCode::OperationInProgress);
    let status = service
        .status(&project_folder(repo.path()), &cancel)
        .await
        .unwrap();
    assert_eq!(
        status.operation_in_progress,
        Some(OperationInProgress::Rebase)
    );
}

#[tokio::test]
async fn should_delete_the_message_file_after_success_and_failure() {
    // Arrange
    let repo = repo_with_staged_change();
    install_hook(&repo, PRE_COMMIT, FAILING_HOOK);

    // Act
    let failed = commit(&repo, request("Blocked", "", false)).await;
    let left_after_failure = files_in(&message_folder(&repo));
    fs::remove_file(hook_path(&repo, PRE_COMMIT)).expect("the hook can be removed");
    let succeeded = commit(&repo, request("Passed", "", false)).await;
    let left_after_success = files_in(&message_folder(&repo));

    // Assert
    assert_eq!(code_of(failed), ErrorCode::HookFailed);
    assert!(succeeded.is_ok());
    assert_eq!(left_after_failure, Vec::<PathBuf>::new());
    assert_eq!(left_after_success, Vec::<PathBuf>::new());
}

#[tokio::test]
async fn should_commit_with_the_configured_identity_only_from_a_message_file_outside_the_repository()
 {
    // Arrange
    let repo = repo_with_staged_change();
    let recording = RecordingGit::new(repo.runner());
    let harness = OperationsHarness::default();
    let service = harness.service(&recording, repo.data_dir());
    let cancel = CancellationToken::new();

    // Act
    service
        .commit(
            &project_folder(repo.path()),
            request("Recorded", "", false),
            &context(&cancel),
        )
        .await
        .unwrap();

    // Assert
    let runs = recording.runs_of("commit");
    assert_eq!(runs.len(), 1);
    let args = &runs[0].args;
    let position = |value: &str| args.iter().position(|arg| arg == value);
    let commit_at = position("commit").unwrap();
    assert_eq!(
        args[commit_at - 1],
        OsString::from("user.useConfigOnly=true")
    );
    assert_eq!(args[commit_at - 2], OsString::from("-c"));
    assert!(position("--cleanup=whitespace").unwrap() > commit_at);
    assert_eq!(position("--no-verify"), None);
    let file = PathBuf::from(&args[position("-F").unwrap() + 1]);
    assert_eq!(file.parent(), Some(message_folder(&repo).as_path()));
    assert!(!file.starts_with(repo.path()));
}
