mod support;

use std::fs;
use std::sync::Arc;
use std::time::Duration;

use codecharta_core::analysis::queue::{AnalysisQueue, EnqueueOutcome, JobExecutor, NewJob};
use codecharta_core::analysis::runner::RunHooks;
use codecharta_core::analysis::service::{JobFailure, JobRequest};
use codecharta_core::git::GitService;
use codecharta_core::ids::commit_snapshot_id;
use codecharta_core::snapshots::record::{
    AnalysisProfileRecord, AnalysisRecord, GitRecord, ImportedRecord, MapRecord,
    SNAPSHOT_SCHEMA_VERSION, SnapshotRecord,
};
use codecharta_core::snapshots::retention::Retention;
use codecharta_core_api::error::ErrorCode;
use codecharta_core_api::ids::SnapshotId;
use codecharta_core_api::methods::analysis::{AnalysisTarget, JobState, TargetKind};
use codecharta_core_api::methods::projects::{FolderRef, ProjectView};
use codecharta_core_api::methods::snapshots::{
    PrunePlan, PrunePolicy, SnapshotRef, SnapshotSource, StoreUsage,
};
use codecharta_core_api::values::{CommitSha, FullCommit};
use tokio_util::sync::CancellationToken;

use support::{RecordingRecycler, StoreWorkspace, folder_ref};

const PROFILE_HASH: &str = "0a1b2c3d";
const MAP_CONTENT: &[u8] = b"not really gzip";
const LOG_CONTENT: &[u8] = b"ccsh said hello";
const CREATED_AT: &str = "2026-11-19T00:00:00Z";
const WAIT: Duration = Duration::from_secs(5);
const POLL: Duration = Duration::from_millis(10);

/// What a snapshot record says about where it came from.
enum Origin<'origin> {
    Commit(&'origin str),
    WorkingTree,
    Imported,
}

fn record(folder: &FolderRef, id: &str, origin: &Origin<'_>) -> SnapshotRecord {
    let base = SnapshotRecord {
        schema_version: SNAPSHOT_SCHEMA_VERSION,
        id: SnapshotId::try_from(id).expect("a valid snapshot id"),
        project_id: folder.project_id.clone(),
        folder_id: folder.folder_id.clone(),
        source: SnapshotSource::Analysed,
        created_at: CREATED_AT.to_string(),
        git: None,
        hosting: None,
        analysis: Some(analysis_record(TargetKind::WorkingTree)),
        imported: None,
        map: MapRecord {
            file: "map.cc.json.gz".to_string(),
            bytes: MAP_CONTENT.len() as u64,
            checksum: None,
            root_name: None,
        },
    };
    match origin {
        Origin::Commit(date) => SnapshotRecord {
            git: Some(git_record(&id[..40], date)),
            analysis: Some(analysis_record(TargetKind::Commit)),
            ..base
        },
        Origin::WorkingTree => base,
        Origin::Imported => SnapshotRecord {
            source: SnapshotSource::Imported,
            analysis: None,
            imported: Some(ImportedRecord {
                at: CREATED_AT.to_string(),
                original_file_name: "map.cc.json".to_string(),
                file_modified_at: CREATED_AT.to_string(),
                content_sha256: "0".repeat(64),
            }),
            ..base
        },
    }
}

fn git_record(commit: &str, commit_date: &str) -> GitRecord {
    GitRecord {
        commit: FullCommit::try_from(commit).expect("a full commit"),
        short_commit: commit[..7].to_string(),
        subject: "A commit".to_string(),
        author_name: "Ada Author".to_string(),
        author_date: commit_date.to_string(),
        commit_date: commit_date.to_string(),
        parents: Vec::new(),
        branches_at_run: Vec::new(),
        tags_at_run: Vec::new(),
        head_at_run: None,
        dirty: false,
        remotes: Vec::new(),
        tree: None,
    }
}

fn analysis_record(target: TargetKind) -> AnalysisRecord {
    AnalysisRecord {
        started_at: CREATED_AT.to_string(),
        finished_at: CREATED_AT.to_string(),
        duration_ms: 1_000,
        ccsh_version: "2.4.0".to_string(),
        java_version: Some("25".to_string()),
        profile: AnalysisProfileRecord {
            without: Vec::new(),
            exclude: Vec::new(),
            extra_args: Vec::new(),
        },
        profile_hash: PROFILE_HASH.to_string(),
        exit_code: 0,
        not_in_map: Vec::new(),
        target: Some(target),
        reused_from: None,
    }
}

