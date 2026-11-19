use std::cmp::Reverse;
use std::collections::HashSet;

use codecharta_core_api::ids::{ProjectId, SnapshotId, WORKING_TREE_SNAPSHOT_PREFIX};
use codecharta_core_api::methods::analysis::TargetKind;
use codecharta_core_api::methods::projects::{FolderKind, FolderRef, FolderStatus};
use codecharta_core_api::methods::snapshots::{
    FolderUsage, PrunePlan, PrunePolicy, PruneResult, SnapshotRef, SnapshotSource, SnapshotSummary,
    StoreUsage,
};
use tokio_util::sync::CancellationToken;

use super::nearest::commit_seconds;
use super::repository::{SnapshotRepository, no_such_snapshot};
use crate::analysis::queue::AnalysisQueue;
use crate::error::{CoreError, CoreResult};
use crate::git::{GitFolder, GitService};
use crate::projects::ProjectRepository;

/// Measuring, deleting and cleaning up snapshots. Deletions go to the recycle bin unless the request says
/// `permanently`; a snapshot a running analysis writes is never deleted, and nothing is pruned without a
/// request naming the snapshots.
pub struct Retention<'deps, 'core> {
    pub projects: &'deps ProjectRepository<'core>,
    pub snapshots: &'deps SnapshotRepository<'core>,
    pub git: &'deps GitService<'core>,
    pub queue: &'deps AnalysisQueue,
}

/// Snapshots a clean-up keeps whatever the counts say: those of these commits (branch tips and tags) and
/// these snapshots (the shown one, those being written).
#[derive(Debug, Default)]
pub struct Protected {
    pub commits: HashSet<String>,
    pub snapshots: HashSet<SnapshotId>,
}

impl Retention<'_, '_> {
    /// Per folder of the project, in the project's order.
    pub fn usage(&self, project_id: &ProjectId) -> CoreResult<StoreUsage> {
        let project = self.projects.read_record(project_id)?;
        let folders = project
            .folders
            .iter()
            .map(|folder| {
                self.folder_usage(&FolderRef {
                    project_id: project_id.clone(),
                    folder_id: folder.id.clone(),
                })
            })
            .collect::<CoreResult<Vec<FolderUsage>>>()?;
        Ok(StoreUsage {
            total_bytes: folders.iter().map(|folder| folder.bytes).sum(),
            folders,
        })
    }

    pub async fn delete(&self, snapshot: &SnapshotRef, permanently: bool) -> CoreResult<()> {
        self.ensure_not_being_written(snapshot)?;
        self.snapshots.delete(snapshot, permanently).await?;
        self.queue.announce_snapshots_changed(folder_of(snapshot));
        Ok(())
    }

    /// Lists what `policy` would remove; removes nothing.
    pub async fn plan_prune(
        &self,
        folder: &FolderRef,
        policy: &PrunePolicy,
        cancel: &CancellationToken,
    ) -> CoreResult<PrunePlan> {
        let snapshots = self.snapshots.list(folder)?;
        let protected = Protected {
            commits: self.protected_commits(folder, policy, cancel).await?,
            snapshots: self.protected_snapshots(folder)?,
        };
        let delete = select_for_pruning(&snapshots, policy, &protected);
        let freed_bytes = self.bytes_of(delete.iter().map(|snapshot| &snapshot.snapshot_ref))?;
        Ok(PrunePlan {
            keep: count(snapshots.len() - delete.len()),
            delete,
            freed_bytes,
        })
    }

    /// Removes exactly the named analysed snapshots, after checking all of them: an import is
    /// `BAD_REQUEST`, one being written `SNAPSHOT_BEING_WRITTEN`. A failure stops the clean-up; the
    /// snapshots removed before it stay removed.
    pub async fn prune(
        &self,
        folder: &FolderRef,
        snapshot_ids: &[SnapshotId],
        permanently: bool,
    ) -> CoreResult<PruneResult> {
        let targets = self.prunable(folder, snapshot_ids)?;
        let mut result = PruneResult {
            deleted: 0,
            freed_bytes: 0,
        };
        let removed = self.remove_all(&targets, permanently, &mut result).await;
        if result.deleted > 0 {
            self.queue.announce_snapshots_changed(folder.clone());
        }
        removed.map(|()| result)
    }

