use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use codecharta_core_api::methods::paths::PathsInfo;
use codecharta_core_api::methods::shell::ShellPathTarget;

use crate::config::settings::SettingsStore;
use crate::error::{CoreError, CoreResult};
use crate::path_to_wire;

pub const DATA_DIR_VARIABLE: &str = "CODECHARTA_DATA_DIR";
/// Electron names its userData folder after the app's package name; the core defaults to the same folder.
const APP_FOLDER_NAME: &str = "codecharta-visualization";
const STORE_FOLDER_NAME: &str = "store";
const LOGS_FOLDER_NAME: &str = "logs";

pub type EnvLookup<'lookup> = &'lookup dyn Fn(&str) -> Option<OsString>;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CoreConfig {
    pub data_dir: PathBuf,
}

impl CoreConfig {
    pub fn resolve(cli_data_dir: Option<PathBuf>, env: EnvLookup) -> CoreResult<Self> {
        let chosen = cli_data_dir.or_else(|| non_empty_variable(env, DATA_DIR_VARIABLE));
        let data_dir = match chosen {
            Some(data_dir) => make_absolute(data_dir)?,
            None => default_data_dir(env)?,
        };
        Ok(Self { data_dir })
    }
}

fn non_empty_variable(env: EnvLookup, name: &str) -> Option<PathBuf> {
    env(name)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
}

fn make_absolute(path: PathBuf) -> CoreResult<PathBuf> {
    std::path::absolute(&path).map_err(|source| CoreError::Io {
        context: format!("Could not resolve the data folder {}", path.display()),
        source,
    })
}

fn default_data_dir(env: EnvLookup) -> CoreResult<PathBuf> {
    user_config_dir(env)
        .map(|config_dir| config_dir.join(APP_FOLDER_NAME))
        .ok_or_else(|| {
            CoreError::NotFound(format!(
                "The user's configuration folder is unknown; pass --data-dir or set {DATA_DIR_VARIABLE}."
            ))
        })
}

fn absolute_variable(env: EnvLookup, name: &str) -> Option<PathBuf> {
    non_empty_variable(env, name).filter(|path| path.is_absolute())
}

#[cfg(windows)]
fn user_config_dir(env: EnvLookup) -> Option<PathBuf> {
    absolute_variable(env, "APPDATA")
}

#[cfg(target_os = "macos")]
fn user_config_dir(env: EnvLookup) -> Option<PathBuf> {
    absolute_variable(env, "HOME").map(|home| home.join("Library").join("Application Support"))
}

#[cfg(all(unix, not(target_os = "macos")))]
fn user_config_dir(env: EnvLookup) -> Option<PathBuf> {
    absolute_variable(env, "XDG_CONFIG_HOME")
        .or_else(|| absolute_variable(env, "HOME").map(|home| home.join(".config")))
}

#[derive(Debug)]
pub struct Paths {
    data_dir: PathBuf,
    settings: Arc<SettingsStore>,
}

impl Paths {
    pub fn new(data_dir: PathBuf, settings: Arc<SettingsStore>) -> Self {
        Self { data_dir, settings }
    }

    pub fn data_dir(&self) -> &Path {
        &self.data_dir
    }

    pub fn store_root(&self) -> PathBuf {
        self.settings
            .get()
            .store_root
            .map(PathBuf::from)
            .unwrap_or_else(|| self.default_store_root())
    }

    pub fn logs_dir(&self) -> PathBuf {
        self.data_dir.join(LOGS_FOLDER_NAME)
    }

    pub fn info(&self) -> CoreResult<PathsInfo> {
        let store_root = self.store_root();
        Ok(PathsInfo {
            data_dir: path_to_wire(&self.data_dir)?,
            is_default_store_root: store_root == self.default_store_root(),
            store_root: path_to_wire(&store_root)?,
            logs_dir: path_to_wire(&self.logs_dir())?,
        })
    }

    /// Existing content is not moved; copying the store over is the store's own job (plan 03).
    pub async fn set_store_root(&self, path: &Path) -> CoreResult<PathsInfo> {
        if !path.is_absolute() {
            return Err(CoreError::BadRequest(format!(
                "The store folder must be an absolute path: {}",
                path.display()
            )));
        }
        if !path.is_dir() {
            return Err(CoreError::NotFound(format!(
                "The folder {} does not exist.",
                path.display()
            )));
        }
        let store_root = path_to_wire(path)?;
        self.settings
            .update(|settings| settings.store_root = Some(store_root))
            .await?;
        self.info()
    }

    pub async fn reset_store_root(&self) -> CoreResult<PathsInfo> {
        self.settings
            .update(|settings| settings.store_root = None)
            .await?;
        self.info()
    }

    /// Snapshot maps live in the store, which arrives with plan 03; until then none can be found.
    pub fn resolve(&self, target: &ShellPathTarget) -> CoreResult<PathBuf> {
        match target {
            ShellPathTarget::DataFolder => Ok(self.data_dir.clone()),
            ShellPathTarget::LogsFolder => Ok(self.logs_dir()),
            ShellPathTarget::StoreRoot => Ok(self.store_root()),
            ShellPathTarget::SnapshotMap { snapshot_id, .. } => Err(CoreError::NotFound(format!(
                "There is no map of the snapshot {snapshot_id}."
            ))),
        }
    }

