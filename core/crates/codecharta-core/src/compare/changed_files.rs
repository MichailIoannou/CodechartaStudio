use codecharta_core_api::error::ErrorCode;
use codecharta_core_api::methods::compare::{ChangedFile, ChangedFilesResult, ChangedFilesSource};
use codecharta_core_api::values::{CommitSha, Revision};
use tokio_util::sync::CancellationToken;

use crate::error::{CoreError, CoreResult};
use crate::git::parse::changed_files::NameStatus;
use crate::git::{GitFolder, GitService};

/// Lists the files between two commits in the first folder whose repository has both.
pub struct ChangedFilesSearch<'call, 'core> {
    pub git: &'call GitService<'core>,
    pub cancel: &'call CancellationToken,
}

impl ChangedFilesSearch<'_, '_> {
    /// `folders` in the order they are tried; none holding both commits is a result, not an error.
    pub async fn list(
        &self,
        folders: &[GitFolder],
        base: &CommitSha,
        head: &CommitSha,
    ) -> CoreResult<ChangedFilesResult> {
        for folder in folders {
            if self.has_both(folder, base, head).await? {
                let entries = self.git.changed_paths(folder, base, head, self.cancel);
                return Ok(git_result(entries.await?));
            }
        }
        Ok(ChangedFilesResult {
            source: ChangedFilesSource::Unavailable,
            files: Vec::new(),
        })
    }

    async fn has_both(
        &self,
        folder: &GitFolder,
        base: &CommitSha,
        head: &CommitSha,
    ) -> CoreResult<bool> {
        Ok(self.has_commit(folder, base).await? && self.has_commit(folder, head).await?)
    }

    async fn has_commit(&self, folder: &GitFolder, commit: &CommitSha) -> CoreResult<bool> {
        let revision = Revision::try_from(commit.as_str())
            .map_err(|error| CoreError::Internal(error.to_string()))?;
        match self
            .git
            .resolve_commit(folder, &revision, self.cancel)
            .await
        {
            Ok(_) => Ok(true),
            Err(error) if error.code() == ErrorCode::UnknownRevision => Ok(false),
            Err(error) => Err(error),
        }
    }
}

fn git_result(entries: Vec<NameStatus>) -> ChangedFilesResult {
    ChangedFilesResult {
        source: ChangedFilesSource::Git,
        files: entries
            .into_iter()
            .map(|entry| ChangedFile {
                change: entry.change,
                path: entry.path,
                previous_path: entry.previous_path,
            })
            .collect(),
    }
}
