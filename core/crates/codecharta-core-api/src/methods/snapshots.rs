use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::ids::{FolderId, ProjectId, SnapshotId};
use crate::methods::analysis::{AnalysisTarget, TargetKind};
use crate::methods::projects::{
    FolderGitFacts, FolderKind, FolderRef, Project, ProjectIdParams, ResolvedCommit,
};
use crate::registry::method;
use crate::values::{CommitHash, FullCommit, MapChecksum, PickToken, ProjectName, RootName};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub enum SnapshotSource {
    Analysed,
    Imported,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SnapshotRef {
    pub project_id: ProjectId,
    pub folder_id: FolderId,
    pub snapshot_id: SnapshotId,
}

/// One snapshot as lists show it. An imported map has no analysis time: `createdAt` is when it entered
/// the store, `fileModifiedAt` only a hint, and `finishedAt`, `durationMs`, `profileHash` and `target`
/// are null.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotSummary {
    #[serde(rename = "ref")]
    pub snapshot_ref: SnapshotRef,
    pub source: SnapshotSource,
    pub created_at: String,
    pub commit: Option<FullCommit>,
    pub short_commit: Option<String>,
    pub subject: Option<String>,
    pub commit_date: Option<String>,
    pub dirty: bool,
    pub original_file_name: Option<String>,
    pub file_modified_at: Option<String>,
    pub map_bytes: u64,
    pub checksum: Option<String>,
    pub profile_hash: Option<String>,
    pub target: Option<TargetKind>,
    pub finished_at: Option<String>,
    pub duration_ms: Option<u64>,
    pub not_in_map: Vec<String>,
}

/// How the shown snapshot's commit relates to the asked one: `behind` counts the asked commit's commits
/// the snapshot lacks, `ahead` the snapshot's commits the asked one lacks.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub enum SnapshotRelation {
    Ancestor,
    Descendant,
    Diverged,
}

/// Why the newest snapshot is shown instead of one chosen by commit. Append-only.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum LatestReason {
    PlainFolder,
    GitUnavailable,
    RepositoryUnavailable,
}

/// Why no snapshot fits. Append-only.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum NoSnapshotReason {
    NoSnapshots,
    NoCommits,
    UnknownCommit,
    Unrelated,
}

/// Which snapshot to show for a commit or the working tree. `isCurrentProfile` is false for a snapshot
/// of another analysis profile and for an import, which has none.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum SnapshotResolution {
    Exact {
        snapshot: SnapshotSummary,
        is_current_profile: bool,
    },
    Nearest {
        snapshot: SnapshotSummary,
        is_current_profile: bool,
        relation: SnapshotRelation,
        behind: u32,
        ahead: u32,
    },
    Latest {
        snapshot: SnapshotSummary,
        reason: LatestReason,
    },
    None {
        reason: NoSnapshotReason,
    },
}

/// The commit a file name starts with, the way `ccsh analyse --commit` names its output.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct CommitHint {
    pub hash: CommitHash,
}

/// The folder an import file lies in, inspected like a picked folder; the token stands for its path.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ContainingFolder {
    pub pick_token: PickToken,
    pub path: String,
    pub suggested_name: ProjectName,
    pub kind: FolderKind,
    pub git: Option<FolderGitFacts>,
}

/// A project that already has the containing folder.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ExistingTarget {
    pub project_id: ProjectId,
    pub project_name: String,
    pub folder_id: FolderId,
}

/// What the shell shows after a native file pick; `importToken` stands for the file from then on.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct PickedImportFile {
    pub import_token: PickToken,
    pub file_name: String,
    pub size_bytes: u64,
    pub file_modified_at: String,
    pub commit_hint: Option<CommitHint>,
    pub containing_folder: ContainingFolder,
    pub hint_commit: Option<ResolvedCommit>,
    pub existing_target: Option<ExistingTarget>,
    pub duplicate_of: Option<SnapshotRef>,
}

/// The project a cc.json file was opened into and the snapshot it became (or already was).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct OpenedFile {
    pub project: Project,
    pub snapshot: SnapshotSummary,
    pub created_project: bool,
    pub was_already_imported: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotList {
    pub snapshots: Vec<SnapshotSummary>,
}

/// Where the gzip map of a snapshot is; only the shell gets it, and reads it after checking that it lies
/// inside the store root.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct MapLocation {
    pub path: String,
}