/// Writes a snapshot with a map and, for an analysis, its log; answers its reference.
async fn add_snapshot(
    workspace: &StoreWorkspace,
    folder: &FolderRef,
    id: &str,
    origin: Origin<'_>,
) -> SnapshotRef {
    let snapshots = workspace.snapshots();
    let staged = snapshots.begin_snapshot(folder).expect("a staged snapshot");
    fs::write(staged.map_file(), MAP_CONTENT).expect("the map is written");
    if !matches!(origin, Origin::Imported) {
        fs::write(staged.log_file(), LOG_CONTENT).expect("the log is written");
    }
    snapshots
        .commit_snapshot(staged, record(folder, id, &origin))
        .await
        .expect("the snapshot is committed");
    snapshot_ref(folder, id)
}

fn snapshot_ref(folder: &FolderRef, id: &str) -> SnapshotRef {
    SnapshotRef {
        project_id: folder.project_id.clone(),
        folder_id: folder.folder_id.clone(),
        snapshot_id: SnapshotId::try_from(id).expect("a valid snapshot id"),
    }
}

fn commit_id(commit: &str) -> String {
    format!("{}-{PROFILE_HASH}", commit.trim())
}

fn commit_date(workspace: &StoreWorkspace, commit: &str) -> String {
    workspace
        .repo
        .git(&["show", "-s", "--format=%cI", commit.trim()])
        .trim()
        .to_string()
}

async fn usage_of(workspace: &StoreWorkspace, folder: &FolderRef) -> StoreUsage {
    let (projects, snapshots) = (workspace.projects(), workspace.snapshots());
    let git = GitService::new(&workspace.git, workspace.repo.data_dir());
    let queue = AnalysisQueue::new();
    let retention = Retention {
        projects: &projects,
        snapshots: &snapshots,
        git: &git,
        queue: &queue,
    };
    retention
        .usage(&folder.project_id)
        .expect("the usage is measured")
}

async fn plan_of(
    workspace: &StoreWorkspace,
    folder: &FolderRef,
    policy: &PrunePolicy,
) -> PrunePlan {
    let (projects, snapshots) = (workspace.projects(), workspace.snapshots());
    let git = GitService::new(&workspace.git, workspace.repo.data_dir());
    let queue = AnalysisQueue::new();
    let retention = Retention {
        projects: &projects,
        snapshots: &snapshots,
        git: &git,
        queue: &queue,
    };
    retention
        .plan_prune(folder, policy, &CancellationToken::new())
        .await
        .expect("the plan is made")
}

fn planned_ids(plan: &PrunePlan) -> Vec<String> {
    plan.delete
        .iter()
        .map(|snapshot| snapshot.snapshot_ref.snapshot_id.to_string())
        .collect()
}

#[tokio::test]
async fn should_sum_sizes_per_folder() {
    // Arrange
    let workspace = StoreWorkspace::new();
    let plain = tempfile::tempdir().expect("a second folder");
    let project = workspace
        .project_of(&[workspace.repo.path(), plain.path()])
        .await;
    let (first, second) = (folder_ref(&project, 0), folder_ref(&project, 1));
    add_snapshot(
        &workspace,
        &first,
        "worktree-20261119T000000001Z-0a1b2c3d",
        Origin::WorkingTree,
    )
    .await;
    add_snapshot(
        &workspace,
        &first,
        "imported-0123456789abcdef",
        Origin::Imported,
    )
    .await;
    add_snapshot(
        &workspace,
        &second,
        "worktree-20261119T000000002Z-0a1b2c3d",
        Origin::WorkingTree,
    )
    .await;
    let analysed_bytes = (MAP_CONTENT.len() + LOG_CONTENT.len()) as u64;
    let imported_bytes = MAP_CONTENT.len() as u64;

    // Act
    let usage = usage_of(&workspace, &first).await;

    // Assert
    let per_folder: Vec<(String, u32, u64)> = usage
        .folders
        .iter()
        .map(|folder| {
            (
                folder.folder_id.to_string(),
                folder.snapshot_count,
                folder.bytes,
            )
        })
        .collect();
    assert_eq!(
        per_folder,
        [
            (
                first.folder_id.to_string(),
                2,
                analysed_bytes + imported_bytes
            ),
            (second.folder_id.to_string(), 1, analysed_bytes),
        ]
    );
    assert_eq!(usage.total_bytes, 2 * analysed_bytes + imported_bytes);
}

/// Runs every job until it is cancelled, like an analysis that takes long.
struct EndlessExecutor;

impl JobExecutor for EndlessExecutor {
    async fn execute(
        &self,
        _job: &JobRequest,
        _hooks: &RunHooks,
        cancel: &CancellationToken,
    ) -> Result<SnapshotId, JobFailure> {
        cancel.cancelled().await;
        Err(JobFailure::Cancelled)
    }
}

