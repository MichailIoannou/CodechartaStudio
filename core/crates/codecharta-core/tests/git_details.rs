mod support;

use codecharta_core::CoreResult;
use codecharta_core::git::details::ChangedFilesRequest;
use codecharta_core::git::{GitFolder, GitService};
use codecharta_core_api::error::ErrorCode;
use codecharta_core_api::methods::git::{
    ChangedFilesMode, GitChangedFiles, GitCommitDetails, GitFileChange,
};
use codecharta_core_api::values::CommitSha;
use tokio_util::sync::CancellationToken;

use support::TempRepo;

const MANY_FILES: usize = 5001;
const LISTED_FILES: usize = 5000;
const UNKNOWN_SHA: &str = "0123456789abcdef0123456789abcdef01234567";

fn sha(text: &str) -> CommitSha {
    CommitSha::try_from(text).expect("a full sha")
}

async fn details_of(repo: &TempRepo, commit: &str) -> CoreResult<GitCommitDetails> {
    let runner = repo.runner();
    GitService::new(&runner, repo.data_dir())
        .commit_details(
            &GitFolder::at(repo.path()),
            &sha(commit),
            &CancellationToken::new(),
        )
        .await
}

async fn changed_between(
    repo: &TempRepo,
    from: &str,
    to: &str,
    mode: ChangedFilesMode,
) -> CoreResult<GitChangedFiles> {
    let runner = repo.runner();
    let request = ChangedFilesRequest {
        from: sha(from),
        to: sha(to),
        mode,
    };
    GitService::new(&runner, repo.data_dir())
        .changed_files(
            &GitFolder::at(repo.path()),
            &request,
            &CancellationToken::new(),
        )
        .await
}

fn paths(files: &GitChangedFiles) -> Vec<&str> {
    files.files.iter().map(|file| file.path.as_str()).collect()
}

#[tokio::test]
async fn should_list_the_files_of_the_root_commit() {
    // Arrange
    let repo = TempRepo::new();
    let root = repo.commit(
        "Root\n\nBody text.\n",
        &[("a.txt", "a\nb\n"), ("b.txt", "b")],
    );

    // Act
    let details = details_of(&repo, &root).await.unwrap();

    // Assert
    let files: Vec<(GitFileChange, &str)> = details
        .files
        .iter()
        .map(|file| (file.change, file.path.as_str()))
        .collect();
    assert_eq!(
        files,
        [
            (GitFileChange::Added, "a.txt"),
            (GitFileChange::Added, "b.txt")
        ]
    );
    assert_eq!(details.compared_to_parent, None);
    assert_eq!(details.message, "Root\n\nBody text.");
    assert_eq!(details.committer_name, "Carl Committer");
    assert_eq!(details.totals.insertions, 3);
}

#[tokio::test]
async fn should_compare_a_merge_with_its_first_parent() {
    // Arrange
    let repo = TempRepo::new();
    repo.commit("Root", &[("a.txt", "a")]);
    repo.branch("side");
    repo.checkout("side");
    repo.commit("Side", &[("side.txt", "side")]);
    repo.checkout("main");
    let main = repo.commit("Main", &[("main.txt", "main")]);
    let merge = repo.merge(&["side"], "Merge side");

    // Act
    let details = details_of(&repo, &merge).await.unwrap();

    // Assert
    assert_eq!(details.compared_to_parent.as_deref(), Some(main.as_str()));
    assert_eq!(details.summary.parents.len(), 2);
    let files: Vec<&str> = details
        .files
        .iter()
        .map(|file| file.path.as_str())
        .collect();
    assert_eq!(files, ["side.txt"]);
}

#[tokio::test]
async fn should_keep_the_totals_when_the_list_is_truncated() {
    // Arrange
    let repo = TempRepo::new();
    repo.commit("Root", &[("root.txt", "root")]);
    for number in 0..MANY_FILES {
        repo.write_file(&format!("many/{number}.txt"), "line\n");
    }
    repo.git(&["add", "many"]);
    let many = repo.commit("Many files", &[]);

    // Act
    let details = details_of(&repo, &many).await.unwrap();

    // Assert
    assert_eq!(details.files.len(), LISTED_FILES);
    assert!(details.are_files_truncated);
    assert_eq!(details.totals.files_changed as usize, MANY_FILES);
    assert_eq!(details.totals.insertions as usize, MANY_FILES);
}

#[tokio::test]
async fn should_keep_paths_with_spaces_and_non_ascii() {
    // Arrange
    let repo = TempRepo::new();
    repo.commit("Root", &[("plain.txt", "a\nb\nc\nd\n")]);
    repo.subfolder("dir with space");
    repo.git(&["mv", "plain.txt", "dir with space/ünïcödé 日本.txt"]);
    let renamed = repo.commit("Rename", &[]);

    // Act
    let details = details_of(&repo, &renamed).await.unwrap();

    // Assert
    let file = &details.files[0];
    assert_eq!(file.change, GitFileChange::Renamed);
    assert_eq!(file.path, "dir with space/ünïcödé 日本.txt");
    assert_eq!(file.previous_path.as_deref(), Some("plain.txt"));
    assert_eq!((file.insertions, file.deletions), (Some(0), Some(0)));
}

#[tokio::test]
async fn should_compare_directly_or_since_the_merge_base_on_diverged_branches() {
    // Arrange
    let repo = TempRepo::new();
    let base = repo.commit("Root", &[("a.txt", "a")]);
    repo.branch("side");
    let main = repo.commit("Main", &[("main.txt", "main")]);
    repo.checkout("side");
    let side = repo.commit("Side", &[("side.txt", "side")]);

    // Act
    let direct = changed_between(&repo, &main, &side, ChangedFilesMode::Direct)
        .await
        .unwrap();
    let since_base = changed_between(&repo, &main, &side, ChangedFilesMode::SinceMergeBase)
        .await
        .unwrap();

    // Assert
    assert_eq!(paths(&direct), ["main.txt", "side.txt"]);
    assert_eq!(direct.files[0].change, GitFileChange::Deleted);
    assert_eq!(direct.from, main);
    assert_eq!(paths(&since_base), ["side.txt"]);
    assert_eq!(since_base.from, base);
    assert_eq!(since_base.to, side);
}

#[tokio::test]
async fn should_fail_unknown_revision_for_unrelated_histories() {
    // Arrange
    let repo = TempRepo::new();
    let main = repo.commit("Root", &[("a.txt", "a")]);
    repo.git(&["checkout", "--quiet", "--orphan", "other"]);
    repo.git(&["rm", "-r", "--quiet", "--force", "."]);
    let other = repo.commit("Other root", &[("b.txt", "b")]);

    // Act
    let unrelated = changed_between(&repo, &main, &other, ChangedFilesMode::SinceMergeBase).await;
    let unknown = details_of(&repo, UNKNOWN_SHA).await;

    // Assert
    assert_eq!(unrelated.unwrap_err().code(), ErrorCode::UnknownRevision);
    assert_eq!(unknown.unwrap_err().code(), ErrorCode::UnknownRevision);
}
