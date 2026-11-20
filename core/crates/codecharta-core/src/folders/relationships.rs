use std::collections::BTreeMap;

use codecharta_core_api::ids::FolderId;
use codecharta_core_api::methods::projects::{
    FolderGitFacts, FolderRelationship, RelationshipKind,
};

pub const ORIGIN_REMOTE: &str = "origin";
const SCHEME_SEPARATOR: &str = "://";
const FILE_SCHEME: &str = "file";
const GIT_SUFFIX: &str = ".git";
const PATH_SEPARATOR: char = '/';
const USER_SEPARATOR: char = '@';
const PORT_SEPARATOR: char = ':';
/// `C:` in `C:\src\repo` is a drive letter, not a host.
const DRIVE_LETTER_LENGTH: usize = 1;

/// A project folder with the git facts its relationships are derived from.
pub struct GitFolder<'folder> {
    pub id: &'folder FolderId,
    pub git: &'folder FolderGitFacts,
}

/// The same repository written as https, ssh or scp-like url gives the same text: host in lowercase,
/// no credentials, port, trailing slash or `.git`. Local paths only lose the trailing slash and `.git`.
pub fn normalise_remote_url(url: &str) -> String {
    let trimmed = url.trim();
    match split_host_and_path(trimmed) {
        Some((host, path)) => format!(
            "{}{PATH_SEPARATOR}{}",
            host.to_ascii_lowercase(),
            strip_repository_suffix(path).trim_start_matches(PATH_SEPARATOR)
        ),
        None => strip_repository_suffix(trimmed).to_string(),
    }
}

fn split_host_and_path(url: &str) -> Option<(&str, &str)> {
    if let Some((scheme, rest)) = url.split_once(SCHEME_SEPARATOR) {
        if scheme.eq_ignore_ascii_case(FILE_SCHEME) {
            return None;
        }
        let (authority, path) = rest.split_once(PATH_SEPARATOR).unwrap_or((rest, ""));
        return Some((host_of(authority), path));
    }
    let (authority, path) = url.split_once(PORT_SEPARATOR)?;
    let is_scp_like = authority.len() > DRIVE_LETTER_LENGTH
        && !authority.contains(PATH_SEPARATOR)
        && !authority.contains('\\');
    is_scp_like.then(|| (host_of(authority), path))
}

fn host_of(authority: &str) -> &str {
    let host_and_port = authority
        .rsplit_once(USER_SEPARATOR)
        .map_or(authority, |(_, host)| host);
    host_and_port
        .split(PORT_SEPARATOR)
        .next()
        .unwrap_or(host_and_port)
}

fn strip_repository_suffix(path: &str) -> &str {
    let without_slash = path.trim_end_matches(PATH_SEPARATOR);
    without_slash
        .strip_suffix(GIT_SUFFIX)
        .unwrap_or(without_slash)
}

/// Every folder gets an entry, empty when it relates to no other folder.
pub fn derive_relationships(
    folders: &[GitFolder<'_>],
) -> BTreeMap<FolderId, Vec<FolderRelationship>> {
    folders
        .iter()
        .map(|folder| (folder.id.clone(), relationships_of(folder, folders)))
        .collect()
}

fn relationships_of(folder: &GitFolder<'_>, folders: &[GitFolder<'_>]) -> Vec<FolderRelationship> {
    folders
        .iter()
        .filter(|other| other.id != folder.id)
        .filter_map(|other| {
            relationship(folder.git, other.git).map(|kind| FolderRelationship {
                kind,
                folder_id: other.id.clone(),
            })
        })
        .collect()
}

fn relationship(folder: &FolderGitFacts, other: &FolderGitFacts) -> Option<RelationshipKind> {
    let other_origin = origin_url(other);
    if other_origin
        .as_ref()
        .is_some_and(|origin| other_remote_urls(folder).any(|url| &url == origin))
    {
        return Some(RelationshipKind::ForkOf);
    }
    if shares_history(folder, other) {
        return Some(RelationshipKind::SharesHistoryWith);
    }
    let same_origin = other_origin.is_some() && origin_url(folder) == other_origin;
    same_origin.then_some(RelationshipKind::SameRemote)
}

fn origin_url(git: &FolderGitFacts) -> Option<String> {
    git.remotes
        .iter()
        .find(|remote| remote.name == ORIGIN_REMOTE)
        .map(|remote| normalise_remote_url(&remote.url))
}

fn other_remote_urls(git: &FolderGitFacts) -> impl Iterator<Item = String> + '_ {
    git.remotes
        .iter()
        .filter(|remote| remote.name != ORIGIN_REMOTE)
        .map(|remote| normalise_remote_url(&remote.url))
}

/// The root commits of a shallow clone are its graft points, so they say nothing about shared history.
fn shares_history(folder: &FolderGitFacts, other: &FolderGitFacts) -> bool {
    !folder.is_shallow
        && !other.is_shallow
        && folder
            .root_commits
            .iter()
            .any(|root| other.root_commits.contains(root))
}

