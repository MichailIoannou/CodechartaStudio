use std::collections::HashMap;
use std::future::Future;
use std::sync::{Mutex, PoisonError};

use codecharta_core_api::methods::git::{
    ChangedFilesMode, GitChangedFiles, GitCommitDetails, GitCommitDistance, GitLogPage,
};

use codecharta_core_api::values::CommitSha;

use super::cache::LruCache;
use super::log::LogSession;
use crate::error::CoreResult;

const SESSIONS_PER_REPOSITORY: usize = 8;
const PAGES_PER_REPOSITORY: usize = 50;
const DETAILS_PER_REPOSITORY: usize = 200;
const QUERIES_PER_REPOSITORY: usize = 2000;

/// A query whose answer never changes once both commits exist (outside a shallow clone).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum QueryKey {
    Count {
        from: String,
        to: String,
    },
    MergeBase {
        left: String,
        right: String,
    },
    IsAncestor {
        ancestor: String,
        descendant: String,
    },
    Distance {
        candidate: String,
        target: String,
    },
    ChangedFiles {
        from: String,
        to: String,
        mode: ChangedFilesMode,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum QueryAnswer {
    Count(u64),
    MergeBase(Option<String>),
    IsAncestor(bool),
    Distance(GitCommitDistance),
    ChangedFiles(GitChangedFiles),
}

/// An answer type that `GitMemory::remembered` keeps as one kind of `QueryAnswer`.
pub trait Remembered: Sized {
    fn into_answer(self) -> QueryAnswer;
    fn from_answer(answer: QueryAnswer) -> Option<Self>;
}

macro_rules! remembered_as {
    ($answer_type:ty, $variant:ident) => {
        impl Remembered for $answer_type {
            fn into_answer(self) -> QueryAnswer {
                QueryAnswer::$variant(self)
            }

            fn from_answer(answer: QueryAnswer) -> Option<Self> {
                match answer {
                    QueryAnswer::$variant(value) => Some(value),
                    _ => None,
                }
            }
        }
    };
}

remembered_as!(u64, Count);
remembered_as!(Option<String>, MergeBase);
remembered_as!(bool, IsAncestor);
remembered_as!(GitCommitDistance, Distance);
remembered_as!(GitChangedFiles, ChangedFiles);

/// What the core remembers between git requests, per repository id: log sessions and their pages, and
/// answers about commits, which do not change.
#[derive(Debug, Default)]
pub struct GitMemory {
    repositories: Mutex<HashMap<String, RepositoryMemory>>,
}

#[derive(Debug)]
struct RepositoryMemory {
    sessions: LruCache<String, LogSession>,
    pages: LruCache<(String, usize), GitLogPage>,
    details: LruCache<String, GitCommitDetails>,
    queries: LruCache<QueryKey, QueryAnswer>,
}

impl Default for RepositoryMemory {
    fn default() -> Self {
        Self {
            sessions: LruCache::new(SESSIONS_PER_REPOSITORY),
            pages: LruCache::new(PAGES_PER_REPOSITORY),
            details: LruCache::new(DETAILS_PER_REPOSITORY),
            queries: LruCache::new(QUERIES_PER_REPOSITORY),
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

    pub fn remember_page(&self, repository_id: &str, position: (String, usize), page: GitLogPage) {
        self.with_repository(repository_id, |memory| memory.pages.insert(position, page));
    }

    pub fn page(&self, repository_id: &str, position: &(String, usize)) -> Option<GitLogPage> {
        self.with_repository(repository_id, |memory| memory.pages.get(position).cloned())
    }

    pub fn remember_details(&self, repository_id: &str, sha: String, details: GitCommitDetails) {
        self.with_repository(repository_id, |memory| memory.details.insert(sha, details));
    }

    pub fn details(&self, repository_id: &str, sha: &str) -> Option<GitCommitDetails> {
        self.with_repository(repository_id, |memory| {
            memory.details.get(&sha.to_string()).cloned()
        })
    }

    pub fn remember_answer(&self, repository_id: &str, key: QueryKey, answer: QueryAnswer) {
        self.with_repository(repository_id, |memory| memory.queries.insert(key, answer));
    }

    pub fn answer(&self, repository_id: &str, key: &QueryKey) -> Option<QueryAnswer> {
        self.with_repository(repository_id, |memory| memory.queries.get(key).cloned())
    }

    /// The remembered distances of `candidates` to `target`, by candidate sha.
    pub fn distances(
        &self,
        repository_id: &str,
        target: &CommitSha,
        candidates: &[CommitSha],
    ) -> HashMap<String, GitCommitDistance> {
        self.with_repository(repository_id, |memory| {
            let mut known = HashMap::new();
            for candidate in candidates {
                let key = distance_key(candidate.as_str(), target);
                let remembered = memory.queries.get(&key).cloned();
                if let Some(distance) = remembered.and_then(GitCommitDistance::from_answer) {
                    known.insert(distance.sha.clone(), distance);
                }
            }
            known
        })
    }

    pub fn remember_distance(
        &self,
        repository_id: &str,
        target: &CommitSha,
        distance: GitCommitDistance,
    ) {
        let key = distance_key(&distance.sha, target);
        self.remember_answer(repository_id, key, distance.into_answer());
    }

    /// The remembered answer to `key`, else what `ask` answers, which is then remembered. A failure is
    /// not remembered.
    pub async fn remembered<T: Remembered + Clone>(
        &self,
        repository_id: &str,
        key: QueryKey,
        ask: impl Future<Output = CoreResult<T>>,
    ) -> CoreResult<T> {
        if let Some(known) = self.answer(repository_id, &key).and_then(T::from_answer) {
            return Ok(known);
        }
        let answer = ask.await?;
        self.remember_answer(repository_id, key, answer.clone().into_answer());
        Ok(answer)
    }

    /// Refs moved: logs start again from new tips. A fetch into a shallow clone may also add history
    /// behind its boundary, which changes parents, merge bases and counts, so those answers go too.
    pub fn fetched(&self, repository_id: &str, is_shallow: bool) {
        self.forget_logs(repository_id);
        if is_shallow {
            self.forget_answers(repository_id);
        }
    }

    /// For the end of every mutating operation.
    pub fn forget_logs(&self, repository_id: &str) {
        self.with_repository(repository_id, |memory| {
            let fresh = RepositoryMemory::default();
            memory.sessions = fresh.sessions;
            memory.pages = fresh.pages;
        });
    }

    pub fn forget_answers(&self, repository_id: &str) {
        self.with_repository(repository_id, |memory| {
            let fresh = RepositoryMemory::default();
            memory.details = fresh.details;
            memory.queries = fresh.queries;
        });
    }

    pub fn forget_repository(&self, repository_id: &str) {
        self.lock().remove(repository_id);
    }

    fn with_repository<T>(
        &self,
        repository_id: &str,
        action: impl FnOnce(&mut RepositoryMemory) -> T,
    ) -> T {
        action(self.lock().entry(repository_id.to_string()).or_default())
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, HashMap<String, RepositoryMemory>> {
        self.repositories
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
    }
}

fn distance_key(candidate: &str, target: &CommitSha) -> QueryKey {
    QueryKey::Distance {
        candidate: candidate.to_string(),
        target: target.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const REPOSITORY: &str = "/repo/.git";

    fn count_key() -> QueryKey {
        QueryKey::Count {
            from: "a".to_string(),
            to: "b".to_string(),
        }
    }

    fn session() -> LogSession {
        LogSession {
            tips: vec!["a".to_string()],
            filter: None,
        }
    }

    #[test]
    fn should_keep_answers_after_a_fetch_unless_the_clone_is_shallow() {
        // Arrange
        let memory = GitMemory::default();
        memory.remember_answer(REPOSITORY, count_key(), QueryAnswer::Count(2));
        memory.remember_session(REPOSITORY, "s".to_string(), session());

        // Act
        memory.fetched(REPOSITORY, false);
        let after_full_fetch = memory.answer(REPOSITORY, &count_key());
        memory.fetched(REPOSITORY, true);
        let after_shallow_fetch = memory.answer(REPOSITORY, &count_key());

        // Assert
        assert_eq!(after_full_fetch, Some(QueryAnswer::Count(2)));
        assert_eq!(after_shallow_fetch, None);
        assert_eq!(memory.session(REPOSITORY, "s"), None);
    }

    #[test]
    fn should_keep_repositories_apart() {
        // Arrange
        let memory = GitMemory::default();
        memory.remember_answer(REPOSITORY, count_key(), QueryAnswer::Count(2));

        // Act
        let other = memory.answer("/other/.git", &count_key());
        memory.forget_repository(REPOSITORY);

        // Assert
        assert_eq!(other, None);
        assert_eq!(memory.answer(REPOSITORY, &count_key()), None);
    }
}
