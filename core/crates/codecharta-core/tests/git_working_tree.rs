mod support;

use std::fs;

use codecharta_core::git::GitFolder;
use codecharta_core_api::error::ErrorCode;
use codecharta_core_api::methods::git::{
    ChangedPart, DiscardEntry, GitEntryKind, GitFileChange, GitStageTarget, GitWorkingTree,
    GitWorkingTreeEntry,
};
use codecharta_core_api::values::WorkingTreePath;
use tokio_util::sync::CancellationToken;

use support::TempRepo;
use support::git_operations::{OperationsHarness, code_of, context, project_folder};

const DIFF_CUT_BYTES: usize = 2 * 1024 * 1024;
const LARGE_DIFF_LINES: usize = 250_000;
const PATHSPEC_FROM_STDIN: &str = "--pathspec-from-file=-";
const END_OF_PATHS: &str = "--";

fn path(text: &str) -> WorkingTreePath {
    WorkingTreePath::try_from(text).expect("a working-tree path")
}

fn paths(texts: &[&str]) -> GitStageTarget {
    GitStageTarget::Paths {
        paths: texts.iter().map(|text| path(text)).collect(),
    }
}

fn row(text: &str, kind: GitEntryKind, change: GitFileChange) -> DiscardEntry {
    DiscardEntry {
        path: path(text),
        kind,
        change,
    }
}

fn listed(tree: &GitWorkingTree) -> Vec<(String, GitEntryKind, GitFileChange)> {
    tree.entries
        .iter()
        .map(|entry| (entry.path.clone(), entry.kind, entry.change))
        .collect()
}

fn listed_row(
    text: &str,
    kind: GitEntryKind,
    change: GitFileChange,
) -> (String, GitEntryKind, GitFileChange) {
    (text.to_string(), kind, change)
}

fn read(repo: &TempRepo, name: &str) -> String {
    fs::read_to_string(repo.path().join(name)).expect("the file can be read")
}

/// `a.txt` and `old.txt` committed on `main`.
fn committed_repo() -> TempRepo {
    let repo = TempRepo::new();
    repo.commit("Root", &[("a.txt", "a\n"), ("old.txt", "old\n")]);
    repo
}

struct Workspace {
    repo: TempRepo,
    harness: OperationsHarness,
    folder: GitFolder,
}

impl Workspace {
    fn of(repo: TempRepo) -> Self {
        let folder = project_folder(repo.path());
        Self {
            repo,
            harness: OperationsHarness::default(),
            folder,
        }
    }
}

#[tokio::test]
async fn should_list_every_change_of_the_repository_from_a_subfolder() {
    // Arrange
    let repo = committed_repo();
    repo.write_file("a.txt", "changed\n");
    repo.write_file("new dir/one.txt", "1");
    repo.write_file("new dir/two.txt", "2");
    let subfolder = repo.subfolder("sub");
    let (runner, harness) = (repo.runner(), OperationsHarness::default());
    let service = harness.service(&runner, repo.data_dir());

    // Act
    let tree = service
        .working_tree(&project_folder(&subfolder), &CancellationToken::new())
        .await
        .unwrap();

    // Assert
    assert_eq!(
        listed(&tree),
        vec![
            listed_row("a.txt", GitEntryKind::Unstaged, GitFileChange::Modified),
            listed_row(
                "new dir/one.txt",
                GitEntryKind::Untracked,
                GitFileChange::Added
            ),
            listed_row(
                "new dir/two.txt",
                GitEntryKind::Untracked,
                GitFileChange::Added
            ),
        ]
    );
    assert_eq!(tree.status.counts.unstaged, 1);
    assert!(!tree.are_entries_truncated);
}

#[tokio::test]
async fn should_stage_and_unstage_a_file_with_space_and_brackets() {
    // Arrange
    let workspace = Workspace::of(committed_repo());
    let name = "docs/a file [1].txt";
    workspace.repo.write_file(name, "new");
    let runner = workspace.repo.runner();
    let service = workspace
        .harness
        .service(&runner, workspace.repo.data_dir());
    let cancel = CancellationToken::new();

    // Act
    let staged = service
        .stage(&workspace.folder, &paths(&[name]), &context(&cancel))
        .await
        .unwrap();
    let unstaged = service
        .unstage(&workspace.folder, &[path(name)], &context(&cancel))
        .await
        .unwrap();

    // Assert
    assert_eq!(
        listed(&staged),
        vec![listed_row(name, GitEntryKind::Staged, GitFileChange::Added)]
    );
    assert_eq!(staged.status.counts.staged, 1);
    assert_eq!(
        listed(&unstaged),
        vec![listed_row(
            name,
            GitEntryKind::Untracked,
            GitFileChange::Added
        )]
    );
}

