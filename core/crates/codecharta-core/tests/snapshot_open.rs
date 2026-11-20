mod support;

use std::fs;
use std::path::{Path, PathBuf};

use codecharta_core::CoreError;
use codecharta_core::projects::FolderToAdd;
use codecharta_core::projects::tokens::PickTokens;
use codecharta_core::snapshots::record::{MapRecord, SNAPSHOT_SCHEMA_VERSION, SnapshotRecord};
use codecharta_core::snapshots::{OpenFileRequest, SnapshotMove};
use codecharta_core_api::ids::{FolderId, SnapshotId};
use codecharta_core_api::methods::projects::{
    FolderKind, FolderRef, FolderRole, Project, ProjectView,
};
use codecharta_core_api::methods::snapshots::{OpenedFile, SnapshotRef, SnapshotSource};
use codecharta_core_api::values::{FullCommit, Label};
use support::{StoreWorkspace, folder_ref};
use tempfile::TempDir;

const MAP: &str = r#"{"projectName":"demo","apiVersion":"1.5","nodes":[]}"#;
const UNKNOWN_COMMIT: &str = "0000000000000000000000000000000000000000";

/// A folder called `assets` with a map in it, outside any repository.
struct MapFolder {
    _parent: TempDir,
    folder: PathBuf,
    file: PathBuf,
}

impl MapFolder {
    fn new() -> Self {
        let parent = tempfile::tempdir().expect("a temporary folder");
        let folder = parent.path().join("assets");
        fs::create_dir_all(&folder).expect("the folder is created");
        let file = write_map(&folder, "sample1.cc.json");
        Self {
            _parent: parent,
            folder,
            file,
        }
    }
}

fn write_map(folder: &Path, name: &str) -> PathBuf {
    let file = folder.join(name);
    fs::write(&file, MAP).expect("the map is written");
    file
}

fn open_request(file: &Path) -> OpenFileRequest {
    OpenFileRequest {
        file: file.to_path_buf(),
        target: None,
        bind_to_commit: None,
    }
}

async fn opened(workspace: &StoreWorkspace, file: &Path) -> OpenedFile {
    workspace
        .snapshots()
        .open_file(open_request(file))
        .await
        .expect("the file is opened")
}

fn snapshot_of(opened: &OpenedFile) -> SnapshotRef {
    opened.snapshot.snapshot_ref.clone()
}

fn move_to(folder: &FolderId, commit: Option<&str>) -> SnapshotMove {
    SnapshotMove {
        to_folder: folder.clone(),
        bind_to_commit: commit.map(|commit| FullCommit::try_from(commit).expect("a full commit")),
    }
}

/// Adds the workspace repository to the project of `opened` and answers the project again.
async fn with_repository_folder(workspace: &StoreWorkspace, opened: &OpenedFile) -> Project {
    let folder = FolderToAdd {
        path: workspace.repo.path().to_path_buf(),
        label: Label::try_from("repo").expect("a valid label"),
        role: FolderRole::Primary,
    };
    workspace
        .projects()
        .add_folder(&opened.project.id, folder)
        .await
        .expect("the repository is added")
}

#[tokio::test]
async fn should_create_a_project_named_after_the_containing_folder() {
    // Arrange
    let workspace = StoreWorkspace::new();
    let maps = MapFolder::new();

    // Act
    let opened = opened(&workspace, &maps.file).await;

    // Assert
    assert!(opened.created_project);
    assert!(!opened.was_already_imported);
    assert_eq!(opened.project.name.as_str(), "assets");
    assert_eq!(opened.snapshot.source, SnapshotSource::Imported);
    assert_eq!(opened.project.folders[0].snapshot_count, 1);
}

#[tokio::test]
async fn should_register_the_containing_folder_as_the_project_folder() {
    // Arrange
    let workspace = StoreWorkspace::new();
    let maps = MapFolder::new();

    // Act
    let opened = opened(&workspace, &maps.file).await;

    // Assert
    let folders = &opened.project.folders;
    assert_eq!(folders.len(), 1);
    assert_eq!(Path::new(&folders[0].path), maps.folder);
    assert_eq!(folders[0].label.as_str(), "assets");
    assert_eq!(folders[0].role, FolderRole::Primary);
    assert_eq!(opened.snapshot.snapshot_ref.folder_id, folders[0].id);
}

#[tokio::test]
async fn should_register_a_non_repository_folder_as_plain() {
    // Arrange
    let workspace = StoreWorkspace::new();
    let maps = MapFolder::new();

    // Act
    let opened = opened(&workspace, &maps.file).await;

    // Assert
    assert_eq!(opened.project.folders[0].kind, FolderKind::Plain);
    assert!(opened.project.folders[0].git.is_none());
}

