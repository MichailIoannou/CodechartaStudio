use std::ffi::OsString;
use std::path::Path;
use std::time::Duration;

use codecharta_core_api::methods::projects::GitRemote;
use codecharta_core_api::methods::tools::ToolId;
use codecharta_core_api::values::CommitSha;
use serde::Deserialize;
use tokio_util::sync::CancellationToken;

use crate::git::runner::ProcessFuture;
use crate::snapshots::record::{HostingProvider, HostingRecord, PullRequestRecord};
use crate::tools::{ToolRunOptions, Tools};

/// The whole lookup, including a slow `gh` or `glab`, never holds a snapshot up for longer.
pub const HOSTING_BUDGET: Duration = Duration::from_secs(10);
const PREFERRED_REMOTE: &str = "origin";
const GITHUB_HOST: &str = "github.com";
const GITLAB_HOST_MARKER: &str = "gitlab";
const GIT_SUFFIX: &str = ".git";
const SCHEME_SEPARATOR: &str = "://";
const PATH_SEPARATOR: char = '/';
const USER_SEPARATOR: char = '@';
const PORT_SEPARATOR: char = ':';
const GITHUB_PATH_SEGMENTS: usize = 2;
const MIN_PATH_SEGMENTS: usize = 2;
const GH_SEARCH_ARGS: [&str; 5] = ["pr", "list", "--state", "all", "--search"];
const GH_OUTPUT_ARGS: [&str; 4] = [
    "--json",
    "number,title,state,baseRefName,headRefName",
    "--limit",
    "20",
];
const GLAB_API: &str = "api";

/// Runs `gh` or `glab` in the repository; a test hands in a scripted one.
pub trait HostingCli: Send + Sync {
    fn run<'call>(
        &'call self,
        tool: ToolId,
        cwd: &'call Path,
        args: Vec<OsString>,
        cancel: &'call CancellationToken,
    ) -> ProcessFuture<'call>;
}

impl HostingCli for Tools {
    fn run<'call>(
        &'call self,
        tool: ToolId,
        cwd: &'call Path,
        args: Vec<OsString>,
        cancel: &'call CancellationToken,
    ) -> ProcessFuture<'call> {
        Box::pin(async move {
            let options = ToolRunOptions {
                cwd: Some(cwd.to_path_buf()),
                ..ToolRunOptions::new(HOSTING_BUDGET)
            };
            Tools::run(self, tool, args, options, cancel).await
        })
    }
}

/// What the hosting lookup of one snapshot starts from.
pub struct HostingProbe<'probe> {
    pub repository_path: &'probe Path,
    pub remotes: &'probe [GitRemote],
    pub commit: &'probe CommitSha,
    pub budget: Duration,
}

/// Provider and repository come from the remote url alone; the pull or merge requests of the commit are
/// added when the user's own `gh` / `glab` answers within the budget, and are empty otherwise.
pub async fn probe_hosting(
    cli: &dyn HostingCli,
    probe: &HostingProbe<'_>,
    cancel: &CancellationToken,
) -> Option<HostingRecord> {
    let (provider, repository) = hosting_of(probe.remotes)?;
    let lookup = pull_requests(cli, provider, probe, cancel);
    let pull_requests = tokio::time::timeout(probe.budget, lookup)
        .await
        .unwrap_or_else(|_| {
            tracing::debug!(
                "the pull request lookup took longer than {:?}",
                probe.budget
            );
            Vec::new()
        });
    Some(HostingRecord {
        provider,
        repository,
        pull_requests,
    })
}

/// `origin`, else the first remote, decides the provider.
pub fn hosting_of(remotes: &[GitRemote]) -> Option<(HostingProvider, String)> {
    let remote = remotes
        .iter()
        .find(|remote| remote.name == PREFERRED_REMOTE)
        .or_else(|| remotes.first())?;
    let (host, path) = host_and_path(&remote.url)?;
    let segments: Vec<&str> = path.split(PATH_SEPARATOR).collect();
    let is_named = segments.len() >= MIN_PATH_SEGMENTS && !segments.contains(&"");
    if !is_named {
        return None;
    }
    if host == GITHUB_HOST {
        let is_owner_and_repository = segments.len() == GITHUB_PATH_SEGMENTS;
        return is_owner_and_repository.then_some((HostingProvider::Github, path));
    }
    host.contains(GITLAB_HOST_MARKER)
        .then_some((HostingProvider::Gitlab, path))
}

/// `scheme://[user@]host[:port]/path` or scp-like `[user@]host:path`; the host in lower case, the path
/// without slashes around it and without `.git`.
fn host_and_path(url: &str) -> Option<(String, String)> {
    let (authority, path) = match url.split_once(SCHEME_SEPARATOR) {
        Some((_, rest)) => {
            let (authority, path) = rest.split_once(PATH_SEPARATOR)?;
            (without_port(authority), path)
        }
        None => url.split_once(PORT_SEPARATOR)?,
    };
    let host = authority
        .rsplit_once(USER_SEPARATOR)
        .map_or(authority, |(_, host)| host);
    let path = path.trim_matches(PATH_SEPARATOR);
    let path = path.strip_suffix(GIT_SUFFIX).unwrap_or(path);
    if host.is_empty() || host.contains(PATH_SEPARATOR) {
        return None;
    }
    Some((host.to_ascii_lowercase(), path.to_string()))
}

