pub mod error;

pub use error::{CoreError, CoreResult};

use std::path::{Path, PathBuf};

use codecharta_core_api::methods::core::Platform;

pub const CORE_VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CoreConfig {
    pub data_dir: PathBuf,
}

#[derive(Debug)]
pub struct Core {
    config: CoreConfig,
}

impl Core {
    pub fn new(config: CoreConfig) -> Self {
        Self { config }
    }

    pub fn data_dir(&self) -> &Path {
        &self.config.data_dir
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
    fn should_keep_the_configured_data_dir() {
        // Arrange
        let data_dir = PathBuf::from("/some/data dir");

        // Act
        let core = Core::new(CoreConfig {
            data_dir: data_dir.clone(),
        });

        // Assert
        assert_eq!(core.data_dir(), data_dir.as_path());
        assert_eq!(path_to_wire(core.data_dir()).unwrap(), "/some/data dir");
    }
}
