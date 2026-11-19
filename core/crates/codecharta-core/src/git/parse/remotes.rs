use codecharta_core_api::methods::projects::GitRemote;

use crate::error::CoreResult;
use crate::folders::inspector::strip_credentials;
use crate::git::error::parse_failed;
use crate::git::nul::split_nul_fields;

pub const REMOTE_URLS_ARGS: [&str; 4] = ["config", "-z", "--get-regexp", r"^remote\..*\.url$"];
/// `config --get-regexp` exits 1 when nothing matches.
pub const NO_MATCH_EXIT_CODE: i32 = 1;

const WHAT: &str = "the remotes";
const KEY_PREFIX: &str = "remote.";
const KEY_SUFFIX: &str = ".url";

/// `config -z` writes `key\nvalue\0` per entry; the first url of each remote counts, without credentials.
pub fn parse_remote_urls(stdout: &str) -> CoreResult<Vec<GitRemote>> {
    let mut remotes: Vec<GitRemote> = Vec::new();
    for entry in split_nul_fields(stdout) {
        let remote = parse_entry(entry)?;
        if !remotes.iter().any(|known| known.name == remote.name) {
            remotes.push(remote);
        }
    }
    Ok(remotes)
}

fn parse_entry(entry: &str) -> CoreResult<GitRemote> {
    let (key, url) = entry.split_once('\n').ok_or_else(|| parse_failed(WHAT))?;
    let name = key
        .strip_prefix(KEY_PREFIX)
        .and_then(|rest| rest.strip_suffix(KEY_SUFFIX))
        .ok_or_else(|| parse_failed(WHAT))?;
    Ok(GitRemote {
        name: name.to_string(),
        url: strip_credentials(url),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn remote(name: &str, url: &str) -> GitRemote {
        GitRemote {
            name: name.to_string(),
            url: url.to_string(),
        }
    }

    #[test]
    fn should_strip_https_credentials_and_keep_scp_like_urls() {
        // Arrange
        let output = include_str!("testdata/remote_urls.txt");

        // Act
        let remotes = parse_remote_urls(output).unwrap();

        // Assert
        assert_eq!(
            remotes,
            [
                remote("origin", "/fixture/origin.git"),
                remote("team/fork", "/fixture/fork.git"),
                remote("mirror", "https://example.test/ada/repo.git"),
                remote("scp", "git@example.test:ada/repo.git"),
            ]
        );
    }

    #[test]
    fn should_keep_the_first_url_of_a_remote() {
        // Arrange
        let output = "remote.origin.url\nfirst\0remote.origin.url\nsecond\0";

        // Act
        let remotes = parse_remote_urls(output).unwrap();

        // Assert
        assert_eq!(remotes, [remote("origin", "first")]);
    }

    #[test]
    fn should_read_no_remotes_from_empty_output() {
        // Arrange
        let output = "";

        // Act
        let remotes = parse_remote_urls(output).unwrap();

        // Assert
        assert!(remotes.is_empty());
    }
}
