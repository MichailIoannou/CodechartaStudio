use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::methods::projects::FolderRef;
use crate::registry::method;
use crate::values::{CommitSha, FullRefName, HostName};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub enum HostingProvider {
    Github,
    Gitlab,
}

/// `knownHost`: github.com or gitlab.com; `override`: the folder's own answer for its host;
/// `hostNameHint`: the host name contains `github` or `gitlab`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub enum DetectedBy {
    KnownHost,
    HostNameHint,
    Override,
}

/// What the user said a host the core does not recognise is; it applies to remotes on `host` only.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HostingOverride {
    pub provider: HostingProvider,
    pub host: HostName,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HostingStatusParams {
    pub folder: FolderRef,
}

/// Read from the folder's remotes, `upstream` first, then `origin`, then the others. `host`,
/// `repository` and `remote` are null when no remote names a hosted repository; `provider` and
/// `detectedBy` also when the host is not recognised. A url never carries credentials here.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct HostingStatus {
    pub provider: Option<HostingProvider>,
    pub host: Option<String>,
    pub repository: Option<String>,
    pub remote: Option<String>,
    pub detected_by: Option<DetectedBy>,
}

method!(
    HostingStatusMethod,
    "hosting.status",
    Renderer,
    HostingStatusParams,
    HostingStatus
);

/// Fetches `refs/pull/<number>/head` (GitHub) or `refs/merge-requests/<number>/head` (GitLab) of the
/// configured remote `remote` into `refs/codecharta/pr/<number>` or `refs/codecharta/mr/<number>`, and
/// nothing else; only ever on the user's explicit request. Cancel it with `core.cancel`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FetchChangeRequestHeadParams {
    pub folder: FolderRef,
    pub remote: String,
    pub provider: HostingProvider,
    pub number: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct FetchedHead {
    pub git_ref: FullRefName,
    pub commit: CommitSha,
}

method!(
    HostingFetchChangeRequestHead,
    "hosting.fetchChangeRequestHead",
    Renderer,
    FetchChangeRequestHeadParams,
    FetchedHead
);

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn should_write_an_unrecognised_host_without_a_provider() {
        // Arrange
        let status = HostingStatus {
            host: Some("git.example.org".to_string()),
            repository: Some("team/app".to_string()),
            remote: Some("origin".to_string()),
            ..HostingStatus::default()
        };

        // Act
        let json = serde_json::to_value(&status).unwrap();

        // Assert
        assert_eq!(
            json,
            json!({
                "provider": null,
                "host": "git.example.org",
                "repository": "team/app",
                "remote": "origin",
                "detectedBy": null
            })
        );
    }

    #[test]
    fn should_refuse_fetch_params_with_a_refspec_or_a_negative_number() {
        // Arrange
        let folder = json!({ "projectId": "p-1", "folderId": "f-1" });
        let with_refspec = json!({ "folder": folder, "remote": "origin", "provider": "github",
            "number": 7, "refspec": "+refs/heads/main:refs/heads/main" });
        let negative =
            json!({ "folder": folder, "remote": "origin", "provider": "github", "number": -7 });

        // Act
        let parsed =
            [with_refspec, negative].map(serde_json::from_value::<FetchChangeRequestHeadParams>);

        // Assert
        assert!(parsed.iter().all(Result::is_err));
    }

    #[test]
    fn should_refuse_an_override_for_an_upper_case_host() {
        // Arrange
        let json = json!({ "provider": "gitlab", "host": "Git.Example.org" });

        // Act
        let parsed = serde_json::from_value::<HostingOverride>(json);

        // Assert
        assert!(parsed.is_err());
    }
}