#[tokio::test]
async fn should_reuse_the_project_that_already_has_the_containing_folder() {
    // Arrange
    let workspace = StoreWorkspace::new();
    let maps = MapFolder::new();
    let first = opened(&workspace, &maps.file).await;
    let other = write_map(&maps.folder, "other.cc.json");
    fs::write(&other, MAP.replace("demo", "other")).unwrap();

    // Act
    let second = opened(&workspace, &other).await;

    // Assert
    assert!(!second.created_project);
    assert!(!second.was_already_imported);
    assert_eq!(second.project.id, first.project.id);
    assert_eq!(workspace.projects().list().unwrap().len(), 1);
    assert_eq!(second.project.folders[0].snapshot_count, 2);
}

#[tokio::test]
async fn should_resolve_the_file_name_hint_in_the_containing_repository() {
    // Arrange
    let workspace = StoreWorkspace::new();
    let commit = workspace.repo.git(&["rev-parse", "HEAD"]);
    let file = write_map(
        workspace.repo.path(),
        &format!("{}.repo.cc.json", &commit[..8]),
    );
    let tokens = PickTokens::default();
    let picked = workspace
        .snapshots()
        .inspect_import_file(&tokens, &file)
        .await
        .unwrap();
    let hint = picked.hint_commit.unwrap().commit;

    // Act
    let opened = workspace
        .snapshots()
        .open_file(OpenFileRequest {
            bind_to_commit: Some(hint.clone()),
            ..open_request(&file)
        })
        .await
        .unwrap();

    // Assert
    assert_eq!(hint.as_str(), commit);
    assert!(picked.existing_target.is_none());
    assert_eq!(opened.project.folders[0].kind, FolderKind::Git);
    assert_eq!(opened.snapshot.commit, Some(hint));
    assert!(
        opened
            .snapshot
            .snapshot_ref
            .snapshot_id
            .as_str()
            .starts_with(&format!("{commit}-imported-"))
    );
}

#[tokio::test]
async fn should_show_the_existing_snapshot_when_the_same_file_is_opened_again() {
    // Arrange
    let workspace = StoreWorkspace::new();
    let maps = MapFolder::new();
    let first = opened(&workspace, &maps.file).await;

    // Act
    let second = opened(&workspace, &maps.file).await;

    // Assert
    assert!(second.was_already_imported);
    assert!(!second.created_project);
    assert_eq!(second.snapshot, first.snapshot);
    assert_eq!(second.project.folders[0].snapshot_count, 1);
}

#[tokio::test]
async fn should_not_duplicate_a_snapshot_that_was_moved_to_another_folder() {
    // Arrange
    let workspace = StoreWorkspace::new();
    let maps = MapFolder::new();
    let first = opened(&workspace, &maps.file).await;
    let project = with_repository_folder(&workspace, &first).await;
    let moved = workspace
        .snapshots()
        .move_snapshot(&snapshot_of(&first), move_to(&project.folders[1].id, None))
        .await
        .unwrap();

    // Act
    let again = opened(&workspace, &maps.file).await;

    // Assert
    assert!(again.was_already_imported);
    assert_eq!(again.snapshot, moved);
}

#[tokio::test]
async fn should_move_an_imported_snapshot_to_another_folder_and_bind_it() {
    // Arrange
    let workspace = StoreWorkspace::new();
    let maps = MapFolder::new();
    let first = opened(&workspace, &maps.file).await;
    let project = with_repository_folder(&workspace, &first).await;
    let commit = workspace.repo.git(&["rev-parse", "HEAD"]);
    let repository = folder_ref(&project, 1);

    // Act
    let moved = workspace
        .snapshots()
        .move_snapshot(
            &snapshot_of(&first),
            move_to(&repository.folder_id, Some(&commit)),
        )
        .await
        .unwrap();

    // Assert
    let new_id = moved.snapshot_ref.snapshot_id.to_string();
    assert!(
        new_id.starts_with(&format!("{commit}-imported-")),
        "{new_id}"
    );
    assert_eq!(moved.snapshot_ref.folder_id, repository.folder_id);
    assert_eq!(
        moved.commit.as_ref().map(FullCommit::as_str),
        Some(commit.as_str())
    );
    assert!(
        workspace
            .snapshots()
            .list(&folder_ref(&project, 0))
            .unwrap()
            .is_empty()
    );
    assert_eq!(
        workspace.snapshots().list(&repository).unwrap(),
        vec![moved]
    );
    let old_dir = workspace
        .snapshots_dir(&folder_ref(&project, 0))
        .join(first.snapshot.snapshot_ref.snapshot_id.as_str());
    assert!(!old_dir.exists());
}

