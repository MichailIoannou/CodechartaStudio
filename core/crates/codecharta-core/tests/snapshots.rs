mod support;

use std::fs;

use codecharta_core::CoreError;
use codecharta_core::snapshots::record::{
    GitRecord, MapRecord, SNAPSHOT_SCHEMA_VERSION, SnapshotRecord,
};
use codecharta_core::snapshots::{MapFacts, StagedSnapshot};
use codecharta_core_api::ids::SnapshotId;
use codecharta_core_api::methods::projects::{FolderRef, ProjectView};
use codecharta_core_api::methods::snapshots::{SnapshotRef, SnapshotSource};
use codecharta_core_api::values::{FullCommit, MapChecksum, RootName};
use support::{StoreWorkspace, folder_ref};

const MAP_CONTENT: &[u8] = b"not really gzip";

fn record_for(folder: &FolderRef, id: &str, created_at: &str) -> SnapshotRecord {
    SnapshotRecord {
        schema_version: SNAPSHOT_SCHEMA_VERSION,
        id: SnapshotId::try_from(id).expect("a valid snapshot id"),
        project_id: folder.project_id.clone(),
        folder_id: folder.folder_id.clone(),
        source: SnapshotSource::Analysed,
        created_at: created_at.to_string(),
        git: None,
        hosting: None,
        analysis: None,
        imported: None,
        map: MapRecord {
            file: "map.cc.json.gz".to_string(),
            bytes: MAP_CONTENT.len() as u64,
            checksum: None,
            root_name: None,
        },
    }
}

fn snapshot_ref(folder: &FolderRef, id: &str) -> SnapshotRef {
    SnapshotRef {
        project_id: folder.project_id.clone(),
        folder_id: folder.folder_id.clone(),
        snapshot_id: SnapshotId::try_from(id).expect("a valid snapshot id"),
    }
}

fn staged_with_map(workspace: &StoreWorkspace, folder: &FolderRef) -> StagedSnapshot {
    let staged = workspace
        .snapshots()
        .begin_snapshot(folder)
        .expect("the snapshot is staged");
    fs::write(staged.map_file(), MAP_CONTENT).expect("the map is written");
    staged
}

async fn committed(workspace: &StoreWorkspace, folder: &FolderRef, id: &str, created_at: &str) {
    let staged = staged_with_map(workspace, folder);
    workspace
        .snapshots()
        .commit_snapshot(staged, record_for(folder, id, created_at))
        .await
        .expect("the snapshot is committed");
}

fn listed_ids(workspace: &StoreWorkspace, folder: &FolderRef) -> Vec<String> {
    workspace
        .snapshots()
        .list(folder)
        .expect("the snapshots are listed")
        .into_iter()
        .map(|summary| summary.snapshot_ref.snapshot_id.to_string())
        .collect()
}

#[tokio::test]
async fn should_list_snapshots_newest_first() {
    // Arrange
    let workspace = StoreWorkspace::new();
    let project = workspace.project_of(&[workspace.repo.path()]).await;
    let folder = folder_ref(&project, 0);
    committed(&workspace, &folder, "older", "2026-01-01T00:00:00Z").await;
    committed(&workspace, &folder, "newest", "2026-03-01T00:00:00Z").await;
    committed(&workspace, &folder, "middle", "2026-02-01T00:00:00Z").await;

    // Act
    let ids = listed_ids(&workspace, &folder);

    // Assert
    assert_eq!(ids, vec!["newest", "middle", "older"]);
}

#[tokio::test]
async fn should_skip_a_directory_without_snapshot_json() {
    // Arrange
    let workspace = StoreWorkspace::new();
    let project = workspace.project_of(&[workspace.repo.path()]).await;
    let folder = folder_ref(&project, 0);
    committed(&workspace, &folder, "kept", "2026-01-01T00:00:00Z").await;
    fs::create_dir_all(workspace.snapshots_dir(&folder).join("no-record")).unwrap();

    // Act
    let ids = listed_ids(&workspace, &folder);

    // Assert
    assert_eq!(ids, vec!["kept"]);
}

