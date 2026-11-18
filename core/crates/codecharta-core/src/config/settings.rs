use std::collections::BTreeMap;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard, PoisonError};
use std::time::{SystemTime, UNIX_EPOCH};

use codecharta_core_api::methods::tools::ToolId;
use serde::{Deserialize, Serialize};

use crate::error::{CoreError, CoreResult};

pub const SETTINGS_FILE_NAME: &str = "core-settings.json";
pub const SETTINGS_SCHEMA_VERSION: u32 = 1;
const SETTINGS_FILE_STEM: &str = "core-settings";
const SCHEMA_VERSION_FIELD: &str = "schemaVersion";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct CoreSettings {
    pub schema_version: u32,
    pub store_root: Option<String>,
    pub tool_paths: BTreeMap<ToolId, String>,
}

impl Default for CoreSettings {
    fn default() -> Self {
        Self {
            schema_version: SETTINGS_SCHEMA_VERSION,
            store_root: None,
            tool_paths: BTreeMap::new(),
        }
    }
}

/// The core's own settings file. Reads never fail on bad content: a file the core cannot use is kept
/// as a copy and the defaults apply, so a damaged file can never stop the app from starting.
#[derive(Debug)]
pub struct SettingsStore {
    file: PathBuf,
    current: Mutex<CoreSettings>,
}

impl SettingsStore {
    pub fn load(file: PathBuf) -> CoreResult<Self> {
        let settings = read_settings(&file)?;
        Ok(Self {
            file,
            current: Mutex::new(settings),
        })
    }

    pub fn get(&self) -> CoreSettings {
        self.lock().clone()
    }

    pub async fn update(
        &self,
        change: impl FnOnce(&mut CoreSettings) + Send,
    ) -> CoreResult<CoreSettings> {
        let mut current = self.lock();
        let mut changed = current.clone();
        change(&mut changed);
        changed.schema_version = SETTINGS_SCHEMA_VERSION;
        write_atomically(&self.file, &changed)?;
        *current = changed.clone();
        Ok(changed)
    }

    fn lock(&self) -> MutexGuard<'_, CoreSettings> {
        self.current.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

fn read_settings(file: &Path) -> CoreResult<CoreSettings> {
    let bytes = match fs::read(file) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(CoreSettings::default());
        }
        Err(error) => return Err(io_error("Could not read the core settings", error)),
    };
    let Ok(content) = serde_json::from_slice::<serde_json::Value>(&bytes) else {
        return keep_corrupt_copy(file);
    };
    match schema_version_of(&content) {
        Some(version) if version > u64::from(SETTINGS_SCHEMA_VERSION) => {
            back_up_newer_schema(file, version)
        }
        _ => serde_json::from_value(content).or_else(|_| keep_corrupt_copy(file)),
    }
}

fn schema_version_of(content: &serde_json::Value) -> Option<u64> {
    content.get(SCHEMA_VERSION_FIELD)?.as_u64()
}

fn keep_corrupt_copy(file: &Path) -> CoreResult<CoreSettings> {
    let copy = sibling(file, &format!("corrupt-{}", epoch_millis()));
    tracing::warn!(
        "the core settings could not be read; kept them as {}",
        copy.display()
    );
    copy_file(file, &copy)?;
    Ok(CoreSettings::default())
}

fn back_up_newer_schema(file: &Path, version: u64) -> CoreResult<CoreSettings> {
    let backup = sibling(file, &format!("v{version}.backup"));
    if !backup.exists() {
        tracing::warn!(
            "the core settings come from a newer version; kept them as {}",
            backup.display()
        );
        copy_file(file, &backup)?;
    }
    Ok(CoreSettings::default())
}

fn sibling(file: &Path, infix: &str) -> PathBuf {
    file.with_file_name(format!("{SETTINGS_FILE_STEM}.{infix}.json"))
}

fn copy_file(from: &Path, to: &Path) -> CoreResult<()> {
    fs::copy(from, to)
        .map(|_| ())
        .map_err(|error| io_error("Could not keep a copy of the core settings", error))
}

fn epoch_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis())
        .unwrap_or_default()
}

/// Written to a temporary file in the same folder and renamed over the old one, so a crash mid-write
/// leaves either the old or the new settings, never half a file.
fn write_atomically(file: &Path, settings: &CoreSettings) -> CoreResult<()> {
    let folder = file.parent().unwrap_or_else(|| Path::new("."));
    fs::create_dir_all(folder)
        .map_err(|error| io_error("Could not create the data folder", error))?;
    let mut content = serde_json::to_vec_pretty(settings).map_err(|error| {
        CoreError::Internal(format!("could not serialise the settings: {error}"))
    })?;
    content.push(b'\n');
    let mut temporary = tempfile::NamedTempFile::new_in(folder)
        .map_err(|error| io_error("Could not write the core settings", error))?;
    temporary
        .write_all(&content)
        .and_then(|()| temporary.as_file().sync_all())
        .map_err(|error| io_error("Could not write the core settings", error))?;
    temporary
        .persist(file)
        .map(|_| ())
        .map_err(|error| io_error("Could not save the core settings", error.error))
}

