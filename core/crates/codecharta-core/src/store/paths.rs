use std::path::{Component, Path, PathBuf};

use codecharta_core_api::ids::{FolderId, ProjectId, SnapshotId};

use crate::error::{CoreError, CoreResult};

pub const STORE_FILE_NAME: &str = "store.json";
pub const SESSION_FILE_NAME: &str = "session.json";
pub const LOCK_FILE_NAME: &str = ".lock";
pub const PROJECTS_FOLDER_NAME: &str = "projects";
pub const PROJECT_FILE_NAME: &str = "project.json";
pub const SNAPSHOTS_FOLDER_NAME: &str = "snapshots";
pub const SNAPSHOT_FILE_NAME: &str = "snapshot.json";
pub const MAP_FILE_NAME: &str = "map.cc.json.gz";
pub const RUN_LOG_FILE_NAME: &str = "run.log";
pub const STAGING_FOLDER_PREFIX: &str = ".incoming-";

/// The only place that builds paths inside the store.
#[derive(Debug, Clone)]
pub struct StorePaths {
    root: PathBuf,
}

impl StorePaths {
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn store_file(&self) -> PathBuf {
        self.root.join(STORE_FILE_NAME)
    }

    pub fn session_file(&self) -> PathBuf {
        self.root.join(SESSION_FILE_NAME)
    }

    pub fn lock_file(&self) -> PathBuf {
        self.root.join(LOCK_FILE_NAME)
    }

    pub fn projects_dir(&self) -> PathBuf {
        self.root.join(PROJECTS_FOLDER_NAME)
    }

    pub fn project_dir(&self, project: &ProjectId) -> CoreResult<PathBuf> {
        self.inside_root(self.projects_dir().join(project.as_str()))
    }

    pub fn project_file(&self, project: &ProjectId) -> CoreResult<PathBuf> {
        self.inside_root(self.project_dir(project)?.join(PROJECT_FILE_NAME))
    }

    pub fn project_snapshots_dir(&self, project: &ProjectId) -> CoreResult<PathBuf> {
        self.inside_root(self.project_dir(project)?.join(SNAPSHOTS_FOLDER_NAME))
    }

    pub fn folder_snapshots_dir(
        &self,
        project: &ProjectId,
        folder: &FolderId,
    ) -> CoreResult<PathBuf> {
        let snapshots = self.project_snapshots_dir(project)?;
        self.inside_root(snapshots.join(folder.as_str()))
    }

    pub fn snapshot_dir(
        &self,
        project: &ProjectId,
        folder: &FolderId,
        snapshot: &SnapshotId,
    ) -> CoreResult<PathBuf> {
        let folder_dir = self.folder_snapshots_dir(project, folder)?;
        self.inside_root(folder_dir.join(snapshot.as_str()))
    }

    pub fn map_file(
        &self,
        project: &ProjectId,
        folder: &FolderId,
        snapshot: &SnapshotId,
    ) -> CoreResult<PathBuf> {
        let snapshot_dir = self.snapshot_dir(project, folder, snapshot)?;
        self.inside_root(snapshot_dir.join(MAP_FILE_NAME))
    }

    pub fn snapshot_file(
        &self,
        project: &ProjectId,
        folder: &FolderId,
        snapshot: &SnapshotId,
    ) -> CoreResult<PathBuf> {
        let snapshot_dir = self.snapshot_dir(project, folder, snapshot)?;
        self.inside_root(snapshot_dir.join(SNAPSHOT_FILE_NAME))
    }

    /// A directory a snapshot is built in before it is renamed to its id; `suffix` is generated.
    pub fn staging_dir(
        &self,
        project: &ProjectId,
        folder: &FolderId,
        suffix: &str,
    ) -> CoreResult<PathBuf> {
        let folder_dir = self.folder_snapshots_dir(project, folder)?;
        self.inside_root(folder_dir.join(format!("{STAGING_FOLDER_PREFIX}{suffix}")))
    }