    fn default_store_root(&self) -> PathBuf {
        self.data_dir.join(STORE_FOLDER_NAME)
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use super::*;
    use crate::config::settings::SETTINGS_FILE_NAME;

    fn environment(variables: &[(&str, &Path)]) -> impl Fn(&str) -> Option<OsString> + use<> {
        let variables: HashMap<String, OsString> = variables
            .iter()
            .map(|(name, value)| (name.to_string(), value.as_os_str().to_owned()))
            .collect();
        move |name| variables.get(name).cloned()
    }

    fn paths_in(folder: &tempfile::TempDir) -> Paths {
        let settings = SettingsStore::load(folder.path().join(SETTINGS_FILE_NAME)).unwrap();
        Paths::new(folder.path().to_path_buf(), Arc::new(settings))
    }

    #[test]
    fn should_prefer_cli_data_dir_over_env() {
        // Arrange
        let folder = tempfile::tempdir().unwrap();
        let from_cli = folder.path().join("cli");
        let from_env = folder.path().join("env");
        let env = environment(&[(DATA_DIR_VARIABLE, &from_env)]);

        // Act
        let chosen = CoreConfig::resolve(Some(from_cli.clone()), &env).unwrap();
        let fallback = CoreConfig::resolve(None, &env).unwrap();

        // Assert
        assert_eq!(chosen.data_dir, from_cli);
        assert_eq!(fallback.data_dir, from_env);
    }

    #[test]
    fn should_make_a_relative_data_dir_absolute() {
        // Arrange
        let env = environment(&[]);

        // Act
        let config = CoreConfig::resolve(Some(PathBuf::from("relative")), &env).unwrap();

        // Assert
        assert!(config.data_dir.is_absolute());
        assert!(config.data_dir.ends_with("relative"));
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    #[test]
    fn should_default_to_the_app_folder_in_the_user_config_folder() {
        // Arrange
        let folder = tempfile::tempdir().unwrap();
        let env = environment(&[("HOME", folder.path())]);

        // Act
        let config = CoreConfig::resolve(None, &env).unwrap();

        // Assert
        assert_eq!(
            config.data_dir,
            folder.path().join(".config").join(APP_FOLDER_NAME)
        );
    }

    #[test]
    fn should_default_store_root_into_data_dir() {
        // Arrange
        let folder = tempfile::tempdir().unwrap();

        // Act
        let info = paths_in(&folder).info().unwrap();

        // Assert
        let data_dir = folder.path().to_str().unwrap();
        assert_eq!(info.data_dir, data_dir);
        assert!(info.is_default_store_root);
        assert_eq!(
            info.store_root,
            folder.path().join("store").to_str().unwrap()
        );
        assert_eq!(info.logs_dir, folder.path().join("logs").to_str().unwrap());
    }

    #[tokio::test]
    async fn should_set_and_reset_the_store_root() {
        // Arrange
        let folder = tempfile::tempdir().unwrap();
        let other = tempfile::tempdir().unwrap();
        let paths = paths_in(&folder);

        // Act
        let changed = paths.set_store_root(other.path()).await.unwrap();
        let reset = paths.reset_store_root().await.unwrap();

        // Assert
        assert_eq!(changed.store_root, other.path().to_str().unwrap());
        assert!(!changed.is_default_store_root);
        assert!(reset.is_default_store_root);
    }

    #[tokio::test]
    async fn should_refuse_a_relative_or_missing_store_root() {
        // Arrange
        let folder = tempfile::tempdir().unwrap();
        let paths = paths_in(&folder);

        // Act
        let relative = paths.set_store_root(Path::new("store")).await;
        let missing = paths.set_store_root(&folder.path().join("missing")).await;

        // Assert
        assert!(matches!(relative, Err(CoreError::BadRequest(_))));
        assert!(matches!(missing, Err(CoreError::NotFound(_))));
        assert!(paths.info().unwrap().is_default_store_root);
    }

    #[tokio::test]
    async fn should_resolve_the_store_root() {
        // Arrange
        let folder = tempfile::tempdir().unwrap();
        let chosen = tempfile::tempdir().unwrap();
        let paths = paths_in(&folder);
        let default_root = paths.resolve(&ShellPathTarget::StoreRoot).unwrap();
        paths.set_store_root(chosen.path()).await.unwrap();

        // Act
        let chosen_root = paths.resolve(&ShellPathTarget::StoreRoot).unwrap();

        // Assert
        assert_eq!(default_root, folder.path().join("store"));
        assert_eq!(chosen_root, chosen.path());
    }

    #[test]
    fn should_resolve_the_data_and_logs_folders() {
        // Arrange
        let folder = tempfile::tempdir().unwrap();
        let paths = paths_in(&folder);

        // Act
        let resolved = [ShellPathTarget::DataFolder, ShellPathTarget::LogsFolder]
            .map(|target| paths.resolve(&target).unwrap());

        // Assert
        assert_eq!(
            resolved,
            [folder.path().to_path_buf(), folder.path().join("logs")]
        );
    }

    #[test]
    fn should_answer_not_found_for_snapshot_maps_without_a_store() {
        // Arrange
        let folder = tempfile::tempdir().unwrap();
        let target = ShellPathTarget::SnapshotMap {
            project_id: "project".to_string(),
            folder_id: "folder".to_string(),
            snapshot_id: "snapshot".to_string(),
        };

        // Act
        let result = paths_in(&folder).resolve(&target);

        // Assert
        assert!(matches!(result, Err(CoreError::NotFound(_))), "{result:?}");
    }
}
