mod support;

use codecharta_core::CoreResult;
use codecharta_core::compare::changed_files::ChangedFilesSearch;
use codecharta_core::git::{GitFolder, GitService};
use codecharta_core_api::methods::compare::{ChangedFilesResult, ChangedFilesSource};
use codecharta_core_api::methods::git::GitFileChange;
use codecharta_core_api::values::CommitSha;
use tokio_util::sync::CancellationToken;

use support::TempRepo;

const MANY_FILES: usize = 5001;

fn sha(text: &str) -> CommitSha {
    CommitSha::try_from(text.trim()).expect("a full sha")
}

async fn changed_between(
    repo: &TempRepo,
    folders: &[GitFolder],
    base: &str,
    head: &str,
) -> CoreResult<ChangedFilesResult> {
    let runner = repo.runner();
    let git = GitService::new(&runner, repo.data_dir());
    let cancel = CancellationToken::new();
    let search = ChangedFilesSearch {
        git: &git,
        cancel: &cancel,
    };
    search.list(folders, &sha(base), &sha(head)).await
}

fn listed(result: &ChangedFilesResult) -> Vec<(GitFileChange, &str)> {
    result
        .files
        .iter()
        .map(|file| (file.change, file.path.as_str()))
        .collect()
}

#[tokio::test]
async fn should_report_paths_relative_to_a_subfolder() {
    // Arrange
    let repo = TempRepo::new();
    let base = repo.commit(
        "base",
        &[
            ("app/a.txt", "1"),
            ("app/old.txt", "x"),
            ("other/b.txt", "1"),
        ],
    );
    repo.write_file("app/a.txt", "2");
    repo.write_file("other/b.txt", "2");
    repo.write_file("app/new dir/ü.txt", "n");
    repo.git(&["add", "--all"]);
    repo.git(&["rm", "--quiet", "--", "app/old.txt"]);
    let head = repo.commit("head", &[]);
    let folder = GitFolder::at(&repo.path().join("app"));

    // Act
    let result = changed_between(&repo, &[folder], &base, &head)
        .await
        .unwrap();

    // Assert
    assert_eq!(result.source, ChangedFilesSource::Git);
    assert_eq!(
        listed(&result),
        [
            (GitFileChange::Modified, "a.txt"),
            (GitFileChange::Added, "new dir/ü.txt"),
            (GitFileChange::Deleted, "old.txt"),
        ]
    );
}

#[tokio::test]
async fn should_report_a_rename_with_both_paths() {
    // Arrange
    let repo = TempRepo::new();
    let base = repo.commit_file("old.txt", "some content\nthat stays\n", "base");
    repo.git(&["mv", "old.txt", "new.txt"]);
    let head = repo.commit("head", &[]);
    let folder = GitFolder::at(repo.path());

    // Act
    let result = changed_between(&repo, &[folder], &base, &head)
        .await
        .unwrap();

    // Assert
    assert_eq!(result.files.len(), 1);
    assert_eq!(result.files[0].change, GitFileChange::Renamed);
    assert_eq!(result.files[0].path, "new.txt");
    assert_eq!(result.files[0].previous_path.as_deref(), Some("old.txt"));
}

#[tokio::test]
async fn should_list_more_files_than_a_commit_view_shows() {
    // Arrange
    let repo = TempRepo::new();
    let base = repo.commit_file("keep.txt", "1", "base");
    for number in 0..MANY_FILES {
        repo.write_file(&format!("many/f{number}.txt"), "x");
    }
    repo.git(&["add", "--all"]);
    let head = repo.commit("head", &[]);
    let folder = GitFolder::at(repo.path());

    // Act
    let result = changed_between(&repo, &[folder], &base, &head)
        .await
        .unwrap();

    // Assert
    assert_eq!(result.files.len(), MANY_FILES);
}

#[tokio::test]
async fn should_return_unavailable_when_no_clone_has_both_commits() {
    // Arrange
    let repo = TempRepo::new();
    let base = repo.commit_file("a.txt", "1", "base");
    let other = repo.clone_full();
    let head = repo.commit_file("a.txt", "2", "head");
    let folders = [GitFolder::at(other.path())];

    // Act
    let result = changed_between(&repo, &folders, &base, &head)
        .await
        .unwrap();

    // Assert
    assert_eq!(result.source, ChangedFilesSource::Unavailable);
    assert!(result.files.is_empty());
}

#[tokio::test]
async fn should_use_the_head_folder_clone_when_only_it_has_both() {
    // Arrange
    let base_clone = TempRepo::new();
    let base = base_clone.commit_file("a.txt", "1", "base");
    let head_clone = base_clone.clone_full();
    let head = head_clone.commit_file("a.txt", "2", "head");
    let folders = [
        GitFolder::at(base_clone.path()),
        GitFolder::at(head_clone.path()),
    ];

    // Act
    let result = changed_between(&head_clone, &folders, &base, &head)
        .await
        .unwrap();

    // Assert
    assert_eq!(result.source, ChangedFilesSource::Git);
    assert_eq!(listed(&result), [(GitFileChange::Modified, "a.txt")]);
}
