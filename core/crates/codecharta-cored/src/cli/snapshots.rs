use std::path::PathBuf;
use std::process::ExitCode;

use clap::Subcommand;
use codecharta_core::recycle::SystemRecycler;
use codecharta_core::snapshots::{ImportOutcome, ImportRequest, SnapshotRepository};
use codecharta_core::store::Store;
use codecharta_core::{Core, CoreResult};
use codecharta_core_api::ids::{FolderId, ProjectId};
use codecharta_core_api::methods::projects::FolderRef;
use codecharta_core_api::methods::snapshots::{SnapshotSource, SnapshotSummary};
use codecharta_core_api::values::{CommitSha, FullCommit};
use serde::Serialize;

use super::arguments::{parse_commit_sha, parse_folder_id, parse_project_id};
use super::output::{exit_code_of, print_json};

const UNKNOWN: &str = "-";
const UNRESOLVED: &str = "none";

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
    /// Which snapshot to show for a commit (default: the working tree) of a project folder; answers
    /// `none` until the nearest-snapshot search exists
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
            commit: _,
            json,
        } => list(core, &folder_ref(project, folder)).and_then(|_| print_resolution(json)),
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

/// Plan 05-M5 brings the search; until then no snapshot is ever chosen.
fn print_resolution(json: bool) -> CoreResult<()> {
    if json {
        return print_json(&serde_json::json!({ "kind": UNRESOLVED }));
    }
    println!("{UNRESOLVED}");
    Ok(())
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