#[cfg(test)]
mod tests {
    use codecharta_core_api::methods::projects::GitRemote;
    use codecharta_core_api::values::FullCommit;

    use super::*;

    const ROOT_A: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const ROOT_B: &str = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

    fn facts(remotes: &[(&str, &str)], roots: &[&str], is_shallow: bool) -> FolderGitFacts {
        FolderGitFacts {
            top_level: "/src/repo".to_string(),
            is_repository_root: true,
            remotes: remotes
                .iter()
                .map(|(name, url)| GitRemote {
                    name: name.to_string(),
                    url: url.to_string(),
                })
                .collect(),
            default_branch: Some("main".to_string()),
            root_commits: roots
                .iter()
                .map(|root| FullCommit::try_from(*root).unwrap())
                .collect(),
            is_shallow,
            detected_at: "2026-11-18T00:00:00Z".to_string(),
        }
    }

    fn id(value: &str) -> FolderId {
        FolderId::try_from(value).unwrap()
    }

    fn relationships_between(
        first: &FolderGitFacts,
        second: &FolderGitFacts,
    ) -> BTreeMap<FolderId, Vec<FolderRelationship>> {
        let (first_id, second_id) = (id("f-first"), id("f-second"));
        derive_relationships(&[
            GitFolder {
                id: &first_id,
                git: first,
            },
            GitFolder {
                id: &second_id,
                git: second,
            },
        ])
    }

    #[test]
    fn should_treat_ssh_and_https_urls_of_one_repository_as_equal() {
        // Arrange
        let urls = [
            "https://github.com/MaibornWolff/codecharta.git",
            "git@github.com:MaibornWolff/codecharta.git",
            "ssh://git@GitHub.com:22/MaibornWolff/codecharta",
            "https://ada:s3cret-token@github.com/MaibornWolff/codecharta/",
        ];

        // Act
        let normalised: Vec<String> = urls.into_iter().map(normalise_remote_url).collect();

        // Assert
        assert!(
            normalised
                .iter()
                .all(|url| url == "github.com/MaibornWolff/codecharta"),
            "{normalised:?}"
        );
    }

    #[test]
    fn should_keep_local_paths_apart_from_hosts() {
        // Arrange
        let paths = [
            "C:\\src\\repo.git",
            "/srv/git/repo.git/",
            "file:///srv/git/repo",
        ];

        // Act
        let normalised: Vec<String> = paths.into_iter().map(normalise_remote_url).collect();

        // Assert
        assert_eq!(
            normalised,
            vec!["C:\\src\\repo", "/srv/git/repo", "file:///srv/git/repo"]
        );
    }

    #[test]
    fn should_report_fork_of_when_a_non_origin_remote_matches_the_other_origin() {
        // Arrange
        let upstream = facts(
            &[("origin", "https://github.com/owner/repo.git")],
            &[],
            false,
        );
        let fork = facts(
            &[
                ("origin", "https://github.com/ada/repo.git"),
                ("upstream", "git@github.com:owner/repo.git"),
            ],
            &[],
            false,
        );

        // Act
        let relationships = relationships_between(&upstream, &fork);

        // Assert
        assert_eq!(relationships[&id("f-first")], vec![]);
        assert_eq!(
            relationships[&id("f-second")],
            vec![FolderRelationship {
                kind: RelationshipKind::ForkOf,
                folder_id: id("f-first"),
            }]
        );
    }

    #[test]
    fn should_report_shares_history_with_for_intersecting_root_commits() {
        // Arrange
        let first = facts(&[], &[ROOT_A, ROOT_B], false);
        let second = facts(&[], &[ROOT_B], false);

        // Act
        let relationships = relationships_between(&first, &second);

        // Assert
        assert_eq!(
            relationships[&id("f-first")],
            vec![FolderRelationship {
                kind: RelationshipKind::SharesHistoryWith,
                folder_id: id("f-second"),
            }]
        );
        assert_eq!(
            relationships[&id("f-second")][0].kind,
            RelationshipKind::SharesHistoryWith
        );
    }

    #[test]
    fn should_report_same_remote_for_equal_origins() {
        // Arrange
        let first = facts(&[("origin", "https://github.com/owner/repo")], &[], true);
        let second = facts(&[("origin", "git@github.com:owner/repo.git")], &[], true);

        // Act
        let relationships = relationships_between(&first, &second);

        // Assert
        assert_eq!(
            relationships[&id("f-first")][0].kind,
            RelationshipKind::SameRemote
        );
    }

    #[test]
    fn should_report_nothing_for_shallow_clones_without_matching_remotes() {
        // Arrange
        let first = facts(&[("origin", "https://github.com/ada/one")], &[ROOT_A], true);
        let second = facts(&[("origin", "https://github.com/ada/two")], &[ROOT_A], true);

        // Act
        let relationships = relationships_between(&first, &second);

        // Assert
        assert!(
            relationships.values().all(Vec::is_empty),
            "{relationships:?}"
        );
    }
}