    fn inside_root(&self, candidate: PathBuf) -> CoreResult<PathBuf> {
        let below_root = candidate
            .strip_prefix(&self.root)
            .ok()
            .filter(|relative| {
                relative
                    .components()
                    .all(|component| matches!(component, Component::Normal(_)))
            })
            .is_some_and(|relative| relative.components().next().is_some());
        if below_root {
            Ok(candidate)
        } else {
            Err(CoreError::Internal(format!(
                "the store path {} is not inside the store root",
                candidate.display()
            )))
        }
    }
}

/// Resolves a path a caller names relative to a user folder and refuses anything that leaves it,
/// including through a symbolic link.
pub fn confine_to_folder(folder: &Path, relative: &str) -> CoreResult<PathBuf> {
    let relative_path = names_only(relative)?;
    let canonical_folder = canonicalize(folder)?;
    let resolved = canonicalize(&canonical_folder.join(relative_path))?;
    inside(&canonical_folder, resolved, relative)
}

/// Like `confine_to_folder`, but the entry itself is not followed: a symbolic link stays the link, while
/// the folders leading to it must not leave `folder`. The entry need not exist.
pub fn confine_entry_to_folder(folder: &Path, relative: &str) -> CoreResult<PathBuf> {
    let relative_path = names_only(relative)?;
    let (Some(parent), Some(name)) = (relative_path.parent(), relative_path.file_name()) else {
        return Err(not_inside(relative));
    };
    let canonical_folder = canonicalize(folder)?;
    let canonical_parent = canonicalize(&canonical_folder.join(parent))?;
    inside(&canonical_folder, canonical_parent.join(name), relative)
}

fn names_only(relative: &str) -> CoreResult<&Path> {
    let relative_path = Path::new(relative);
    let only_names = relative_path
        .components()
        .all(|component| matches!(component, Component::Normal(_) | Component::CurDir));
    if relative.is_empty() || !only_names {
        return Err(not_inside(relative));
    }
    Ok(relative_path)
}

fn not_inside(relative: &str) -> CoreError {
    CoreError::BadRequest(format!(
        "{relative:?} is not a relative path inside the folder."
    ))
}

fn inside(canonical_folder: &Path, resolved: PathBuf, relative: &str) -> CoreResult<PathBuf> {
    if resolved.starts_with(canonical_folder) {
        Ok(resolved)
    } else {
        Err(CoreError::NotAllowed(format!(
            "{relative:?} leads outside the folder."
        )))
    }
}

