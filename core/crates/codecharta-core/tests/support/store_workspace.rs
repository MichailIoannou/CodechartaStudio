use std::path::{Path, PathBuf};
use std::sync::Arc;

use codecharta_core::projects::{FolderToAdd, NewProject, ProjectRepository};
use codecharta_core::snapshots::SnapshotRepository;
use codecharta_core::store::Store;
use codecharta_core_api::methods::projects::{FolderRef, FolderRole, Project};
use codecharta_core_api::values::{Label, ProjectName};
use tempfile::TempDir;

use super::git_fixture::FixtureGit;
use super::{RecordingRecycler, TempRepo};

/// A store opened for writing, one git repository with a commit, and the git and recycle bin the
/// repositories of the store use.
pub struct StoreWorkspace {
    pub store_root: TempDir,
    pub store: Arc<Store>,
    pub repo: TempRepo,
    pub git: FixtureGit,
    pub recycler: RecordingRecycler,
}

impl StoreWorkspace {
    pub fn new() -> Self {
        let store_root = tempfile::tempdir().expect("a temporary store root");
        let store = Arc::new(Store::open(store_root.path()).expect("the store opens"));
        let repo = TempRepo::new();
        repo.commit_file("a.txt", "a", "Add a");
        let git = repo.runner();
        Self {
            store_root,
            store,
            repo,
            git,
            recycler: RecordingRecycler::new(),
        }
    }

    pub fn projects(&self) -> ProjectRepository<'_> {
        ProjectRepository::new(Arc::clone(&self.store), &self.git, &self.recycler)
    }

    pub fn snapshots(&self) -> SnapshotRepository<'_> {
        SnapshotRepository::new(Arc::clone(&self.store), &self.git, &self.recycler)
    }

    /// A project whose folders are `paths`, each labelled after its position; the first is primary.
    pub async fn project_of(&self, paths: &[&Path]) -> Project {
        let folders = paths
            .iter()
            .enumerate()
            .map(|(index, path)| FolderToAdd {
                path: path.to_path_buf(),
                label: Label::try_from(format!("folder-{index}")).expect("a valid label"),
                role: FolderRole::Helper,
            })
            .collect();
        let new = NewProject {
            name: ProjectName::try_from("Maps").expect("a valid name"),
            description: None,
            folders,
        };
        self.projects()
            .create(new)
            .await
            .expect("the project is created")
    }

    pub fn snapshots_dir(&self, folder: &FolderRef) -> PathBuf {
        self.store_root
            .path()
            .join("projects")
            .join(folder.project_id.as_str())
            .join("snapshots")
            .join(folder.folder_id.as_str())
    }
}

pub fn folder_ref(project: &Project, index: usize) -> FolderRef {
    FolderRef {
        project_id: project.id.clone(),
        folder_id: project.folders[index].id.clone(),
    }
}
