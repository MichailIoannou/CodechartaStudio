pub mod atomic;
pub mod lock;
pub mod paths;
pub mod session;
pub mod state;
mod sweep;

use std::path::Path;
use std::time::SystemTime;

use serde::Serialize;
use serde_json::Value;

use crate::error::{CoreError, CoreResult};
use atomic::{ProjectLocks, read_json_if_exists, write_json_atomic};
use lock::StoreLock;
use paths::StorePaths;
use session::SessionRepository;

pub const STORE_SCHEMA_VERSION: u32 = 1;
const SCHEMA_VERSION_FIELD: &str = "schemaVersion";

/// Brings a store from `to_version - 1` to `to_version`; `store.json` is rewritten after each one.
pub struct Migration {
    pub to_version: u32,
    pub migrate: fn(&Path) -> CoreResult<()>,
}

pub const MIGRATIONS: &[Migration] = &[];

struct Schema<'migrations> {
    version: u32,
    migrations: &'migrations [Migration],
}

const CURRENT_SCHEMA: Schema<'static> = Schema {
    version: STORE_SCHEMA_VERSION,
    migrations: MIGRATIONS,
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NewStoreFile {
    schema_version: u32,
    created_at: String,
}

#[derive(Debug)]
pub struct Store {
    paths: StorePaths,
    lock: Option<StoreLock>,
    project_locks: ProjectLocks,
}

impl Store {
    /// Opens the store for writing: takes the store lock, creates, sweeps and migrates.
    pub fn open(root: &Path) -> CoreResult<Self> {
        Self::open_with_schema(root, &CURRENT_SCHEMA)
    }

    /// Opens the store for reading only: no lock, nothing is created or changed on disk.
    pub fn open_read_only(root: &Path) -> CoreResult<Self> {
        let paths = StorePaths::new(root.to_path_buf());
        let store_file = paths.store_file();
        if let Some(content) = read_json_if_exists::<Value>(&store_file)? {
            let version = schema_version_of(&store_file, &content)?;
            ensure_readable(version, STORE_SCHEMA_VERSION)?;
            ensure_migrated(root, version)?;
        }
        Ok(Self::new(paths, None))
    }

    fn open_with_schema(root: &Path, schema: &Schema) -> CoreResult<Self> {
        let lock = StoreLock::acquire(root)?;
        let paths = StorePaths::new(root.to_path_buf());
        let version = read_or_create_schema_version(&paths, schema.version)?;
        ensure_readable(version, schema.version)?;
        sweep::sweep_leftovers(&paths)?;
        run_migrations(&paths, version, schema.migrations)?;
        Ok(Self::new(paths, Some(lock)))
    }

    fn new(paths: StorePaths, lock: Option<StoreLock>) -> Self {
        Self {
            paths,
            lock,
            project_locks: ProjectLocks::default(),
        }
    }

    pub fn is_writable(&self) -> bool {
        self.lock.is_some()
    }

    pub fn ensure_writable(&self) -> CoreResult<()> {
        if self.is_writable() {
            return Ok(());
        }
        Err(CoreError::NotAllowed(
            "The store is open for reading only.".to_string(),
        ))
    }

    pub fn session(&self) -> SessionRepository<'_> {
        SessionRepository::new(self)
    }

    pub fn paths(&self) -> &StorePaths {
        &self.paths
    }

    pub fn project_locks(&self) -> &ProjectLocks {
        &self.project_locks
    }
}

fn read_or_create_schema_version(paths: &StorePaths, new_version: u32) -> CoreResult<u64> {
    let store_file = paths.store_file();
    match read_json_if_exists::<Value>(&store_file)? {
        Some(content) => schema_version_of(&store_file, &content),
        None => {
            let created_at = humantime::format_rfc3339_seconds(SystemTime::now()).to_string();
            write_json_atomic(
                &store_file,
                &NewStoreFile {
                    schema_version: new_version,
                    created_at,
                },
            )?;
            Ok(u64::from(new_version))
        }
    }
}

fn schema_version_of(store_file: &Path, content: &Value) -> CoreResult<u64> {
    content
        .get(SCHEMA_VERSION_FIELD)
        .and_then(Value::as_u64)
        .ok_or_else(|| CoreError::Io {
            context: format!("{} has no schema version", store_file.display()),
            source: std::io::Error::from(std::io::ErrorKind::InvalidData),
        })
}

fn ensure_readable(version: u64, supported: u32) -> CoreResult<()> {
    if version > u64::from(supported) {
        return Err(CoreError::StoreNewerSchema {
            found: version,
            supported,
        });
    }
    Ok(())
}

