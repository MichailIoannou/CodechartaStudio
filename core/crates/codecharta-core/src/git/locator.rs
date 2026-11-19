use std::path::{Path, PathBuf};

use codecharta_core_api::error::ErrorCode;
use codecharta_core_api::methods::git::GitRepositoryInfo;
use codecharta_core_api::methods::tools::ToolId;
use tokio_util::sync::CancellationToken;

use super::command::{GitCommand, REPOSITORY_LIMITS};
use super::error::{GitError, command_failed, message_for};
use super::parse::repository::{REV_PARSE_ARGS, RevParseFacts, parse_rev_parse, reports_bare};
use super::runner::GitCli;
use crate::error::{CoreError, CoreResult};
use crate::tools::definitions::definition;
use crate::tools::version::is_at_least;

const WINDOWS_VERBATIM_UNC_PREFIX: &str = r"\\?\UNC\";
const WINDOWS_VERBATIM_PREFIX: &str = r"\\?\";
const WINDOWS_UNC_PREFIX: &str = r"\\";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PathStyle {
    Windows,
    Unix,
}

impl PathStyle {
    pub fn current() -> Self {
        if cfg!(windows) {
            Self::Windows
        } else {
            Self::Unix
        }
    }
}

/// A located repository: what clients see, plus the folders the core reads from.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Repository {
    pub info: GitRepositoryInfo,
    pub git_dir: PathBuf,
}

/// The version of the git that will run; `GIT_TOO_OLD` below the minimum.
pub async fn checked_version(git: &GitCli<'_>) -> CoreResult<String> {
    let version = git.version().await?;
    let minimum = definition(ToolId::Git).minimum.unwrap_or_default();
    if !is_at_least(&version, minimum) {
        let message = format!("git {version} is older than the minimum {minimum}.");
        return Err(GitError::new(ErrorCode::GitTooOld, message).into());
    }
    Ok(version)
}

pub async fn locate(
    git: &GitCli<'_>,
    folder: &Path,
    cancel: &CancellationToken,
) -> CoreResult<Repository> {
    let git_version = checked_version(git).await?;
    let command = GitCommand::read(folder, &REV_PARSE_ARGS, REPOSITORY_LIMITS);
    let output = git.run_raw(&command, cancel).await?;
    if output.exit_code != 0 {
        return Err(refusal(&output, folder));
    }
    let facts = parse_rev_parse(&output.stdout)?;
    Ok(Repository {
        info: repository_info(&facts, git_version)?,
        git_dir: PathBuf::from(&facts.git_dir),
    })
}

fn refusal(output: &crate::process::RunOutput, folder: &Path) -> CoreError {
    if reports_bare(&output.stdout) {
        let code = ErrorCode::BareRepository;
        return GitError::new(code, message_for(code)).into();
    }
    match command_failed(output) {
        CoreError::Git(error) if error.code == ErrorCode::DubiousOwnership => error
            .with_repository_path(folder.to_string_lossy().into_owned())
            .into(),
        other => other,
    }
}

fn repository_info(facts: &RevParseFacts, git_version: String) -> CoreResult<GitRepositoryInfo> {
    let style = PathStyle::current();
    let common_dir = canonical(&facts.common_dir)?;
    Ok(GitRepositoryInfo {
        repository_id: normalise_repository_id(&common_dir, style),
        root_path: normalise_path(&facts.top_level, style),
        folder_prefix: facts.prefix.clone(),
        is_shallow: facts.is_shallow,
        is_linked_worktree: canonical(&facts.git_dir)? != common_dir,
        git_version,
    })
}

fn canonical(path: &str) -> CoreResult<String> {
    std::fs::canonicalize(path)
        .map(|canonical| canonical.to_string_lossy().into_owned())
        .map_err(|source| CoreError::Io {
            context: format!("Could not resolve the git folder {path}"),
            source,
        })
}

/// The same folder always gives the same id: no verbatim prefix and, on Windows, one case and one
/// separator, because the file system ignores case there.
pub fn normalise_repository_id(path: &str, style: PathStyle) -> String {
    match style {
        PathStyle::Windows => normalise_path(path, style).to_lowercase(),
        PathStyle::Unix => path.to_string(),
    }
}

/// git prints `C:/…` on Windows and canonicalising adds `\\?\`; both become a plain `C:\…`.
pub fn normalise_path(path: &str, style: PathStyle) -> String {
    if style == PathStyle::Unix {
        return path.to_string();
    }
    let backslashed = path.replace('/', "\\");
    if let Some(share) = backslashed.strip_prefix(WINDOWS_VERBATIM_UNC_PREFIX) {
        return format!("{WINDOWS_UNC_PREFIX}{share}");
    }
    backslashed
        .strip_prefix(WINDOWS_VERBATIM_PREFIX)
        .map_or_else(|| backslashed.clone(), str::to_string)
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use super::*;
    use crate::git::command::GitInvocation;
    use crate::git::runner::{GitProcess, ProcessFuture, VersionFuture};

    struct OldGit;

    impl GitProcess for OldGit {
        fn version(&self) -> VersionFuture<'_> {
            Box::pin(async { Ok("2.30.2".to_string()) })
        }

        fn execute<'call>(
            &'call self,
            _invocation: GitInvocation,
            _cancel: &'call CancellationToken,
        ) -> ProcessFuture<'call> {
            Box::pin(async {
                Ok(crate::process::RunOutput {
                    exit_code: 0,
                    stdout: String::new(),
                    stderr: String::new(),
                    duration: Duration::ZERO,
                })
            })
        }
    }

    #[tokio::test]
    async fn should_reject_git_below_2_31() {
        // Arrange
        let data_dir = std::env::temp_dir();
        let git = GitCli::new(&OldGit, &data_dir);

        // Act
        let error = locate(&git, &data_dir, &CancellationToken::new())
            .await
            .unwrap_err();

        // Assert
        assert_eq!(error.code(), ErrorCode::GitTooOld);
        assert_eq!(
            error.to_string(),
            "git 2.30.2 is older than the minimum 2.31.0."
        );
    }

    #[test]
    fn should_normalise_drive_letter_case_on_windows() {
        // Arrange
        let spellings = [r"C:\Repo\.git", "c:/repo/.git", r"\\?\C:\Repo\.git"];

        // Act
        let ids: Vec<String> = spellings
            .iter()
            .map(|path| normalise_repository_id(path, PathStyle::Windows))
            .collect();

        // Assert
        assert_eq!(ids, vec![r"c:\repo\.git"; spellings.len()]);
    }

    #[test]
    fn should_keep_case_and_separators_on_unix() {
        // Arrange
        let path = "/srv/Repo/.git";

        // Act
        let id = normalise_repository_id(path, PathStyle::Unix);

        // Assert
        assert_eq!(id, path);
    }

    #[test]
    fn should_turn_a_verbatim_unc_path_into_a_share_path() {
        // Arrange
        let path = r"\\?\UNC\server\share\repo";

        // Act
        let normalised = normalise_path(path, PathStyle::Windows);

        // Assert
        assert_eq!(normalised, r"\\server\share\repo");
    }
}
