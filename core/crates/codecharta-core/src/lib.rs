pub mod config;
pub mod error;
pub mod folders;
pub mod git;
pub mod ids;
pub mod process;
pub mod projects;
pub mod recycle;
pub mod snapshots;
pub mod store;
pub mod timestamps;
pub mod tools;

pub use config::paths::{CoreConfig, Paths};
pub use config::settings::{CoreSettings, SettingsStore};
pub use error::{CoreError, CoreResult};

use std::path::{Path, PathBuf};
use std::sync::{Arc, OnceLock};

use codecharta_core_api::ids::InvalidStoreId;
use codecharta_core_api::methods::core::Platform;
use codecharta_core_api::methods::git::RepositoryChanged;
use codecharta_core_api::methods::projects::FolderRef;
use codecharta_core_api::methods::shell::ShellPathTarget;
use codecharta_core_api::methods::snapshots::SnapshotRef;
use codecharta_core_api::methods::store::StoreStatus;

use config::settings::SETTINGS_FILE_NAME;
use git::changes::RepositoryChanges;
use git::command::UserEnvironment;
use git::memory::GitMemory;
use git::queue::OperationQueue;
use git::{GitFolder, GitService};
use process::ProcessRunner;
use process::env::hardened_env;
use projects::ProjectRepository;
use projects::tokens::PickTokens;
use recycle::SystemRecycler;
use snapshots::SnapshotRepository;
use store::Store;
use store::state::StoreState;
use tools::{SearchLocations, Tools, ToolsSetup};

pub const CORE_VERSION: &str = env!("CARGO_PKG_VERSION");

pub struct Core {
    paths: Paths,
    runner: Arc<ProcessRunner>,
    tools: Tools,
    store: OnceLock<StoreState>,
    pick_tokens: PickTokens,
    recycler: SystemRecycler,
    repository_changes: RepositoryChanges,
    git_memory: GitMemory,
    user_environment: UserEnvironment,
    operation_queue: OperationQueue,
}

impl Core {
    /// Reads the settings and the process environment; creates nothing on disk.
    pub fn open(config: CoreConfig) -> CoreResult<Self> {
        let settings = Arc::new(SettingsStore::load(
            config.data_dir.join(SETTINGS_FILE_NAME),
        )?);
        let locations = SearchLocations::from_environment(&|name| std::env::var_os(name));
        let runner = Arc::new(ProcessRunner::new(hardened_env(
            std::env::vars_os(),
            &locations.well_known_folders,
        )));
        let tools = Tools::new(ToolsSetup {
            settings: Arc::clone(&settings),
            runner: Arc::clone(&runner),
            locations,
        });
        Ok(Self {
            paths: Paths::new(config.data_dir, settings),
            runner,
            tools,
            store: OnceLock::new(),
            pick_tokens: PickTokens::default(),
            recycler: SystemRecycler,
            repository_changes: RepositoryChanges::default(),
            git_memory: GitMemory::default(),
            user_environment: UserEnvironment::read(&|name| std::env::var_os(name)),
            operation_queue: OperationQueue::default(),
        })
    }

    /// Opens the store for writing, once; a problem is kept and answered by every store request.
    pub fn open_store(&self) {
        self.store
            .get_or_init(|| StoreState::open(&self.paths.store_root()));
    }

    pub fn store(&self) -> CoreResult<&Store> {
        self.store_state()?.store()
    }