#[tokio::test]
async fn should_stage_all_changes() {
    // Arrange
    let workspace = Workspace::of(committed_repo());
    workspace.repo.write_file("a.txt", "changed\n");
    fs::remove_file(workspace.repo.path().join("old.txt")).unwrap();
    workspace.repo.write_file("u.txt", "u");
    let runner = workspace.repo.runner();
    let service = workspace
        .harness
        .service(&runner, workspace.repo.data_dir());
    let cancel = CancellationToken::new();

    // Act
    let staged = service
        .stage(&workspace.folder, &GitStageTarget::All, &context(&cancel))
        .await
        .unwrap();

    // Assert
    assert_eq!(
        listed(&staged),
        vec![
            listed_row("a.txt", GitEntryKind::Staged, GitFileChange::Modified),
            listed_row("old.txt", GitEntryKind::Staged, GitFileChange::Deleted),
            listed_row("u.txt", GitEntryKind::Staged, GitFileChange::Added),
        ]
    );
}

#[tokio::test]
async fn should_unstage_a_file_without_commits() {
    // Arrange
    let workspace = Workspace::of(TempRepo::new());
    workspace.repo.write_file("first.txt", "1");
    workspace.repo.git(&["add", "--", "first.txt"]);
    workspace.repo.write_file("first.txt", "1 and more");
    let runner = workspace.repo.runner();
    let service = workspace
        .harness
        .service(&runner, workspace.repo.data_dir());
    let cancel = CancellationToken::new();

    // Act
    let unstaged = service
        .unstage(&workspace.folder, &[path("first.txt")], &context(&cancel))
        .await
        .unwrap();

    // Assert
    assert_eq!(
        listed(&unstaged),
        vec![listed_row(
            "first.txt",
            GitEntryKind::Untracked,
            GitFileChange::Added
        )]
    );
    assert_eq!(read(&workspace.repo, "first.txt"), "1 and more");
}

#[tokio::test]
async fn should_discard_a_modified_tracked_file() {
    // Arrange
    let workspace = Workspace::of(committed_repo());
    workspace.repo.write_file("a.txt", "changed\n");
    let runner = workspace.repo.runner();
    let service = workspace
        .harness
        .service(&runner, workspace.repo.data_dir());
    let cancel = CancellationToken::new();
    let rows = [row(
        "a.txt",
        GitEntryKind::Unstaged,
        GitFileChange::Modified,
    )];

    // Act
    let tree = service
        .discard(&workspace.folder, &rows, &context(&cancel))
        .await
        .unwrap();

    // Assert
    assert!(tree.entries.is_empty());
    assert_eq!(read(&workspace.repo, "a.txt"), "a\n");
    assert!(workspace.harness.recycler().recycled().is_empty());
}

#[tokio::test]
async fn should_keep_the_staged_change_when_discarding_the_unstaged_one() {
    // Arrange
    let workspace = Workspace::of(committed_repo());
    workspace.repo.write_file("a.txt", "staged\n");
    workspace.repo.git(&["add", "--", "a.txt"]);
    workspace.repo.write_file("a.txt", "staged and more\n");
    let runner = workspace.repo.runner();
    let service = workspace
        .harness
        .service(&runner, workspace.repo.data_dir());
    let cancel = CancellationToken::new();
    let unstaged = [row(
        "a.txt",
        GitEntryKind::Unstaged,
        GitFileChange::Modified,
    )];
    let staged_alone = [row("a.txt", GitEntryKind::Staged, GitFileChange::Modified)];

    // Act
    let refused = service
        .discard(&workspace.folder, &staged_alone, &context(&cancel))
        .await;
    let tree = service
        .discard(&workspace.folder, &unstaged, &context(&cancel))
        .await
        .unwrap();

    // Assert
    assert_eq!(code_of(refused), ErrorCode::NotAllowed);
    assert_eq!(
        listed(&tree),
        vec![listed_row(
            "a.txt",
            GitEntryKind::Staged,
            GitFileChange::Modified
        )]
    );
    assert_eq!(read(&workspace.repo, "a.txt"), "staged\n");
}

