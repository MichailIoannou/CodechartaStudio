use std::process::ExitCode;

use clap::Subcommand;
use codecharta_core::compare::{changed_files_in_project, resolve_in_project};
use codecharta_core::projects::ProjectRepository;
use codecharta_core::recycle::SystemRecycler;
use codecharta_core::snapshots::{FolderResolver, SnapshotRepository};
use codecharta_core::store::Store;
use codecharta_core::{Core, CoreResult};
use codecharta_core_api::ids::{FolderId, ProjectId};
use codecharta_core_api::methods::compare::{
    ChangedFilesParams, ChangedFilesResult, ChangedFilesSource, CompareIntent,
    ResolveComparisonParams, ResolveStatus, ResolvedComparison, ResolvedSide, SideStatus,
};
use codecharta_core_api::methods::git::GitFileChange;
use codecharta_core_api::methods::projects::FolderRef;
use codecharta_core_api::values::{CommitSha, Revision};
use tokio_util::sync::CancellationToken;

use super::arguments::{parse_commit_sha, parse_folder_id, parse_project_id};
use super::output::{exit_code_of, print_json, wire_name};

#[derive(Debug, Subcommand)]
pub enum CompareCommand {
    /// Which two commits of a project folder a comparison shows and the snapshot each has: the ancestor
    /// (else the older commit) is the base; never analyses
    Resolve {
        #[arg(long, value_parser = parse_project_id)]
        project: ProjectId,
        #[arg(long, value_parser = parse_folder_id)]
        folder: FolderId,
        /// HEAD, all 40 (or 64) hexadecimal digits of a commit, or a full ref name such as refs/heads/main
        #[arg(long, value_parser = parse_revision)]
        base: Revision,
        /// Like --base
        #[arg(long, value_parser = parse_revision)]
        head: Revision,
        /// Print the resolution as JSON, as `compare.resolve` answers it
        #[arg(long)]
        json: bool,
    },
    /// The files that changed between two commits, relative to the project folder; the base folder's
    /// clone is asked first, then the head folder's
    ChangedFiles {
        #[arg(long, value_parser = parse_project_id)]
        project: ProjectId,
        /// The folder holding the base commit
        #[arg(long, value_parser = parse_folder_id)]
        folder: FolderId,
        /// The folder holding the head commit; the base folder when omitted
        #[arg(long, value_parser = parse_folder_id)]
        head_folder: Option<FolderId>,
        /// All 40 (or 64) hexadecimal digits of the base commit
        #[arg(long, value_parser = parse_commit_sha)]
        base: CommitSha,
        /// All 40 (or 64) hexadecimal digits of the head commit
        #[arg(long, value_parser = parse_commit_sha)]
        head: CommitSha,
        /// Print the files as JSON, as `compare.changedFiles` answers them
        #[arg(long)]
        json: bool,
    },
}

pub fn run_compare(
    core: &Core,
    runtime: &tokio::runtime::Runtime,
    command: CompareCommand,
) -> ExitCode {
    match command {
        CompareCommand::Resolve {
            project,
            folder,
            base,
            head,
            json,
        } => run_resolve(core, runtime, (project, folder), (base, head), json),
        CompareCommand::ChangedFiles {
            project,
            folder,
            head_folder,
            base,
            head,
            json,
        } => {
            let head_folder = head_folder.unwrap_or_else(|| folder.clone());
            let params = ChangedFilesParams {
                base_folder: FolderRef {
                    project_id: project.clone(),
                    folder_id: folder,
                },
                head_folder: FolderRef {
                    project_id: project,
                    folder_id: head_folder,
                },
                base,
                head,
            };
            let printed = runtime
                .block_on(list_changed_files(core, &params))
                .and_then(|listed| print_changed_files(&listed, json));
            exit_code_of(printed)
        }
    }
}

fn run_resolve(
    core: &Core,
    runtime: &tokio::runtime::Runtime,
    folder: (ProjectId, FolderId),
    revisions: (Revision, Revision),
    json: bool,
) -> ExitCode {
    let (project, folder) = folder;
    let (base, head) = revisions;
    let params = ResolveComparisonParams {
        intent: CompareIntent::Commits {
            folder: FolderRef {
                project_id: project,
                folder_id: folder,
            },
            a: base,
            b: head,
        },
        shown_commit: None,
    };
    let printed = runtime
        .block_on(resolve(core, &params))
        .and_then(|comparison| print_comparison(&comparison, json));
    exit_code_of(printed)
}

