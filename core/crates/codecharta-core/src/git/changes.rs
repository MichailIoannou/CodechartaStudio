use std::collections::HashMap;
use std::sync::{Mutex, PoisonError};

use codecharta_core_api::methods::git::{ChangedPart, RepositoryChanged};
use codecharta_core_api::methods::projects::FolderRef;
use tokio::sync::broadcast;

/// Notifications a slow subscriber may fall behind by before it misses some.
const CHANGES_BUFFER: usize = 64;

/// Remembers the last refs fingerprint seen per repository and announces a different one (G13).
pub struct RepositoryChanges {
    sender: broadcast::Sender<RepositoryChanged>,
    fingerprints: Mutex<HashMap<String, String>>,
}

impl Default for RepositoryChanges {
    fn default() -> Self {
        Self {
            sender: broadcast::channel(CHANGES_BUFFER).0,
            fingerprints: Mutex::default(),
        }
    }
}

impl RepositoryChanges {
    pub fn subscribe(&self) -> broadcast::Receiver<RepositoryChanged> {
        self.sender.subscribe()
    }

    /// The first fingerprint of a repository is only remembered; a later different one is announced.
    pub fn observe_fingerprint(&self, repo: &FolderRef, repository_id: &str, fingerprint: &str) {
        let previous = self
            .fingerprints
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .insert(repository_id.to_string(), fingerprint.to_string());
        if previous.is_some_and(|previous| previous != fingerprint) {
            let _no_subscriber_is_fine = self.sender.send(RepositoryChanged {
                repo: repo.clone(),
                repository_id: repository_id.to_string(),
                parts: vec![ChangedPart::Refs],
                fingerprint: Some(fingerprint.to_string()),
            });
        }
    }
}

#[cfg(test)]
mod tests {
    use codecharta_core_api::ids::{FolderId, ProjectId};

    use super::*;

    fn repo() -> FolderRef {
        FolderRef {
            project_id: ProjectId::try_from("p-1").unwrap(),
            folder_id: FolderId::try_from("f-1").unwrap(),
        }
    }

    #[test]
    fn should_announce_only_a_different_fingerprint_after_the_first() {
        // Arrange
        let changes = RepositoryChanges::default();
        let mut receiver = changes.subscribe();

        // Act
        changes.observe_fingerprint(&repo(), "/repo/.git", "one");
        changes.observe_fingerprint(&repo(), "/repo/.git", "one");
        changes.observe_fingerprint(&repo(), "/repo/.git", "two");

        // Assert
        let changed = receiver.try_recv().unwrap();
        assert_eq!(changed.fingerprint.as_deref(), Some("two"));
        assert_eq!(changed.parts, vec![ChangedPart::Refs]);
        assert_eq!(changed.repository_id, "/repo/.git");
        assert!(receiver.try_recv().is_err());
    }
}