fn without_port(authority: &str) -> &str {
    authority
        .rsplit_once(PORT_SEPARATOR)
        .filter(|(_, port)| port.bytes().all(|byte| byte.is_ascii_digit()))
        .map_or(authority, |(host, _)| host)
}

async fn pull_requests(
    cli: &dyn HostingCli,
    provider: HostingProvider,
    probe: &HostingProbe<'_>,
    cancel: &CancellationToken,
) -> Vec<PullRequestRecord> {
    let (tool, args) = lookup_command(provider, probe.commit);
    let args = args.into_iter().map(OsString::from).collect();
    match cli.run(tool, probe.repository_path, args, cancel).await {
        Ok(output) if output.exit_code == 0 => parse_pull_requests(provider, &output.stdout),
        Ok(output) => {
            tracing::debug!("{tool:?} exited with {}", output.exit_code);
            Vec::new()
        }
        Err(error) => {
            tracing::debug!("{tool:?} could not list pull requests: {error}");
            Vec::new()
        }
    }
}

fn lookup_command(provider: HostingProvider, commit: &CommitSha) -> (ToolId, Vec<String>) {
    match provider {
        HostingProvider::Github => {
            let args = [&GH_SEARCH_ARGS[..], &[commit.as_str()], &GH_OUTPUT_ARGS[..]].concat();
            (ToolId::Gh, args.into_iter().map(str::to_string).collect())
        }
        HostingProvider::Gitlab => {
            let endpoint = format!("projects/:id/repository/commits/{commit}/merge_requests");
            (ToolId::Glab, vec![GLAB_API.to_string(), endpoint])
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GhPullRequest {
    number: u64,
    title: String,
    state: String,
    base_ref_name: String,
    head_ref_name: String,
}

#[derive(Deserialize)]
struct GlabMergeRequest {
    iid: u64,
    title: String,
    state: String,
    target_branch: String,
    source_branch: String,
}

fn parse_pull_requests(provider: HostingProvider, stdout: &str) -> Vec<PullRequestRecord> {
    let parsed = match provider {
        HostingProvider::Github => serde_json::from_str::<Vec<GhPullRequest>>(stdout)
            .map(|found| found.into_iter().map(from_github).collect()),
        HostingProvider::Gitlab => serde_json::from_str::<Vec<GlabMergeRequest>>(stdout)
            .map(|found| found.into_iter().map(from_gitlab).collect()),
    };
    parsed.unwrap_or_else(|error| {
        tracing::debug!("the pull request list is not readable: {error}");
        Vec::new()
    })
}

fn from_github(found: GhPullRequest) -> PullRequestRecord {
    PullRequestRecord {
        number: found.number,
        title: found.title,
        state: found.state.to_lowercase(),
        base_ref: found.base_ref_name,
        head_ref: found.head_ref_name,
    }
}

fn from_gitlab(found: GlabMergeRequest) -> PullRequestRecord {
    PullRequestRecord {
        number: found.iid,
        title: found.title,
        state: found.state.to_lowercase(),
        base_ref: found.target_branch,
        head_ref: found.source_branch,
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use crate::CoreError;
    use crate::process::RunOutput;

    use super::*;

    const SHA: &str = "0123456789abcdef0123456789abcdef01234567";
    const SHORT_BUDGET: Duration = Duration::from_millis(50);
    const HANG: Duration = Duration::from_secs(60);
    const GH_OUTPUT: &str = r#"[{"number":123,"title":"Add x","state":"OPEN","baseRefName":"main","headRefName":"feature/x"},{"number":99,"title":"Old","state":"MERGED","baseRefName":"main","headRefName":"fix/y"}]"#;
    const GLAB_OUTPUT: &str = r#"[{"iid":7,"title":"Fix","state":"opened","target_branch":"main","source_branch":"fix","id":4711}]"#;

    enum Script {
        Answer {
            exit_code: i32,
            stdout: &'static str,
        },
        Missing,
        Hang,
    }

    struct ScriptedCli {
        script: Script,
        calls: Mutex<Vec<(ToolId, Vec<OsString>)>>,
    }

    impl ScriptedCli {
        fn new(script: Script) -> Self {
            Self {
                script,
                calls: Mutex::new(Vec::new()),
            }
        }
    }

    impl HostingCli for ScriptedCli {
        fn run<'call>(
            &'call self,
            tool: ToolId,
            _cwd: &'call Path,
            args: Vec<OsString>,
            _cancel: &'call CancellationToken,
        ) -> ProcessFuture<'call> {
            self.calls.lock().unwrap().push((tool, args));
            Box::pin(async move {
                match &self.script {
                    Script::Answer { exit_code, stdout } => Ok(RunOutput {
                        exit_code: *exit_code,
                        stdout: (*stdout).to_string(),
                        stderr: String::new(),
                        duration: Duration::ZERO,
                    }),
                    Script::Missing => Err(CoreError::ToolNotFound { tool }),
                    Script::Hang => {
                        tokio::time::sleep(HANG).await;
                        Err(CoreError::Cancelled)
                    }
                }
            })
        }
    }

    fn remote(name: &str, url: &str) -> GitRemote {
        GitRemote {
            name: name.to_string(),
            url: url.to_string(),
        }
    }

    async fn probed(cli: &ScriptedCli, url: &str) -> Option<HostingRecord> {
        let remotes = [remote("origin", url)];
        let commit = CommitSha::try_from(SHA).unwrap();
        let probe = HostingProbe {
            repository_path: Path::new("/repo"),
            remotes: &remotes,
            commit: &commit,
            budget: SHORT_BUDGET,
        };
        probe_hosting(cli, &probe, &CancellationToken::new()).await
    }

    #[test]
    fn should_derive_github_owner_repo_from_https_and_ssh_urls() {
        // Arrange
        let urls = [
            "https://github.com/owner/repo.git",
            "https://GitHub.com/owner/repo/",
            "git@github.com:owner/repo.git",
            "ssh://git@github.com:22/owner/repo.git",
        ];

        // Act
        let derived: Vec<Option<(HostingProvider, String)>> = urls
            .iter()
            .map(|url| hosting_of(&[remote("origin", url)]))
            .collect();

        // Assert
        let expected = Some((HostingProvider::Github, "owner/repo".to_string()));
        assert!(
            derived.iter().all(|found| found == &expected),
            "{derived:?}"
        );
    }

    #[test]
    fn should_derive_gitlab() {
        // Arrange
        let remotes = [
            remote("upstream", "https://example.org/a/b.git"),
            remote("origin", "git@gitlab.example.com:group/sub/repo.git"),
        ];

        // Act
        let derived = hosting_of(&remotes);

        // Assert
        assert_eq!(
            derived,
            Some((HostingProvider::Gitlab, "group/sub/repo".to_string()))
        );
    }

    #[test]
    fn should_return_none_for_other_hosts() {
        // Arrange
        let urls = [
            "https://bitbucket.org/owner/repo.git",
            "/home/user/repos/origin.git",
            "https://github.com/owner",
            "https://github.com/owner/repo/extra",
        ];

        // Act
        let derived: Vec<Option<(HostingProvider, String)>> = urls
            .iter()
            .map(|url| hosting_of(&[remote("origin", url)]))
            .collect();

        // Assert
        assert!(derived.iter().all(Option::is_none), "{derived:?}");
        assert_eq!(hosting_of(&[]), None);
    }

    #[tokio::test]
    async fn should_map_gh_output_to_pull_requests() {
        // Arrange
        let cli = ScriptedCli::new(Script::Answer {
            exit_code: 0,
            stdout: GH_OUTPUT,
        });

        // Act
        let hosting = probed(&cli, "https://github.com/owner/repo.git")
            .await
            .unwrap();

        // Assert
        assert_eq!(hosting.repository, "owner/repo");
        assert_eq!(
            hosting.pull_requests[0],
            PullRequestRecord {
                number: 123,
                title: "Add x".to_string(),
                state: "open".to_string(),
                base_ref: "main".to_string(),
                head_ref: "feature/x".to_string(),
            }
        );
        assert_eq!(hosting.pull_requests[1].state, "merged");
        let calls = cli.calls.lock().unwrap();
        assert_eq!(calls[0].0, ToolId::Gh);
        assert!(calls[0].1.contains(&OsString::from(SHA)));
    }

    #[tokio::test]
    async fn should_map_glab_output_to_merge_requests() {
        // Arrange
        let cli = ScriptedCli::new(Script::Answer {
            exit_code: 0,
            stdout: GLAB_OUTPUT,
        });

        // Act
        let hosting = probed(&cli, "https://gitlab.com/group/repo.git")
            .await
            .unwrap();

        // Assert
        assert_eq!(hosting.provider, HostingProvider::Gitlab);
        assert_eq!(hosting.pull_requests[0].number, 7);
        assert_eq!(hosting.pull_requests[0].state, "opened");
        assert_eq!(hosting.pull_requests[0].base_ref, "main");
        assert_eq!(cli.calls.lock().unwrap()[0].0, ToolId::Glab);
    }

    #[tokio::test]
    async fn should_return_an_empty_list_when_gh_is_missing_fails_or_times_out() {
        // Arrange
        let scripts = [
            Script::Missing,
            Script::Answer {
                exit_code: 1,
                stdout: GH_OUTPUT,
            },
            Script::Answer {
                exit_code: 0,
                stdout: "not json",
            },
            Script::Hang,
        ];

        // Act
        let mut found = Vec::new();
        for script in scripts {
            let cli = ScriptedCli::new(script);
            found.push(probed(&cli, "git@github.com:owner/repo.git").await);
        }

        // Assert
        for hosting in found {
            let hosting = hosting.expect("the url alone names the repository");
            assert_eq!(hosting.repository, "owner/repo");
            assert!(hosting.pull_requests.is_empty());
        }
    }
}
