use std::io::ErrorKind;

use codecharta_core_api::ids::ProjectId;
use serde::{Deserialize, Serialize};

use crate::error::{CoreError, CoreResult};
use crate::store::Store;
use crate::store::atomic::{read_json_if_exists, write_json_atomic};

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SessionFile {
    active_project_id: Option<ProjectId>,
}

/// What the app shows on start; kept in `session.json` beside the projects, not in the UI's own storage.
pub struct SessionRepository<'store> {
    store: &'store Store,
}

impl<'store> SessionRepository<'store> {
    pub fn new(store: &'store Store) -> Self {
        Self { store }
    }

    /// A damaged session file only costs the remembered project, so it reads as none.
    pub fn active_project(&self) -> CoreResult<Option<ProjectId>> {
        let session_file = self.store.paths().session_file();
        match read_json_if_exists::<SessionFile>(&session_file) {
            Ok(session) => Ok(session.and_then(|session| session.active_project_id)),
            Err(CoreError::Io { source, .. }) if source.kind() == ErrorKind::InvalidData => {
                tracing::warn!(
                    "ignored the unreadable {}: {source}",
                    session_file.display()
                );
                Ok(None)
            }
            Err(error) => Err(error),
        }
    }

    pub fn set_active_project(&self, project: Option<&ProjectId>) -> CoreResult<()> {
        self.store.ensure_writable()?;
        let session = SessionFile {
            active_project_id: project.cloned(),
        };
        write_json_atomic(&self.store.paths().session_file(), &session)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn project() -> ProjectId {
        ProjectId::try_from("p-0123456789abcdef").unwrap()
    }

    #[test]
    fn should_return_no_active_project_for_a_new_store() {
        // Arrange
        let folder = tempfile::tempdir().unwrap();
        let store = Store::open(folder.path()).unwrap();

        // Act
        let active = store.session().active_project().unwrap();

        // Assert
        assert_eq!(active, None);
    }

    #[test]
    fn should_persist_the_active_project_id() {
        // Arrange
        let folder = tempfile::tempdir().unwrap();
        {
            let store = Store::open(folder.path()).unwrap();
            store
                .session()
                .set_active_project(Some(&project()))
                .unwrap();
        }

        // Act
        let reopened = Store::open(folder.path()).unwrap();
        let active = reopened.session().active_project().unwrap();

        // Assert
        assert_eq!(active, Some(project()));
    }

    #[test]
    fn should_clear_the_active_project() {
        // Arrange
        let folder = tempfile::tempdir().unwrap();
        let store = Store::open(folder.path()).unwrap();
        store
            .session()
            .set_active_project(Some(&project()))
            .unwrap();

        // Act
        store.session().set_active_project(None).unwrap();

        // Assert
        assert_eq!(store.session().active_project().unwrap(), None);
    }

    #[test]
    fn should_treat_an_unreadable_session_as_no_active_project() {
        // Arrange
        let folder = tempfile::tempdir().unwrap();
        let store = Store::open(folder.path()).unwrap();
        let invalid_id = r#"{ "activeProjectId": "../elsewhere" }"#;
        std::fs::write(store.paths().session_file(), invalid_id).unwrap();

        // Act
        let active = store.session().active_project().unwrap();

        // Assert
        assert_eq!(active, None);
    }

    #[test]
    fn should_refuse_to_change_the_session_of_a_read_only_store() {
        // Arrange
        let folder = tempfile::tempdir().unwrap();
        let store = Store::open_read_only(folder.path()).unwrap();

        // Act
        let result = store.session().set_active_project(Some(&project()));

        // Assert
        assert!(
            matches!(result, Err(CoreError::NotAllowed(_))),
            "{result:?}"
        );
        assert!(!store.paths().session_file().exists());
    }
}
