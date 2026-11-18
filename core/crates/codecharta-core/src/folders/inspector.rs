use std::collections::BTreeSet;
use std::path::Path;

use codecharta_core_api::methods::projects::{
    FolderGitFacts, FolderKind, GitRemote, ResolvedCommit,
};
use codecharta_core_api::values::{CommitHash, FullCommit};

use crate::error::CoreResult;
use crate::folders::relationships::ORIGIN_REMOTE;
use crate::git::GitRunner;
use crate::timestamps;

const SHOW_TOP_LEVEL: [&str; 2] = ["rev-parse", "--show-toplevel"];
const IS_SHALLOW: [&str; 2] = ["rev-parse", "--is-shallow-repository"];
const REMOTE_URLS: [&str; 3] = ["config", "--get-regexp", r"^remote\..*\.url$"];
const ORIGIN_HEAD: [&str; 4] = [
    "symbolic-ref",
    "--quiet",
    "--short",
    "refs/remotes/origin/HEAD",
];
const CURRENT_BRANCH: [&str; 3] = ["rev-parse", "--abbrev-ref", "HEAD"];
const ROOT_COMMITS: [&str; 3] = ["rev-list", "--max-parents=0", "HEAD"];
const SHOW_COMMIT_FORMAT: &str = "--format=%H%x00%h%x00%s%x00%an%x00%aI";
const COMMIT_FIELD_COUNT: usize = 5;
const FIELD_SEPARATOR: char = '\0';
const GIT_TRUE: &str = "true";
const DETACHED_HEAD: &str = "HEAD";
const REMOTE_KEY_PREFIX: &str = "remote.";
const REMOTE_KEY_SUFFIX: &str = ".url";
const SCHEME_SEPARATOR: &str = "://";
const WEB_SCHEMES: [&str; 2] = ["http", "https"];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FolderInspection {
    pub kind: FolderKind,
    pub git: Option<FolderGitFacts>,
}

impl FolderInspection {
    fn plain() -> Self {
        Self {
            kind: FolderKind::Plain,
            git: None,
        }
    }
}

/// A folder is `git` exactly when git can name its top level; anything git cannot answer, including git
/// not being installed, makes it `plain`.
pub async fn inspect_folder(git: &dyn GitRunner, path: &Path) -> FolderInspection {
    match git_facts(git, path).await {
        Some(facts) => FolderInspection {
            kind: FolderKind::Git,
            git: Some(facts),
        },
        None => FolderInspection::plain(),
    }
}

async fn git_facts(git: &dyn GitRunner, path: &Path) -> Option<FolderGitFacts> {
    let top_level = successful_output(git, path, &SHOW_TOP_LEVEL).await?;
    let is_shallow = successful_output(git, path, &IS_SHALLOW).await.as_deref() == Some(GIT_TRUE);
    let root_commits = if is_shallow {
        Vec::new()
    } else {
        root_commits(git, path).await
    };
    Some(FolderGitFacts {
        is_repository_root: is_same_folder(Path::new(&top_level), path),
        top_level,
        remotes: remotes(git, path).await,
        default_branch: default_branch(git, path).await,
        root_commits,
        is_shallow,
        detected_at: timestamps::now(),
    })
}

async fn successful_output(git: &dyn GitRunner, path: &Path, args: &[&str]) -> Option<String> {
    any_output(git, path, args)
        .await
        .filter(|(succeeded, _)| *succeeded)
        .map(|(_, stdout)| stdout)
}

async fn any_output(git: &dyn GitRunner, path: &Path, args: &[&str]) -> Option<(bool, String)> {
    match git.run(path, args).await {
        Ok(output) => Some((output.succeeded(), output.stdout.trim().to_string())),
        Err(error) => {
            tracing::debug!("git {args:?} in {} failed: {error}", path.display());
            None
        }
    }
}

fn is_same_folder(top_level: &Path, folder: &Path) -> bool {
    match (top_level.canonicalize(), folder.canonicalize()) {
        (Ok(top_level), Ok(folder)) => same_path_text(&top_level, &folder),
        _ => false,
    }
}

#[cfg(windows)]
fn same_path_text(first: &Path, second: &Path) -> bool {
    first
        .to_string_lossy()
        .eq_ignore_ascii_case(&second.to_string_lossy())
}

#[cfg(not(windows))]
fn same_path_text(first: &Path, second: &Path) -> bool {
    first == second
}

async fn remotes(git: &dyn GitRunner, path: &Path) -> Vec<GitRemote> {
    let listing = successful_output(git, path, &REMOTE_URLS)
        .await
        .unwrap_or_default();
    let mut names = BTreeSet::new();
    listing
        .lines()
        .filter_map(parse_remote_line)
        .filter(|remote| names.insert(remote.name.clone()))
        .collect()
}

fn parse_remote_line(line: &str) -> Option<GitRemote> {
    let (key, url) = line.split_once(' ')?;
    let name = key
        .strip_prefix(REMOTE_KEY_PREFIX)?
        .strip_suffix(REMOTE_KEY_SUFFIX)?;
    Some(GitRemote {
        name: name.to_string(),
        url: strip_credentials(url.trim()),
    })
}

/// A web url loses its whole user part (a token is often given as the user name); other scheme urls
/// lose the password. An scp-like `git@host:owner/repo` names no secret and stays as it is.
pub fn strip_credentials(url: &str) -> String {
    let Some((scheme, rest)) = url.split_once(SCHEME_SEPARATOR) else {
        return url.to_string();
    };
    let (authority, path) = rest
        .split_once('/')
        .map_or((rest, None), |(authority, path)| (authority, Some(path)));
    let Some((user_part, host)) = authority.rsplit_once('@') else {
        return url.to_string();
    };
    let is_web = WEB_SCHEMES
        .iter()
        .any(|web| scheme.eq_ignore_ascii_case(web));
    let user = user_part.split(':').next().unwrap_or_default();
    let kept_authority = if is_web || user.is_empty() {
        host.to_string()
    } else {
        format!("{user}@{host}")
    };
    match path {
        Some(path) => format!("{scheme}{SCHEME_SEPARATOR}{kept_authority}/{path}"),
        None => format!("{scheme}{SCHEME_SEPARATOR}{kept_authority}"),
    }
}

