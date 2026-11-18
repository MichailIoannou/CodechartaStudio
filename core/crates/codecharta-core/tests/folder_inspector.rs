mod support;

use codecharta_core::folders::inspector::{inspect_folder, resolve_commit};
use codecharta_core_api::methods::projects::{FolderKind, GitRemote};
use codecharta_core_api::values::CommitHash;
use support::TempRepo;

const SHORT_HASH_LENGTH: usize = 7;

#[tokio::test]
async fn should_classify_a_repository_root_as_git() {
    // Arrange
    let upstream = TempRepo::new();
    let first = upstream.commit_file("a.txt", "a", "Add a");
    let clone = upstream.clone_full();
    clone.add_remote("mirror", "https://ada:s3cret-token@github.com/ada/repo.git");

    // Act
    let inspection = inspect_folder(&clone.runner(), clone.path()).await;

    // Assert
    assert_eq!(inspection.kind, FolderKind::Git);
    let git = inspection.git.unwrap();
    assert!(git.is_repository_root);
    assert!(!git.is_shallow);
    assert_eq!(git.default_branch.as_deref(), Some("main"));
    assert_eq!(
        git.root_commits
            .iter()
            .map(|root| root.as_str())
            .collect::<Vec<_>>(),
        vec![first.as_str()]
    );
    assert_eq!(
        git.remotes[1],
        GitRemote {
            name: "mirror".to_string(),
            url: "https://github.com/ada/repo.git".to_string(),
        }
    );
    assert_eq!(git.remotes[0].name, "origin");
}

#[tokio::test]
async fn should_flag_a_subfolder_as_not_the_repository_root() {
    // Arrange
    let repo = TempRepo::new();
    repo.commit_file("a.txt", "a", "Add a");
    let subfolder = repo.subfolder("docs");

    // Act
    let inspection = inspect_folder(&repo.runner(), &subfolder).await;

    // Assert
    assert_eq!(inspection.kind, FolderKind::Git);
    assert!(!inspection.git.unwrap().is_repository_root);
}

#[tokio::test]
async fn should_classify_a_plain_folder() {
    // Arrange
    let repo = TempRepo::new();
    let plain = tempfile::tempdir().unwrap();

    // Act
    let inspection = inspect_folder(&repo.runner(), plain.path()).await;

    // Assert
    assert_eq!(inspection.kind, FolderKind::Plain);
    assert_eq!(inspection.git, None);
}

#[tokio::test]
async fn should_report_no_default_branch_when_origin_head_is_unset_and_head_has_no_commits() {
    // Arrange
    let empty = TempRepo::new();

    // Act
    let inspection = inspect_folder(&empty.runner(), empty.path()).await;

    // Assert
    let git = inspection.git.unwrap();
    assert_eq!(git.default_branch, None);
    assert!(git.root_commits.is_empty());
    assert!(git.remotes.is_empty());
}

#[tokio::test]
async fn should_report_no_root_commits_for_a_shallow_clone() {
    // Arrange
    let upstream = TempRepo::new();
    upstream.commit_file("a.txt", "a", "Add a");
    upstream.commit_file("b.txt", "b", "Add b");
    let shallow = upstream.clone_shallow();

    // Act
    let inspection = inspect_folder(&shallow.runner(), shallow.path()).await;

    // Assert
    let git = inspection.git.unwrap();
    assert!(git.is_shallow);
    assert!(git.root_commits.is_empty());
}

#[tokio::test]
async fn should_resolve_a_short_hash_to_its_commit() {
    // Arrange
    let repo = TempRepo::new();
    let commit = repo.commit_file("a.txt", "a", "Add a");
    let short = CommitHash::try_from(&commit[..SHORT_HASH_LENGTH]).unwrap();

    // Act
    let resolved = resolve_commit(&repo.runner(), repo.path(), &short)
        .await
        .unwrap()
        .unwrap();

    // Assert
    assert_eq!(resolved.commit.as_str(), commit);
    assert_eq!(resolved.subject, "Add a");
    assert_eq!(resolved.author_name, "Ada Tester");
    assert!(resolved.author_date.starts_with("2026-01-02T03:04:05"));
    assert!(commit.starts_with(&resolved.short_commit));
}

#[tokio::test]
async fn should_return_none_for_an_unknown_hash() {
    // Arrange
    let repo = TempRepo::new();
    repo.commit_file("a.txt", "a", "Add a");
    let unknown = CommitHash::try_from("abcdef0123456").unwrap();

    // Act
    let resolved = resolve_commit(&repo.runner(), repo.path(), &unknown).await;

    // Assert
    assert_eq!(resolved.unwrap(), None);
}