async fn wait_until_running(queue: &AnalysisQueue) {
    let deadline = tokio::time::Instant::now() + WAIT;
    while tokio::time::Instant::now() < deadline {
        if queue
            .list()
            .iter()
            .any(|job| job.state == JobState::Running)
        {
            return;
        }
        tokio::time::sleep(POLL).await;
    }
    panic!("no job started within {WAIT:?}");
}

#[tokio::test]
async fn should_refuse_to_delete_a_snapshot_being_written() {
    // Arrange
    let workspace = StoreWorkspace::new();
    let project = workspace.project_of(&[workspace.repo.path()]).await;
    let folder = folder_ref(&project, 0);
    let head = workspace.repo.git(&["rev-parse", "HEAD"]);
    let date = commit_date(&workspace, &head);
    let written = add_snapshot(
        &workspace,
        &folder,
        &commit_id(&head),
        Origin::Commit(&date),
    )
    .await;
    let queue = Arc::new(AnalysisQueue::new());
    let rerun = NewJob {
        folder: folder.clone(),
        target: AnalysisTarget::Commit {
            sha: CommitSha::try_from(head.trim()).expect("a sha"),
        },
        profile_hash: PROFILE_HASH.to_string(),
        batch_id: None,
        force: true,
    };
    let existing = commit_snapshot_id(
        &FullCommit::try_from(head.trim()).expect("a commit"),
        PROFILE_HASH,
    )
    .ok();
    assert!(matches!(
        queue.enqueue(rerun, existing),
        Ok(EnqueueOutcome::Queued(_))
    ));
    let driving = Arc::clone(&queue);
    let driver = tokio::spawn(async move { driving.drive(&EndlessExecutor).await });
    wait_until_running(&queue).await;
    let (projects, snapshots) = (workspace.projects(), workspace.snapshots());
    let git = GitService::new(&workspace.git, workspace.repo.data_dir());
    let retention = Retention {
        projects: &projects,
        snapshots: &snapshots,
        git: &git,
        queue: &queue,
    };

    // Act
    let deleted = retention.delete(&written, false).await;
    let pruned = retention
        .prune(&folder, std::slice::from_ref(&written.snapshot_id), true)
        .await;

    // Assert
    assert_eq!(deleted.unwrap_err().code(), ErrorCode::SnapshotBeingWritten);
    assert_eq!(pruned.unwrap_err().code(), ErrorCode::SnapshotBeingWritten);
    assert!(
        workspace
            .snapshots_dir(&folder)
            .join(written.snapshot_id.as_str())
            .is_dir()
    );
    queue.shutdown();
    driver.await.expect("the driver ends");
}

/// main: a ← b (tag v1) ← c (branch side) ← d ← e ← f (main); snapshots of every commit, one working tree
/// snapshot and one import bound to d.
struct History {
    workspace: StoreWorkspace,
    folder: FolderRef,
    ids: Vec<String>,
    working_tree: String,
    imported: String,
}

async fn history() -> History {
    let workspace = StoreWorkspace::new();
    let mut commits = vec![workspace.repo.git(&["rev-parse", "HEAD"])];
    for name in ["b", "c", "d", "e", "f"] {
        commits.push(
            workspace
                .repo
                .commit_file(&format!("{name}.txt"), name, name),
        );
        match name {
            "b" => workspace.repo.tag("v1", true),
            "c" => workspace.repo.branch("side"),
            _ => {}
        }
    }
    let project = workspace.project_of(&[workspace.repo.path()]).await;
    let folder = folder_ref(&project, 0);
    let mut ids = Vec::new();
    for commit in &commits {
        let date = commit_date(&workspace, commit);
        let id = commit_id(commit);
        add_snapshot(&workspace, &folder, &id, Origin::Commit(&date)).await;
        ids.push(id);
    }
    let working_tree = "worktree-20261119T000000001Z-0a1b2c3d".to_string();
    add_snapshot(&workspace, &folder, &working_tree, Origin::WorkingTree).await;
    let imported = format!("imported-{}-01234567", commits[3].trim());
    add_snapshot(&workspace, &folder, &imported, Origin::Imported).await;
    History {
        workspace,
        folder,
        ids,
        working_tree,
        imported,
    }
}

async fn show(history: &History, id: &str) {
    let view = ProjectView {
        working_folder_id: Some(history.folder.folder_id.clone()),
        shown_snapshot_id_by_folder: [(
            history.folder.folder_id.clone(),
            SnapshotId::try_from(id).expect("a snapshot id"),
        )]
        .into(),
    };
    history
        .workspace
        .projects()
        .set_view(&history.folder.project_id, view)
        .await
        .expect("the view is saved");
}