/// `origin/HEAD` when the clone knows it, else the current branch as a guess. A repository without
/// commits answers `HEAD` with exit code 128, so the output decides, not the exit code.
async fn default_branch(git: &dyn GitRunner, path: &Path) -> Option<String> {
    let origin_prefix = format!("{ORIGIN_REMOTE}/");
    if let Some(origin_head) = successful_output(git, path, &ORIGIN_HEAD).await {
        let branch = origin_head
            .strip_prefix(&origin_prefix)
            .unwrap_or(&origin_head);
        return Some(branch.to_string());
    }
    let (_, current) = any_output(git, path, &CURRENT_BRANCH).await?;
    let is_branch = !current.is_empty() && current != DETACHED_HEAD && !current.contains('\n');
    is_branch.then_some(current)
}

/// Two roots are normal after merging unrelated histories; a repository without commits has none.
async fn root_commits(git: &dyn GitRunner, path: &Path) -> Vec<FullCommit> {
    let listing = successful_output(git, path, &ROOT_COMMITS)
        .await
        .unwrap_or_default();
    let roots: BTreeSet<FullCommit> = listing
        .lines()
        .filter_map(|line| FullCommit::try_from(line.trim()).ok())
        .collect();
    roots.into_iter().collect()
}

/// `None` when the folder has no such commit, also when a short hash is ambiguous.
pub async fn resolve_commit(
    git: &dyn GitRunner,
    folder: &Path,
    hash: &CommitHash,
) -> CoreResult<Option<ResolvedCommit>> {
    let revision = format!("{hash}^{{commit}}");
    let verified = git
        .run(folder, &["rev-parse", "--verify", "--quiet", &revision])
        .await?;
    let Some(commit) = verified
        .succeeded()
        .then(|| FullCommit::try_from(verified.stdout.trim()).ok())
        .flatten()
    else {
        return Ok(None);
    };
    let shown = git
        .run(folder, &["show", "-s", SHOW_COMMIT_FORMAT, commit.as_str()])
        .await?;
    if !shown.succeeded() {
        return Ok(None);
    }
    Ok(parse_commit(commit, &shown.stdout))
}

fn parse_commit(commit: FullCommit, shown: &str) -> Option<ResolvedCommit> {
    let fields: Vec<&str> = shown
        .trim_end_matches(['\n', '\r'])
        .split(FIELD_SEPARATOR)
        .collect();
    let [_, short_commit, subject, author_name, author_date] =
        <[&str; COMMIT_FIELD_COUNT]>::try_from(fields).ok()?;
    Some(ResolvedCommit {
        commit,
        short_commit: short_commit.to_string(),
        subject: subject.to_string(),
        author_name: author_name.to_string(),
        author_date: author_date.to_string(),
    })
}

#[cfg(test)]
mod tests {
    use crate::error::CoreError;
    use crate::git::GitFuture;
    use codecharta_core_api::methods::tools::ToolId;

    use super::*;

    struct MissingGit;

    impl GitRunner for MissingGit {
        fn run<'call>(
            &'call self,
            _cwd: &'call Path,
            _args: &'call [&'call str],
        ) -> GitFuture<'call> {
            Box::pin(async { Err(CoreError::ToolNotFound { tool: ToolId::Git }) })
        }
    }

    #[test]
    fn should_strip_credentials_from_a_remote_url() {
        // Arrange
        let urls = [
            "https://ada:s3cret-token@github.com/owner/repo.git",
            "https://ghp_token@github.com/owner/repo.git",
            "ssh://git:password@host.example/owner/repo",
            "ssh://git@host.example/owner/repo",
            "git@github.com:owner/repo.git",
            "https://github.com/owner/repo.git",
        ];

        // Act
        let stripped: Vec<String> = urls.into_iter().map(strip_credentials).collect();

        // Assert
        assert_eq!(
            stripped,
            vec![
                "https://github.com/owner/repo.git",
                "https://github.com/owner/repo.git",
                "ssh://git@host.example/owner/repo",
                "ssh://git@host.example/owner/repo",
                "git@github.com:owner/repo.git",
                "https://github.com/owner/repo.git",
            ]
        );
    }

    #[tokio::test]
    async fn should_classify_everything_as_plain_when_git_is_unavailable() {
        // Arrange
        let folder = tempfile::tempdir().unwrap();

        // Act
        let inspection = inspect_folder(&MissingGit, folder.path()).await;

        // Assert
        assert_eq!(inspection, FolderInspection::plain());
    }

    #[test]
    fn should_read_the_fields_of_a_shown_commit() {
        // Arrange
        let commit = FullCommit::try_from("0123456789abcdef0123456789abcdef01234567").unwrap();
        let shown = "0123456789abcdef0123456789abcdef01234567\x000123456\x00Add a file\x00Ada\x002026-01-02T03:04:05+00:00\n";

        // Act
        let resolved = parse_commit(commit.clone(), shown).unwrap();

        // Assert
        assert_eq!(resolved.commit, commit);
        assert_eq!(resolved.short_commit, "0123456");
        assert_eq!(resolved.subject, "Add a file");
        assert_eq!(resolved.author_name, "Ada");
        assert_eq!(resolved.author_date, "2026-01-02T03:04:05+00:00");
    }
}
