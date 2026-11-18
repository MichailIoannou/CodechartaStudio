use std::collections::HashMap;
use std::sync::{Mutex, PoisonError};

use super::cache::LruCache;
use super::log::LogSession;

const SESSIONS_PER_REPOSITORY: usize = 8;

/// What the core remembers between git requests, per repository id.
#[derive(Debug, Default)]
pub struct GitMemory {
    repositories: Mutex<HashMap<String, RepositoryMemory>>,
}

#[derive(Debug)]
struct RepositoryMemory {
    sessions: LruCache<String, LogSession>,
}

impl Default for RepositoryMemory {
    fn default() -> Self {
        Self {
            sessions: LruCache::new(SESSIONS_PER_REPOSITORY),
        }
    }
}

impl GitMemory {
    pub fn remember_session(&self, repository_id: &str, session_id: String, session: LogSession) {
        self.with_repository(repository_id, |memory| {
            memory.sessions.insert(session_id, session);
        });
    }

    pub fn session(&self, repository_id: &str, session_id: &str) -> Option<LogSession> {
        self.with_repository(repository_id, |memory| {
            memory.sessions.get(&session_id.to_string()).cloned()
        })
    }

    fn with_repository<T>(
        &self,
        repository_id: &str,
        action: impl FnOnce(&mut RepositoryMemory) -> T,
    ) -> T {
        let mut repositories = self
            .repositories
            .lock()
            .unwrap_or_else(PoisonError::into_inner);
        action(repositories.entry(repository_id.to_string()).or_default())
    }
}