    async fn remove_all(
        &self,
        targets: &[SnapshotRef],
        permanently: bool,
        result: &mut PruneResult,
    ) -> CoreResult<()> {
        for snapshot in targets {
            let bytes = self.snapshots.bytes_on_disk(snapshot)?;
            self.snapshots.delete(snapshot, permanently).await?;
            result.deleted += 1;
            result.freed_bytes += bytes;
        }
        Ok(())
    }

    fn prunable(
        &self,
        folder: &FolderRef,
        snapshot_ids: &[SnapshotId],
    ) -> CoreResult<Vec<SnapshotRef>> {
        let listed = self.snapshots.list(folder)?;
        let mut targets: Vec<SnapshotRef> = Vec::new();
        for id in snapshot_ids {
            let snapshot = listed
                .iter()
                .find(|snapshot| snapshot.snapshot_ref.snapshot_id == *id)
                .ok_or_else(|| no_such_snapshot(&snapshot_ref(folder, id)))?;
            if snapshot.source == SnapshotSource::Imported {
                return Err(CoreError::BadRequest(format!(
                    "The imported snapshot {id} can only be deleted on its own, never by a clean-up."
                )));
            }
            self.ensure_not_being_written(&snapshot.snapshot_ref)?;
            if !targets.contains(&snapshot.snapshot_ref) {
                targets.push(snapshot.snapshot_ref.clone());
            }
        }
        Ok(targets)
    }

    fn folder_usage(&self, folder: &FolderRef) -> CoreResult<FolderUsage> {
        let snapshots = self.snapshots.list(folder)?;
        Ok(FolderUsage {
            folder_id: folder.folder_id.clone(),
            snapshot_count: count(snapshots.len()),
            bytes: self.bytes_of(snapshots.iter().map(|snapshot| &snapshot.snapshot_ref))?,
        })
    }

    fn bytes_of<'snapshot>(
        &self,
        snapshots: impl Iterator<Item = &'snapshot SnapshotRef>,
    ) -> CoreResult<u64> {
        snapshots
            .map(|snapshot| self.snapshots.bytes_on_disk(snapshot))
            .sum()
    }

    fn ensure_not_being_written(&self, snapshot: &SnapshotRef) -> CoreResult<()> {
        let written = self.queue.snapshots_being_written(&folder_of(snapshot));
        if !written.contains(&snapshot.snapshot_id) {
            return Ok(());
        }
        Err(CoreError::SnapshotBeingWritten {
            snapshot_id: snapshot.snapshot_id.to_string(),
        })
    }

    /// The commits of the folder's branches (local and remote) and tags; none for a folder without a
    /// usable repository, where no branch can point anywhere.
    async fn protected_commits(
        &self,
        folder: &FolderRef,
        policy: &PrunePolicy,
        cancel: &CancellationToken,
    ) -> CoreResult<HashSet<String>> {
        let resolved = self.projects.resolve_folder(folder)?;
        let has_repository =
            resolved.kind == FolderKind::Git && resolved.status == FolderStatus::Ok;
        if !policy.keep_branch_tips_and_tags || !has_repository {
            return Ok(HashSet::new());
        }
        let git_folder = GitFolder {
            path: resolved.path,
            repo: Some(folder.clone()),
        };
        let refs = self.git.refs(&git_folder, cancel).await?;
        let local = refs.local_branches.into_iter().map(|branch| branch.commit);
        let remote = refs.remote_branches.into_iter().map(|branch| branch.commit);
        let tagged = refs.tags.into_iter().map(|tag| tag.commit);
        Ok(local.chain(remote).chain(tagged).collect())
    }

    fn protected_snapshots(&self, folder: &FolderRef) -> CoreResult<HashSet<SnapshotId>> {
        let project = self.projects.read_record(&folder.project_id)?;
        let shown = project
            .view
            .shown_snapshot_id_by_folder
            .get(&folder.folder_id)
            .cloned();
        let written = self.queue.snapshots_being_written(folder);
        Ok(shown.into_iter().chain(written).collect())
    }
}

