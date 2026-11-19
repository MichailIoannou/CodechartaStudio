use std::future::Future;

use codecharta_core_api::methods::analysis::AnalysisTarget;
use codecharta_core_api::methods::compare::{ComparedCommit, NearestSnapshot, SideStatus};
use codecharta_core_api::methods::snapshots::SnapshotResolution;
use tokio_util::sync::CancellationToken;

use crate::error::CoreResult;
use crate::snapshots::FolderResolver;

/// Which snapshot a side of a comparison has; the store answers through 05-M5's resolution.
pub trait SideLookup {
    fn status_of(
        &self,
        side: &ComparedCommit,
        cancel: &CancellationToken,
    ) -> impl Future<Output = CoreResult<SideStatus>> + Send;
}

impl SideLookup for FolderResolver<'_, '_> {
    async fn status_of(
        &self,
        side: &ComparedCommit,
        cancel: &CancellationToken,
    ) -> CoreResult<SideStatus> {
        let target = AnalysisTarget::Commit {
            sha: side.commit.clone(),
        };
        self.resolve(&side.folder, &target, cancel)
            .await
            .map(side_status)
    }
}

/// A side has a snapshot only when its own commit was analysed; any other snapshot is what "Use nearest"
/// would show. Without usable git the newest snapshot is no stand-in for a commit, so it is left out.
pub fn side_status(resolution: SnapshotResolution) -> SideStatus {
    match resolution {
        SnapshotResolution::Exact { snapshot, .. } => SideStatus::Exact { snapshot },
        SnapshotResolution::Nearest {
            snapshot,
            relation,
            behind,
            ahead,
            ..
        } => SideStatus::Missing {
            nearest: Some(NearestSnapshot {
                snapshot,
                relation,
                stale_by: behind.saturating_add(ahead),
                behind,
                ahead,
            }),
        },
        SnapshotResolution::Latest { .. } | SnapshotResolution::None { .. } => {
            SideStatus::Missing { nearest: None }
        }
    }
}

#[cfg(test)]
mod tests {
    use codecharta_core_api::methods::snapshots::{
        LatestReason, NoSnapshotReason, SnapshotRelation,
    };

    use super::*;
    use crate::compare::fixtures::analysed;

    #[test]
    fn should_mark_a_side_missing_without_a_snapshot() {
        // Arrange
        let resolutions = [
            SnapshotResolution::None {
                reason: NoSnapshotReason::NoSnapshots,
            },
            SnapshotResolution::Latest {
                snapshot: analysed("abc", 1),
                reason: LatestReason::GitUnavailable,
            },
        ];

        // Act
        let statuses: Vec<SideStatus> = resolutions.into_iter().map(side_status).collect();

        // Assert
        assert_eq!(statuses, vec![SideStatus::Missing { nearest: None }; 2]);
    }

    #[test]
    fn should_count_the_commits_on_both_sides_of_a_diverged_nearest_snapshot() {
        // Arrange
        let snapshot = analysed("abc", 1);
        let resolution = SnapshotResolution::Nearest {
            snapshot: snapshot.clone(),
            is_current_profile: true,
            relation: SnapshotRelation::Diverged,
            behind: 2,
            ahead: 3,
        };

        // Act
        let status = side_status(resolution);

        // Assert
        assert_eq!(
            status,
            SideStatus::Missing {
                nearest: Some(NearestSnapshot {
                    snapshot,
                    relation: SnapshotRelation::Diverged,
                    stale_by: 5,
                    behind: 2,
                    ahead: 3,
                }),
            }
        );
    }

    #[test]
    fn should_keep_the_exact_snapshot_of_another_profile() {
        // Arrange
        let snapshot = analysed("abc", 1);
        let resolution = SnapshotResolution::Exact {
            snapshot: snapshot.clone(),
            is_current_profile: false,
        };

        // Act
        let status = side_status(resolution);

        // Assert
        assert_eq!(status, SideStatus::Exact { snapshot });
    }
}