#[tokio::test]
async fn should_discard_a_staged_new_file_and_an_untracked_file_to_the_recycle_bin() {
    // Arrange
    let workspace = Workspace::of(committed_repo());
    workspace.repo.write_file("staged new.txt", "staged");
    workspace.repo.git(&["add", "--", "staged new.txt"]);
    workspace.repo.write_file("dir/untracked.txt", "untracked");
    let runner = workspace.repo.runner();
    let service = workspace
        .harness
        .service(&runner, workspace.repo.data_dir());
    let cancel = CancellationToken::new();
    let rows = [
        row("staged new.txt", GitEntryKind::Staged, GitFileChange::Added),
        row(
            "dir/untracked.txt",
            GitEntryKind::Untracked,
            GitFileChange::Added,
        ),
    ];

    // Act
    let tree = service
        .discard(&workspace.folder, &rows, &context(&cancel))
        .await
        .unwrap();

    // Assert
    assert!(tree.entries.is_empty());
    let recycled = workspace.harness.recycler().recycled();
    let names: Vec<String> = recycled
        .iter()
        .map(|file| file.file_name().unwrap().to_string_lossy().into_owned())
        .collect();
    assert_eq!(names, vec!["staged new.txt", "untracked.txt"]);
    assert!(!workspace.repo.path().join("staged new.txt").exists());
    assert!(!workspace.repo.path().join("dir/untracked.txt").exists());
}

#[tokio::test]
async fn should_discard_a_staged_rename_restoring_the_old_path_and_recycling_the_new_one() {
    // Arrange
    let workspace = Workspace::of(committed_repo());
    workspace.repo.git(&["mv", "old.txt", "new.txt"]);
    let runner = workspace.repo.runner();
    let service = workspace
        .harness
        .service(&runner, workspace.repo.data_dir());
    let cancel = CancellationToken::new();
    let rows = [row("new.txt", GitEntryKind::Staged, GitFileChange::Renamed)];

    // Act
    let tree = service
        .discard(&workspace.folder, &rows, &context(&cancel))
        .await
        .unwrap();

    // Assert
    assert!(tree.entries.is_empty());
    assert_eq!(read(&workspace.repo, "old.txt"), "old\n");
    assert!(!workspace.repo.path().join("new.txt").exists());
    let recycled = workspace.harness.recycler().recycled();
    assert_eq!(recycled.len(), 1);
    assert!(recycled[0].ends_with("new.txt"));
}

#[tokio::test]
async fn should_fail_with_changed_since_listed_and_change_nothing() {
    // Arrange
    let workspace = Workspace::of(committed_repo());
    workspace.repo.write_file("a.txt", "changed\n");
    workspace.repo.write_file("u.txt", "u");
    let runner = workspace.repo.runner();
    let service = workspace
        .harness
        .service(&runner, workspace.repo.data_dir());
    let cancel = CancellationToken::new();
    let rows = [
        row("u.txt", GitEntryKind::Untracked, GitFileChange::Added),
        row("a.txt", GitEntryKind::Staged, GitFileChange::Modified),
    ];

    // Act
    let refused = service
        .discard(&workspace.folder, &rows, &context(&cancel))
        .await;

    // Assert
    assert_eq!(code_of(refused), ErrorCode::ChangedSinceListed);
    assert_eq!(read(&workspace.repo, "u.txt"), "u");
    assert_eq!(read(&workspace.repo, "a.txt"), "changed\n");
    assert!(workspace.harness.recycler().recycled().is_empty());
}

#[tokio::test]
async fn should_refuse_an_unlisted_path() {
    // Arrange
    let workspace = Workspace::of(committed_repo());
    let runner = workspace.repo.runner();
    let service = workspace
        .harness
        .service(&runner, workspace.repo.data_dir());
    let cancel = CancellationToken::new();

    // Act
    let staged = service
        .stage(&workspace.folder, &paths(&["a.txt"]), &context(&cancel))
        .await;
    let unstaged = service
        .unstage(&workspace.folder, &[path("a.txt")], &context(&cancel))
        .await;
    let diff = service
        .diff_file(
            &workspace.folder,
            &path("a.txt"),
            GitEntryKind::Unstaged,
            &cancel,
        )
        .await;

    // Assert
    assert_eq!(code_of(staged), ErrorCode::ChangedSinceListed);
    assert_eq!(code_of(unstaged), ErrorCode::ChangedSinceListed);
    assert_eq!(code_of(diff), ErrorCode::ChangedSinceListed);
}

