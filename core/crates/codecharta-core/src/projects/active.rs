use std::path::Path;

use codecharta_core_api::ids::ProjectId;
use codecharta_core_api::methods::projects::PickedFolder;

use crate::error::{CoreError, CoreResult};
use crate::folders::inspector::inspect_folder;
use crate::git::GitRunner;
use crate::projects::folders::suggested_label;
use crate::projects::repository::{ProjectRepository, absolute_path_text};
use crate::projects::tokens::PickTokens;

impl ProjectRepository<'_> {
    /// A remembered project that no longer exists reads as none.
    pub fn active_project(&self) -> CoreResult<Option<ProjectId>> {
        let active = self.store.session().active_project()?;
        Ok(active.filter(|id| self.exists(id)))
    }

    pub fn set_active_project(&self, project: Option<&ProjectId>) -> CoreResult<()> {
        if let Some(id) = project.filter(|id| !self.exists(id)) {
            return Err(CoreError::NotFound(format!("There is no project {id}.")));
        }
        self.store.session().set_active_project(project)
    }

    fn exists(&self, id: &ProjectId) -> bool {
        self.store
            .paths()
            .project_file(id)
            .is_ok_and(|file| file.is_file())
    }
}

/// Inspects a folder the shell picked natively and hands out the token that stands for its path.
pub async fn pick_folder(
    git: &dyn GitRunner,
    tokens: &PickTokens,
    path: &Path,
) -> CoreResult<PickedFolder> {
    if !path.is_absolute() {
        return Err(CoreError::BadRequest(format!(
            "{} is not an absolute path.",
            path.display()
        )));
    }
    if !path.is_dir() {
        return Err(CoreError::NotFound(format!(
            "There is no folder {}.",
            path.display()
        )));
    }
    let inspection = inspect_folder(git, path).await;
    Ok(PickedFolder {
        pick_token: tokens.issue_folder(path.to_path_buf())?,
        path: absolute_path_text(path)?,
        suggested_label: suggested_label(path),
        kind: inspection.kind,
        git: inspection.git,
    })
}
