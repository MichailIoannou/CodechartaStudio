pub mod config;
pub mod error;
pub mod folders;
pub mod git;
pub mod ids;
pub mod process;
pub mod projects;
pub mod recycle;
pub mod store;
pub mod timestamps;
pub mod tools;

pub use config::paths::{CoreConfig, Paths};
pub use config::settings::{CoreSettings, SettingsStore};
pub use error::{CoreError, CoreResult};

use std::path::Path;
use std::sync::{Arc, OnceLock};

use codecharta_core_api::methods::core::Platform;
use codecharta_core_api::methods::store::StoreStatus;

use config::settings::SETTINGS_FILE_NAME;
use process::ProcessRunner;
use process::env::hardened_env;
use store::Store;
use store::state::StoreState;
use tools::{SearchLocations, Tools, ToolsSetup};

pub const CORE_VERSION: &str = env!("CARGO_PKG_VERSION");

pub struct Core {
    paths: Paths,
    runner: Arc<ProcessRunner>,
    tools: Tools,
    store: OnceLock<StoreState>,
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
