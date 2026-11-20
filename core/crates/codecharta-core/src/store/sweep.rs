use std::fs;
use std::io;
use std::path::Path;

use codecharta_core_api::ids::{FolderId, ProjectId, SnapshotId};

use serde_json::Value;

use crate::error::{CoreError, CoreResult};
use crate::store::atomic::{TEMPORARY_FILE_PREFIX, read_json_if_exists};
use crate::store::paths::{STAGING_FOLDER_PREFIX, StorePaths};

const SNAPSHOT_ID_FIELD: &str = "id";
const SNAPSHOT_FOLDER_FIELD: &str = "folderId";

/// Removes what a crash during a write can leave behind. Only the store's own places are searched,
/// so nothing a user put into the store folder is touched.
pub fn sweep_leftovers(paths: &StorePaths) -> CoreResult<()> {
    remove_temporary_files(paths.root())?;
    for project in child_folder_names(&paths.projects_dir())?
        .into_iter()
        .filter_map(|name| ProjectId::try_from(name).ok())
    {
        sweep_project(paths, &project)?;
    }
    Ok(())
}

fn sweep_project(paths: &StorePaths, project: &ProjectId) -> CoreResult<()> {
    let project_dir = paths.project_dir(project)?;
    remove_temporary_files(&project_dir)?;
    for folder in child_folder_names(&paths.project_snapshots_dir(project)?)?
        .into_iter()
        .filter_map(|name| FolderId::try_from(name).ok())
    {
        sweep_folder_snapshots(paths, project, &folder)?;
    }
    Ok(())
}

fn sweep_folder_snapshots(
    paths: &StorePaths,
    project: &ProjectId,
    folder: &FolderId,
) -> CoreResult<()> {
    let folder_dir = paths.folder_snapshots_dir(project, folder)?;
    for name in child_folder_names(&folder_dir)? {
        if name.starts_with(STAGING_FOLDER_PREFIX) {
            let staging = folder_dir.join(&name);
            fs::remove_dir_all(&staging).map_err(|source| sweep_error(&staging, source))?;
        } else if let Ok(snapshot) = SnapshotId::try_from(name) {
            remove_temporary_files(&paths.snapshot_dir(project, folder, &snapshot)?)?;
            finish_interrupted_move(paths, project, folder, &snapshot)?;
        }
    }
    Ok(())
}

/// A move rewrites `snapshot.json` before it renames the directory; after a crash in between, the record
/// names where the directory belongs.
fn finish_interrupted_move(
    paths: &StorePaths,
    project: &ProjectId,
    folder: &FolderId,
    snapshot: &SnapshotId,
) -> CoreResult<()> {
    let Some((recorded_folder, recorded_id)) =
        recorded_place(&paths.snapshot_file(project, folder, snapshot)?)
    else {
        return Ok(());
    };
    if (&recorded_folder, &recorded_id) == (folder, snapshot) {
        return Ok(());
    }
    let target = paths.snapshot_dir(project, &recorded_folder, &recorded_id)?;
    if target.exists() {
        return Ok(());
    }
    let target_folder = paths.folder_snapshots_dir(project, &recorded_folder)?;
    fs::create_dir_all(&target_folder).map_err(|source| sweep_error(&target_folder, source))?;
    let current = paths.snapshot_dir(project, folder, snapshot)?;
    fs::rename(&current, &target).map_err(|source| sweep_error(&current, source))
}

fn recorded_place(snapshot_file: &Path) -> Option<(FolderId, SnapshotId)> {
    let record = read_json_if_exists::<Value>(snapshot_file).ok()??;
    let field = |name: &str| record.get(name)?.as_str().map(str::to_string);
    let folder = FolderId::try_from(field(SNAPSHOT_FOLDER_FIELD)?).ok()?;
    let snapshot = SnapshotId::try_from(field(SNAPSHOT_ID_FIELD)?).ok()?;
    Some((folder, snapshot))
}

fn remove_temporary_files(folder: &Path) -> CoreResult<()> {
    for entry in entries(folder)? {
        let is_file = entry.file_type().is_ok_and(|file_type| file_type.is_file());
        let is_temporary = entry
            .file_name()
            .to_str()
            .is_some_and(|name| name.starts_with(TEMPORARY_FILE_PREFIX));
        if is_file && is_temporary {
            let file = entry.path();
            fs::remove_file(&file).map_err(|source| sweep_error(&file, source))?;
        }
    }
    Ok(())
}

fn child_folder_names(folder: &Path) -> CoreResult<Vec<String>> {
    Ok(entries(folder)?
        .into_iter()
        .filter(|entry| entry.file_type().is_ok_and(|file_type| file_type.is_dir()))
        .filter_map(|entry| entry.file_name().into_string().ok())
        .collect())
}

fn entries(folder: &Path) -> CoreResult<Vec<fs::DirEntry>> {
    match fs::read_dir(folder) {
        Ok(entries) => entries
            .collect::<io::Result<Vec<_>>>()
            .map_err(|source| sweep_error(folder, source)),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(Vec::new()),
        Err(source) => Err(sweep_error(folder, source)),
    }
}

fn sweep_error(path: &Path, source: io::Error) -> CoreError {
    CoreError::Io {
        context: format!("Could not clean up {}", path.display()),
        source,
    }
}