fn canonicalize(path: &Path) -> CoreResult<PathBuf> {
    path.canonicalize().map_err(|source| {
        if source.kind() == std::io::ErrorKind::NotFound {
            CoreError::NotFound(format!("{} does not exist.", path.display()))
        } else {
            CoreError::Io {
                context: format!("Could not resolve {}", path.display()),
                source,
            }
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn project() -> ProjectId {
        ProjectId::try_from("p-0123456789abcdef").unwrap()
    }

    #[test]
    fn should_build_every_store_path_below_the_root() {
        // Arrange
        let root = tempfile::tempdir().unwrap();
        let paths = StorePaths::new(root.path().to_path_buf());
        let folder = FolderId::try_from("f-0123456789abcdef").unwrap();
        let snapshot = SnapshotId::try_from("imported-0123456789abcdef").unwrap();

        // Act
        let map_file = paths.map_file(&project(), &folder, &snapshot).unwrap();

        // Assert
        assert_eq!(
            map_file,
            root.path()
                .join("projects")
                .join("p-0123456789abcdef")
                .join("snapshots")
                .join("f-0123456789abcdef")
                .join("imported-0123456789abcdef")
                .join("map.cc.json.gz")
        );
    }

    #[test]
    fn should_reject_a_resolved_path_outside_the_store_root() {
        // Arrange
        let root = tempfile::tempdir().unwrap();
        let paths = StorePaths::new(root.path().join("store"));
        let candidates = [
            root.path().join("store").join("..").join("elsewhere"),
            root.path().join("elsewhere"),
            root.path().join("store"),
        ];

        // Act
        let results: Vec<bool> = candidates
            .into_iter()
            .map(|candidate| paths.inside_root(candidate).is_ok())
            .collect();

        // Assert
        assert_eq!(results, vec![false, false, false]);
    }

    #[test]
    fn should_refuse_a_relative_path_containing_parent_segments() {
        // Arrange
        let folder = tempfile::tempdir().unwrap();
        std::fs::write(folder.path().join("inside.txt"), "x").unwrap();

        // Act
        let parent = confine_to_folder(folder.path(), "sub/../../outside.txt");
        let absolute = confine_to_folder(folder.path(), "/etc/hosts");
        let inside = confine_to_folder(folder.path(), "./inside.txt");

        // Assert
        assert!(
            matches!(parent, Err(CoreError::BadRequest(_))),
            "{parent:?}"
        );
        assert!(
            matches!(absolute, Err(CoreError::BadRequest(_))),
            "{absolute:?}"
        );
        assert!(inside.unwrap().ends_with("inside.txt"));
    }

    #[test]
    fn should_answer_not_found_for_a_missing_file_in_the_folder() {
        // Arrange
        let folder = tempfile::tempdir().unwrap();

        // Act
        let result = confine_to_folder(folder.path(), "missing.txt");

        // Assert
        assert!(matches!(result, Err(CoreError::NotFound(_))), "{result:?}");
    }

    #[cfg(unix)]
    #[test]
    fn should_refuse_a_symlink_that_leaves_the_folder() {
        // Arrange
        let workspace = tempfile::tempdir().unwrap();
        let folder = workspace.path().join("folder");
        std::fs::create_dir(&folder).unwrap();
        std::fs::write(workspace.path().join("secret.txt"), "x").unwrap();
        std::os::unix::fs::symlink(workspace.path().join("secret.txt"), folder.join("link.txt"))
            .unwrap();

        // Act
        let result = confine_to_folder(&folder, "link.txt");

        // Assert
        assert!(
            matches!(result, Err(CoreError::NotAllowed(_))),
            "{result:?}"
        );
    }
    #[cfg(unix)]
    #[test]
    fn should_keep_a_symlink_entry_as_the_link_inside_the_folder() {
        // Arrange
        let workspace = tempfile::tempdir().unwrap();
        let folder = workspace.path().join("folder");
        std::fs::create_dir(&folder).unwrap();
        std::fs::write(workspace.path().join("secret.txt"), "x").unwrap();
        std::os::unix::fs::symlink(workspace.path().join("secret.txt"), folder.join("link.txt"))
            .unwrap();

        // Act
        let result = confine_entry_to_folder(&folder, "link.txt");

        // Assert
        let canonical_folder = folder.canonicalize().unwrap();
        assert_eq!(result.unwrap(), canonical_folder.join("link.txt"));
    }

    #[cfg(unix)]
    #[test]
    fn should_refuse_an_entry_below_a_symlinked_folder_outside() {
        // Arrange
        let workspace = tempfile::tempdir().unwrap();
        let (folder, outside) = (
            workspace.path().join("folder"),
            workspace.path().join("outside"),
        );
        std::fs::create_dir(&folder).unwrap();
        std::fs::create_dir(&outside).unwrap();
        std::fs::write(outside.join("victim.txt"), "x").unwrap();
        std::os::unix::fs::symlink(&outside, folder.join("linked")).unwrap();

        // Act
        let result = confine_entry_to_folder(&folder, "linked/victim.txt");

        // Assert
        assert!(
            matches!(result, Err(CoreError::NotAllowed(_))),
            "{result:?}"
        );
    }

    #[test]
    fn should_refuse_an_entry_naming_no_file_in_the_folder() {
        // Arrange
        let folder = tempfile::tempdir().unwrap();

        // Act
        let refused = [".", "a/../..", "/etc/hosts"]
            .map(|relative| confine_entry_to_folder(folder.path(), relative).is_err());
        let missing = confine_entry_to_folder(folder.path(), "missing.txt");

        // Assert
        assert_eq!(refused, [true; 3]);
        assert!(missing.unwrap().ends_with("missing.txt"));
    }
}
