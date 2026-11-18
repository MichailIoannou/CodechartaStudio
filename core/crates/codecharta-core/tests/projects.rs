mod support;

use std::fs;
use std::path::{Path, PathBuf};

use codecharta_core::projects::{FolderToAdd, NewProject, ProjectRepository};
use codecharta_core::store::Store;
use codecharta_core_api::methods::projects::{
    AnalysisProfile, FolderKind, FolderRole, FolderStatus, Project, UpdateProjectParams,
};
use codecharta_core_api::values::{Description, Label, ProjectName};
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
