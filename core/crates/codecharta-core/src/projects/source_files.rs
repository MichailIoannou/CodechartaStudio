use std::fs;
use std::path::Path;

use codecharta_core_api::methods::projects::{FolderRef, FolderStatus, SourceFileLocation};

use crate::error::{CoreError, CoreResult};
use crate::path_to_wire;
use crate::projects::repository::ProjectRepository;
use crate::store::paths::confine_to_folder;

const MEBIBYTE: u64 = 1024 * 1024;
pub const MAX_SOURCE_FILE_BYTES: u64 = 16 * MEBIBYTE;

impl ProjectRepository<'_> {
    /// A file of the folder's working tree, not of a snapshot's commit; `None` when there is none.
    pub fn source_file_location(
        &self,
        target: &FolderRef,
        relative_path: &str,
    ) -> CoreResult<Option<SourceFileLocation>> {
        let folder = self.resolve_folder(target)?;
        if folder.status != FolderStatus::Ok {
            return Err(CoreError::FolderUnavailable(format!(
                "The folder {} is missing.",
                folder.path.display()
            )));
        }
        let file = match confine_to_folder(&folder.path, relative_path) {
            Ok(file) => file,
            Err(CoreError::NotFound(_)) => return Ok(None),
            Err(error) => return Err(error),
        };
        let size_bytes = regular_file_size(&file)?;
        Ok(Some(SourceFileLocation {
            path: path_to_wire(&file)?,
            folder_root: path_to_wire(&canonical(&folder.path)?)?,
            size_bytes,
        }))
    }
}

fn regular_file_size(file: &Path) -> CoreResult<u64> {
    let metadata = fs::metadata(file).map_err(|source| CoreError::Io {
        context: format!("Could not read {}", file.display()),
        source,
    })?;
    if !metadata.is_file() {
        return Err(CoreError::BadRequest(format!(
            "{} is not a file.",
            file.display()
        )));
    }
    if metadata.len() > MAX_SOURCE_FILE_BYTES {
        return Err(CoreError::TooLarge {
            limit_bytes: MAX_SOURCE_FILE_BYTES,
        });
    }
    Ok(metadata.len())
}

fn canonical(folder: &Path) -> CoreResult<std::path::PathBuf> {
    folder.canonicalize().map_err(|source| CoreError::Io {
        context: format!("Could not resolve {}", folder.display()),
        source,
    })
}
