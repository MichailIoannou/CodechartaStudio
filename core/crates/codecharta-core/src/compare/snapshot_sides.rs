use codecharta_core_api::ids::SnapshotId;
use codecharta_core_api::methods::analysis::TargetKind;
use codecharta_core_api::methods::compare::{
    BaseMode, CompareIntent, ComparedCommit, ComparisonOrigin, RefInput, RefLabel, RefLabelKind,
    ResolveComparisonParams, ResolveStatus, ResolvedComparison, ResolvedSide, SideInput, SideKind,
    SideStatus,
};
use codecharta_core_api::methods::projects::FolderRef;
use codecharta_core_api::methods::snapshots::{SnapshotRef, SnapshotSource, SnapshotSummary};
use tokio_util::sync::CancellationToken;

use super::explicit::pick_typed;
use super::preflight::preflight;
use super::resolve::{CommitComparison, label};
use super::sides::SideLookup;
use crate::error::{CoreError, CoreResult};
use crate::git::GitFolder;

const NOT_EXPLICIT_MESSAGE: &str = "Only an explicit comparison can name a snapshot.";
const NO_CLONE_MESSAGE: &str = "a commit side was resolved without its clone";
const NOT_WORKING_TREE_MESSAGE: &str = "The snapshot is not an analysis of the working tree.";
const NOT_IMPORTED_MESSAGE: &str = "The snapshot is not an imported map.";
const WORKING_TREE_LABEL: &str = "working tree";
const IMPORTED_LABEL: &str = "imported";

/// The clones of the commit sides of a comparison that names a snapshot; a snapshot side needs none.
pub struct SnapshotSideFolders<'folders> {
    pub base: Option<&'folders GitFolder>,
    pub head: Option<&'folders GitFolder>,
}

impl<Sides: SideLookup + Sync> CommitComparison<'_, '_, Sides> {
    /// A working-tree or imported snapshot has no commit: the comparison is tip vs tip, with no merge base
    /// and no shared history to check.
    pub async fn resolve_with_snapshots(
        &self,
        folders: &SnapshotSideFolders<'_>,
        params: &ResolveComparisonParams,
        cancel: &CancellationToken,
    ) -> CoreResult<ResolvedComparison> {
        let CompareIntent::Explicit { base, head, .. } = &params.intent else {
            return Err(CoreError::BadRequest(NOT_EXPLICIT_MESSAGE.to_string()));
        };
        let base_side = self.resolve_side(base, folders.base, cancel).await?;
        let head_side = self.resolve_side(head, folders.head, cancel).await?;
        let status = if base_side.requested == head_side.requested {
            ResolveStatus::SameCommit
        } else {
            ResolveStatus::Ready
        };
        let origin = if base.folder == head.folder {
            ComparisonOrigin::Commits
        } else {
            ComparisonOrigin::Folders
        };
        let preflight = preflight(&base_side.status, &head_side.status, &self.limits);
        Ok(ResolvedComparison {
            status,
            origin,
            base_mode: BaseMode::Tip,
            base: base_side,
            head: head_side,
            base_tip: None,
            preflight,
        })
    }

    async fn resolve_side(
        &self,
        input: &SideInput,
        clone: Option<&GitFolder>,
        cancel: &CancellationToken,
    ) -> CoreResult<ResolvedSide> {
        match &input.rev {
            RefInput::Rev { .. } => {
                let clone =
                    clone.ok_or_else(|| CoreError::Internal(NO_CLONE_MESSAGE.to_string()))?;
                let picked = pick_typed(&self.history_in(clone, cancel), &input.rev).await?;
                self.side(&input.folder, picked, cancel).await
            }
            RefInput::WorkingTree { snapshot_id } => {
                self.snapshot_side(&input.folder, snapshot_id, SideKind::WorkingTree)
            }
            RefInput::Imported { snapshot_id } => {
                self.snapshot_side(&input.folder, snapshot_id, SideKind::Imported)
            }
        }
    }

    fn snapshot_side(
        &self,
        folder: &FolderRef,
        snapshot_id: &SnapshotId,
        kind: SideKind,
    ) -> CoreResult<ResolvedSide> {
        let snapshot = self.sides.snapshot(&SnapshotRef {
            project_id: folder.project_id.clone(),
            folder_id: folder.folder_id.clone(),
            snapshot_id: snapshot_id.clone(),
        })?;
        let requested = ComparedCommit {
            folder: folder.clone(),
            kind,
            commit: None,
            short_commit: None,
            snapshot_id: Some(snapshot_id.clone()),
            label: snapshot_label(kind, &snapshot)?,
        };
        Ok(ResolvedSide {
            requested,
            status: SideStatus::Exact { snapshot },
        })
    }
}

/// `BAD_REQUEST` when the snapshot is not of the kind the side names.
fn snapshot_label(kind: SideKind, snapshot: &SnapshotSummary) -> CoreResult<RefLabel> {
    match kind {
        SideKind::WorkingTree if snapshot.target == Some(TargetKind::WorkingTree) => {
            Ok(label(RefLabelKind::WorkingTree, WORKING_TREE_LABEL))
        }
        SideKind::Imported if snapshot.source == SnapshotSource::Imported => {
            let name = snapshot
                .original_file_name
                .as_deref()
                .unwrap_or(IMPORTED_LABEL);
            Ok(label(RefLabelKind::Imported, name))
        }
        SideKind::WorkingTree => Err(CoreError::BadRequest(NOT_WORKING_TREE_MESSAGE.to_string())),
        SideKind::Imported | SideKind::Commit => {
            Err(CoreError::BadRequest(NOT_IMPORTED_MESSAGE.to_string()))
        }
    }
}
