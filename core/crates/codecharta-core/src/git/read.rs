use std::path::Path;

use codecharta_core_api::methods::git::GitRefs;
use codecharta_core_api::methods::projects::GitRemote;
use tokio_util::sync::CancellationToken;

use super::command::{GitCommand, QUERY_LIMITS, REFS_LIMITS, STATUS_LIMITS};
use super::error::command_failed;
use super::fingerprint::fingerprint_of;
use super::locator::{PathStyle, Repository};
use super::parse::refs::{REFS_ARGS, RefContext, RefRecord, parse_refs, sort_refs};
use super::parse::remotes::{NO_MATCH_EXIT_CODE, REMOTE_URLS_ARGS, parse_remote_urls};
use super::parse::status::{STATUS_ARGS, StatusSummary, parse_status};
use super::runner::GitCli;
use crate::error::CoreResult;

pub async fn status_summary(
    git: &GitCli<'_>,
    folder: &Path,
    cancel: &CancellationToken,
) -> CoreResult<StatusSummary> {
    let command = GitCommand::read(folder, &STATUS_ARGS, STATUS_LIMITS);
    parse_status(&git.run(&command, cancel).await?)
}

/// Branches, tags and remotes; the head comes from the status header, read at the same time.
pub async fn read_refs(
    git: &GitCli<'_>,
    repository: &Repository,
    folder: &Path,
    cancel: &CancellationToken,
) -> CoreResult<GitRefs> {
    let (summary, records, remotes) = tokio::join!(
        status_summary(git, folder, cancel),
        ref_records(git, folder, cancel),
        remotes(git, folder, cancel),
    );
    let (summary, records, remotes) = (summary?, records?, remotes?);
    let remote_names: Vec<String> = remotes.iter().map(|remote| remote.name.clone()).collect();
    let sorted = sort_refs(
        &records,
        &RefContext {
            remote_names: &remote_names,
            root_path: &repository.info.root_path,
            style: PathStyle::current(),
        },
    );
    Ok(GitRefs {
        fingerprint: fingerprint_of(&records, &summary.head),
        head: summary.head,
        local_branches: sorted.local_branches,
        remote_branches: sorted.remote_branches,
        tags: sorted.tags,
        remotes,
    })
}

async fn ref_records(
    git: &GitCli<'_>,
    folder: &Path,
    cancel: &CancellationToken,
) -> CoreResult<Vec<RefRecord>> {
    let command = GitCommand::read(folder, &REFS_ARGS, REFS_LIMITS);
    parse_refs(&git.run(&command, cancel).await?)
}

async fn remotes(
    git: &GitCli<'_>,
    folder: &Path,
    cancel: &CancellationToken,
) -> CoreResult<Vec<GitRemote>> {
    let command = GitCommand::read(folder, &REMOTE_URLS_ARGS, QUERY_LIMITS);
    let output = git.run_raw(&command, cancel).await?;
    match output.exit_code {
        0 => parse_remote_urls(&output.stdout),
        NO_MATCH_EXIT_CODE if output.stdout.is_empty() => Ok(Vec::new()),
        _ => Err(command_failed(&output)),
    }
}
