use std::collections::BTreeMap;

use codecharta_core_api::methods::git::GitRefs;
use codecharta_core_api::values::{FullRefName, Revision};

use super::operation::Mutation;
use crate::error::{CoreError, CoreResult};

const FETCH_ALL_ARGS: [&str; 5] = [
    "fetch",
    "--all",
    "--progress",
    "--no-recurse-submodules",
    "--no-auto-maintenance",
];
const PRUNE: &str = "--prune";
/// An empty `--refmap` keeps git from also updating remote-tracking branches, and `--no-tags` from
/// following tags, so nothing but the named destinations is written.
const FETCH_REFSPECS_ARGS: [&str; 7] = [
    "fetch",
    "--progress",
    "--no-recurse-submodules",
    "--no-auto-maintenance",
    "--no-tags",
    "--refmap=",
    "--no-write-fetch-head",
];
const END_OF_OPTIONS: &str = "--end-of-options";
/// The only refs the core writes into a user's repository besides what the user asks git to do (D5).
pub const CODECHARTA_REFS_PREFIX: &str = "refs/codecharta/";
const FULL_REF_PREFIX: &str = "refs/";
const FORCE_PREFIX: &str = "+";
const REFSPEC_SEPARATOR: &str = ":";

/// One `[+]<source>:<destination>` of a fetch: `source` is a full ref name on the remote, `destination`
/// lies under `refs/codecharta/`. Only `new` makes one, so no other destination can reach git.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Refspec {
    force: bool,
    source: String,
    destination: FullRefName,
}

impl Refspec {
    pub fn new(force: bool, source: &str, destination: &str) -> CoreResult<Self> {
        let source = full_ref(source)?;
        let destination = full_ref(destination)?;
        if !destination.starts_with(CODECHARTA_REFS_PREFIX) {
            return Err(CoreError::BadRequest(format!(
                "A fetch may write only refs under {CODECHARTA_REFS_PREFIX}."
            )));
        }
        Ok(Self {
            force,
            source,
            destination: FullRefName::try_from(destination)
                .map_err(|error| CoreError::BadRequest(error.to_string()))?,
        })
    }

    pub fn destination(&self) -> &FullRefName {
        &self.destination
    }

    fn text(&self) -> String {
        let force = if self.force { FORCE_PREFIX } else { "" };
        format!(
            "{force}{}{REFSPEC_SEPARATOR}{}",
            self.source, self.destination
        )
    }
}

/// A well-formed full ref name: no option, no expression, nothing `check-ref-format` would refuse.
fn full_ref(text: &str) -> CoreResult<String> {
    let invalid = || CoreError::BadRequest("A refspec names full, well-formed refs.".to_string());
    let revision = Revision::try_from(text).map_err(|_| invalid())?;
    if !revision.as_str().starts_with(FULL_REF_PREFIX) {
        return Err(invalid());
    }
    Ok(revision.into())
}

/// `remote` is the name of a configured remote, never a url.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FetchRefspecsRequest {
    pub remote: String,
    pub refspecs: Vec<Refspec>,
}

/// Answers the refs as they were before, to count what the fetch changed.
pub async fn fetch(mutation: &Mutation<'_>, prune: bool) -> CoreResult<GitRefs> {
    let before = mutation.refs().await?;
    let mut args = FETCH_ALL_ARGS.to_vec();
    if prune {
        args.push(PRUNE);
    }
    mutation.run_network(&args).await?;
    Ok(before)
}

pub async fn fetch_refspecs(
    mutation: &Mutation<'_>,
    request: &FetchRefspecsRequest,
) -> CoreResult<GitRefs> {
    if request.refspecs.is_empty() {
        return Err(CoreError::BadRequest(
            "Name at least one refspec.".to_string(),
        ));
    }
    let before = mutation.refs().await?;
    if !before
        .remotes
        .iter()
        .any(|remote| remote.name == request.remote)
    {
        return Err(CoreError::NotFound(format!(
            "There is no remote {:?}.",
            request.remote
        )));
    }
    let refspecs: Vec<String> = request.refspecs.iter().map(Refspec::text).collect();
    let mut args = FETCH_REFSPECS_ARGS.to_vec();
    args.extend([END_OF_OPTIONS, request.remote.as_str()]);
    args.extend(refspecs.iter().map(String::as_str));
    mutation.run_network(&args).await?;
    Ok(before)
}

/// Branches, remote branches and tags that appeared, disappeared or point elsewhere.
pub fn count_updated_refs(before: &GitRefs, after: &GitRefs) -> u32 {
    let (before, after) = (commits_by_ref(before), commits_by_ref(after));
    let changed = before
        .iter()
        .filter(|(name, commit)| after.get(*name) != Some(*commit))
        .count();
    let added = after
        .keys()
        .filter(|name| !before.contains_key(*name))
        .count();
    u32::try_from(changed + added).unwrap_or(u32::MAX)
}

fn commits_by_ref(refs: &GitRefs) -> BTreeMap<&str, &str> {
    let local = refs
        .local_branches
        .iter()
        .map(|branch| (branch.ref_name.as_str(), branch.commit.as_str()));
    let remote = refs
        .remote_branches
        .iter()
        .map(|branch| (branch.ref_name.as_str(), branch.commit.as_str()));
    let tags = refs
        .tags
        .iter()
        .map(|tag| (tag.ref_name.as_str(), tag.commit.as_str()));
    local.chain(remote).chain(tags).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_refuse_refspecs_writing_outside_refs_codecharta() {
        // Arrange
        let destinations = [
            "refs/heads/stolen",
            "refs/remotes/origin/main",
            "refs/codecharta",
            "refs/codecharta/../heads/main",
            "refs/codecharta/pr/1:refs/heads/x",
            "--upload-pack=evil",
            "HEAD",
        ];

        // Act
        let refused: Vec<bool> = destinations
            .iter()
            .map(|destination| Refspec::new(true, "refs/pull/1/head", destination).is_err())
            .collect();

        // Assert
        assert_eq!(refused, vec![true; destinations.len()]);
    }

    #[test]
    fn should_write_a_forced_refspec_from_full_ref_names() {
        // Arrange
        let source = "refs/pull/12/head";

        // Act
        let forced = Refspec::new(true, source, "refs/codecharta/pr/12").unwrap();
        let plain = Refspec::new(false, source, "refs/codecharta/pr/12").unwrap();
        let refused = Refspec::new(false, "-x", "refs/codecharta/pr/12");

        // Assert
        assert_eq!(forced.text(), "+refs/pull/12/head:refs/codecharta/pr/12");
        assert_eq!(plain.text(), "refs/pull/12/head:refs/codecharta/pr/12");
        assert!(refused.is_err());
    }
}