/// The captured ccsh output of an analysed snapshot or of a failed analysis.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotLog {
    pub log: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RecordMapFactsParams {
    pub project_id: ProjectId,
    pub folder_id: FolderId,
    pub snapshot_id: SnapshotId,
    pub checksum: MapChecksum,
    pub root_name: RootName,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct InspectImportFileParams {
    pub path: String,
}

/// `target: null` lets the file's folder decide the project (overview D12).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OpenFileParams {
    pub import_token: PickToken,
    pub target: Option<FolderRef>,
    pub bind_to_commit: Option<FullCommit>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ImportSnapshotParams {
    pub project_id: ProjectId,
    pub folder_id: FolderId,
    pub import_token: PickToken,
    pub bind_to_commit: Option<FullCommit>,
}

/// `toFolderId` equal to the snapshot's own folder with a `bindToCommit` binds it later.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MoveSnapshotParams {
    pub project_id: ProjectId,
    pub folder_id: FolderId,
    pub snapshot_id: SnapshotId,
    pub to_folder_id: FolderId,
    pub bind_to_commit: Option<FullCommit>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DeleteSnapshotParams {
    pub project_id: ProjectId,
    pub folder_id: FolderId,
    pub snapshot_id: SnapshotId,
    pub permanently: bool,
}

/// The space the snapshots of one project folder take: their maps and analysis logs.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct FolderUsage {
    pub folder_id: FolderId,
    pub snapshot_count: u32,
    pub bytes: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct StoreUsage {
    pub total_bytes: u64,
    pub folders: Vec<FolderUsage>,
}

pub const DEFAULT_KEEP_NEWEST_COMMIT_SNAPSHOTS: u32 = 50;
pub const DEFAULT_KEEP_NEWEST_WORKING_TREE_SNAPSHOTS: u32 = 3;

/// Which analysed snapshots a clean-up keeps; imported snapshots and the shown one are always kept.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PrunePolicy {
    pub keep_newest_commit_snapshots: u32,
    pub keep_newest_working_tree_snapshots: u32,
    pub keep_branch_tips_and_tags: bool,
}

