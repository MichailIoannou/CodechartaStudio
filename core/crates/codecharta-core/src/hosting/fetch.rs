use codecharta_core_api::methods::hosting::{
    FetchChangeRequestHeadParams, FetchedHead, HostingProvider,
};
use codecharta_core_api::values::{CommitSha, FullRefName, Revision};

use crate::error::{CoreError, CoreResult};
use crate::git::operation::OperationContext;
use crate::git::sync::{CODECHARTA_REFS_PREFIX, FetchRefspecsRequest, Refspec};
use crate::git::{GitFolder, GitService};

const FORCED: bool = true;

/// Where a pull or merge request's head lives on the remote and in this clone.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ChangeRequestRef {
    pub provider: HostingProvider,
    pub number: u64,
}

impl ChangeRequestRef {
    /// Number 0 names no request on either provider.
    pub fn new(provider: HostingProvider, number: u64) -> CoreResult<Self> {
        if number == 0 {
            return Err(CoreError::BadRequest(
                "A pull or merge request number starts at 1.".to_string(),
            ));
        }
        Ok(Self { provider, number })
    }

    pub fn remote_ref(&self) -> String {
        match self.provider {
            HostingProvider::Github => format!("refs/pull/{}/head", self.number),
            HostingProvider::Gitlab => format!("refs/merge-requests/{}/head", self.number),
        }
    }

    /// `refs/codecharta/pr/<n>` or `refs/codecharta/mr/<n>`: the one ref the fetch writes (D5).
    pub fn private_ref(&self) -> String {
        let namespace = match self.provider {
            HostingProvider::Github => "pr",
            HostingProvider::Gitlab => "mr",
        };
        format!("{CODECHARTA_REFS_PREFIX}{namespace}/{}", self.number)
    }

    pub fn private_revision(&self) -> CoreResult<Revision> {
        Revision::try_from(self.private_ref())
            .map_err(|error| CoreError::Internal(format!("not a revision: {error}")))
    }

    /// The label a side shows: `#7` on GitHub, `!7` on GitLab.
    pub fn label(&self) -> String {
        match self.provider {
            HostingProvider::Github => format!("#{}", self.number),
            HostingProvider::Gitlab => format!("!{}", self.number),
        }
    }
}

/// Fetches the head of a pull or merge request from one of the folder's configured remotes into its
/// private ref, through the operation queue and the credential prompts; nothing else is written.
pub async fn fetch_change_request_head(
    git: &GitService<'_>,
    folder: &GitFolder,
    params: &FetchChangeRequestHeadParams,
    context: &OperationContext<'_>,
) -> CoreResult<FetchedHead> {
    let change_request = ChangeRequestRef::new(params.provider, params.number)?;
    let request = FetchRefspecsRequest {
        remote: params.remote.clone(),
        refspecs: vec![Refspec::new(
            FORCED,
            &change_request.remote_ref(),
            &change_request.private_ref(),
        )?],
    };
    git.fetch_refspecs(folder, &request, context).await?;
    let revision = change_request.private_revision()?;
    let summary = git
        .resolve_commit(folder, &revision, context.cancel)
        .await?;
    Ok(FetchedHead {
        git_ref: FullRefName::try_from(change_request.private_ref())
            .map_err(|error| CoreError::Internal(error.to_string()))?,
        commit: CommitSha::try_from(summary.sha)
            .map_err(|error| CoreError::Internal(format!("git answered no commit: {error}")))?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_name_the_refs_of_each_provider() {
        // Arrange
        let github = ChangeRequestRef::new(HostingProvider::Github, 7).unwrap();
        let gitlab = ChangeRequestRef::new(HostingProvider::Gitlab, 12).unwrap();

        // Act
        let names = [
            github.remote_ref(),
            github.private_ref(),
            github.label(),
            gitlab.remote_ref(),
            gitlab.private_ref(),
            gitlab.label(),
        ];

        // Assert
        assert_eq!(
            names,
            [
                "refs/pull/7/head",
                "refs/codecharta/pr/7",
                "#7",
                "refs/merge-requests/12/head",
                "refs/codecharta/mr/12",
                "!12",
            ]
        );
    }

    #[test]
    fn should_refuse_number_zero() {
        // Arrange
        let provider = HostingProvider::Github;

        // Act
        let refused = ChangeRequestRef::new(provider, 0);

        // Assert
        assert!(matches!(refused, Err(CoreError::BadRequest(_))));
    }
}
