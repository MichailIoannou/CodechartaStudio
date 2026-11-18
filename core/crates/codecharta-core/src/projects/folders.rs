use std::path::{Path, PathBuf};

use codecharta_core_api::ids::FolderId;
use codecharta_core_api::methods::projects::FolderRole;
use codecharta_core_api::values::{Label, MAX_LABEL_CHARS};

use crate::error::{CoreError, CoreResult};
use crate::projects::record::{FolderRecord, ProjectRecord};

const FALLBACK_LABEL: &str = "folder";
const LABEL_REPLACEMENT: char = '-';
const LABEL_FORBIDDEN_CHARACTERS: [char; 3] = ['/', '\\', ':'];

/// A folder the caller wants in a project, by path: the CLI passes argv paths, the RPC layer the path
/// behind a pick token.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FolderToAdd {
    pub path: PathBuf,
    pub label: Label,
    pub role: FolderRole,
}

/// The folder's own name, made into a valid label.
pub fn suggested_label(path: &Path) -> Label {
    let name = path
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default();
    let cleaned: String = name
        .chars()
        .map(|character| {
            if character.is_control() || LABEL_FORBIDDEN_CHARACTERS.contains(&character) {
                LABEL_REPLACEMENT
            } else {
                character
            }
        })
        .take(MAX_LABEL_CHARS)
        .collect();
    Label::try_from(cleaned).unwrap_or_else(|_| fallback_label())
}

fn fallback_label() -> Label {
    Label::try_from(FALLBACK_LABEL).unwrap_or_else(|_| unreachable!("the fallback label is valid"))
}

/// The first folder is always the primary one; a new primary demotes the old one to helper.
pub fn attach_folder(record: &mut ProjectRecord, mut folder: FolderRecord) -> CoreResult<()> {
    ensure_new_location(record, &folder.path, None)?;
    ensure_new_label(record, &folder.label, None)?;
    if record.folders.is_empty() {
        folder.role = FolderRole::Primary;
    } else if folder.role == FolderRole::Primary {
        demote_primary(record);
    }
    if record.view.working_folder_id.is_none() {
        record.view.working_folder_id = Some(folder.id.clone());
    }
    record.folders.push(folder);
    Ok(())
}

/// Compared canonicalised when the folder exists, so another spelling of the same folder is caught.
pub fn ensure_new_location(
    record: &ProjectRecord,
    path: &str,
    except: Option<&FolderId>,
) -> CoreResult<()> {
    let key = location_key(path);
    let taken = others(record, except).any(|folder| location_key(&folder.path) == key);
    if taken {
        return Err(CoreError::DuplicateFolder {
            path: path.to_string(),
        });
    }
    Ok(())
}

pub fn ensure_new_label(
    record: &ProjectRecord,
    label: &Label,
    except: Option<&FolderId>,
) -> CoreResult<()> {
    let key = label.as_str().to_lowercase();
    if others(record, except).any(|folder| folder.label.as_str().to_lowercase() == key) {
        return Err(CoreError::DuplicateLabel {
            label: label.to_string(),
        });
    }
    Ok(())
}

fn others<'record>(
    record: &'record ProjectRecord,
    except: Option<&'record FolderId>,
) -> impl Iterator<Item = &'record FolderRecord> {
    record
        .folders
        .iter()
        .filter(move |folder| Some(&folder.id) != except)
}

fn location_key(path: &str) -> String {
    let resolved = Path::new(path).canonicalize().map_or_else(
        |_| path.trim_end_matches(['/', '\\']).to_string(),
        |canonical| canonical.to_string_lossy().into_owned(),
    );
    if cfg!(windows) {
        resolved.to_lowercase()
    } else {
        resolved
    }
}

pub fn demote_primary(record: &mut ProjectRecord) {
    record
        .folders
        .iter_mut()
        .filter(|folder| folder.role == FolderRole::Primary)
        .for_each(|folder| folder.role = FolderRole::Helper);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_suggest_the_folder_name_as_label() {
        // Arrange
        let paths = [
            PathBuf::from("/src/codecharta"),
            PathBuf::from("/src/a:b"),
            PathBuf::from("/"),
        ];

        // Act
        let labels: Vec<String> = paths
            .iter()
            .map(|path| suggested_label(path).to_string())
            .collect();

        // Assert
        assert_eq!(labels, vec!["codecharta", "a-b", FALLBACK_LABEL]);
    }
}
