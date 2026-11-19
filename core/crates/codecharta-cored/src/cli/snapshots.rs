use std::path::PathBuf;
use std::process::ExitCode;

use clap::Subcommand;
use codecharta_core::projects::ProjectRepository;
use codecharta_core::recycle::SystemRecycler;
use codecharta_core::snapshots::{
    FolderResolver, ImportOutcome, ImportRequest, SnapshotRepository,
};
use codecharta_core::store::Store;
use codecharta_core::{Core, CoreResult};
use codecharta_core_api::ids::{FolderId, ProjectId};
use codecharta_core_api::methods::analysis::AnalysisTarget;
use codecharta_core_api::methods::projects::FolderRef;
use codecharta_core_api::methods::snapshots::{
    SnapshotResolution, SnapshotSource, SnapshotSummary,
};
use codecharta_core_api::values::{CommitSha, FullCommit};
use serde::Serialize;
use tokio_util::sync::CancellationToken;

use super::arguments::{parse_commit_sha, parse_folder_id, parse_project_id};
use super::output::{exit_code_of, print_json, wire_name};

const UNKNOWN: &str = "-";
const OTHER_PROFILE: &str = "other-profile";

#[derive(Debug, Subcommand)]
pub enum SnapshotsCommand {
    /// List the snapshots of a project folder, newest first; reads only, so it works while the app runs
    List {
        #[arg(long, value_parser = parse_project_id)]
        project: ProjectId,
        #[arg(long, value_parser = parse_folder_id)]
        folder: FolderId,
        /// Print the summaries as JSON
        #[arg(long)]
        json: bool,
    },
    /// Which snapshot to show for a commit (default: the working tree) of a project folder: the exact
    /// one, the nearest analysed commit, the newest (folders without git) or none; never analyses
    Resolve {
        #[arg(long, value_parser = parse_project_id)]
        project: ProjectId,
        #[arg(long, value_parser = parse_folder_id)]
        folder: FolderId,
        #[arg(long, value_parser = parse_commit_sha)]
        commit: Option<CommitSha>,
        /// Print the resolution as JSON
        #[arg(long)]
        json: bool,
    },
    /// Import a cc.json or cc.json.gz file into a project folder; content imported before is not copied
    /// again
    Import {
        #[arg(long, value_parser = parse_project_id)]
        project: ProjectId,
        #[arg(long, value_parser = parse_folder_id)]
        folder: FolderId,
        #[arg(long)]
        file: PathBuf,
        /// Bind the snapshot to this commit of the folder (all 40 hexadecimal digits)
        #[arg(long, value_parser = parse_full_commit)]
        bind_to_commit: Option<FullCommit>,
        /// Print the snapshot as JSON
        #[arg(long)]
        json: bool,
    },
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ImportedJson<'outcome> {
    snapshot: &'outcome SnapshotSummary,
    was_already_imported: bool,
}

pub fn run_snapshots(
    core: &Core,
    runtime: &tokio::runtime::Runtime,
    command: SnapshotsCommand,
) -> ExitCode {
    let printed = match command {
        SnapshotsCommand::List {
            project,
            folder,
            json,
        } => list(core, &folder_ref(project, folder))
            .and_then(|summaries| print_list(&summaries, json)),
        SnapshotsCommand::Resolve {
            project,
            folder,
            commit,
            json,
        } => runtime
            .block_on(resolve(core, &folder_ref(project, folder), commit))
            .and_then(|resolution| print_resolution(&resolution, json)),
        SnapshotsCommand::Import {
            project,
            folder,
            file,
            bind_to_commit,
            json,
        } => {
            let request = ImportRequest {
                target: folder_ref(project, folder),
                file,
                bind_to_commit,
            };
            runtime
                .block_on(import(core, request))
                .and_then(|outcome| print_import(&outcome, json))
        }
    };
    exit_code_of(printed)
}

fn list(core: &Core, folder: &FolderRef) -> CoreResult<Vec<SnapshotSummary>> {
    let store = Store::open_read_only(&core.paths().store_root())?;
    SnapshotRepository::new(&store, core.tools(), &SystemRecycler).list(folder)
}