fn ensure_migrated(root: &Path, version: u64) -> CoreResult<()> {
    if version < u64::from(STORE_SCHEMA_VERSION) {
        return Err(CoreError::Conflict(format!(
            "The store at {} needs an upgrade; open it in the app once.",
            root.display()
        )));
    }
    Ok(())
}

fn run_migrations(paths: &StorePaths, version: u64, migrations: &[Migration]) -> CoreResult<()> {
    for migration in migrations
        .iter()
        .filter(|migration| u64::from(migration.to_version) > version)
    {
        (migration.migrate)(paths.root())?;
        write_schema_version(paths, migration.to_version)?;
    }
    Ok(())
}

fn write_schema_version(paths: &StorePaths, version: u32) -> CoreResult<()> {
    let store_file = paths.store_file();
    let mut content = read_json_if_exists::<Value>(&store_file)?.unwrap_or_default();
    if let Value::Object(fields) = &mut content {
        fields.insert(SCHEMA_VERSION_FIELD.to_string(), Value::from(version));
    }
    write_json_atomic(&store_file, &content)
}

#[cfg(test)]
mod tests {
    use std::fs;

    use serde_json::json;

    use super::*;
    use crate::store::atomic::read_json;

    const MIGRATION_LOG: &str = "migrations.log";

    fn log_migration(root: &Path, version: u32) -> CoreResult<()> {
        let log = root.join(MIGRATION_LOG);
        let mut lines = fs::read_to_string(&log).unwrap_or_default();
        lines.push_str(&format!("{version}\n"));
        fs::write(log, lines).unwrap();
        Ok(())
    }

    fn write_store_file(root: &Path, version: u32) {
        fs::create_dir_all(root).unwrap();
        let content = json!({ "schemaVersion": version, "createdAt": "2026-11-18T00:00:00Z" });
        fs::write(root.join("store.json"), content.to_string()).unwrap();
    }

    fn stored_version(root: &Path) -> u64 {
        let content: Value = read_json(&root.join("store.json")).unwrap();
        content[SCHEMA_VERSION_FIELD].as_u64().unwrap()
    }

    #[test]
    fn should_keep_the_migrations_in_ascending_order_up_to_the_current_schema() {
        // Arrange
        let versions: Vec<u32> = MIGRATIONS
            .iter()
            .map(|migration| migration.to_version)
            .collect();

        // Act
        let ascending = versions.windows(2).all(|pair| pair[0] < pair[1]);

        // Assert
        assert!(ascending, "{versions:?}");
        assert!(
            versions
                .last()
                .is_none_or(|last| *last == STORE_SCHEMA_VERSION)
        );
    }

    #[test]
    fn should_create_store_json_in_an_empty_root() {
        // Arrange
        let folder = tempfile::tempdir().unwrap();
        let root = folder.path().join("store");

        // Act
        Store::open(&root).unwrap();

        // Assert
        let content: Value = read_json(&root.join("store.json")).unwrap();
        assert_eq!(content[SCHEMA_VERSION_FIELD], json!(STORE_SCHEMA_VERSION));
        assert!(content["createdAt"].as_str().unwrap().ends_with('Z'));
    }

    #[test]
    fn should_run_pending_migrations_in_order() {
        // Arrange
        let folder = tempfile::tempdir().unwrap();
        write_store_file(folder.path(), 2);
        let migrations = [
            Migration {
                to_version: 2,
                migrate: |root| log_migration(root, 2),
            },
            Migration {
                to_version: 3,
                migrate: |root| log_migration(root, 3),
            },
            Migration {
                to_version: 4,
                migrate: |root| log_migration(root, 4),
            },
        ];
        let schema = Schema {
            version: 4,
            migrations: &migrations,
        };

        // Act
        Store::open_with_schema(folder.path(), &schema).unwrap();

        // Assert
        let log = fs::read_to_string(folder.path().join(MIGRATION_LOG)).unwrap();
        assert_eq!(log, "3\n4\n");
        assert_eq!(stored_version(folder.path()), 4);
    }

    #[test]
    fn should_fail_with_store_newer_schema_for_a_newer_store() {
        // Arrange
        let folder = tempfile::tempdir().unwrap();
        write_store_file(folder.path(), STORE_SCHEMA_VERSION + 1);

        // Act
        let result = Store::open(folder.path());

        // Assert
        assert!(
            matches!(result, Err(CoreError::StoreNewerSchema { .. })),
            "{result:?}"
        );
        assert_eq!(
            stored_version(folder.path()),
            u64::from(STORE_SCHEMA_VERSION + 1)
        );
    }