/// Reads the store only, so it works while the app runs.
async fn resolve(core: &Core, params: &ResolveComparisonParams) -> CoreResult<ResolvedComparison> {
    let store = Store::open_read_only(&core.paths().store_root())?;
    let resolver = FolderResolver {
        projects: &ProjectRepository::new(&store, core.tools(), &SystemRecycler),
        snapshots: &SnapshotRepository::new(&store, core.tools(), &SystemRecycler),
        git: &core.git()?,
        cache: core.resolution_cache(),
    };
    resolve_in_project(&resolver, params, &CancellationToken::new()).await
}

/// Reads the store only, so it works while the app runs.
async fn list_changed_files(
    core: &Core,
    params: &ChangedFilesParams,
) -> CoreResult<ChangedFilesResult> {
    let store = Store::open_read_only(&core.paths().store_root())?;
    let projects = ProjectRepository::new(&store, core.tools(), &SystemRecycler);
    changed_files_in_project(&projects, &core.git()?, params, &CancellationToken::new()).await
}

/// The source, then one `<letter>  <path>` line per file; `R  <old> -> <new>` for a rename or copy.
fn print_changed_files(listed: &ChangedFilesResult, json: bool) -> CoreResult<()> {
    if json {
        return print_json(listed);
    }
    let source = match listed.source {
        ChangedFilesSource::Git => "git",
        ChangedFilesSource::Unavailable => "unavailable",
    };
    println!("{source}");
    for file in &listed.files {
        let letter = change_letter(file.change);
        match &file.previous_path {
            Some(previous) => println!("{letter}  {previous} -> {}", file.path),
            None => println!("{letter}  {}", file.path),
        }
    }
    Ok(())
}

fn change_letter(change: GitFileChange) -> char {
    match change {
        GitFileChange::Added => 'A',
        GitFileChange::Modified => 'M',
        GitFileChange::Deleted => 'D',
        GitFileChange::Renamed => 'R',
        GitFileChange::Copied => 'C',
        GitFileChange::TypeChanged => 'T',
        GitFileChange::Unknown => '?',
    }
}

fn print_comparison(comparison: &ResolvedComparison, json: bool) -> CoreResult<()> {
    if json {
        return print_json(comparison);
    }
    println!("{}", status_name(&comparison.status));
    println!("base  {}", side_line(&comparison.base));
    println!("head  {}", side_line(&comparison.head));
    println!("size  {}", size_line(comparison));
    Ok(())
}

/// `<short commit>  <label>  exact <id>`, `… nearest <id> <relation> stale by <n>` or `… missing`.
fn side_line(side: &ResolvedSide) -> String {
    let requested = &side.requested;
    let status = match &side.status {
        SideStatus::Exact { snapshot } => format!("exact {}", snapshot.snapshot_ref.snapshot_id),
        SideStatus::Missing {
            nearest: Some(nearest),
        } => format!(
            "nearest {} {} stale by {}",
            nearest.snapshot.snapshot_ref.snapshot_id,
            wire_name(&nearest.relation),
            nearest.stale_by
        ),
        SideStatus::Missing { nearest: None } => "missing".to_string(),
    };
    format!(
        "{}  {}  {status}",
        requested.short_commit, requested.label.name
    )
}

/// `<combined bytes> bytes <verdict>`, plus `identical` and `profiles-differ` when they apply.
fn size_line(comparison: &ResolvedComparison) -> String {
    let preflight = &comparison.preflight;
    let flags = [
        (preflight.identical_checksums, "  identical"),
        (preflight.profiles_differ, "  profiles-differ"),
    ];
    let suffix: String = flags
        .into_iter()
        .filter_map(|(applies, flag)| applies.then_some(flag))
        .collect();
    format!(
        "{} bytes {}{suffix}",
        preflight.combined_bytes,
        wire_name(&preflight.size_verdict)
    )
}

fn status_name(status: &ResolveStatus) -> String {
    match status {
        ResolveStatus::Ready => "ready".to_string(),
        ResolveStatus::SameCommit => "sameCommit".to_string(),
        ResolveStatus::NoCommonAncestor => "noCommonAncestor".to_string(),
        ResolveStatus::AlreadyMerged { target } => format!("alreadyMerged {target}"),
    }
}

fn parse_revision(value: &str) -> Result<Revision, String> {
    Revision::try_from(value).map_err(|error| error.to_string())
}
