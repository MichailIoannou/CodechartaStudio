use std::collections::HashSet;
use std::ops::ControlFlow;

use codecharta_core_api::error::ErrorCode;
use codecharta_core_api::methods::analysis::{AnalysisTarget, BatchSelection, TargetKind};
use codecharta_core_api::methods::snapshots::{SnapshotSource, SnapshotSummary};
use codecharta_core_api::values::{CommitSha, Revision};
use tokio_util::sync::CancellationToken;

use crate::error::{CoreError, CoreResult};
use crate::git::query::RevListRequest;
use crate::git::{GitFolder, GitService};

/// A batch queues at most this many analyses.
pub const MAX_BATCH_JOBS: usize = 200;

/// What a batch would analyse, before anything is queued.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BatchPlan {
    pub to_analyse: Vec<CommitSha>,
    pub already_analysed: Vec<CommitSha>,
    pub left_out: u32,
    pub estimated_duration_ms: Option<u64>,
}

/// `BAD_REQUEST` for a count or list outside `1..=MAX_BATCH_JOBS`.
pub fn validate_selection(selection: &BatchSelection) -> CoreResult<()> {
    let count = match selection {
        BatchSelection::Commits { shas } => shas.len(),
        BatchSelection::LastCommits { count, .. } => usize::from(*count),
        BatchSelection::Tags => return Ok(()),
    };
    if (1..=MAX_BATCH_JOBS).contains(&count) {
        return Ok(());
    }
    Err(CoreError::BadRequest(format!(
        "A batch analyses 1 to {MAX_BATCH_JOBS} commits."
    )))
}

/// The target the preflight of a batch checks: its first named commit, or the folder for tags.
pub fn preflight_target(selection: &BatchSelection) -> AnalysisTarget {
    let first = match selection {
        BatchSelection::Commits { shas } => shas.first().cloned(),
        BatchSelection::LastCommits { tip_sha, .. } => Some(tip_sha.clone()),
        BatchSelection::Tags => None,
    };
    first.map_or(AnalysisTarget::WorkingTree, |sha| AnalysisTarget::Commit {
        sha,
    })
}

/// The commits of a selection, newest first and each once. An unknown commit of `Commits` is
/// `NOT_A_COMMIT`.
pub async fn expand_batch(
    git: &GitService<'_>,
    folder: &GitFolder,
    selection: &BatchSelection,
    cancel: &CancellationToken,
) -> CoreResult<Vec<CommitSha>> {
    validate_selection(selection)?;
    let commits = match selection {
        BatchSelection::Commits { shas } => verified_commits(git, folder, shas, cancel).await?,
        BatchSelection::LastCommits {
            tip_sha,
            count,
            first_parent_only,
        } => {
            let request = RevListRequest {
                include: vec![tip_sha.clone()],
                exclude: Vec::new(),
                first_parent: *first_parent_only,
                max_count: Some(u32::from(*count)),
            };
            walked_commits(git, folder, &request, cancel).await?
        }
        BatchSelection::Tags => tagged_commits(git, folder, cancel).await?,
    };
    Ok(each_once(commits))
}

async fn verified_commits(
    git: &GitService<'_>,
    folder: &GitFolder,
    shas: &[CommitSha],
    cancel: &CancellationToken,
) -> CoreResult<Vec<CommitSha>> {
    for sha in shas {
        let revision = Revision::try_from(sha.as_str())
            .map_err(|error| CoreError::BadRequest(error.to_string()))?;
        match git.resolve_commit(folder, &revision, cancel).await {
            Err(error) if error.code() == ErrorCode::UnknownRevision => {
                return Err(CoreError::NotACommit {
                    commit: sha.to_string(),
                });
            }
            resolved => resolved?,
        };
    }
    Ok(shas.to_vec())
}

async fn walked_commits(
    git: &GitService<'_>,
    folder: &GitFolder,
    request: &RevListRequest,
    cancel: &CancellationToken,
) -> CoreResult<Vec<CommitSha>> {
    let mut commits = Vec::new();
    let mut sink = |batch: &[CommitSha]| {
        commits.extend_from_slice(batch);
        ControlFlow::Continue(())
    };
    git.rev_list(folder, request, cancel, &mut sink).await?;
    Ok(commits)
}

/// The commits tags point at, annotated tags peeled, newest tag first.
async fn tagged_commits(
    git: &GitService<'_>,
    folder: &GitFolder,
    cancel: &CancellationToken,
) -> CoreResult<Vec<CommitSha>> {
    let mut tags = git.refs(folder, cancel).await?.tags;
    tags.sort_by_key(|tag| std::cmp::Reverse(tag.created_at));
    Ok(tags
        .iter()
        .filter_map(|tag| CommitSha::try_from(tag.commit.as_str()).ok())
        .collect())
}

fn each_once(commits: Vec<CommitSha>) -> Vec<CommitSha> {
    let mut seen = HashSet::new();
    commits
        .into_iter()
        .filter(|commit| seen.insert(commit.clone()))
        .collect()
}