#[tokio::test]
async fn should_refuse_to_discard_a_conflicted_file() {
    // Arrange
    let repo = committed_repo();
    repo.branch("other");
    repo.checkout("other");
    repo.commit_file("a.txt", "other\n", "Other");
    repo.checkout("main");
    repo.commit_file("a.txt", "main\n", "Main");
    assert!(repo.try_git(&["merge", "--quiet", "other"]).is_none());
    let workspace = Workspace::of(repo);
    let runner = workspace.repo.runner();
    let service = workspace
        .harness
        .service(&runner, workspace.repo.data_dir());
    let cancel = CancellationToken::new();
    let rows = [row(
        "a.txt",
        GitEntryKind::Conflicted,
        GitFileChange::Modified,
    )];

    // Act
    let refused = service
        .discard(&workspace.folder, &rows, &context(&cancel))
        .await;
    let tree = service
        .working_tree(&workspace.folder, &cancel)
        .await
        .unwrap();

    // Assert
    assert_eq!(code_of(refused), ErrorCode::NotAllowed);
    assert_eq!(
        tree.entries,
        vec![GitWorkingTreeEntry {
            path: "a.txt".to_string(),
            previous_path: None,
            kind: GitEntryKind::Conflicted,
            change: GitFileChange::Modified,
            conflict: Some("UU".to_string()),
        }]
    );
}

#[cfg(unix)]
#[tokio::test]
async fn should_refuse_trashing_through_a_symlinked_folder_outside_the_repository() {
    // Arrange
    let workspace = Workspace::of(committed_repo());
    workspace.repo.write_file("dir/new.txt", "staged");
    workspace.repo.git(&["add", "--", "dir/new.txt"]);
    let outside = tempfile::tempdir().unwrap();
    fs::write(outside.path().join("new.txt"), "outside").unwrap();
    fs::remove_dir_all(workspace.repo.path().join("dir")).unwrap();
    std::os::unix::fs::symlink(outside.path(), workspace.repo.path().join("dir")).unwrap();
    let runner = workspace.repo.runner();
    let service = workspace
        .harness
        .service(&runner, workspace.repo.data_dir());
    let cancel = CancellationToken::new();
    let rows = [
        row("dir/new.txt", GitEntryKind::Staged, GitFileChange::Added),
        row(
            "dir/new.txt",
            GitEntryKind::Unstaged,
            GitFileChange::Deleted,
        ),
    ];

    // Act
    let refused = service
        .discard(&workspace.folder, &rows, &context(&cancel))
        .await;

    // Assert
    assert_eq!(code_of(refused), ErrorCode::NotAllowed);
    assert_eq!(
        fs::read_to_string(outside.path().join("new.txt")).unwrap(),
        "outside"
    );
    assert!(workspace.harness.recycler().recycled().is_empty());
    assert!(
        workspace
            .repo
            .git(&["ls-files", "--", "dir/new.txt"])
            .contains("dir/new.txt")
    );
}

#[tokio::test]
async fn should_show_an_untracked_file_as_an_added_diff() {
    // Arrange
    let repo = committed_repo();
    repo.write_file("new [1].txt", "first line\n");
    let (runner, harness) = (repo.runner(), OperationsHarness::default());
    let service = harness.service(&runner, repo.data_dir());

    // Act
    let diff = service
        .diff_file(
            &project_folder(repo.path()),
            &path("new [1].txt"),
            GitEntryKind::Untracked,
            &CancellationToken::new(),
        )
        .await
        .unwrap();

    // Assert
    assert_eq!(diff.path, "new [1].txt");
    assert!(diff.text.contains("new file mode"), "{}", diff.text);
    assert!(diff.text.contains("+first line"), "{}", diff.text);
    assert!(!diff.is_binary && !diff.is_truncated);
}

