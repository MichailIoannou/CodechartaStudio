use std::path::Path;
use std::sync::Arc;

use codecharta_core_api::methods::store::{StoreProblemCode, StoreStatus};

use crate::error::{CoreError, CoreResult};
use crate::store::Store;

/// The store as the serving core opened it. A store that could not be opened does not stop the core:
/// every request that needs it gets the problem from start-up again.
#[derive(Debug)]
pub enum StoreState {
    Open(Arc<Store>),
    Unavailable(CoreError),
}

impl StoreState {
    pub fn open(root: &Path) -> Self {
        match Store::open(root) {
            Ok(store) => Self::Open(Arc::new(store)),
            Err(error) => {
                tracing::warn!("the store at {} is unavailable: {error}", root.display());
                Self::Unavailable(error)
            }
        }
    }

    pub fn store(&self) -> CoreResult<Arc<Store>> {
        match self {
            Self::Open(store) => Ok(Arc::clone(store)),
            Self::Unavailable(problem) => Err(same_error(problem)),
        }
    }

    pub fn status(&self) -> StoreStatus {
        let problem = match self {
            Self::Open(_) => None,
            Self::Unavailable(CoreError::StoreLocked { .. }) => Some(StoreProblemCode::StoreLocked),
            Self::Unavailable(CoreError::StoreNewerSchema { .. }) => {
                Some(StoreProblemCode::StoreNewerSchema)
            }
            Self::Unavailable(_) => Some(StoreProblemCode::Io),
        };
        StoreStatus { problem }
    }
}

fn same_error(problem: &CoreError) -> CoreError {
    match problem {
        CoreError::StoreLocked { store_root } => CoreError::StoreLocked {
            store_root: store_root.clone(),
        },
        CoreError::StoreNewerSchema { found, supported } => CoreError::StoreNewerSchema {
            found: *found,
            supported: *supported,
        },
        CoreError::Io { context, source } => CoreError::Io {
            context: context.clone(),
            source: std::io::Error::new(source.kind(), source.to_string()),
        },
        other => CoreError::Internal(other.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn newer_store(root: &Path) {
        std::fs::create_dir_all(root).unwrap();
        std::fs::write(root.join("store.json"), r#"{ "schemaVersion": 999 }"#).unwrap();
    }

    #[test]
    fn should_report_no_problem_for_a_healthy_store() {
        // Arrange
        let folder = tempfile::tempdir().unwrap();

        // Act
        let state = StoreState::open(folder.path());

        // Assert
        assert_eq!(state.status(), StoreStatus { problem: None });
        assert!(state.store().is_ok());
    }

    #[test]
    fn should_answer_the_startup_problem_on_every_use() {
        // Arrange
        let folder = tempfile::tempdir().unwrap();
        newer_store(folder.path());

        // Act
        let state = StoreState::open(folder.path());

        // Assert
        assert_eq!(
            state.status().problem,
            Some(StoreProblemCode::StoreNewerSchema)
        );
        for _ in 0..2 {
            let error = state.store().unwrap_err();
            assert!(
                matches!(error, CoreError::StoreNewerSchema { found: 999, .. }),
                "{error:?}"
            );
        }
    }

    #[test]
    fn should_report_other_causes_as_io() {
        // Arrange
        let folder = tempfile::tempdir().unwrap();
        std::fs::write(folder.path().join("store.json"), "not json").unwrap();

        // Act
        let state = StoreState::open(folder.path());

        // Assert
        assert_eq!(state.status().problem, Some(StoreProblemCode::Io));
        assert!(matches!(state.store(), Err(CoreError::Io { .. })));
    }
}
