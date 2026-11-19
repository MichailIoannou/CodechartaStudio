mod support;

use std::fs;
use std::path::{Path, PathBuf};

use codecharta_core::CoreError;
use codecharta_core::projects::{
    FolderChanges, FolderToAdd, NewProject, ProjectRepository, Relink,
};
use codecharta_core::store::Store;
use codecharta_core_api::ids::FolderId;
use codecharta_core_api::methods::projects::{
    AnalysisProfile, FolderKind, FolderRef, FolderRole, FolderStatus, Project, ProjectView,
    RelationshipKind, UpdateProjectParams,
};
use codecharta_core_api::values::{CommitHash, Description, Label, ProjectName};
use serde_json::{Value, json};
use support::git_fixture::FixtureGit;
use support::{RecordingRecycler, TempRepo};
use tempfile::TempDir;

struct Workspace {
    store_root: TempDir,
    store: Store,
    repo: TempRepo,
    git: FixtureGit,
    recycler: RecordingRecycler,
}

impl Workspace {
    fn new() -> Self {
        Self::with_recycler(RecordingRecycler::new())
    }

    fn with_recycler(recycler: RecordingRecycler) -> Self {
        let store_root = tempfile::tempdir().expect("a temporary store root");
        let store = Store::open(store_root.path()).expect("the store opens");
        let repo = TempRepo::new();
        repo.commit_file("a.txt", "a", "Add a");
        let git = repo.runner();
        Self {
            store_root,
            store,
            repo,
            git,
            recycler,
        }
    }

    fn projects(&self) -> ProjectRepository<'_> {
        ProjectRepository::new(&self.store, &self.git, &self.recycler)
    }

    fn project_dir(&self, project: &Project) -> PathBuf {
        self.store_root
            .path()
            .join("projects")
            .join(project.id.as_str())
    }

    async fn create(&self, folders: Vec<FolderToAdd>) -> Project {
        let new = NewProject {
            name: ProjectName::try_from("CodeCharta").expect("a valid name"),
            description: Some(Description::try_from("The map").expect("a valid description")),
            folders,
        };
        self.projects()
            .create(new)
            .await
            .expect("the project is created")
    }
}

fn folder(path: &Path, label: &str, role: FolderRole) -> FolderToAdd {
    FolderToAdd {
        path: path.to_path_buf(),
        label: Label::try_from(label).expect("a valid label"),
        role,
    }
}

#[tokio::test]
async fn should_write_project_json_atomically() {
    // Arrange
    let workspace = Workspace::new();

    // Act
    let project = workspace
        .create(vec![folder(
            workspace.repo.path(),
            "app",
            FolderRole::Primary,
        )])
        .await;

    // Assert
    let project_dir = workspace.project_dir(&project);
    let stored: Value =
        serde_json::from_slice(&fs::read(project_dir.join("project.json")).unwrap()).unwrap();
    assert_eq!(stored["schemaVersion"], json!(1));
    assert_eq!(stored["name"], json!("CodeCharta"));
    assert_eq!(stored["folders"][0]["label"], json!("app"));
    assert_eq!(
        stored["view"],
        json!({ "workingFolderId": project.folders[0].id, "shownSnapshotIdByFolder": {} })
    );
    let leftovers: Vec<String> = fs::read_dir(&project_dir)
        .unwrap()
        .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
        .filter(|name| name.starts_with(".tmp-"))
        .collect();
    assert!(leftovers.is_empty(), "{leftovers:?}");
}

#[tokio::test]
async fn should_force_the_first_folder_to_primary() {
    // Arrange
    let workspace = Workspace::new();
    let helper = tempfile::tempdir().unwrap();

    // Act
    let project = workspace
        .create(vec![
            folder(workspace.repo.path(), "app", FolderRole::Helper),
            folder(helper.path(), "docs", FolderRole::Fork),
        ])
        .await;

    // Assert
    let roles: Vec<FolderRole> = project.folders.iter().map(|folder| folder.role).collect();
    assert_eq!(roles, vec![FolderRole::Primary, FolderRole::Fork]);
    assert_eq!(
        project.view.working_folder_id.as_ref(),
        Some(&project.folders[0].id)
    );
}