    /// The projects of the store this core opened, with the real git and recycle bin.
    pub fn projects(&self) -> CoreResult<ProjectRepository<'_>> {
        Ok(ProjectRepository::new(
            self.store()?,
            &self.tools,
            &self.recycler,
        ))
    }

    /// The snapshots of the store this core opened.
    pub fn snapshots(&self) -> CoreResult<SnapshotRepository<'_>> {
        Ok(SnapshotRepository::new(
            self.store()?,
            &self.tools,
            &self.recycler,
        ))
    }

    /// git runs in the data folder, which is created for it when it does not exist yet.
    pub fn git(&self) -> CoreResult<GitService<'_>> {
        std::fs::create_dir_all(self.data_dir()).map_err(|source| CoreError::Io {
            context: format!(
                "Could not create the data folder {}",
                self.data_dir().display()
            ),
            source,
        })?;
        Ok(GitService::new(&self.tools, self.data_dir())
            .with_changes(&self.repository_changes)
            .with_memory(&self.git_memory)
            .with_user_environment(self.user_environment.clone()))
    }

    /// The project folder a git request names, resolved through the store.
    pub fn git_folder(&self, repo: &FolderRef) -> CoreResult<GitFolder> {
        self.projects()?.git_folder(repo)
    }

    /// Every mutating git command of the core waits its turn here (plans 04–06).
    pub fn operation_queue(&self) -> &OperationQueue {
        &self.operation_queue
    }

    pub fn subscribe_repository_changes(
        &self,
    ) -> tokio::sync::broadcast::Receiver<RepositoryChanged> {
        self.repository_changes.subscribe()
    }

    /// A snapshot map is found through the store; every other target through the paths alone.
    pub fn resolve_path(&self, target: &ShellPathTarget) -> CoreResult<PathBuf> {
        let ShellPathTarget::SnapshotMap {
            project_id,
            folder_id,
            snapshot_id,
        } = target
        else {
            return self.paths.resolve(target);
        };
        let snapshot = SnapshotRef {
            project_id: store_id(project_id)?,
            folder_id: store_id(folder_id)?,
            snapshot_id: store_id(snapshot_id)?,
        };
        self.snapshots()?.map_location(&snapshot)
    }

    pub fn pick_tokens(&self) -> &PickTokens {
        &self.pick_tokens
    }

    pub fn store_status(&self) -> CoreResult<StoreStatus> {
        Ok(self.store_state()?.status())
    }

    fn store_state(&self) -> CoreResult<&StoreState> {
        self.store
            .get()
            .ok_or_else(|| CoreError::Internal("the store was not opened".to_string()))
    }

    pub fn data_dir(&self) -> &Path {
        self.paths.data_dir()
    }

    pub fn paths(&self) -> &Paths {
        &self.paths
    }

    pub fn tools(&self) -> &Tools {
        &self.tools
    }

    /// Kills every child process tree that is still running.
    pub async fn shutdown(&self) {
        self.runner.kill_all().await;
    }

    pub fn platform(&self) -> Platform {
        platform_of(std::env::consts::OS)
    }
}

fn platform_of(operating_system: &str) -> Platform {
    match operating_system {
        "windows" => Platform::Win32,
        "macos" => Platform::Darwin,
        _ => Platform::Linux,
    }
}

fn store_id<Id: TryFrom<String, Error = InvalidStoreId>>(value: &str) -> CoreResult<Id> {
    Id::try_from(value.to_string()).map_err(|error| CoreError::BadRequest(error.to_string()))
}

pub fn path_to_wire(path: &Path) -> CoreResult<String> {
    path.to_str()
        .map(str::to_string)
        .ok_or_else(|| CoreError::Io {
            context: format!("The path {} is not valid UTF-8", path.display()),
            source: std::io::Error::from(std::io::ErrorKind::InvalidData),
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_name_platforms_like_node() {
        // Arrange
        let operating_systems = ["windows", "macos", "linux"];

        // Act
        let platforms: Vec<Platform> = operating_systems.into_iter().map(platform_of).collect();

        // Assert
        assert_eq!(
            platforms,
            vec![Platform::Win32, Platform::Darwin, Platform::Linux]
        );
    }

    #[test]
    fn should_open_without_creating_the_data_dir() {
        // Arrange
        let folder = tempfile::tempdir().unwrap();
        let data_dir = folder.path().join("data dir");

        // Act
        let core = Core::open(CoreConfig {
            data_dir: data_dir.clone(),
        })
        .unwrap();

        // Assert
        assert_eq!(core.data_dir(), data_dir.as_path());
        assert!(!data_dir.exists());
    }

    #[test]
    fn should_open_the_store_in_the_store_root() {
        // Arrange
        let folder = tempfile::tempdir().unwrap();
        let core = Core::open(CoreConfig {
            data_dir: folder.path().to_path_buf(),
        })
        .unwrap();
        let unopened = core.store_status();

        // Act
        core.open_store();

        // Assert
        assert!(matches!(unopened, Err(CoreError::Internal(_))));
        assert_eq!(core.store_status().unwrap().problem, None);
        assert_eq!(
            core.store().unwrap().paths().root(),
            folder.path().join("store")
        );
        assert!(folder.path().join("store").join("store.json").is_file());
    }
}