#[tokio::test]
async fn should_make_a_snapshot_visible_only_after_commit() {
    // Arrange
    let workspace = StoreWorkspace::new();
    let project = workspace.project_of(&[workspace.repo.path()]).await;
    let folder = folder_ref(&project, 0);
    let staged = staged_with_map(&workspace, &folder);
    let while_staged = listed_ids(&workspace, &folder);

    // Act
    let summary = workspace
        .snapshots()
        .commit_snapshot(staged, record_for(&folder, "s-1", "2026-01-01T00:00:00Z"))
        .await
        .unwrap();

    // Assert
    assert!(while_staged.is_empty());
    assert_eq!(listed_ids(&workspace, &folder), vec!["s-1"]);
    assert_eq!(summary.map_bytes, MAP_CONTENT.len() as u64);
    let snapshot_dir = workspace.snapshots_dir(&folder).join("s-1");
    assert!(snapshot_dir.join("snapshot.json").is_file());
    assert!(snapshot_dir.join("map.cc.json.gz").is_file());
}

#[tokio::test]
async fn should_remove_the_staging_directory_on_abort() {
    // Arrange
    let workspace = StoreWorkspace::new();
    let project = workspace.project_of(&[workspace.repo.path()]).await;
    let folder = folder_ref(&project, 0);
    let staged = staged_with_map(&workspace, &folder);
    let staging_dir = staged.directory().to_path_buf();

    // Act
    workspace.snapshots().abort_snapshot(staged).unwrap();

    // Assert
    assert!(!staging_dir.exists());
    assert!(
        staging_dir
            .file_name()
            .unwrap()
            .to_string_lossy()
            .starts_with(".incoming-")
    );
}

#[tokio::test]
async fn should_refuse_to_commit_over_an_existing_snapshot_and_remove_the_staging_directory() {
    // Arrange
    let workspace = StoreWorkspace::new();
    let project = workspace.project_of(&[workspace.repo.path()]).await;
    let folder = folder_ref(&project, 0);
    committed(&workspace, &folder, "s-1", "2026-01-01T00:00:00Z").await;
    let staged = staged_with_map(&workspace, &folder);
    let staging_dir = staged.directory().to_path_buf();

    // Act
    let result = workspace
        .snapshots()
        .commit_snapshot(staged, record_for(&folder, "s-1", "2026-02-01T00:00:00Z"))
        .await;

    // Assert
    assert!(matches!(result, Err(CoreError::Conflict(_))), "{result:?}");
    assert!(!staging_dir.exists());
}

#[tokio::test]
async fn should_recycle_a_deleted_snapshot() {
    // Arrange
    let workspace = StoreWorkspace::new();
    let project = workspace.project_of(&[workspace.repo.path()]).await;
    let folder = folder_ref(&project, 0);
    committed(&workspace, &folder, "s-1", "2026-01-01T00:00:00Z").await;
    let shown = ProjectView {
        working_folder_id: Some(folder.folder_id.clone()),
        shown_snapshot_id_by_folder: [(
            folder.folder_id.clone(),
            SnapshotId::try_from("s-1").unwrap(),
        )]
        .into(),
    };
    workspace
        .projects()
        .set_view(&project.id, shown)
        .await
        .unwrap();

    // Act
    workspace
        .snapshots()
        .delete(&snapshot_ref(&folder, "s-1"), false)
        .await
        .unwrap();

    // Assert
    let snapshot_dir = workspace.snapshots_dir(&folder).join("s-1");
    assert_eq!(workspace.recycler.recycled(), vec![snapshot_dir.clone()]);
    assert!(!snapshot_dir.exists());
    let project = workspace.projects().get(&project.id).await.unwrap();
    assert!(project.view.shown_snapshot_id_by_folder.is_empty());
}

