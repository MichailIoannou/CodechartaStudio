pub mod config;
pub mod error;
pub mod process;

pub use config::paths::{CoreConfig, Paths};
pub use config::settings::{CoreSettings, SettingsStore};
pub use error::{CoreError, CoreResult};

use std::path::Path;
use std::sync::Arc;

use codecharta_core_api::methods::core::Platform;

use config::settings::SETTINGS_FILE_NAME;

pub const CORE_VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(Debug)]
pub struct Core {
    paths: Paths,
}

impl Core {
    pub fn open(config: CoreConfig) -> CoreResult<Self> {
        let settings = Arc::new(SettingsStore::load(
            config.data_dir.join(SETTINGS_FILE_NAME),
        )?);
        Ok(Self {
            paths: Paths::new(config.data_dir, settings),
        })
    }

    pub fn data_dir(&self) -> &Path {
        self.paths.data_dir()
    }

    pub fn paths(&self) -> &Paths {
        &self.paths
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
}
