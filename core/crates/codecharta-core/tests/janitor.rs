mod support;

use std::path::{Path, PathBuf};

use codecharta_core::analysis::janitor::{list_codecharta_worktrees, remove_orphans};
use codecharta_core::git::{GitFolder, GitService};
use codecharta_core_api::values::CommitSha;
use tempfile::TempDir;

use support::TempRepo;

struct Run {
    repo: TempRepo,
    temp: TempDir,
    first: String,
    second: String,
}

impl Run {
    fn new() -> Self {
        let repo = TempRepo::new();
        let first = repo.commit_file("a.txt", "a", "First");
        let second = repo.commit_file("b.txt", "b", "Second");
        Self {
            repo,
            temp: tempfile::tempdir().expect("a temp folder"),
            first,
            second,
        }
    }

    fn add_worktree(&self, name: &str, commit: &str) -> PathBuf {
        let path = self.temp.path().join(name);
        let text = path.to_string_lossy().into_owned();
        self.repo
            .git(&["worktree", "add", "--quiet", "--detach", &text, commit]);
        path
    }

    fn listed_paths(&self) -> Vec<PathBuf> {
        let porcelain = self.repo.git(&["worktree", "list", "--porcelain"]);
        porcelain
            .lines()
            .filter_map(|line| line.strip_prefix("worktree "))
            .map(PathBuf::from)
            .collect()
    }

    async fn clean_up_after(&self, before_run: impl FnOnce(&Self), sha: &str) {
        let runner = self.repo.runner();
        let git = GitService::new(&runner, self.repo.data_dir());
        let folder = GitFolder::at(self.repo.path());
        let before = list_codecharta_worktrees(&git, &folder)
            .await
            .expect("the worktrees are listed");
        before_run(self);
        let sha = CommitSha::try_from(sha).expect("a full sha");
        remove_orphans(&git, &folder, &before, &sha)
            .await
            .expect("the orphans are removed");
    }
}

fn ends_with(paths: &[PathBuf], name: &str) -> bool {
    paths
        .iter()
        .any(|path| path.file_name() == Path::new(name).file_name())
}

#[tokio::test]
async fn should_remove_a_worktree_that_appeared_during_the_run_at_the_jobs_commit() {
    // Arrange
    let run = Run::new();
    let sha = run.second.clone();

    // Act
    run.clean_up_after(
        |run| {
            let path = run.add_worktree("codecharta-worktree-1", &run.second);
            run.repo.git(&[
                "worktree",
                "lock",
                "--reason",
                "initializing",
                &path.to_string_lossy(),
            ]);
        },
        &sha,
    )
    .await;

    // Assert
    let listed = run.listed_paths();
    assert!(!ends_with(&listed, "codecharta-worktree-1"), "{listed:?}");
    assert!(!run.temp.path().join("codecharta-worktree-1").exists());
    assert_eq!(listed.len(), 1);
}

#[tokio::test]
async fn should_leave_one_that_existed_before() {
    // Arrange
    let run = Run::new();
    run.add_worktree("codecharta-worktree-old", &run.second);
    let sha = run.second.clone();

    // Act
    run.clean_up_after(|_| {}, &sha).await;

    // Assert
    assert!(ends_with(&run.listed_paths(), "codecharta-worktree-old"));
}

#[tokio::test]
async fn should_leave_one_at_another_commit() {
    // Arrange
    let run = Run::new();
    let sha = run.second.clone();

    // Act
    run.clean_up_after(
        |run| {
            run.add_worktree("codecharta-worktree-other", &run.first);
            run.add_worktree("user-worktree", &run.second);
        },
        &sha,
    )
    .await;

    // Assert
    let listed = run.listed_paths();
    assert!(
        ends_with(&listed, "codecharta-worktree-other"),
        "{listed:?}"
    );
    assert!(ends_with(&listed, "user-worktree"), "{listed:?}");
}