/// The analysed snapshots a clean-up removes: all but the newest commit and working-tree snapshots the
/// policy keeps and the protected ones. Imported snapshots are never listed.
pub fn select_for_pruning(
    snapshots: &[SnapshotSummary],
    policy: &PrunePolicy,
    protected: &Protected,
) -> Vec<SnapshotSummary> {
    let kept = kept_as_newest(snapshots, policy);
    let is_protected_commit = |snapshot: &SnapshotSummary| {
        policy.keep_branch_tips_and_tags
            && !is_working_tree(snapshot)
            && snapshot
                .commit
                .as_ref()
                .is_some_and(|commit| protected.commits.contains(commit.as_str()))
    };
    snapshots
        .iter()
        .filter(|snapshot| snapshot.source == SnapshotSource::Analysed)
        .filter(|snapshot| !kept.contains(&snapshot.snapshot_ref.snapshot_id))
        .filter(|snapshot| {
            !protected
                .snapshots
                .contains(&snapshot.snapshot_ref.snapshot_id)
        })
        .filter(|snapshot| !is_protected_commit(snapshot))
        .cloned()
        .collect()
}

fn kept_as_newest<'snapshot>(
    snapshots: &'snapshot [SnapshotSummary],
    policy: &PrunePolicy,
) -> HashSet<&'snapshot SnapshotId> {
    let (working_trees, commits): (Vec<&SnapshotSummary>, Vec<&SnapshotSummary>) = snapshots
        .iter()
        .filter(|snapshot| snapshot.source == SnapshotSource::Analysed)
        .partition(|snapshot| is_working_tree(snapshot));
    newest_commits(&commits, policy.keep_newest_commit_snapshots)
        .chain(newest_working_trees(
            &working_trees,
            policy.keep_newest_working_tree_snapshots,
        ))
        .collect()
}

/// Newest commit date first; snapshots of one commit by the time they entered the store.
fn newest_commits<'snapshot>(
    commits: &[&'snapshot SnapshotSummary],
    keep: u32,
) -> impl Iterator<Item = &'snapshot SnapshotId> {
    let mut ordered = commits.to_vec();
    ordered.sort_by_key(|snapshot| {
        let seconds = snapshot.commit_date.as_deref().and_then(commit_seconds);
        Reverse((seconds, snapshot.created_at.clone()))
    });
    first_ids(ordered, keep)
}

fn newest_working_trees<'snapshot>(
    working_trees: &[&'snapshot SnapshotSummary],
    keep: u32,
) -> impl Iterator<Item = &'snapshot SnapshotId> {
    let mut ordered = working_trees.to_vec();
    ordered.sort_by_key(|snapshot| Reverse(snapshot.created_at.clone()));
    first_ids(ordered, keep)
}

fn first_ids(ordered: Vec<&SnapshotSummary>, keep: u32) -> impl Iterator<Item = &SnapshotId> {
    let keep = usize::try_from(keep).unwrap_or(usize::MAX);
    ordered
        .into_iter()
        .take(keep)
        .map(|snapshot| &snapshot.snapshot_ref.snapshot_id)
}

fn is_working_tree(snapshot: &SnapshotSummary) -> bool {
    snapshot.target == Some(TargetKind::WorkingTree)
        || snapshot
            .snapshot_ref
            .snapshot_id
            .as_str()
            .starts_with(WORKING_TREE_SNAPSHOT_PREFIX)
}

fn folder_of(snapshot: &SnapshotRef) -> FolderRef {
    FolderRef {
        project_id: snapshot.project_id.clone(),
        folder_id: snapshot.folder_id.clone(),
    }
}

fn snapshot_ref(folder: &FolderRef, id: &SnapshotId) -> SnapshotRef {
    SnapshotRef {
        project_id: folder.project_id.clone(),
        folder_id: folder.folder_id.clone(),
        snapshot_id: id.clone(),
    }
}

fn count(length: usize) -> u32 {
    u32::try_from(length).unwrap_or(u32::MAX)
}