    #[test]
    fn should_refuse_a_store_json_without_a_schema_version() {
        // Arrange
        let folder = tempfile::tempdir().unwrap();
        fs::write(folder.path().join("store.json"), "{}").unwrap();

        // Act
        let result = Store::open(folder.path());

        // Assert
        assert!(matches!(result, Err(CoreError::Io { .. })), "{result:?}");
    }

    #[test]
    fn should_delete_leftover_temporary_files_and_staging_directories() {
        // Arrange
        let folder = tempfile::tempdir().unwrap();
        let root = folder.path();
        write_store_file(root, STORE_SCHEMA_VERSION);
        let project = root.join("projects").join("p-0123456789abcdef");
        let folder_snapshots = project.join("snapshots").join("f-0123456789abcdef");
        let snapshot = folder_snapshots.join("imported-0123456789abcdef");
        let staging = folder_snapshots.join(".incoming-0a1b2c3d");
        fs::create_dir_all(&snapshot).unwrap();
        fs::create_dir_all(&staging).unwrap();
        fs::write(staging.join("map.cc.json.gz"), "partial").unwrap();
        let leftovers = [
            root.join(".tmp-store"),
            project.join(".tmp-project"),
            snapshot.join(".tmp-snapshot"),
        ];
        let kept = [root.join("notes.txt"), snapshot.join("map.cc.json.gz")];
        for file in leftovers.iter().chain(&kept) {
            fs::write(file, "x").unwrap();
        }

        // Act
        Store::open(root).unwrap();

        // Assert
        assert!(!staging.exists());
        assert!(leftovers.iter().all(|file| !file.exists()));
        assert!(kept.iter().all(|file| file.exists()));
    }

    #[test]
    fn should_restore_or_drop_a_replaced_snapshot_and_drop_failed_runs_on_open() {
        // Arrange
        let folder = tempfile::tempdir().unwrap();
        let root = folder.path();
        write_store_file(root, STORE_SCHEMA_VERSION);
        let snapshots = root
            .join("projects")
            .join("p-0123456789abcdef")
            .join("snapshots")
            .join("f-0000000000000001");
        let write_record = |name: &str, id: &str| {
            fs::create_dir_all(snapshots.join(name)).unwrap();
            let record = json!({ "id": id, "folderId": "f-0000000000000001" });
            fs::write(
                snapshots.join(name).join("snapshot.json"),
                record.to_string(),
            )
            .unwrap();
        };
        write_record(".replaced-00000001", "s-lost");
        write_record(".replaced-00000002", "s-kept");
        write_record("s-kept", "s-kept");
        write_record(".failed-job-1", "s-failed");

        // Act
        Store::open(root).unwrap();

        // Assert
        let mut names: Vec<String> = fs::read_dir(&snapshots)
            .unwrap()
            .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();
        assert_eq!(names, ["s-kept", "s-lost"]);
    }

    #[test]
    fn should_leave_the_staging_folder_of_an_analysis_to_the_recovery() {
        // Arrange
        let folder = tempfile::tempdir().unwrap();
        let root = folder.path();
        write_store_file(root, STORE_SCHEMA_VERSION);
        let snapshots = root
            .join("projects")
            .join("p-0123456789abcdef")
            .join("snapshots")
            .join("f-0000000000000001");
        fs::create_dir_all(snapshots.join(".incoming-00000001")).unwrap();
        fs::create_dir_all(snapshots.join(".incoming-00000002")).unwrap();
        fs::write(snapshots.join(".incoming-00000002").join("job.json"), "{}").unwrap();

        // Act
        Store::open(root).unwrap();

        // Assert
        assert!(!snapshots.join(".incoming-00000001").exists());
        assert!(snapshots.join(".incoming-00000002").exists());
    }

    #[test]
    fn should_finish_a_snapshot_move_that_a_crash_interrupted() {
        // Arrange
        let folder = tempfile::tempdir().unwrap();
        let root = folder.path();
        write_store_file(root, STORE_SCHEMA_VERSION);
        let snapshots = root
            .join("projects")
            .join("p-0123456789abcdef")
            .join("snapshots");
        let old_place = snapshots
            .join("f-0000000000000001")
            .join("imported-0123456789abcdef");
        fs::create_dir_all(&old_place).unwrap();
        let record = json!({ "id": "imported-0123456789abcdef", "folderId": "f-0000000000000002" });
        fs::write(old_place.join("snapshot.json"), record.to_string()).unwrap();

        // Act
        Store::open(root).unwrap();

        // Assert
        let new_place = snapshots
            .join("f-0000000000000002")
            .join("imported-0123456789abcdef");
        assert!(!old_place.exists());
        assert!(new_place.join("snapshot.json").is_file());
    }
}
