use codecharta_core_api::methods::hosting::{
    DetectedBy, HostingOverride, HostingProvider, HostingStatus,
};
use codecharta_core_api::methods::projects::GitRemote;

use super::remote_url::parse_remote_url;
use super::slug::{RepoSlug, validate_repo_slug};

const PREFERRED_REMOTES: [&str; 2] = ["upstream", "origin"];
const KNOWN_HOSTS: [(&str, HostingProvider); 2] = [
    ("github.com", HostingProvider::Github),
    ("gitlab.com", HostingProvider::Gitlab),
];
const HOST_NAME_HINTS: [(&str, HostingProvider); 2] = [
    ("gitlab", HostingProvider::Gitlab),
    ("github", HostingProvider::Github),
];

/// The hosted repository of a folder; `provider` is `None` for a host the core does not recognise.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Detection {
    pub remote: String,
    pub host: String,
    pub repository: RepoSlug,
    pub provider: Option<(HostingProvider, DetectedBy)>,
}

/// Everything null when no remote names a hosted repository.
pub fn status_of(detection: Option<Detection>) -> HostingStatus {
    let Some(detection) = detection else {
        return HostingStatus::default();
    };
    HostingStatus {
        provider: detection.provider.map(|(provider, _)| provider),
        detected_by: detection.provider.map(|(_, detected_by)| detected_by),
        host: Some(detection.host),
        repository: Some(detection.repository.as_str().to_string()),
        remote: Some(detection.remote),
    }
}

/// The first remote naming a hosted repository, `upstream` first, then `origin`, then the others in
/// their order. A known host wins over the folder's override, the override over a hint in the host name.
pub fn detect(
    remotes: &[GitRemote],
    hosting_override: Option<&HostingOverride>,
) -> Option<Detection> {
    by_preference(remotes).find_map(|remote| {
        let parsed = parse_remote_url(&remote.url)?;
        let repository = validate_repo_slug(&parsed.repository).ok()?;
        Some(Detection {
            provider: provider_of(&parsed.host, hosting_override),
            remote: remote.name.clone(),
            host: parsed.host,
            repository,
        })
    })
}

fn by_preference(remotes: &[GitRemote]) -> impl Iterator<Item = &GitRemote> {
    let preferred = PREFERRED_REMOTES
        .iter()
        .filter_map(|name| remotes.iter().find(|remote| remote.name == *name));
    let others = remotes
        .iter()
        .filter(|remote| !PREFERRED_REMOTES.contains(&remote.name.as_str()));
    preferred.chain(others)
}

fn provider_of(
    host: &str,
    hosting_override: Option<&HostingOverride>,
) -> Option<(HostingProvider, DetectedBy)> {
    let known = KNOWN_HOSTS
        .iter()
        .find(|(known, _)| *known == host)
        .map(|(_, provider)| (*provider, DetectedBy::KnownHost));
    let overridden = hosting_override
        .filter(|chosen| chosen.host.as_str() == host)
        .map(|chosen| (chosen.provider, DetectedBy::Override));
    let hinted = || {
        HOST_NAME_HINTS
            .iter()
            .find(|(hint, _)| host.contains(hint))
            .map(|(_, provider)| (*provider, DetectedBy::HostNameHint))
    };
    known.or(overridden).or_else(hinted)
}

#[cfg(test)]
mod tests {
    use codecharta_core_api::values::HostName;

    use super::*;

    fn remote(name: &str, url: &str) -> GitRemote {
        GitRemote {
            name: name.to_string(),
            url: url.to_string(),
        }
    }

    fn treat_as(host: &str, provider: HostingProvider) -> HostingOverride {
        HostingOverride {
            provider,
            host: HostName::try_from(host).unwrap(),
        }
    }

    #[test]
    fn should_prefer_upstream_over_origin() {
        // Arrange
        let remotes = [
            remote("fork", "https://github.com/someone/app.git"),
            remote("origin", "https://github.com/me/app.git"),
            remote("upstream", "git@github.com:team/app.git"),
        ];

        // Act
        let detected = detect(&remotes, None).unwrap();
        let without_upstream = detect(&remotes[..2], None).unwrap();

        // Assert
        assert_eq!(detected.remote, "upstream");
        assert_eq!(detected.repository.as_str(), "team/app");
        assert_eq!(
            detected.provider,
            Some((HostingProvider::Github, DetectedBy::KnownHost))
        );
        assert_eq!(without_upstream.remote, "origin");
    }

    #[test]
    fn should_skip_a_remote_that_names_no_hosted_repository() {
        // Arrange
        let remotes = [
            remote("origin", "/srv/git/app.git"),
            remote("mirror", "https://gitlab.com/group/sub/app.git"),
        ];

        // Act
        let detected = detect(&remotes, None).unwrap();

        // Assert
        assert_eq!(detected.remote, "mirror");
        assert_eq!(detected.repository.as_str(), "group/sub/app");
        assert_eq!(
            detected.provider,
            Some((HostingProvider::Gitlab, DetectedBy::KnownHost))
        );
        assert_eq!(detect(&remotes[..1], None), None);
    }

    #[test]
    fn should_honour_a_folder_override() {
        // Arrange
        let remotes = [remote("origin", "https://git.example.org/team/app.git")];
        let matching = treat_as("git.example.org", HostingProvider::Gitlab);
        let elsewhere = treat_as("other.example.org", HostingProvider::Gitlab);
        let on_github = [remote("origin", "https://github.com/team/app.git")];

        // Act
        let overridden = detect(&remotes, Some(&matching)).unwrap();
        let unmatched = detect(&remotes, Some(&elsewhere)).unwrap();
        let known = detect(
            &on_github,
            Some(&treat_as("github.com", HostingProvider::Gitlab)),
        )
        .unwrap();

        // Assert
        assert_eq!(
            overridden.provider,
            Some((HostingProvider::Gitlab, DetectedBy::Override))
        );
        assert_eq!(unmatched.provider, None);
        assert_eq!(unmatched.host, "git.example.org");
        assert_eq!(
            known.provider,
            Some((HostingProvider::Github, DetectedBy::KnownHost))
        );
    }

    #[test]
    fn should_guess_the_provider_from_the_host_name() {
        // Arrange
        let remotes = [
            remote("origin", "git@gitlab.corp.example:team/app.git"),
            remote("other", "https://github.example.com/team/app"),
        ];

        // Act
        let gitlab = detect(&remotes, None).unwrap();
        let github = detect(&remotes[1..], None).unwrap();

        // Assert
        assert_eq!(
            gitlab.provider,
            Some((HostingProvider::Gitlab, DetectedBy::HostNameHint))
        );
        assert_eq!(
            github.provider,
            Some((HostingProvider::Github, DetectedBy::HostNameHint))
        );
    }

    #[test]
    fn should_report_an_unrecognised_host_without_a_provider() {
        // Arrange
        let detection = detect(
            &[remote("origin", "https://git.example.org/team/app.git")],
            None,
        );

        // Act
        let status = status_of(detection);

        // Assert
        assert_eq!(status.provider, None);
        assert_eq!(status.detected_by, None);
        assert_eq!(status.host.as_deref(), Some("git.example.org"));
        assert_eq!(status.repository.as_deref(), Some("team/app"));
        assert_eq!(status.remote.as_deref(), Some("origin"));
    }
}