#[tokio::test]
async fn should_derive_kind_status_and_counts_when_getting_a_project() {
    // Arrange
    let workspace = Workspace::new();
    let plain = tempfile::tempdir().unwrap();
    let created = workspace
        .create(vec![
            folder(workspace.repo.path(), "app", FolderRole::Primary),
            folder(plain.path(), "notes", FolderRole::Helper),
        ])
        .await;

    // Act
    let project = workspace.projects().get(&created.id).await.unwrap();

    // Assert
    let kinds: Vec<FolderKind> = project.folders.iter().map(|folder| folder.kind).collect();
    assert_eq!(kinds, vec![FolderKind::Git, FolderKind::Plain]);
    assert!(
        project
            .folders
            .iter()
            .all(|folder| folder.status == FolderStatus::Ok && folder.snapshot_count == 0)
    );
    assert!(project.folders[0].git.as_ref().unwrap().is_repository_root);
}

#[tokio::test]
async fn should_update_name_description_and_profile() {
    // Arrange
    let workspace = Workspace::new();
    let created = workspace.create(Vec::new()).await;
    let profile = AnalysisProfile {
        parallel: false,
        ..AnalysisProfile::default()
    };

    // Act
    let updated = workspace
        .projects()
        .update(UpdateProjectParams {
            project_id: created.id.clone(),
            name: Some(ProjectName::try_from("Renamed").unwrap()),
            description: Some(Description::try_from("").unwrap()),
            analysis_profile: Some(profile.clone()),
        })
        .await
        .unwrap();

    // Assert
    assert_eq!(updated.name.as_str(), "Renamed");
    assert_eq!(updated.description, None);
    assert_eq!(updated.analysis_profile, profile);
    let listed = workspace.projects().list().unwrap();
    assert_eq!(listed[0].name, "Renamed");
}

#[tokio::test]
async fn should_list_a_project_with_a_newer_schema_as_a_problem() {
    // Arrange
    let workspace = Workspace::new();
    let project = workspace
        .create(vec![folder(
            workspace.repo.path(),
            "app",
            FolderRole::Primary,
        )])
        .await;
    let project_file = workspace.project_dir(&project).join("project.json");
    let mut stored: Value = serde_json::from_slice(&fs::read(&project_file).unwrap()).unwrap();
    stored["schemaVersion"] = json!(99);
    fs::write(&project_file, stored.to_string()).unwrap();

    // Act
    let listed = workspace.projects().list().unwrap();

    // Assert
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].name, "CodeCharta");
    assert!(
        listed[0].problem.as_deref().unwrap().contains("newer"),
        "{listed:?}"
    );
    assert!(workspace.projects().get(&project.id).await.is_err());
}

#[tokio::test]
async fn should_recycle_a_deleted_projects_directory() {
    // Arrange
    let workspace = Workspace::new();
    let project = workspace.create(Vec::new()).await;
    workspace
        .store
        .session()
        .set_active_project(Some(&project.id))
        .unwrap();

    // Act
    workspace
        .projects()
        .delete(&project.id, false)
        .await
        .unwrap();

    // Assert
    assert_eq!(
        workspace.recycler.recycled(),
        vec![workspace.project_dir(&project)]
    );
    assert!(!workspace.project_dir(&project).exists());
    assert!(workspace.projects().list().unwrap().is_empty());
    assert_eq!(workspace.store.session().active_project().unwrap(), None);
}

#[tokio::test]
async fn should_delete_permanently_when_asked() {
    // Arrange
    let workspace = Workspace::with_recycler(RecordingRecycler::failing());
    let project = workspace.create(Vec::new()).await;
    let recycled = workspace.projects().delete(&project.id, false).await;

    // Act
    workspace
        .projects()
        .delete(&project.id, true)
        .await
        .unwrap();

    // Assert
    assert!(recycled.is_err());
    assert!(!workspace.project_dir(&project).exists());
    assert!(workspace.recycler.recycled().is_empty());
}

fn reference(project: &Project, index: usize) -> FolderRef {
    FolderRef {
        project_id: project.id.clone(),
        folder_id: project.folders[index].id.clone(),
    }
}

fn add_snapshot_dir(workspace: &Workspace, target: &FolderRef) -> PathBuf {
    let snapshot = workspace
        .store_root
        .path()
        .join("projects")
        .join(target.project_id.as_str())
        .join("snapshots")
        .join(target.folder_id.as_str())
        .join("imported-0123456789abcdef");
    fs::create_dir_all(&snapshot).expect("the snapshot folder can be created");
    snapshot
}

#[tokio::test]
async fn should_reject_a_folder_already_in_the_project() {
    // Arrange
    let workspace = Workspace::new();
    let project = workspace
        .create(vec![folder(
            workspace.repo.path(),
            "app",
            FolderRole::Primary,
        )])
        .await;
    let same_folder_spelled_differently = workspace.repo.path().join(".");

    // Act
    let added = workspace
        .projects()
        .add_folder(
            &project.id,
            folder(
                &same_folder_spelled_differently,
                "again",
                FolderRole::Helper,
            ),
        )
        .await;

    // Assert
    assert!(
        matches!(added, Err(CoreError::DuplicateFolder { .. })),
        "{added:?}"
    );
}