fn io_error(context: &str, source: std::io::Error) -> CoreError {
    CoreError::Io {
        context: context.to_string(),
        source,
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use super::*;

    const CONCURRENT_UPDATES: usize = 10;

    fn settings_file(folder: &tempfile::TempDir) -> PathBuf {
        folder.path().join(SETTINGS_FILE_NAME)
    }

    fn file_names(folder: &tempfile::TempDir) -> Vec<String> {
        let mut names: Vec<String> = fs::read_dir(folder.path())
            .unwrap()
            .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();
        names
    }

    #[test]
    fn should_return_defaults_without_a_file() {
        // Arrange
        let folder = tempfile::tempdir().unwrap();

        // Act
        let store = SettingsStore::load(settings_file(&folder)).unwrap();

        // Assert
        assert_eq!(store.get(), CoreSettings::default());
        assert!(file_names(&folder).is_empty());
    }

    #[test]
    fn should_keep_a_corrupt_file_as_a_copy() {
        // Arrange
        let folder = tempfile::tempdir().unwrap();
        fs::write(settings_file(&folder), "{ not json").unwrap();

        // Act
        let store = SettingsStore::load(settings_file(&folder)).unwrap();

        // Assert
        assert_eq!(store.get(), CoreSettings::default());
        let names = file_names(&folder);
        assert_eq!(names.len(), 2, "{names:?}");
        assert!(names[0].starts_with("core-settings.corrupt-") && names[0].ends_with(".json"));
    }

    #[test]
    fn should_back_up_a_newer_schema_once() {
        // Arrange
        let folder = tempfile::tempdir().unwrap();
        fs::write(
            settings_file(&folder),
            r#"{ "schemaVersion": 7, "storeRoot": "/a" }"#,
        )
        .unwrap();
        SettingsStore::load(settings_file(&folder)).unwrap();
        fs::write(
            settings_file(&folder),
            r#"{ "schemaVersion": 7, "storeRoot": "/b" }"#,
        )
        .unwrap();

        // Act
        let store = SettingsStore::load(settings_file(&folder)).unwrap();

        // Assert
        assert_eq!(store.get(), CoreSettings::default());
        let backup = folder.path().join("core-settings.v7.backup.json");
        assert!(fs::read_to_string(backup).unwrap().contains("/a"));
        assert_eq!(file_names(&folder).len(), 2);
    }

    #[tokio::test]
    async fn should_drop_unknown_fields() {
        // Arrange
        let folder = tempfile::tempdir().unwrap();
        let content = r#"{ "schemaVersion": 1, "storeRoot": "/store", "fromTheFuture": true }"#;
        fs::write(settings_file(&folder), content).unwrap();
        let store = SettingsStore::load(settings_file(&folder)).unwrap();

        // Act
        store
            .update(|settings| {
                settings.tool_paths.insert(ToolId::Git, "/bin/git".into());
            })
            .await
            .unwrap();

        // Assert
        let written = fs::read_to_string(settings_file(&folder)).unwrap();
        assert!(!written.contains("fromTheFuture"));
        assert!(written.contains("\"storeRoot\": \"/store\""));
        assert!(written.contains("\"git\": \"/bin/git\""));
    }

    #[tokio::test]
    async fn should_write_atomically() {
        // Arrange
        let folder = tempfile::tempdir().unwrap();
        let file = folder
            .path()
            .join("not yet created")
            .join(SETTINGS_FILE_NAME);
        let store = SettingsStore::load(file.clone()).unwrap();

        // Act
        store
            .update(|settings| settings.store_root = Some("/store".into()))
            .await
            .unwrap();

        // Assert
        let reloaded = SettingsStore::load(file.clone()).unwrap();
        assert_eq!(reloaded.get().store_root.as_deref(), Some("/store"));
        let names: Vec<_> = fs::read_dir(file.parent().unwrap()).unwrap().collect();
        assert_eq!(names.len(), 1, "no temporary file is left behind");
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn should_apply_concurrent_updates_in_order() {
        // Arrange
        let folder = tempfile::tempdir().unwrap();
        let store = Arc::new(SettingsStore::load(settings_file(&folder)).unwrap());
        let mut updates = tokio::task::JoinSet::new();

        // Act
        for _ in 0..CONCURRENT_UPDATES {
            let store = Arc::clone(&store);
            updates.spawn(async move {
                store
                    .update(|settings| {
                        let previous = settings.store_root.take().unwrap_or_default();
                        settings.store_root = Some(format!("{previous}x"));
                    })
                    .await
                    .unwrap();
            });
        }
        updates.join_all().await;

        // Assert
        let expected = "x".repeat(CONCURRENT_UPDATES);
        assert_eq!(store.get().store_root.as_deref(), Some(expected.as_str()));
        let reloaded = SettingsStore::load(settings_file(&folder)).unwrap();
        assert_eq!(
            reloaded.get().store_root.as_deref(),
            Some(expected.as_str())
        );
    }
}