#[tokio::test]
async fn should_show_a_staged_rename_and_an_unstaged_change() {
    // Arrange
    let repo = committed_repo();
    repo.git(&["mv", "old.txt", "new.txt"]);
    repo.write_file("a.txt", "changed\n");
    let (runner, harness) = (repo.runner(), OperationsHarness::default());
    let service = harness.service(&runner, repo.data_dir());
    let (folder, cancel) = (project_folder(repo.path()), CancellationToken::new());

    // Act
    let renamed = service
        .diff_file(&folder, &path("new.txt"), GitEntryKind::Staged, &cancel)
        .await
        .unwrap();
    let modified = service
        .diff_file(&folder, &path("a.txt"), GitEntryKind::Unstaged, &cancel)
        .await
        .unwrap();

    // Assert
    assert!(
        renamed.text.contains("rename from old.txt"),
        "{}",
        renamed.text
    );
    assert!(modified.text.contains("-a\n+changed"), "{}", modified.text);
}

#[tokio::test]
async fn should_flag_a_binary_diff() {
    // Arrange
    let repo = committed_repo();
    repo.write_file("image.bin", "bin\0ary");
    let (runner, harness) = (repo.runner(), OperationsHarness::default());
    let service = harness.service(&runner, repo.data_dir());

    // Act
    let diff = service
        .diff_file(
            &project_folder(repo.path()),
            &path("image.bin"),
            GitEntryKind::Untracked,
            &CancellationToken::new(),
        )
        .await
        .unwrap();

    // Assert
    assert!(diff.is_binary, "{}", diff.text);
}

#[tokio::test]
async fn should_truncate_a_large_diff() {
    // Arrange
    let repo = committed_repo();
    let content: String = (0..LARGE_DIFF_LINES)
        .map(|number| format!("line {number:06}\n"))
        .collect();
    repo.write_file("large.txt", &content);
    let (runner, harness) = (repo.runner(), OperationsHarness::default());
    let service = harness.service(&runner, repo.data_dir());

    // Act
    let diff = service
        .diff_file(
            &project_folder(repo.path()),
            &path("large.txt"),
            GitEntryKind::Untracked,
            &CancellationToken::new(),
        )
        .await
        .unwrap();

    // Assert
    assert!(diff.is_truncated);
    assert!(diff.text.len() <= DIFF_CUT_BYTES);
    assert!(diff.text.ends_with('\n'));
}

#[tokio::test]
async fn should_announce_the_working_tree_after_staging() {
    // Arrange
    let workspace = Workspace::of(committed_repo());
    workspace.repo.write_file("u.txt", "u");
    let runner = workspace.repo.runner();
    let service = workspace
        .harness
        .service(&runner, workspace.repo.data_dir());
    let mut changes = workspace.harness.subscribe();
    let cancel = CancellationToken::new();

    // Act
    service
        .stage(&workspace.folder, &paths(&["u.txt"]), &context(&cancel))
        .await
        .unwrap();

    // Assert
    let changed = changes.try_recv().unwrap();
    assert!(changed.parts.contains(&ChangedPart::WorkingTree));
}

#[tokio::test]
async fn should_pass_paths_on_stdin_after_the_end_of_options() {
    // Arrange
    let repo = committed_repo();
    repo.write_file("-n", "looks like an option");
    let runner = support::RecordingGit::new(repo.runner());
    let harness = OperationsHarness::default();
    let service = harness.service(&runner, repo.data_dir());
    let (folder, cancel) = (project_folder(repo.path()), CancellationToken::new());

    // Act
    service
        .stage(&folder, &paths(&["-n"]), &context(&cancel))
        .await
        .unwrap();
    service
        .unstage(&folder, &[path("-n")], &context(&cancel))
        .await
        .unwrap();

    // Assert
    let mutations: Vec<_> = ["add", "restore"]
        .iter()
        .flat_map(|subcommand| runner.runs_of(subcommand))
        .collect();
    assert_eq!(mutations.len(), 2);
    for invocation in mutations {
        let args: Vec<String> = invocation
            .args
            .iter()
            .map(|arg| arg.to_string_lossy().into_owned())
            .collect();
        assert_eq!(
            args.last().map(String::as_str),
            Some(END_OF_PATHS),
            "{args:?}"
        );
        assert!(
            args.iter().any(|arg| arg == PATHSPEC_FROM_STDIN),
            "{args:?}"
        );
        assert!(!args.iter().any(|arg| arg == "-n"), "{args:?}");
        assert_eq!(invocation.stdin.as_deref(), Some("-n\0"));
    }
    assert_eq!(read(&repo, "-n"), "looks like an option");
}