#[tokio::test]
async fn should_reject_a_duplicate_label() {
    // Arrange
    let workspace = Workspace::new();
    let other = tempfile::tempdir().unwrap();
    let project = workspace
        .create(vec![folder(
            workspace.repo.path(),
            "app",
            FolderRole::Primary,
        )])
        .await;

    // Act
    let added = workspace
        .projects()
        .add_folder(&project.id, folder(other.path(), "APP", FolderRole::Helper))
        .await;

    // Assert
    assert!(
        matches!(added, Err(CoreError::DuplicateLabel { .. })),
        "{added:?}"
    );
}

#[tokio::test]
async fn should_demote_the_old_primary() {
    // Arrange
    let workspace = Workspace::new();
    let fork = workspace.repo.clone_full();
    let project = workspace
        .create(vec![folder(
            workspace.repo.path(),
            "app",
            FolderRole::Primary,
        )])
        .await;

    // Act
    let updated = workspace
        .projects()
        .add_folder(
            &project.id,
            folder(fork.path(), "fork", FolderRole::Primary),
        )
        .await
        .unwrap();

    // Assert
    let roles: Vec<FolderRole> = updated.folders.iter().map(|folder| folder.role).collect();
    assert_eq!(roles, vec![FolderRole::Helper, FolderRole::Primary]);
    assert_eq!(
        updated.folders[1].relationships[0].kind,
        RelationshipKind::SharesHistoryWith
    );
}

#[tokio::test]
async fn should_refuse_to_leave_a_project_without_a_primary_folder() {
    // Arrange
    let workspace = Workspace::new();
    let project = workspace
        .create(vec![folder(
            workspace.repo.path(),
            "app",
            FolderRole::Primary,
        )])
        .await;
    let changes = FolderChanges {
        label: Some(Label::try_from("renamed").unwrap()),
        role: Some(FolderRole::Helper),
        hosting: None,
    };

    // Act
    let updated = workspace
        .projects()
        .update_folder(&reference(&project, 0), changes)
        .await;

    // Assert
    assert!(
        matches!(updated, Err(CoreError::BadRequest(_))),
        "{updated:?}"
    );
}

#[tokio::test]
async fn should_list_the_folders_and_the_last_update_of_each_project() {
    // Arrange
    let workspace = Workspace::new();
    let vanishing = tempfile::tempdir().unwrap();
    let vanishing_path = vanishing.path().to_path_buf();
    let project = workspace
        .create(vec![
            folder(workspace.repo.path(), "app", FolderRole::Primary),
            folder(&vanishing_path, "gone", FolderRole::Helper),
        ])
        .await;
    drop(vanishing);

    // Act
    let summary = workspace.projects().list().unwrap().remove(0);

    // Assert
    assert_eq!(
        summary.updated_at.as_deref(),
        Some(project.updated_at.as_str())
    );
    let folders: Vec<_> = summary
        .folders
        .iter()
        .map(|listed| {
            (
                listed.label.as_str(),
                listed.role,
                listed.kind,
                listed.status,
            )
        })
        .collect();
    assert_eq!(
        folders,
        vec![
            (
                "app",
                FolderRole::Primary,
                FolderKind::Git,
                FolderStatus::Ok
            ),
            (
                "gone",
                FolderRole::Helper,
                FolderKind::Plain,
                FolderStatus::Missing
            ),
        ]
    );
    assert_eq!(summary.folders[0].id, project.folders[0].id);
}

#[tokio::test]
async fn should_flag_a_vanished_folder_as_missing() {
    // Arrange
    let workspace = Workspace::new();
    let vanishing = tempfile::tempdir().unwrap();
    let vanishing_path = vanishing.path().to_path_buf();
    let project = workspace
        .create(vec![
            folder(workspace.repo.path(), "app", FolderRole::Primary),
            folder(&vanishing_path, "gone", FolderRole::Helper),
        ])
        .await;
    drop(vanishing);

    // Act
    let reread = workspace.projects().get(&project.id).await.unwrap();

    // Assert
    assert_eq!(reread.folders[1].status, FolderStatus::Missing);
    assert_eq!(
        workspace.projects().list().unwrap()[0].missing_folder_count,
        1
    );
    let resolved = workspace
        .projects()
        .resolve_folder(&reference(&project, 1))
        .unwrap();
    assert_eq!(resolved.status, FolderStatus::Missing);
}

