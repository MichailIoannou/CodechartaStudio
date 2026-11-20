use std::io;
use std::path::{Path, PathBuf};

use codecharta_core_api::methods::analysis::{
    AnalysisErrorCode, AnalysisTarget, JobError, PreflightProblem, PreflightResult, WarningCode,
};
use codecharta_core_api::methods::git::GitRepositoryInfo;
use codecharta_core_api::methods::projects::{AnalysisProfile, FolderKind};
use codecharta_core_api::methods::tools::{ToolId, ToolState, ToolsReport};
use codecharta_core_api::values::Revision;
use tokio_util::sync::CancellationToken;

use super::profile::validate_profile;
use crate::git::{GitFolder, GitService};

const MIB: u64 = 1024 * 1024;
/// The store needs room for the map and its log however small the earlier maps were.
pub const MIN_STORE_FREE_BYTES: u64 = 200 * MIB;
/// A new map of a folder is assumed to be at most this many times its largest earlier one.
pub const STORE_SPACE_FACTOR: u64 = 3;
/// A commit is checked out into a temporary worktree first.
pub const MIN_TEMP_FREE_BYTES: u64 = 1024 * MIB;
const TOOLS_HINT: &str = "Check the tools in the settings.";

/// Free space of the file system that holds `path`; stubbed in tests.
pub trait DiskSpace: Send + Sync {
    fn available(&self, path: &Path) -> io::Result<u64>;
}

pub struct SystemDiskSpace;

impl DiskSpace for SystemDiskSpace {
    fn available(&self, path: &Path) -> io::Result<u64> {
        fs4::available_space(path)
    }
}

/// Where an analysis writes: the store, and the temp folder a commit's worktree goes to.
#[derive(Debug, Clone)]
pub struct DiskPlaces {
    pub store: PathBuf,
    pub temp: PathBuf,
}

pub struct PreflightContext<'ctx> {
    pub tools: &'ctx ToolsReport,
    pub git: &'ctx GitService<'ctx>,
    pub disk: &'ctx dyn DiskSpace,
    pub places: &'ctx DiskPlaces,
}

pub struct PreflightSubject<'subject> {
    pub folder: &'subject GitFolder,
    pub kind: FolderKind,
    pub profile: &'subject AnalysisProfile,
    pub target: &'subject AnalysisTarget,
    pub largest_snapshot_bytes: u64,
}

/// Every check runs, so the user sees all problems at once; errors block, warnings do not.
pub async fn run_preflight(
    context: &PreflightContext<'_>,
    subject: &PreflightSubject<'_>,
) -> PreflightResult {
    let mut problems = tool_problems(context.tools);
    problems.extend(folder_problems(context, subject).await);
    if let Err(error) = validate_profile(subject.profile) {
        problems.push(PreflightProblem::error(error));
    }
    problems.extend(disk_problems(context, subject));
    PreflightResult::of(problems)
}

fn tool_problems(tools: &ToolsReport) -> Vec<PreflightProblem> {
    [
        tool_problem(tools, ToolId::Ccsh),
        tool_problem(tools, ToolId::Java),
    ]
    .into_iter()
    .flatten()
    .collect()
}

fn tool_problem(tools: &ToolsReport, tool: ToolId) -> Option<PreflightProblem> {
    let state = state_of(tools, tool);
    let (missing, too_old, name) = match tool {
        ToolId::Java => (
            AnalysisErrorCode::JavaNotFound,
            AnalysisErrorCode::JavaTooOld,
            "Java",
        ),
        _ => (
            AnalysisErrorCode::CcshNotFound,
            AnalysisErrorCode::CcshTooOld,
            "ccsh",
        ),
    };
    let error = match state {
        ToolState::Ok => return None,
        ToolState::TooOld => JobError::new(too_old, format!("{name} is too old for analyses.")),
        ToolState::Missing | ToolState::Failed => {
            JobError::new(missing, format!("{name} was not found or does not start."))
        }
    };
    Some(PreflightProblem::error(error.with_hint(TOOLS_HINT)))
}

fn state_of(tools: &ToolsReport, tool: ToolId) -> ToolState {
    tools
        .tools
        .iter()
        .find(|status| status.tool == tool)
        .map_or(ToolState::Missing, |status| status.state)
}

