use std::path::{Path, PathBuf};

use codecharta_core_api::methods::projects::{FolderRef, FolderRole};
use codecharta_core_api::methods::snapshots::OpenedFile;
use codecharta_core_api::values::FullCommit;

use crate::error::{CoreError, CoreResult};
use crate::projects::NewProject;
use crate::projects::folders::{FolderToAdd, suggested_label, suggested_project_name};
use crate::snapshots::content::ImportFile;
use crate::snapshots::import::{ImportRequest, containing_folder_of};
use crate::snapshots::repository::SnapshotRepository;

/// A cc.json file to open; without a target the file's own folder decides the project.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OpenFileRequest {
    pub file: PathBuf,
    pub target: Option<FolderRef>,
    pub bind_to_commit: Option<FullCommit>,
}

struct OpenTarget {
    folder: FolderRef,
    created_project: bool,
}

impl SnapshotRepository<'_> {
    /// Files the map into a project (overview D12): the given folder, else the project that already has
    /// the file's folder, else a new project named after that folder with it as the only folder.
    pub async fn open_file(&self, request: OpenFileRequest) -> CoreResult<OpenedFile> {
        self.store.ensure_writable()?;
        let file = ImportFile::open(&request.file)?.path;
        let target = match request.target {
            Some(folder) => OpenTarget {
                folder,
                created_project: false,
            },
            None => self.target_for(&file).await?,
        };
        let import = ImportRequest {
            target: target.folder.clone(),
            file,
            bind_to_commit: request.bind_to_commit,
        };
        let outcome = match self.import_file(import).await {
            Ok(outcome) => outcome,
            Err(error) => return Err(self.forget_created(&target, error).await),
        };
        let projects = self.projects();
        let project = projects.to_project(projects.read_record(&target.folder.project_id)?);
        Ok(OpenedFile {
            project,
            snapshot: outcome.snapshot,
            created_project: target.created_project,
            was_already_imported: outcome.was_already_imported,
        })
    }

    async fn target_for(&self, file: &Path) -> CoreResult<OpenTarget> {
        let folder_path = containing_folder_of(file)?;
        if let Some(existing) = self.existing_target(&folder_path)? {
            return Ok(OpenTarget {
                folder: FolderRef {
                    project_id: existing.project_id,
                    folder_id: existing.folder_id,
                },
                created_project: false,
            });
        }
        let new = NewProject {
            name: suggested_project_name(&folder_path),
            description: None,
            folders: vec![FolderToAdd {
                label: suggested_label(&folder_path),
                path: folder_path,
                role: FolderRole::Primary,
            }],
        };
        let project = self.projects().create(new).await?;
        let folder = project
            .folders
            .first()
            .ok_or_else(|| CoreError::Internal("the new project has no folder".to_string()))?;
        Ok(OpenTarget {
            folder: FolderRef {
                project_id: project.id.clone(),
                folder_id: folder.id.clone(),
            },
            created_project: true,
        })
    }

    /// A project created only for a file that could not be imported is removed again.
    async fn forget_created(&self, target: &OpenTarget, error: CoreError) -> CoreError {
        if target.created_project
            && let Err(cleanup) = self
                .projects()
                .delete(&target.folder.project_id, true)
                .await
        {
            tracing::warn!("could not remove the project created for the file: {cleanup}");
        }
        error
    }
}
