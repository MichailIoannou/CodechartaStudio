use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard, PoisonError};
use std::time::{Duration, Instant};

use codecharta_core_api::values::PickToken;

use crate::error::{CoreError, CoreResult};
use crate::ids::new_token;

pub const PICK_TOKEN_LIFETIME: Duration = Duration::from_secs(15 * 60);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PickKind {
    Folder,
    File,
}

impl PickKind {
    fn noun(self) -> &'static str {
        match self {
            PickKind::Folder => "folder",
            PickKind::File => "file",
        }
    }
}

#[derive(Debug, Clone)]
struct Pick {
    path: PathBuf,
    kind: PickKind,
    issued_at: Instant,
}

/// Paths the shell picked natively, handed to the renderer as opaque tokens. A token is good for one
/// successful use within its lifetime; a failed use gives it back.
#[derive(Debug)]
pub struct PickTokens {
    lifetime: Duration,
    picks: Mutex<HashMap<PickToken, Pick>>,
}

impl Default for PickTokens {
    fn default() -> Self {
        Self::with_lifetime(PICK_TOKEN_LIFETIME)
    }
}

impl PickTokens {
    pub fn with_lifetime(lifetime: Duration) -> Self {
        Self {
            lifetime,
            picks: Mutex::new(HashMap::new()),
        }
    }

    pub fn issue_folder(&self, path: PathBuf) -> CoreResult<PickToken> {
        self.issue(path, PickKind::Folder)
    }

    pub fn issue_file(&self, path: PathBuf) -> CoreResult<PickToken> {
        self.issue(path, PickKind::File)
    }

    fn issue(&self, path: PathBuf, kind: PickKind) -> CoreResult<PickToken> {
        let token = new_token()?;
        let mut picks = self.lock();
        picks.retain(|_, pick| !self.is_expired(pick));
        let pick = Pick {
            path,
            kind,
            issued_at: Instant::now(),
        };
        picks.insert(token.clone(), pick);
        Ok(token)
    }

    pub fn take_folder(&self, token: &PickToken) -> CoreResult<TakenPicks> {
        self.take(std::slice::from_ref(token), PickKind::Folder)
    }

    pub fn take_file(&self, token: &PickToken) -> CoreResult<TakenPicks> {
        self.take(std::slice::from_ref(token), PickKind::File)
    }

    /// All or nothing: one unusable token leaves every token where it was.
    pub fn take_folders(&self, tokens: &[PickToken]) -> CoreResult<TakenPicks> {
        self.take(tokens, PickKind::Folder)
    }

    fn take(&self, tokens: &[PickToken], kind: PickKind) -> CoreResult<TakenPicks> {
        let mut picks = self.lock();
        let mut taken = Vec::with_capacity(tokens.len());
        for token in tokens {
            let usable = picks
                .get(token)
                .is_some_and(|pick| pick.kind == kind && !self.is_expired(pick));
            match usable.then(|| picks.remove(token)).flatten() {
                Some(pick) => taken.push((token.clone(), pick)),
                None => {
                    picks.extend(taken);
                    return Err(CoreError::TokenExpired { what: kind.noun() });
                }
            }
        }
        Ok(TakenPicks { picks: taken })
    }

    /// For a use that failed: the tokens work again until they expire.
    pub fn give_back(&self, taken: TakenPicks) {
        self.lock().extend(taken.picks);
    }

    fn is_expired(&self, pick: &Pick) -> bool {
        pick.issued_at.elapsed() >= self.lifetime
    }

    fn lock(&self) -> MutexGuard<'_, HashMap<PickToken, Pick>> {
        self.picks.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

#[derive(Debug)]
pub struct TakenPicks {
    picks: Vec<(PickToken, Pick)>,
}

impl TakenPicks {
    /// In the order the tokens were given.
    pub fn paths(&self) -> Vec<&Path> {
        self.picks
            .iter()
            .map(|(_, pick)| pick.path.as_path())
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn folder() -> PathBuf {
        PathBuf::from("/src/repo")
    }

    #[test]
    fn should_consume_a_token_once() {
        // Arrange
        let tokens = PickTokens::default();
        let token = tokens.issue_folder(folder()).unwrap();

        // Act
        let first = tokens.take_folder(&token);
        let second = tokens.take_folder(&token);

        // Assert
        assert_eq!(first.unwrap().paths(), vec![folder().as_path()]);
        assert!(
            matches!(second, Err(CoreError::TokenExpired { what: "folder" })),
            "{second:?}"
        );
    }

    #[test]
    fn should_expire_a_token() {
        // Arrange
        let tokens = PickTokens::with_lifetime(Duration::ZERO);
        let token = tokens.issue_folder(folder()).unwrap();

        // Act
        let taken = tokens.take_folder(&token);

        // Assert
        assert!(
            matches!(taken, Err(CoreError::TokenExpired { .. })),
            "{taken:?}"
        );
    }

    #[test]
    fn should_work_again_after_a_failed_use_gave_it_back() {
        // Arrange
        let tokens = PickTokens::default();
        let token = tokens.issue_folder(folder()).unwrap();
        let taken = tokens.take_folder(&token).unwrap();

        // Act
        tokens.give_back(taken);

        // Assert
        assert!(tokens.take_folder(&token).is_ok());
    }

    #[test]
    fn should_take_nothing_when_one_of_several_tokens_is_unusable() {
        // Arrange
        let tokens = PickTokens::default();
        let good = tokens.issue_folder(folder()).unwrap();
        let file = tokens.issue_file(PathBuf::from("/maps/a.cc.json")).unwrap();

        // Act
        let taken = tokens.take_folders(&[good.clone(), file.clone()]);

        // Assert
        assert!(taken.is_err());
        assert!(tokens.take_folder(&good).is_ok());
        assert!(tokens.take_file(&file).is_ok());
    }
}