#[tokio::test]
async fn should_answer_not_a_commit_when_binding_to_a_commit_the_target_does_not_have() {
    // Arrange
    let workspace = StoreWorkspace::new();
    let maps = MapFolder::new();
    let first = opened(&workspace, &maps.file).await;
    let project = with_repository_folder(&workspace, &first).await;

    // Act
    let result = workspace
        .snapshots()
        .move_snapshot(
            &snapshot_of(&first),
            move_to(&project.folders[1].id, Some(UNKNOWN_COMMIT)),
        )
        .await;

    // Assert
    assert!(
        matches!(result, Err(CoreError::NotACommit { .. })),
        "{result:?}"
    );
    assert_eq!(
        workspace
            .snapshots()
            .list(&folder_ref(&project, 0))
            .unwrap()
            .len(),
        1
    );
}

#[tokio::test]
async fn should_refuse_to_move_an_analysed_snapshot() {
    // Arrange
    let workspace = StoreWorkspace::new();
    let other = tempfile::tempdir().unwrap();
    let project = workspace
        .project_of(&[workspace.repo.path(), other.path()])
        .await;
    let folder = folder_ref(&project, 0);
    let staged = workspace.snapshots().begin_snapshot(&folder).unwrap();
    fs::write(staged.map_file(), "map").unwrap();
    let record = SnapshotRecord {
        schema_version: SNAPSHOT_SCHEMA_VERSION,
        id: SnapshotId::try_from("analysed-1").unwrap(),
        project_id: folder.project_id.clone(),
        folder_id: folder.folder_id.clone(),
        source: SnapshotSource::Analysed,
        created_at: "2026-01-01T00:00:00Z".to_string(),
        git: None,
        hosting: None,
        analysis: None,
        imported: None,
        map: MapRecord {
            file: "map.cc.json.gz".to_string(),
            bytes: 3,
            checksum: None,
            root_name: None,
        },
    };
    let analysed = workspace
        .snapshots()
        .commit_snapshot(staged, record)
        .await
        .unwrap();

    // Act
    let result = workspace
        .snapshots()
        .move_snapshot(
            &analysed.snapshot_ref,
            move_to(&project.folders[1].id, None),
        )
        .await;

    // Assert
    assert!(
        matches!(result, Err(CoreError::BadRequest(_))),
        "{result:?}"
    );
}

#[tokio::test]
async fn should_update_the_remembered_snapshot_of_a_folder_after_a_move() {
    // Arrange
    let workspace = StoreWorkspace::new();
    let maps = MapFolder::new();
    let first = opened(&workspace, &maps.file).await;
    let project = with_repository_folder(&workspace, &first).await;
    let plain = project.folders[0].id.clone();
    let repository = project.folders[1].id.clone();
    let view = ProjectView {
        working_folder_id: Some(plain.clone()),
        shown_snapshot_id_by_folder: [(
            plain.clone(),
            first.snapshot.snapshot_ref.snapshot_id.clone(),
        )]
        .into(),
    };
    workspace
        .projects()
        .set_view(&project.id, view)
        .await
        .unwrap();

    // Act
    let moved = workspace
        .snapshots()
        .move_snapshot(&snapshot_of(&first), move_to(&repository, None))
        .await
        .unwrap();

    // Assert
    let project = workspace.projects().get(&project.id).await.unwrap();
    let shown = &project.view.shown_snapshot_id_by_folder;
    assert_eq!(shown.get(&plain), None);
    assert_eq!(
        shown.get(&repository),
        Some(&moved.snapshot_ref.snapshot_id)
    );
}

#[tokio::test]
async fn should_bind_a_snapshot_later_in_its_own_folder() {
    // Arrange
    let workspace = StoreWorkspace::new();
    let file = write_map(workspace.repo.path(), "map.cc.json");
    let first = opened(&workspace, &file).await;
    let commit = workspace.repo.git(&["rev-parse", "HEAD"]);
    let own_folder = first.snapshot.snapshot_ref.folder_id.clone();

    // Act
    let bound = workspace
        .snapshots()
        .move_snapshot(&snapshot_of(&first), move_to(&own_folder, Some(&commit)))
        .await
        .unwrap();

    // Assert
    assert_eq!(bound.snapshot_ref.folder_id, own_folder);
    assert_eq!(
        bound.commit.as_ref().map(FullCommit::as_str),
        Some(commit.as_str())
    );
    let listed = workspace
        .snapshots()
        .list(&FolderRef {
            project_id: first.project.id.clone(),
            folder_id: own_folder,
        })
        .unwrap();
    assert_eq!(listed, vec![bound]);
}

#[tokio::test]
async fn should_remove_the_new_project_when_the_file_cannot_be_imported() {
    // Arrange
    let workspace = StoreWorkspace::new();
    let maps = MapFolder::new();
    let unknown = FullCommit::try_from(UNKNOWN_COMMIT).unwrap();

    // Act
    let result = workspace
        .snapshots()
        .open_file(OpenFileRequest {
            bind_to_commit: Some(unknown),
            ..open_request(&maps.file)
        })
        .await;

    // Assert
    assert!(
        matches!(result, Err(CoreError::FolderUnavailable(_))),
        "{result:?}"
    );
    assert!(workspace.projects().list().unwrap().is_empty());
}
