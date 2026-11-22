use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

use codecharta_core_api::ids::{FolderId, ProjectId, SnapshotId};
use codecharta_core_api::methods::projects::{
    FolderRelationship, FolderStatus, Project, ProjectFolder, ProjectSummary, ProjectSummaryFolder,
};

use crate::folders::relationships::{GitFolder, derive_relationships};
use crate::projects::record::{FolderRecord, ProjectRecord};
use crate::store::paths::StorePaths;

/// The project as callers see it: the stored record plus what is true on disk right now.
pub fn to_project(paths: &StorePaths, record: ProjectRecord) -> Project {
    let mut relationships = relationships_of(&record.folders);
    let folders = record
        .folders
        .into_iter()
        .map(|folder| {
            let related = relationships.remove(&folder.id).unwrap_or_default();
            let snapshot_count = snapshot_count(paths, &record.id, &folder.id);
            to_project_folder(folder, related, snapshot_count)
        })
        .collect();
    Project {
        id: record.id,
        name: record.name,
        description: record.description,
        created_at: record.created_at,
        updated_at: record.updated_at,
        folders,
        analysis_profile: record.analysis_profile,
        view: record.view,
    }
}

pub fn to_summary(paths: &StorePaths, record: &ProjectRecord) -> ProjectSummary {
    let count = |predicate: &dyn Fn(&FolderRecord) -> bool| {
        count_u32(
            record
                .folders
                .iter()
                .filter(|folder| predicate(folder))
                .count(),
        )
    };
    ProjectSummary {
        id: record.id.clone(),
        name: record.name.to_string(),
        updated_at: Some(record.updated_at.clone()),
        folders: record.folders.iter().map(to_summary_folder).collect(),
        folder_count: count(&|_| true),
        missing_folder_count: count(&|folder| status_of(folder) == FolderStatus::Missing),
        snapshot_count: record
            .folders
            .iter()
            .map(|folder| snapshot_count(paths, &record.id, &folder.id))
            .sum(),
        problem: None,
    }
}

fn to_summary_folder(folder: &FolderRecord) -> ProjectSummaryFolder {
    ProjectSummaryFolder {
        id: folder.id.clone(),
        label: folder.label.clone(),
        role: folder.role,
        kind: folder.kind,
        status: status_of(folder),
    }
}

fn relationships_of(folders: &[FolderRecord]) -> BTreeMap<FolderId, Vec<FolderRelationship>> {
    let git_folders: Vec<GitFolder<'_>> = folders
        .iter()
        .filter_map(|folder| {
            folder.git.as_ref().map(|git| GitFolder {
                id: &folder.id,
                git,
            })
        })
        .collect();
    derive_relationships(&git_folders)
}

fn to_project_folder(
    folder: FolderRecord,
    relationships: Vec<FolderRelationship>,
    snapshot_count: u32,
) -> ProjectFolder {
    ProjectFolder {
        status: status_of(&folder),
        id: folder.id,
        path: folder.path,
        label: folder.label,
        role: folder.role,
        kind: folder.kind,
        git: folder.git,
        added_at: folder.added_at,
        relationships,
        snapshot_count,
        hosting: folder.hosting,
    }
}

pub fn status_of(folder: &FolderRecord) -> FolderStatus {
    if Path::new(&folder.path).is_dir() {
        FolderStatus::Ok
    } else {
        FolderStatus::Missing
    }
}

/// Only directories named like a snapshot id count; staging directories start with a dot.
fn snapshot_count(paths: &StorePaths, project: &ProjectId, folder: &FolderId) -> u32 {
    let Ok(folder_dir) = paths.folder_snapshots_dir(project, folder) else {
        return 0;
    };
    let Ok(entries) = fs::read_dir(folder_dir) else {
        return 0;
    };
    count_u32(
        entries
            .filter_map(Result::ok)
            .filter(|entry| entry.path().is_dir())
            .filter(|entry| {
                SnapshotId::try_from(entry.file_name().to_string_lossy().into_owned()).is_ok()
            })
            .count(),
    )
}

fn count_u32(count: usize) -> u32 {
    u32::try_from(count).unwrap_or(u32::MAX)
}