#[tokio::test]
async fn should_refuse_a_relink_to_a_different_history_unless_accepted() {
    // Arrange
    let workspace = Workspace::new();
    let unrelated = TempRepo::new();
    unrelated.commit_file("other.txt", "other", "Start elsewhere");
    let project = workspace
        .create(vec![folder(
            workspace.repo.path(),
            "app",
            FolderRole::Primary,
        )])
        .await;
    let relink = |accept_different_history| Relink {
        path: unrelated.path().to_path_buf(),
        accept_different_history,
    };

    // Act
    let refused = workspace
        .projects()
        .relink_folder(&reference(&project, 0), relink(false))
        .await;
    let accepted = workspace
        .projects()
        .relink_folder(&reference(&project, 0), relink(true))
        .await;

    // Assert
    assert!(
        matches!(refused, Err(CoreError::DifferentHistory { .. })),
        "{refused:?}"
    );
    let relinked = accepted.unwrap();
    assert_eq!(
        Path::new(&relinked.folders[0].path).canonicalize().unwrap(),
        unrelated.path().canonicalize().unwrap()
    );
}

#[tokio::test]
async fn should_keep_snapshots_when_a_folder_is_relinked() {
    // Arrange
    let workspace = Workspace::new();
    let moved = workspace.repo.clone_full();
    let project = workspace
        .create(vec![folder(
            workspace.repo.path(),
            "app",
            FolderRole::Primary,
        )])
        .await;
    let target = reference(&project, 0);
    add_snapshot_dir(&workspace, &target);
    let relink = Relink {
        path: moved.path().to_path_buf(),
        accept_different_history: false,
    };

    // Act
    let relinked = workspace
        .projects()
        .relink_folder(&target, relink)
        .await
        .unwrap();

    // Assert
    assert_eq!(relinked.folders[0].id, target.folder_id);
    assert_eq!(relinked.folders[0].snapshot_count, 1);
}

#[tokio::test]
async fn should_recycle_the_snapshots_of_a_removed_folder() {
    // Arrange
    let workspace = Workspace::new();
    let helper = tempfile::tempdir().unwrap();
    let project = workspace
        .create(vec![
            folder(workspace.repo.path(), "app", FolderRole::Primary),
            folder(helper.path(), "docs", FolderRole::Helper),
        ])
        .await;
    let removed = reference(&project, 0);
    let snapshot = add_snapshot_dir(&workspace, &removed);

    // Act
    let updated = workspace
        .projects()
        .remove_folder(&removed, false)
        .await
        .unwrap();

    // Assert
    assert_eq!(
        workspace.recycler.recycled(),
        vec![snapshot.parent().unwrap().to_path_buf()]
    );
    assert_eq!(updated.folders.len(), 1);
    assert_eq!(updated.folders[0].role, FolderRole::Primary);
    assert_eq!(
        updated.view.working_folder_id.as_ref(),
        Some(&updated.folders[0].id)
    );
}

#[tokio::test]
async fn should_refuse_a_view_naming_a_folder_outside_the_project() {
    // Arrange
    let workspace = Workspace::new();
    let project = workspace
        .create(vec![folder(
            workspace.repo.path(),
            "app",
            FolderRole::Primary,
        )])
        .await;
    let view = ProjectView {
        working_folder_id: Some(FolderId::try_from("f-0000000000000000").unwrap()),
        ..ProjectView::default()
    };

    // Act
    let refused = workspace.projects().set_view(&project.id, view).await;
    let cleared = workspace
        .projects()
        .set_view(&project.id, ProjectView::default())
        .await;

    // Assert
    assert!(
        matches!(refused, Err(CoreError::NotFound(_))),
        "{refused:?}"
    );
    assert!(cleared.is_ok());
}

#[tokio::test]
async fn should_resolve_commits_only_in_git_folders() {
    // Arrange
    let workspace = Workspace::new();
    let plain = tempfile::tempdir().unwrap();
    let project = workspace
        .create(vec![
            folder(workspace.repo.path(), "app", FolderRole::Primary),
            folder(plain.path(), "notes", FolderRole::Helper),
        ])
        .await;
    let head = workspace.repo.git(&["rev-parse", "HEAD"]);
    let hash = CommitHash::try_from(head.as_str()).unwrap();

    // Act
    let in_git = workspace
        .projects()
        .resolve_commit(&reference(&project, 0), &hash)
        .await;
    let in_plain = workspace
        .projects()
        .resolve_commit(&reference(&project, 1), &hash)
        .await;

    // Assert
    assert_eq!(in_git.unwrap().unwrap().commit.as_str(), head);
    assert!(
        matches!(in_plain, Err(CoreError::FolderUnavailable(_))),
        "{in_plain:?}"
    );
}
