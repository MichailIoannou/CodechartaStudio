mod support;

use std::fs;
use std::path::PathBuf;

use codecharta_core::analysis::recovery::{JobFile, JobMarker, Recovery, recover};
use codecharta_core::git::GitService;
use codecharta_core_api::values::CommitSha;

use support::{StoreWorkspace, folder_ref};

const DEAD_PID: u32 = 4_000_000;

fn job_of(workspace: &StoreWorkspace, sha: &str) -> JobFile {
    JobFile {
        repository_path: Some(workspace.repo.path().to_path_buf()),
        sha: Some(CommitSha::try_from(sha).expect("a commit sha")),
        worktrees_before: Vec::new(),
        pid: DEAD_PID,
    }
}

fn worktree_paths(workspace: &StoreWorkspace) -> Vec<PathBuf> {
    workspace
        .repo
        .git(&["worktree", "list", "--porcelain"])
        .lines()
        .filter_map(|line| line.strip_prefix("worktree "))
        .map(PathBuf::from)
        .collect()
}

#[tokio::test]
async fn should_clean_a_leftover_temp_folder_of_a_dead_pid_and_leave_one_of_a_live_pid() {
    // Arrange
    let workspace = StoreWorkspace::new();
    let project = workspace.project_of(&[workspace.repo.path()]).await;
    let folder = folder_ref(&project, 0);
    let snapshots_dir = workspace.snapshots_dir(&folder);
    let head = workspace.repo.git(&["rev-parse", "HEAD"]);
    let worktree_parent = tempfile::tempdir().expect("a temp folder");
    let orphan = worktree_parent.path().join("codecharta-worktree-1");
    let orphan_text = orphan.to_string_lossy().into_owned();
    workspace
        .repo
        .git(&["worktree", "add", "--detach", &orphan_text, &head]);
    let dead = snapshots_dir.join(".incoming-0000dead");
    let live = snapshots_dir.join(".incoming-0000a11e");
    fs::create_dir_all(&dead).expect("the dead folder is created");
    fs::create_dir_all(&live).expect("the live folder is created");
    drop(JobMarker::hold(&dead, &job_of(&workspace, &head)).expect("the marker is written"));
    let held = JobMarker::hold(&live, &job_of(&workspace, &head)).expect("the marker is held");
    let git = GitService::new(&workspace.git, workspace.repo.data_dir());

    // Act
    let recovery = recover(workspace.store.paths(), &git).await;

    // Assert
    assert_eq!(
        recovery.expect("the recovery runs"),
        Recovery {
            cleaned: 1,
            still_running: 1
        }
    );
    assert!(!dead.exists());
    assert!(live.join("job.json").is_file());
    assert!(!orphan.exists());
    assert!(!worktree_paths(&workspace).contains(&orphan));
    held.release();
    assert!(!live.join("job.json").exists());
}
