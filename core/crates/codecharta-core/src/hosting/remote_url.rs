const GIT_SUFFIX: &str = ".git";
const SCHEME_SEPARATOR: &str = "://";
const PATH_SEPARATOR: char = '/';
const USER_SEPARATOR: char = '@';
const PORT_SEPARATOR: char = ':';
const MIN_PATH_SEGMENTS: usize = 2;

/// The hosted repository a remote url names. It never holds the user name, password or token a url
/// may carry.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RemoteRef {
    /// In lower case, without a port.
    pub host: String,
    /// The path without slashes around it and without `.git`; GitLab subgroups are kept.
    pub repository: String,
}

/// `scheme://[credentials@]host[:port]/a/b[.git]` or scp-like `[user@]host:a/b[.git]`, with at least two
/// path segments; a local path names no hosted repository.
pub fn parse_remote_url(url: &str) -> Option<RemoteRef> {
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
    let repository = path.strip_suffix(GIT_SUFFIX).unwrap_or(path);
    let is_host = !host.is_empty() && !host.contains(PATH_SEPARATOR);
    (is_host && is_repository_path(repository)).then(|| RemoteRef {
        host: host.to_ascii_lowercase(),
        repository: repository.to_string(),
    })
}

fn without_port(authority: &str) -> &str {
    authority
        .rsplit_once(PORT_SEPARATOR)
        .filter(|(_, port)| port.bytes().all(|byte| byte.is_ascii_digit()))
        .map_or(authority, |(host, _)| host)
}

fn is_repository_path(path: &str) -> bool {
    let segments: Vec<&str> = path.split(PATH_SEPARATOR).collect();
    segments.len() >= MIN_PATH_SEGMENTS && !segments.contains(&"")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn remote_ref(host: &str, repository: &str) -> Option<RemoteRef> {
        Some(RemoteRef {
            host: host.to_string(),
            repository: repository.to_string(),
        })
    }

    #[test]
    fn should_read_host_and_repository_from_an_https_remote() {
        // Arrange
        let urls = [
            "https://github.com/owner/repo.git",
            "https://GitHub.com/owner/repo/",
            "https://git.example.org:8443/owner/repo",
        ];

        // Act
        let parsed: Vec<Option<RemoteRef>> = urls.into_iter().map(parse_remote_url).collect();

        // Assert
        assert_eq!(
            parsed,
            [
                remote_ref("github.com", "owner/repo"),
                remote_ref("github.com", "owner/repo"),
                remote_ref("git.example.org", "owner/repo"),
            ]
        );
    }

    #[test]
    fn should_read_host_and_repository_from_an_scp_style_remote() {
        // Arrange
        let url = "git@github.com:owner/repo.git";

        // Act
        let parsed = parse_remote_url(url);

        // Assert
        assert_eq!(parsed, remote_ref("github.com", "owner/repo"));
    }

    #[test]
    fn should_read_host_and_repository_from_an_ssh_url_with_a_port() {
        // Arrange
        let url = "ssh://git@gitlab.example.com:2222/team/app.git";

        // Act
        let parsed = parse_remote_url(url);

        // Assert
        assert_eq!(parsed, remote_ref("gitlab.example.com", "team/app"));
    }

    #[test]
    fn should_keep_gitlab_subgroups() {
        // Arrange
        let url = "https://gitlab.com/group/sub/deeper/app.git";

        // Act
        let parsed = parse_remote_url(url);

        // Assert
        assert_eq!(parsed, remote_ref("gitlab.com", "group/sub/deeper/app"));
    }

    #[test]
    fn should_never_return_credentials_embedded_in_a_url() {
        // Arrange
        let urls = [
            "https://user:s3cret@github.com/owner/repo.git",
            "https://ghp_t0ken@github.com/owner/repo.git",
            "ssh://user:s3cret@git.example.org:22/owner/repo.git",
            "https://user:p@ss@git.example.org/owner/repo",
        ];

        // Act
        let parsed: Vec<String> = urls
            .into_iter()
            .map(|url| format!("{:?}", parse_remote_url(url)))
            .collect();

        // Assert
        for text in parsed {
            assert!(text.contains("owner/repo"), "{text}");
            for secret in ["s3cret", "t0ken", "user", "ss@", "p@"] {
                assert!(!text.contains(secret), "{text}");
            }
        }
    }

    #[test]
    fn should_name_no_repository_for_a_local_path_or_a_single_segment() {
        // Arrange
        let urls = [
            "/home/user/repos/origin.git",
            "C:\\repos\\origin.git",
            "https://github.com/owner",
            "file:///srv/git/repo.git",
        ];

        // Act
        let parsed: Vec<Option<RemoteRef>> = urls.into_iter().map(parse_remote_url).collect();

        // Assert
        assert_eq!(parsed, [None, None, None, None]);
    }
}