/// Splits the expanded commits into those with a commit snapshot of `profile_hash` and the rest, keeps
/// at most `MAX_BATCH_JOBS` of the rest, and estimates their duration from the folder's earlier commit
/// analyses.
pub fn plan_batch(
    expanded: Vec<CommitSha>,
    snapshots: &[SnapshotSummary],
    profile_hash: &str,
) -> BatchPlan {
    let analysed: HashSet<&str> = commit_analyses(snapshots)
        .filter(|snapshot| snapshot.profile_hash.as_deref() == Some(profile_hash))
        .filter_map(|snapshot| snapshot.commit.as_ref().map(|commit| commit.as_str()))
        .collect();
    let (already_analysed, mut to_analyse): (Vec<CommitSha>, Vec<CommitSha>) = expanded
        .into_iter()
        .partition(|commit| analysed.contains(commit.as_str()));
    let left_out = to_analyse.len().saturating_sub(MAX_BATCH_JOBS);
    to_analyse.truncate(MAX_BATCH_JOBS);
    let job_count = u64::try_from(to_analyse.len()).unwrap_or(u64::MAX);
    let estimated_duration_ms =
        mean_duration_ms(snapshots).map(|mean| mean.saturating_mul(job_count));
    BatchPlan {
        to_analyse,
        already_analysed,
        left_out: u32::try_from(left_out).unwrap_or(u32::MAX),
        estimated_duration_ms,
    }
}

fn commit_analyses(snapshots: &[SnapshotSummary]) -> impl Iterator<Item = &SnapshotSummary> {
    snapshots.iter().filter(|snapshot| {
        snapshot.source == SnapshotSource::Analysed && snapshot.target == Some(TargetKind::Commit)
    })
}

fn mean_duration_ms(snapshots: &[SnapshotSummary]) -> Option<u64> {
    let durations: Vec<u64> = commit_analyses(snapshots)
        .filter_map(|snapshot| snapshot.duration_ms)
        .collect();
    let count = u64::try_from(durations.len())
        .ok()
        .filter(|count| *count > 0)?;
    Some(durations.iter().sum::<u64>() / count)
}

#[cfg(test)]
mod tests {
    use codecharta_core_api::ids::{FolderId, ProjectId, SnapshotId};
    use codecharta_core_api::methods::snapshots::SnapshotRef;
    use codecharta_core_api::values::FullCommit;

    use super::*;

    const PROFILE: &str = "c0ffee00";
    const OTHER_PROFILE: &str = "0dd0dd00";

    fn sha(number: usize) -> CommitSha {
        CommitSha::try_from(format!("{number:040x}")).expect("a commit sha")
    }

    fn commit_analysis(number: usize, profile: &str, duration_ms: u64) -> SnapshotSummary {
        SnapshotSummary {
            snapshot_ref: SnapshotRef {
                project_id: ProjectId::try_from("p-1").expect("a project id"),
                folder_id: FolderId::try_from("f-1").expect("a folder id"),
                snapshot_id: SnapshotId::try_from(format!("{}-{profile}", sha(number)))
                    .expect("a snapshot id"),
            },
            source: SnapshotSource::Analysed,
            created_at: "2026-11-19T00:00:00Z".to_string(),
            commit: Some(FullCommit::try_from(sha(number).as_str()).expect("a full commit")),
            short_commit: None,
            subject: None,
            commit_date: None,
            dirty: false,
            original_file_name: None,
            file_modified_at: None,
            map_bytes: 1,
            checksum: None,
            profile_hash: Some(profile.to_string()),
            target: Some(TargetKind::Commit),
            finished_at: None,
            duration_ms: Some(duration_ms),
            not_in_map: Vec::new(),
        }
    }

    #[test]
    fn should_skip_analysed_commits() {
        // Arrange
        let expanded = vec![sha(1), sha(2), sha(3)];
        let snapshots = [
            commit_analysis(2, PROFILE, 1_000),
            commit_analysis(3, OTHER_PROFILE, 3_000),
        ];

        // Act
        let plan = plan_batch(expanded, &snapshots, PROFILE);

        // Assert
        assert_eq!(plan.to_analyse, [sha(1), sha(3)]);
        assert_eq!(plan.already_analysed, [sha(2)]);
        assert_eq!(plan.left_out, 0);
        assert_eq!(plan.estimated_duration_ms, Some(4_000));
    }

    #[test]
    fn should_cap_at_200() {
        // Arrange
        let expanded: Vec<CommitSha> = (1..=MAX_BATCH_JOBS + 5).map(sha).collect();
        let too_many = BatchSelection::Commits {
            shas: expanded.clone(),
        };

        // Act
        let plan = plan_batch(expanded, &[], PROFILE);
        let refused = validate_selection(&too_many);

        // Assert
        assert_eq!(plan.to_analyse.len(), 200);
        assert_eq!(plan.to_analyse.last(), Some(&sha(200)));
        assert_eq!(plan.left_out, 5);
        assert_eq!(plan.estimated_duration_ms, None);
        assert_eq!(refused.unwrap_err().code(), ErrorCode::BadRequest);
    }

    #[test]
    fn should_check_the_named_tip_or_the_folder_for_tags() {
        // Arrange
        let last = BatchSelection::LastCommits {
            tip_sha: sha(7),
            count: 3,
            first_parent_only: true,
        };

        // Act
        let targets = [
            preflight_target(&last),
            preflight_target(&BatchSelection::Tags),
        ];

        // Assert
        assert_eq!(
            targets,
            [
                AnalysisTarget::Commit { sha: sha(7) },
                AnalysisTarget::WorkingTree
            ]
        );
    }
}