#[tokio::test]
async fn should_answer_the_map_location_and_not_found_for_an_unknown_snapshot() {
    // Arrange
    let workspace = StoreWorkspace::new();
    let project = workspace.project_of(&[workspace.repo.path()]).await;
    let folder = folder_ref(&project, 0);
    committed(&workspace, &folder, "s-1", "2026-01-01T00:00:00Z").await;

    // Act
    let location = workspace
        .snapshots()
        .map_location(&snapshot_ref(&folder, "s-1"));
    let unknown = workspace
        .snapshots()
        .map_location(&snapshot_ref(&folder, "s-2"));

    // Assert
    assert_eq!(
        location.unwrap(),
        workspace
            .snapshots_dir(&folder)
            .join("s-1")
            .join("map.cc.json.gz")
    );
    assert!(
        matches!(unknown, Err(CoreError::NotFound(_))),
        "{unknown:?}"
    );
}

#[tokio::test]
async fn should_record_the_map_facts_the_renderer_reports() {
    // Arrange
    let workspace = StoreWorkspace::new();
    let project = workspace.project_of(&[workspace.repo.path()]).await;
    let folder = folder_ref(&project, 0);
    committed(&workspace, &folder, "s-1", "2026-01-01T00:00:00Z").await;
    let facts = MapFacts {
        checksum: MapChecksum::try_from("d41d8cd98f00b204e9800998ecf8427e").unwrap(),
        root_name: RootName::try_from("root").unwrap(),
    };

    // Act
    workspace
        .snapshots()
        .record_map_facts(&snapshot_ref(&folder, "s-1"), facts)
        .await
        .unwrap();

    // Assert
    let summaries = workspace.snapshots().list(&folder).unwrap();
    assert_eq!(
        summaries[0].checksum.as_deref(),
        Some("d41d8cd98f00b204e9800998ecf8427e")
    );
}

#[tokio::test]
async fn should_find_the_snapshots_of_a_commit() {
    // Arrange
    let workspace = StoreWorkspace::new();
    let project = workspace.project_of(&[workspace.repo.path()]).await;
    let folder = folder_ref(&project, 0);
    committed(&workspace, &folder, "s-1", "2026-01-01T00:00:00Z").await;
    let commit = FullCommit::try_from(workspace.repo.git(&["rev-parse", "HEAD"])).unwrap();
    let mut analysed = record_for(&folder, "s-2", "2026-02-01T00:00:00Z");
    analysed.git = Some(git_record(&commit));
    let staged = staged_with_map(&workspace, &folder);
    workspace
        .snapshots()
        .commit_snapshot(staged, analysed)
        .await
        .unwrap();

    // Act
    let found = workspace
        .snapshots()
        .find_by_commit(&folder, &commit)
        .unwrap();

    // Assert
    let ids: Vec<&str> = found
        .iter()
        .map(|summary| summary.snapshot_ref.snapshot_id.as_str())
        .collect();
    assert_eq!(ids, vec!["s-2"]);
    assert_eq!(found[0].commit.as_ref(), Some(&commit));
}

fn git_record(commit: &FullCommit) -> GitRecord {
    GitRecord {
        commit: commit.clone(),
        short_commit: commit.as_str()[..7].to_string(),
        subject: "Add a".to_string(),
        author_name: "Ada Tester".to_string(),
        author_date: "2026-01-02T03:04:05Z".to_string(),
        commit_date: "2026-01-02T03:04:05Z".to_string(),
        parents: Vec::new(),
        branches_at_run: Vec::new(),
        tags_at_run: Vec::new(),
        head_at_run: None,
        dirty: false,
        remotes: Vec::new(),
    }
}

#[tokio::test]
async fn should_answer_not_found_for_a_folder_outside_the_project() {
    // Arrange
    let workspace = StoreWorkspace::new();
    let project = workspace.project_of(&[workspace.repo.path()]).await;
    let mut folder = folder_ref(&project, 0);
    folder.folder_id = codecharta_core_api::ids::FolderId::try_from("f-0000000000000000").unwrap();

    // Act
    let result = workspace.snapshots().list(&folder);

    // Assert
    assert!(matches!(result, Err(CoreError::NotFound(_))), "{result:?}");
}