impl Default for PrunePolicy {
    fn default() -> Self {
        Self {
            keep_newest_commit_snapshots: DEFAULT_KEEP_NEWEST_COMMIT_SNAPSHOTS,
            keep_newest_working_tree_snapshots: DEFAULT_KEEP_NEWEST_WORKING_TREE_SNAPSHOTS,
            keep_branch_tips_and_tags: true,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PlanPruneParams {
    pub project_id: ProjectId,
    pub folder_id: FolderId,
    pub policy: PrunePolicy,
}

impl PlanPruneParams {
    pub fn folder(&self) -> FolderRef {
        FolderRef {
            project_id: self.project_id.clone(),
            folder_id: self.folder_id.clone(),
        }
    }
}

/// What a clean-up with a policy would remove; nothing is removed until `snapshots.prune` names the ids.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct PrunePlan {
    pub delete: Vec<SnapshotSummary>,
    pub keep: u32,
    pub freed_bytes: u64,
}

/// Removes the listed analysed snapshots: to the recycle bin, or for good only with `permanently`, which
/// the renderer sends only after asking the user.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PruneParams {
    pub project_id: ProjectId,
    pub folder_id: FolderId,
    pub snapshot_ids: Vec<SnapshotId>,
    pub permanently: bool,
}

impl PruneParams {
    pub fn folder(&self) -> FolderRef {
        FolderRef {
            project_id: self.project_id.clone(),
            folder_id: self.folder_id.clone(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct PruneResult {
    pub deleted: u32,
    pub freed_bytes: u64,
}

/// Resolving never starts an analysis.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResolveForCommitParams {
    pub project_id: ProjectId,
    pub folder_id: FolderId,
    pub target: AnalysisTarget,
}

impl ResolveForCommitParams {
    pub fn folder(&self) -> FolderRef {
        FolderRef {
            project_id: self.project_id.clone(),
            folder_id: self.folder_id.clone(),
        }
    }
}

method!(
    SnapshotsList,
    "snapshots.list",
    Renderer,
    FolderRef,
    SnapshotList
);
method!(
    SnapshotsMapLocation,
    "snapshots.mapLocation",
    Shell,
    SnapshotRef,
    MapLocation
);
method!(
    SnapshotsRecordMapFacts,
    "snapshots.recordMapFacts",
    Renderer,
    RecordMapFactsParams,
    ()
);
method!(
    SnapshotsResolveForCommit,
    "snapshots.resolveForCommit",
    Renderer,
    ResolveForCommitParams,
    SnapshotResolution
);
method!(
    SnapshotsInspectImportFile,
    "snapshots.inspectImportFile",
    Shell,
    InspectImportFileParams,
    PickedImportFile
);
method!(
    SnapshotsOpenFile,
    "snapshots.openFile",
    Renderer,
    OpenFileParams,
    OpenedFile
);
method!(
    SnapshotsImport,
    "snapshots.import",
    Renderer,
    ImportSnapshotParams,
    SnapshotSummary
);
method!(
    SnapshotsMove,
    "snapshots.move",
    Renderer,
    MoveSnapshotParams,
    SnapshotSummary
);
method!(
    SnapshotsReadLog,
    "snapshots.readLog",
    Renderer,
    SnapshotRef,
    SnapshotLog
);
method!(
    SnapshotsDelete,
    "snapshots.delete",
    Renderer,
    DeleteSnapshotParams,
    ()
);

method!(
    SnapshotsUsage,
    "snapshots.usage",
    Renderer,
    ProjectIdParams,
    StoreUsage
);
method!(
    SnapshotsPlanPrune,
    "snapshots.planPrune",
    Renderer,
    PlanPruneParams,
    PrunePlan
);
method!(
    SnapshotsPrune,
    "snapshots.prune",
    Renderer,
    PruneParams,
    PruneResult
);

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn imported_summary() -> SnapshotSummary {
        SnapshotSummary {
            snapshot_ref: SnapshotRef {
                project_id: ProjectId::try_from("p-1").unwrap(),
                folder_id: FolderId::try_from("f-1").unwrap(),
                snapshot_id: SnapshotId::try_from("imported-0123456789abcdef").unwrap(),
            },
            source: SnapshotSource::Imported,
            created_at: "2026-11-18T00:00:00Z".to_string(),
            commit: None,
            short_commit: None,
            subject: None,
            commit_date: None,
            dirty: false,
            original_file_name: Some("map.cc.json".to_string()),
            file_modified_at: None,
            map_bytes: 1,
            checksum: None,
            profile_hash: None,
            target: None,
            finished_at: None,
            duration_ms: None,
            not_in_map: Vec::new(),
        }
    }

    #[test]
    fn should_write_the_snapshot_reference_as_ref() {
        // Arrange
        let summary = imported_summary();

        // Act
        let json = serde_json::to_value(summary).unwrap();

        // Assert
        assert_eq!(
            json["ref"],
            json!({ "projectId": "p-1", "folderId": "f-1", "snapshotId": "imported-0123456789abcdef" })
        );
        assert_eq!(json["source"], json!("imported"));
        assert_eq!(json["originalFileName"], json!("map.cc.json"));
    }

    #[test]
    fn should_write_the_default_prune_policy_in_camel_case() {
        // Arrange
        let policy = PrunePolicy::default();

        // Act
        let json = serde_json::to_value(policy).unwrap();

        // Assert
        assert_eq!(
            json,
            json!({
                "keepNewestCommitSnapshots": 50,
                "keepNewestWorkingTreeSnapshots": 3,
                "keepBranchTipsAndTags": true
            })
        );
    }

    #[test]
    fn should_write_a_resolution_with_its_kind_and_camel_case_fields() {
        // Arrange
        let nearest = SnapshotResolution::Nearest {
            snapshot: imported_summary(),
            is_current_profile: false,
            relation: SnapshotRelation::Diverged,
            behind: 2,
            ahead: 3,
        };
        let none = SnapshotResolution::None {
            reason: NoSnapshotReason::UnknownCommit,
        };

        // Act
        let nearest_json = serde_json::to_value(nearest).unwrap();
        let none_json = serde_json::to_value(none).unwrap();

        // Assert
        assert_eq!(nearest_json["kind"], json!("nearest"));
        assert_eq!(nearest_json["isCurrentProfile"], json!(false));
        assert_eq!(nearest_json["relation"], json!("diverged"));
        assert_eq!(nearest_json["behind"], json!(2));
        assert_eq!(nearest_json["ahead"], json!(3));
        assert_eq!(
            none_json,
            json!({ "kind": "none", "reason": "UNKNOWN_COMMIT" })
        );
    }
}