/// Reads the store only, so it works while the app runs.
async fn resolve(
    core: &Core,
    folder: &FolderRef,
    commit: Option<CommitSha>,
) -> CoreResult<SnapshotResolution> {
    let store = Store::open_read_only(&core.paths().store_root())?;
    let target = commit.map_or(AnalysisTarget::WorkingTree, |sha| AnalysisTarget::Commit {
        sha,
    });
    let resolver = FolderResolver {
        projects: &ProjectRepository::new(&store, core.tools(), &SystemRecycler),
        snapshots: &SnapshotRepository::new(&store, core.tools(), &SystemRecycler),
        git: &core.git()?,
        cache: core.resolution_cache(),
    };
    resolver
        .resolve(folder, &target, &CancellationToken::new())
        .await
}

async fn import(core: &Core, request: ImportRequest) -> CoreResult<ImportOutcome> {
    let store = Store::open(&core.paths().store_root())?;
    SnapshotRepository::new(&store, core.tools(), &SystemRecycler)
        .import_file(request)
        .await
}

fn folder_ref(project_id: ProjectId, folder_id: FolderId) -> FolderRef {
    FolderRef {
        project_id,
        folder_id,
    }
}

fn print_list(summaries: &[SnapshotSummary], json: bool) -> CoreResult<()> {
    if json {
        return print_json(&summaries);
    }
    for summary in summaries {
        println!("{}", list_line(summary));
    }
    Ok(())
}

/// `<id>  <source>  <createdAt>  <short commit>  <file name>`, `-` for what is unknown.
fn list_line(summary: &SnapshotSummary) -> String {
    let source = match summary.source {
        SnapshotSource::Analysed => "analysed",
        SnapshotSource::Imported => "imported",
    };
    format!(
        "{}  {source}  {}  {}  {}",
        summary.snapshot_ref.snapshot_id,
        summary.created_at,
        summary.short_commit.as_deref().unwrap_or(UNKNOWN),
        summary.original_file_name.as_deref().unwrap_or(UNKNOWN),
    )
}

fn print_resolution(resolution: &SnapshotResolution, json: bool) -> CoreResult<()> {
    if json {
        return print_json(resolution);
    }
    println!("{}", resolution_line(resolution));
    Ok(())
}

/// `exact <id>`, `nearest <id> <relation> behind <n> ahead <n>`, `latest <id> <reason>` or `none <reason>`;
/// a snapshot of another profile (or an import) ends in `other-profile`.
fn resolution_line(resolution: &SnapshotResolution) -> String {
    match resolution {
        SnapshotResolution::Exact {
            snapshot,
            is_current_profile,
        } => with_profile(
            format!("exact  {}", snapshot.snapshot_ref.snapshot_id),
            *is_current_profile,
        ),
        SnapshotResolution::Nearest {
            snapshot,
            is_current_profile,
            relation,
            behind,
            ahead,
        } => with_profile(
            format!(
                "nearest  {}  {}  behind {behind}  ahead {ahead}",
                snapshot.snapshot_ref.snapshot_id,
                wire_name(relation)
            ),
            *is_current_profile,
        ),
        SnapshotResolution::Latest { snapshot, reason } => format!(
            "latest  {}  {}",
            snapshot.snapshot_ref.snapshot_id,
            wire_name(reason)
        ),
        SnapshotResolution::None { reason } => format!("none  {}", wire_name(reason)),
    }
}

fn with_profile(line: String, is_current_profile: bool) -> String {
    if is_current_profile {
        return line;
    }
    format!("{line}  {OTHER_PROFILE}")
}

/// Without `--json` only the snapshot id is printed; a note on stderr says when it existed already.
fn print_import(outcome: &ImportOutcome, json: bool) -> CoreResult<()> {
    if json {
        return print_json(&ImportedJson {
            snapshot: &outcome.snapshot,
            was_already_imported: outcome.was_already_imported,
        });
    }
    if outcome.was_already_imported {
        eprintln!("This content was imported before; nothing was copied.");
    }
    println!("{}", outcome.snapshot.snapshot_ref.snapshot_id);
    Ok(())
}

fn parse_full_commit(value: &str) -> Result<FullCommit, String> {
    FullCommit::try_from(value).map_err(|error| error.to_string())
}