#[tokio::test]
async fn should_keep_branch_tips_tags_the_newest_n_and_the_shown_snapshot() {
    // Arrange
    let history = history().await;
    show(&history, &history.ids[0]).await;
    let policy = PrunePolicy {
        keep_newest_commit_snapshots: 2,
        keep_newest_working_tree_snapshots: 1,
        keep_branch_tips_and_tags: true,
    };

    // Act
    let plan = plan_of(&history.workspace, &history.folder, &policy).await;

    // Assert
    assert_eq!(planned_ids(&plan), [history.ids[3].clone()]);
    assert_eq!(plan.keep, 7);
    assert_eq!(
        plan.freed_bytes,
        (MAP_CONTENT.len() + LOG_CONTENT.len()) as u64
    );
}

#[tokio::test]
async fn should_list_the_rest() {
    // Arrange
    let history = history().await;
    let policy = PrunePolicy {
        keep_newest_commit_snapshots: 1,
        keep_newest_working_tree_snapshots: 0,
        keep_branch_tips_and_tags: false,
    };

    // Act
    let plan = plan_of(&history.workspace, &history.folder, &policy).await;

    // Assert
    let mut planned = planned_ids(&plan);
    planned.sort();
    let mut expected = vec![history.working_tree.clone()];
    expected.extend(history.ids[..5].iter().cloned());
    expected.sort();
    assert_eq!(planned, expected);
    assert_eq!(plan.keep, 2);
}

#[tokio::test]
async fn should_never_list_an_imported_snapshot() {
    // Arrange
    let history = history().await;
    let policy = PrunePolicy {
        keep_newest_commit_snapshots: 0,
        keep_newest_working_tree_snapshots: 0,
        keep_branch_tips_and_tags: false,
    };
    let (projects, snapshots) = (history.workspace.projects(), history.workspace.snapshots());
    let git = GitService::new(&history.workspace.git, history.workspace.repo.data_dir());
    let queue = AnalysisQueue::new();
    let retention = Retention {
        projects: &projects,
        snapshots: &snapshots,
        git: &git,
        queue: &queue,
    };
    let imported = SnapshotId::try_from(history.imported.as_str()).expect("a snapshot id");

    // Act
    let plan = plan_of(&history.workspace, &history.folder, &policy).await;
    let pruned = retention
        .prune(&history.folder, std::slice::from_ref(&imported), false)
        .await;

    // Assert
    assert_eq!(plan.delete.len(), 7);
    assert!(!planned_ids(&plan).contains(&history.imported));
    assert_eq!(plan.keep, 1);
    assert_eq!(pruned.unwrap_err().code(), ErrorCode::BadRequest);
    assert!(history.workspace.recycler.recycled().is_empty());
}

#[tokio::test]
async fn should_report_a_failing_recycle_bin_and_delete_permanently_only_when_asked() {
    // Arrange
    let workspace = StoreWorkspace::with_recycler(RecordingRecycler::failing());
    let project = workspace.project_of(&[workspace.repo.path()]).await;
    let folder = folder_ref(&project, 0);
    let first = add_snapshot(
        &workspace,
        &folder,
        "worktree-20261119T000000001Z-0a1b2c3d",
        Origin::WorkingTree,
    )
    .await;
    let second = add_snapshot(
        &workspace,
        &folder,
        "worktree-20261119T000000002Z-0a1b2c3d",
        Origin::WorkingTree,
    )
    .await;
    let (projects, snapshots) = (workspace.projects(), workspace.snapshots());
    let git = GitService::new(&workspace.git, workspace.repo.data_dir());
    let queue = AnalysisQueue::new();
    let mut changes = queue.subscribe();
    let retention = Retention {
        projects: &projects,
        snapshots: &snapshots,
        git: &git,
        queue: &queue,
    };
    let ids = [first.snapshot_id.clone(), second.snapshot_id.clone()];

    // Act
    let recycled = retention.delete(&first, false).await;
    let recycled_prune = retention.prune(&folder, &ids, false).await;
    let kept_after_refusal = workspace.snapshots().list(&folder).expect("listed").len();
    retention
        .delete(&first, true)
        .await
        .expect("deleted for good");
    let pruned = retention
        .prune(&folder, &ids[1..], true)
        .await
        .expect("pruned for good");

    // Assert
    assert_eq!(recycled.unwrap_err().code(), ErrorCode::RecycleFailed);
    assert_eq!(recycled_prune.unwrap_err().code(), ErrorCode::RecycleFailed);
    assert_eq!(kept_after_refusal, 2);
    assert_eq!(pruned.deleted, 1);
    assert_eq!(
        pruned.freed_bytes,
        (MAP_CONTENT.len() + LOG_CONTENT.len()) as u64
    );
    assert!(
        workspace
            .snapshots()
            .list(&folder)
            .expect("listed")
            .is_empty()
    );
    assert!(std::iter::from_fn(|| changes.try_recv().ok()).count() >= 2);
}
