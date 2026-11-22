mod support;

use std::path::Path;

use codecharta_core::CoreResult;
use codecharta_core::git::locator::{PathStyle, normalise_repository_id};
use codecharta_core::git::{GitFolder, GitService};
use codecharta_core_api::error::ErrorCode;
use codecharta_core_api::methods::git::GitRepositoryInfo;
use tokio_util::sync::CancellationToken;

use support::TempRepo;

async fn info_of(repo: &TempRepo, folder: &Path) -> CoreResult<GitRepositoryInfo> {
    let runner = repo.runner();
    GitService::new(&runner, repo.data_dir())
        .repository_info(&GitFolder::at(folder), &CancellationToken::new())
        .await
}

fn canonical(path: &Path) -> String {
    std::fs::canonicalize(path)
        .expect("the folder exists")
        .to_string_lossy()
        .into_owned()
}

#[tokio::test]
async fn should_report_root_for_subfolder() {
    // Arrange
    let repo = TempRepo::new();
    repo.commit("Add a", &[("src/a.txt", "a")]);
    let subfolder = repo.subfolder("src/deep");

    // Act
    let info = info_of(&repo, &subfolder).await.unwrap();

    // Assert
    assert_eq!(
        canonical(Path::new(&info.root_path)),
        canonical(repo.path())
    );
    assert_eq!(info.folder_prefix, "src/deep");
    assert!(!info.is_shallow);
    assert!(!info.is_linked_worktree);
    assert!(!info.git_version.is_empty());
}

#[tokio::test]
async fn should_give_two_folders_of_one_repository_the_same_id() {
    // Arrange
    let repo = TempRepo::new();
    repo.commit("Add a", &[("a.txt", "a")]);
    let subfolder = repo.subfolder("docs");

    // Act
    let root = info_of(&repo, repo.path()).await.unwrap();
    let inner = info_of(&repo, &subfolder).await.unwrap();

    // Assert
    assert_eq!(root.repository_id, inner.repository_id);
    let expected_id =
        normalise_repository_id(&canonical(&repo.path().join(".git")), PathStyle::current());
    assert_eq!(root.repository_id, expected_id);
    assert_eq!(root.folder_prefix, "");
}

#[tokio::test]
async fn should_report_not_a_repository() {
    // Arrange
    let repo = TempRepo::new();
    let plain = tempfile::tempdir().unwrap();

    // Act
    let error = info_of(&repo, plain.path()).await.unwrap_err();

    // Assert
    assert_eq!(error.code(), ErrorCode::NotARepository);
    assert!(
        error.to_payload().details["detail"]
            .as_str()
            .unwrap()
            .contains("not a git repository")
    );
}

#[tokio::test]
async fn should_flag_linked_worktree() {
    // Arrange
    let repo = TempRepo::new();
    repo.commit("Add a", &[("a.txt", "a")]);
    let parent = tempfile::tempdir().unwrap();
    let linked = parent.path().join("linked");
    repo.git(&[
        "worktree",
        "add",
        "--quiet",
        "-b",
        "side",
        &linked.to_string_lossy(),
    ]);

    // Act
    let main = info_of(&repo, repo.path()).await.unwrap();
    let worktree = info_of(&repo, &linked).await.unwrap();

    // Assert
    assert!(worktree.is_linked_worktree);
    assert!(!main.is_linked_worktree);
    assert_eq!(worktree.repository_id, main.repository_id);
    assert_eq!(
        canonical(Path::new(&worktree.root_path)),
        canonical(&linked)
    );
}

#[tokio::test]
async fn should_flag_depth_1_clone_as_shallow() {
    // Arrange
    let upstream = TempRepo::new();
    upstream.commit("Add a", &[("a.txt", "a")]);
    upstream.commit("Add b", &[("b.txt", "b")]);
    let shallow = upstream.clone_shallow();

    // Act
    let info = info_of(&shallow, shallow.path()).await.unwrap();

    // Assert
    assert!(info.is_shallow);
}

#[tokio::test]
async fn should_report_a_bare_repository() {
    // Arrange
    let repo = TempRepo::new();
    repo.commit("Add a", &[("a.txt", "a")]);
    let repo = repo.with_bare_origin();

    // Act
    let error = info_of(&repo, repo.origin_path()).await.unwrap_err();

    // Assert
    assert_eq!(error.code(), ErrorCode::BareRepository);
}
