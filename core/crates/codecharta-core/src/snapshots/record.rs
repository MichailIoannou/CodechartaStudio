use codecharta_core_api::ids::{FolderId, ProjectId, SnapshotId};
use codecharta_core_api::methods::projects::{AnalyserName, GitRemote};
use codecharta_core_api::methods::snapshots::{SnapshotRef, SnapshotSource, SnapshotSummary};
use codecharta_core_api::values::FullCommit;
use serde::{Deserialize, Serialize};

pub const SNAPSHOT_SCHEMA_VERSION: u32 = 1;

/// `snapshot.json` (overview section 5). `createdAt` is when the snapshot entered the store; an imported
/// map has `analysis: null` and an `imported` block instead.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotRecord {
    pub schema_version: u32,
    pub id: SnapshotId,
    pub project_id: ProjectId,
    pub folder_id: FolderId,
    pub source: SnapshotSource,
    pub created_at: String,
    pub git: Option<GitRecord>,
    pub hosting: Option<HostingRecord>,
    pub analysis: Option<AnalysisRecord>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub imported: Option<ImportedRecord>,
    pub map: MapRecord,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitRecord {
    pub commit: FullCommit,
    pub short_commit: String,
    pub subject: String,
    pub author_name: String,
    pub author_date: String,
    pub commit_date: String,
    pub parents: Vec<FullCommit>,
    pub branches_at_run: Vec<String>,
    pub tags_at_run: Vec<String>,
    pub head_at_run: Option<HeadAtRun>,
    pub dirty: bool,
    pub remotes: Vec<GitRemote>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HeadAtRun {
    pub branch: Option<String>,
    pub commit: FullCommit,
    pub upstream: Option<String>,
    pub ahead: u32,
    pub behind: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum HostingProvider {
    Github,
    Gitlab,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HostingRecord {
    pub provider: HostingProvider,
    pub repository: String,
    pub pull_requests: Vec<PullRequestRecord>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PullRequestRecord {
    pub number: u64,
    pub title: String,
    pub state: String,
    pub base_ref: String,
    pub head_ref: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisRecord {
    pub started_at: String,
    pub finished_at: String,
    pub duration_ms: u64,
    pub ccsh_version: String,
    pub java_version: Option<String>,
    pub profile: AnalysisProfileRecord,
    pub profile_hash: String,
    pub exit_code: i32,
    pub not_in_map: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisProfileRecord {
    pub without: Vec<AnalyserName>,
    pub exclude: Vec<String>,
    pub extra_args: Vec<String>,
}

/// `fileModifiedAt` is the file's date, never an analysis time; `contentSha256` is taken of the
/// uncompressed content, so a map and its gzip are one content.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedRecord {
    pub at: String,
    pub original_file_name: String,
    pub file_modified_at: String,
    pub content_sha256: String,
}

/// `checksum` and `rootName` stay null until the renderer parsed the map once: the core never parses it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MapRecord {
    pub file: String,
    pub bytes: u64,
    pub checksum: Option<String>,
    pub root_name: Option<String>,
}

impl SnapshotRecord {
    pub fn snapshot_ref(&self) -> SnapshotRef {
        SnapshotRef {
            project_id: self.project_id.clone(),
            folder_id: self.folder_id.clone(),
            snapshot_id: self.id.clone(),
        }
    }

    pub fn content_sha256(&self) -> Option<&str> {
        self.imported
            .as_ref()
            .map(|imported| imported.content_sha256.as_str())
    }

    pub fn to_summary(&self) -> SnapshotSummary {
        let git = self.git.as_ref();
        let imported = self.imported.as_ref();
        SnapshotSummary {
            snapshot_ref: self.snapshot_ref(),
            source: self.source,
            created_at: self.created_at.clone(),
            commit: git.map(|git| git.commit.clone()),
            short_commit: git.map(|git| git.short_commit.clone()),
            subject: git.map(|git| git.subject.clone()),
            commit_date: git.map(|git| git.commit_date.clone()),
            dirty: git.is_some_and(|git| git.dirty),
            original_file_name: imported.map(|imported| imported.original_file_name.clone()),
            file_modified_at: imported.map(|imported| imported.file_modified_at.clone()),
            map_bytes: self.map.bytes,
            checksum: self.map.checksum.clone(),
            profile_hash: self
                .analysis
                .as_ref()
                .map(|analysis| analysis.profile_hash.clone()),
        }
    }
}