async fn folder_problems(
    context: &PreflightContext<'_>,
    subject: &PreflightSubject<'_>,
) -> Vec<PreflightProblem> {
    if !subject.folder.path.is_dir() {
        let message = format!("The folder {} is missing.", subject.folder.path.display());
        return vec![blocking(AnalysisErrorCode::FolderMissing, message)];
    }
    let is_commit = matches!(subject.target, AnalysisTarget::Commit { .. });
    if subject.kind == FolderKind::Plain && !is_commit {
        return Vec::new();
    }
    if state_of(context.tools, ToolId::Git) != ToolState::Ok {
        let error = JobError::new(AnalysisErrorCode::GitNotFound, "git was not found.");
        return vec![PreflightProblem::error(error.with_hint(TOOLS_HINT))];
    }
    repository_problems(context, subject).await
}

async fn repository_problems(
    context: &PreflightContext<'_>,
    subject: &PreflightSubject<'_>,
) -> Vec<PreflightProblem> {
    let cancel = CancellationToken::new();
    let Ok(repository) = context.git.repository_info(subject.folder, &cancel).await else {
        let message = format!(
            "The folder {} is not a git repository.",
            subject.folder.path.display()
        );
        return vec![blocking(AnalysisErrorCode::NotARepository, message)];
    };
    let mut problems = repository_warnings(&repository);
    if let AnalysisTarget::Commit { sha } = subject.target {
        let is_known = match Revision::try_from(sha.as_str()) {
            Ok(revision) => context
                .git
                .resolve_commit(subject.folder, &revision, &cancel)
                .await
                .is_ok(),
            Err(_) => false,
        };
        if !is_known {
            let message = format!("The commit {sha} is not in the local repository.");
            problems.push(PreflightProblem::error(
                JobError::new(AnalysisErrorCode::UnknownCommit, message)
                    .with_hint("Fetch the commit, then try again."),
            ));
        }
    }
    problems
}

fn repository_warnings(repository: &GitRepositoryInfo) -> Vec<PreflightProblem> {
    let mut warnings = Vec::new();
    if !repository.folder_prefix.is_empty() {
        warnings.push(PreflightProblem::warning(
            WarningCode::NotRepoRoot,
            "The folder is not the repository root, so the history metrics will be missing.",
        ));
    }
    if repository.is_shallow {
        warnings.push(PreflightProblem::warning(
            WarningCode::ShallowClone,
            "The repository is a shallow clone, so the history metrics cover only what was fetched.",
        ));
    }
    warnings
}

fn disk_problems(
    context: &PreflightContext<'_>,
    subject: &PreflightSubject<'_>,
) -> Vec<PreflightProblem> {
    let mut problems = Vec::new();
    let needed = MIN_STORE_FREE_BYTES.max(subject.largest_snapshot_bytes * STORE_SPACE_FACTOR);
    if available(context.disk, &context.places.store).is_some_and(|free| free < needed) {
        problems.push(PreflightProblem::error(
            JobError::new(
                AnalysisErrorCode::DiskFull,
                "There is not enough free space for the snapshot in the store.",
            )
            .with_hint("Free some space or move the store in the settings."),
        ));
    }
    let is_commit = matches!(subject.target, AnalysisTarget::Commit { .. });
    let temp_is_low = available(context.disk, &context.places.temp)
        .is_some_and(|free| free < MIN_TEMP_FREE_BYTES);
    if is_commit && temp_is_low {
        problems.push(PreflightProblem::warning(
            WarningCode::LowDiskSpace,
            "There is little free space for the temporary checkout of the commit.",
        ));
    }
    problems
}

/// An unknown amount of free space does not block: the run reports a full disk itself.
fn available(disk: &dyn DiskSpace, path: &Path) -> Option<u64> {
    disk.available(path)
        .inspect_err(|error| {
            tracing::warn!(
                "could not read the free space at {}: {error}",
                path.display()
            )
        })
        .ok()
}

fn blocking(code: AnalysisErrorCode, message: String) -> PreflightProblem {
    PreflightProblem::error(JobError::new(code, message))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_read_the_free_space_of_an_existing_folder() {
        // Arrange
        let folder = tempfile::tempdir().unwrap();

        // Act
        let free = SystemDiskSpace.available(folder.path());

        // Assert
        assert!(free.unwrap() > 0);
    }
}
