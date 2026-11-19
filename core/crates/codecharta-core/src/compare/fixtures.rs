use codecharta_core_api::ids::{FolderId, ProjectId, SnapshotId};
use codecharta_core_api::methods::analysis::TargetKind;
use codecharta_core_api::methods::snapshots::{SnapshotRef, SnapshotSource, SnapshotSummary};
use codecharta_core_api::values::FullCommit;

pub const PROFILE: &str = "c0ffee00";
const COMMIT: &str = "0123456789abcdef0123456789abcdef01234567";

/// An analysed snapshot of one commit, as the snapshot repository lists it.
pub fn analysed(checksum: &str, map_bytes: u64) -> SnapshotSummary {
    SnapshotSummary {
        snapshot_ref: SnapshotRef {
            project_id: ProjectId::try_from("p-1").expect("a project id"),
            folder_id: FolderId::try_from("f-1").expect("a folder id"),
            snapshot_id: SnapshotId::try_from(format!("{COMMIT}-{PROFILE}"))
                .expect("a snapshot id"),
        },
        source: SnapshotSource::Analysed,
        created_at: "2026-11-19T00:00:00Z".to_string(),
        commit: Some(FullCommit::try_from(COMMIT).expect("a full commit")),
        short_commit: Some(COMMIT[..7].to_string()),
        subject: Some("A commit".to_string()),
        commit_date: Some("2026-11-19T00:00:00Z".to_string()),
        dirty: false,
        original_file_name: None,
        file_modified_at: None,
        map_bytes,
        checksum: Some(checksum.to_string()),
        profile_hash: Some(PROFILE.to_string()),
        target: Some(TargetKind::Commit),
        finished_at: Some("2026-11-19T00:01:00Z".to_string()),
        duration_ms: Some(60_000),
        not_in_map: Vec::new(),
    }
}
