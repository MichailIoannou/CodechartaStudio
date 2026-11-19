use std::path::{Path, PathBuf};

use codecharta_core_api::error::ErrorCode;
use codecharta_core_api::methods::git::{
    DiscardEntry, GitDiff, GitEntryKind, GitFileChange, GitStageTarget, GitStatus, GitWorkingTree,
    GitWorkingTreeEntry,
};
use codecharta_core_api::values::WorkingTreePath;
use tokio_util::sync::CancellationToken;

use super::command::{DIFF_LIMITS, GitCommand, QUERY_LIMITS, STATUS_LIMITS, WORKING_TREE_LIMITS};
use super::error::{command_failed, refused};
use super::locator::locate;
use super::operation::{Mutation, OperationContext, Settled};
use super::parse::status_entries::{StatusEntries, WORKING_TREE_STATUS_ARGS, parse_status_entries};
use super::runner::{FolderGit, GitCli};
use super::service::{GitFolder, GitService};
use crate::error::{CoreError, CoreResult};
use crate::store::paths::confine_entry_to_folder;

pub const MAX_PATHS_PER_REQUEST: usize = 1000;
pub const MAX_DIFF_TEXT_BYTES: usize = 2 * 1024 * 1024;

/// Paths go to git on its standard input, NUL-separated, so neither their number nor their spelling can
/// turn into options.
const PATHS_FROM_STDIN: [&str; 3] = ["--pathspec-from-file=-", "--pathspec-file-nul", "--"];
const PATH_TERMINATOR: char = '\0';
const ADD: [&str; 1] = ["add"];
const ADD_ALL: [&str; 2] = ["add", "-A"];
const RESTORE_INDEX: [&str; 2] = ["restore", "--staged"];
const RESTORE_WORKTREE: [&str; 2] = ["restore", "--worktree"];
const RESTORE_FROM_HEAD: [&str; 4] = ["restore", "--source=HEAD", "--staged", "--worktree"];
/// Without a commit there is nothing to restore the index from; `--force` only skips the check that the
/// file is unchanged, the working tree stays untouched.
const REMOVE_FROM_INDEX: [&str; 4] = ["rm", "--cached", "--force", "--quiet"];
const HEAD_COMMIT: [&str; 4] = ["rev-parse", "--verify", "--quiet", "HEAD^{commit}"];
const DIFF: [&str; 4] = ["diff", "--no-ext-diff", "--no-textconv", "--no-color"];
const STAGED_DIFF: [&str; 2] = ["--cached", "-M"];
const NO_INDEX: &str = "--no-index";
const END_OF_PATHS: &str = "--";
const NULL_FILE: &str = "/dev/null";
/// `diff --no-index` exits 1 when the files differ, which an untracked file always does.
const NO_INDEX_DIFFERENCES: i32 = 1;
const BINARY_PREFIX: &str = "Binary files ";
const BINARY_SUFFIX: &str = " differ";
const STAGEABLE: [GitEntryKind; 3] = [
    GitEntryKind::Unstaged,
    GitEntryKind::Untracked,
    GitEntryKind::Conflicted,
];
const UNSTAGEABLE: [GitEntryKind; 1] = [GitEntryKind::Staged];
const NEW_PATH_CHANGES: [GitFileChange; 3] = [
    GitFileChange::Added,
    GitFileChange::Renamed,
    GitFileChange::Copied,
];

impl GitService<'_> {
    /// Every change of the repository the folder belongs to, untracked files one by one.
    pub async fn working_tree(
        &self,
        folder: &GitFolder,
        cancel: &CancellationToken,
    ) -> CoreResult<GitWorkingTree> {
        let repository = locate(&self.git, &folder.path, cancel).await?;
        let root = Path::new(&repository.info.root_path);
        let (status, listing) = tokio::join!(
            self.status(folder, cancel),
            read_entries(&self.git, root, cancel)
        );
        Ok(working_tree_of(status?, listing?))
    }

    /// The diff of a listed entry: the index against the last commit, the working tree against the
    /// index, or an untracked file as added.
    pub async fn diff_file(
        &self,
        folder: &GitFolder,
        path: &WorkingTreePath,
        kind: GitEntryKind,
        cancel: &CancellationToken,
    ) -> CoreResult<GitDiff> {
        let repository = locate(&self.git, &folder.path, cancel).await?;
        let root = Path::new(&repository.info.root_path);
        let listing = read_entries(&self.git, root, cancel).await?;
        let entry = listed_entry(&listing.entries, path.as_str(), &[kind])?;
        let at_root = FolderGit {
            git: &self.git,
            folder: root,
            cancel,
        };
        diff_of(at_root, entry).await
    }

    pub async fn stage(
        &self,
        folder: &GitFolder,
        target: &GitStageTarget,
        context: &OperationContext<'_>,
    ) -> CoreResult<GitWorkingTree> {
        if let GitStageTarget::Paths { paths } = target {
            check_path_count(paths.len())?;
        }
        let repository = locate(&self.git, &folder.path, context.cancel).await?;
        let mutation = self.mutation(folder, &repository, context)?;
        let settled = self.operate(&mutation, stage(&mutation, target)).await?;
        Ok(settled_working_tree(settled))
    }

    pub async fn unstage(
        &self,
        folder: &GitFolder,
        paths: &[WorkingTreePath],
        context: &OperationContext<'_>,
    ) -> CoreResult<GitWorkingTree> {
        check_path_count(paths.len())?;
        let repository = locate(&self.git, &folder.path, context.cancel).await?;
        let mutation = self.mutation(folder, &repository, context)?;
        let settled = self.operate(&mutation, unstage(&mutation, paths)).await?;
        Ok(settled_working_tree(settled))
    }

    /// Never deletes a file for good: what the last commit does not have goes to the recycle bin.
    pub async fn discard(
        &self,
        folder: &GitFolder,
        rows: &[DiscardEntry],
        context: &OperationContext<'_>,
    ) -> CoreResult<GitWorkingTree> {
        check_path_count(rows.len())?;
        let repository = locate(&self.git, &folder.path, context.cancel).await?;
        let mutation = self.mutation(folder, &repository, context)?;
        let settled = self.operate(&mutation, discard(&mutation, rows)).await?;
        Ok(settled_working_tree(settled))
    }
}

pub fn check_path_count(count: usize) -> CoreResult<()> {
    if (1..=MAX_PATHS_PER_REQUEST).contains(&count) {
        Ok(())
    } else {
        Err(CoreError::BadRequest(format!(
            "Name 1 to {MAX_PATHS_PER_REQUEST} paths."
        )))
    }
}

pub async fn read_entries(
    git: &GitCli<'_>,
    root: &Path,
    cancel: &CancellationToken,
) -> CoreResult<StatusEntries> {
    let command = GitCommand::read(root, &WORKING_TREE_STATUS_ARGS, STATUS_LIMITS);
    parse_status_entries(&git.run(&command, cancel).await?)
}

fn working_tree_of(status: GitStatus, listing: StatusEntries) -> GitWorkingTree {
    GitWorkingTree {
        status,
        entries: listing.entries,
        are_entries_truncated: listing.are_entries_truncated,
    }
}

fn settled_working_tree(settled: Settled<StatusEntries>) -> GitWorkingTree {
    working_tree_of(settled.status, settled.value)
}

/// The entry listing `path` as one of `kinds`; a path no longer listed so is `CHANGED_SINCE_LISTED`.
fn listed_entry<'listing>(
    entries: &'listing [GitWorkingTreeEntry],
    path: &str,
    kinds: &[GitEntryKind],
) -> CoreResult<&'listing GitWorkingTreeEntry> {
    entries
        .iter()
        .find(|entry| entry.path == path && kinds.contains(&entry.kind))
        .ok_or_else(|| refused(ErrorCode::ChangedSinceListed))
}

fn listed_entries<'listing>(
    entries: &'listing [GitWorkingTreeEntry],
    paths: &[WorkingTreePath],
    kinds: &[GitEntryKind],
) -> CoreResult<Vec<&'listing GitWorkingTreeEntry>> {
    paths
        .iter()
        .map(|path| listed_entry(entries, path.as_str(), kinds))
        .collect()
}

/// A rename is staged or unstaged together with the deletion of its previous path.
fn paths_with_previous<'listing>(entries: &[&'listing GitWorkingTreeEntry]) -> Vec<&'listing str> {
    let mut paths = Vec::new();
    for entry in entries {
        paths.push(entry.path.as_str());
        if entry.change == GitFileChange::Renamed {
            paths.extend(entry.previous_path.as_deref());
        }
    }
    paths.dedup();
    paths
}

async fn listing(mutation: &Mutation<'_>) -> CoreResult<StatusEntries> {
    read_entries(mutation.git, mutation.root(), mutation.context.cancel).await
}

async fn run_on_paths(mutation: &Mutation<'_>, args: &[&str], paths: &[&str]) -> CoreResult<()> {
    if paths.is_empty() {
        return Ok(());
    }
    let mut full_args = args.to_vec();
    full_args.extend(PATHS_FROM_STDIN);
    let stdin: String = paths
        .iter()
        .map(|path| format!("{path}{PATH_TERMINATOR}"))
        .collect();
    let command = GitCommand::mutating(mutation.root(), &full_args, WORKING_TREE_LIMITS);
    mutation
        .run_command(&command.with_stdin(stdin))
        .await
        .map(drop)
}

async fn stage(mutation: &Mutation<'_>, target: &GitStageTarget) -> CoreResult<StatusEntries> {
    match target {
        GitStageTarget::All => {
            let command = GitCommand::mutating(mutation.root(), &ADD_ALL, WORKING_TREE_LIMITS);
            mutation.run_command(&command).await?;
        }
        GitStageTarget::Paths { paths } => {
            let before = listing(mutation).await?;
            let entries = listed_entries(&before.entries, paths, &STAGEABLE)?;
            run_on_paths(mutation, &ADD, &paths_with_previous(&entries)).await?;
        }
    }
    listing(mutation).await
}

async fn unstage(mutation: &Mutation<'_>, paths: &[WorkingTreePath]) -> CoreResult<StatusEntries> {
    let before = listing(mutation).await?;
    let entries = listed_entries(&before.entries, paths, &UNSTAGEABLE)?;
    unstage_paths(mutation, &paths_with_previous(&entries)).await?;
    listing(mutation).await
}

async fn unstage_paths(mutation: &Mutation<'_>, paths: &[&str]) -> CoreResult<()> {
    if paths.is_empty() {
        return Ok(());
    }
    let args: &[&str] = if has_commits(mutation).await? {
        &RESTORE_INDEX
    } else {
        &REMOVE_FROM_INDEX
    };
    run_on_paths(mutation, args, paths).await
}

async fn has_commits(mutation: &Mutation<'_>) -> CoreResult<bool> {
    let output = mutation.reads().run_raw(&HEAD_COMMIT, QUERY_LIMITS).await?;
    Ok(output.exit_code == 0)
}

/// Every check runs before anything changes; the recycle bin comes first, since it can be undone.
async fn discard(mutation: &Mutation<'_>, rows: &[DiscardEntry]) -> CoreResult<StatusEntries> {
    let before = listing(mutation).await?;
    let plan = DiscardPlan::of(&before.entries, rows)?;
    let recyclable = recyclable_files(mutation.root(), &plan.to_recycle)?;
    for file in &recyclable {
        mutation.recycler.recycle(file)?;
    }
    unstage_paths(mutation, &plan.out_of_index).await?;
    run_on_paths(mutation, &RESTORE_FROM_HEAD, &plan.to_head).await?;
    run_on_paths(mutation, &RESTORE_WORKTREE, &plan.from_index).await?;
    listing(mutation).await
}

/// Missing files have nothing to recycle; the others must lie inside the repository, through no
/// symbolic link leading out of it.
fn recyclable_files(root: &Path, paths: &[&str]) -> CoreResult<Vec<PathBuf>> {
    paths
        .iter()
        .filter(|path| root.join(path).symlink_metadata().is_ok())
        .map(|path| confine_entry_to_folder(root, path))
        .collect()
}

/// What discarding the named rows does to each path.
#[derive(Debug, Default, PartialEq, Eq)]
struct DiscardPlan<'listing> {
    /// Back to the last commit, in the index and the working tree.
    to_head: Vec<&'listing str>,
    /// The working tree back to the index.
    from_index: Vec<&'listing str>,
    /// Paths the last commit does not have, taken out of the index.
    out_of_index: Vec<&'listing str>,
    to_recycle: Vec<&'listing str>,
}

impl<'listing> DiscardPlan<'listing> {
    fn of(entries: &'listing [GitWorkingTreeEntry], rows: &[DiscardEntry]) -> CoreResult<Self> {
        let named = named_entries(entries, rows)?;
        refuse_staged_without_unstaged(entries, rows)?;
        let mut plan = Self::default();
        for entry in named {
            plan.add(entry)?;
        }
        let restored_otherwise = [plan.to_head.clone(), plan.out_of_index.clone()].concat();
        plan.from_index
            .retain(|path| !restored_otherwise.contains(path));
        Ok(plan)
    }

    fn add(&mut self, entry: &'listing GitWorkingTreeEntry) -> CoreResult<()> {
        let path = entry.path.as_str();
        match entry.kind {
            GitEntryKind::Conflicted => return Err(conflicted_not_discardable()),
            GitEntryKind::Untracked => self.to_recycle.push(path),
            _ if NEW_PATH_CHANGES.contains(&entry.change) => self.add_new_path(entry),
            GitEntryKind::Staged => self.to_head.push(path),
            GitEntryKind::Unstaged => self.from_index.push(path),
        }
        Ok(())
    }

    /// The new path of an addition, rename or copy leaves the index for the recycle bin; the previous
    /// path of a rename comes back.
    fn add_new_path(&mut self, entry: &'listing GitWorkingTreeEntry) {
        self.out_of_index.push(&entry.path);
        self.to_recycle.push(&entry.path);
        let previous = entry
            .previous_path
            .as_deref()
            .filter(|_| entry.change == GitFileChange::Renamed);
        let restored = if entry.kind == GitEntryKind::Staged {
            &mut self.to_head
        } else {
            &mut self.from_index
        };
        restored.extend(previous);
    }
}

fn named_entries<'listing>(
    entries: &'listing [GitWorkingTreeEntry],
    rows: &[DiscardEntry],
) -> CoreResult<Vec<&'listing GitWorkingTreeEntry>> {
    rows.iter()
        .map(|row| {
            listed_entry(entries, row.path.as_str(), &[row.kind])
                .ok()
                .filter(|entry| entry.change == row.change)
                .ok_or_else(|| refused(ErrorCode::ChangedSinceListed))
        })
        .collect()
}

/// Discarding a staged change returns the file to the last commit, which would also drop an unstaged
/// change the user did not name.
fn refuse_staged_without_unstaged(
    entries: &[GitWorkingTreeEntry],
    rows: &[DiscardEntry],
) -> CoreResult<()> {
    let is_named = |path: &str, kind: GitEntryKind| {
        rows.iter()
            .any(|row| row.path.as_str() == path && row.kind == kind)
    };
    let unnamed_unstaged = rows
        .iter()
        .filter(|row| row.kind == GitEntryKind::Staged)
        .any(|row| {
            let path = row.path.as_str();
            listed_entry(entries, path, &[GitEntryKind::Unstaged]).is_ok()
                && !is_named(path, GitEntryKind::Unstaged)
        });
    if unnamed_unstaged {
        return Err(CoreError::NotAllowed(
            "Discarding a staged change returns the file to the last commit; name its unstaged change too."
                .to_string(),
        ));
    }
    Ok(())
}

fn conflicted_not_discardable() -> CoreError {
    CoreError::NotAllowed(
        "A conflicted file cannot be discarded; resolve it or abort the merge or rebase."
            .to_string(),
    )
}

async fn diff_of(at_root: FolderGit<'_>, entry: &GitWorkingTreeEntry) -> CoreResult<GitDiff> {
    let args = diff_args(entry);
    let output = at_root.run_raw(&args, DIFF_LIMITS).await?;
    let is_untracked = entry.kind == GitEntryKind::Untracked;
    let accepted =
        output.exit_code == 0 || (is_untracked && output.exit_code == NO_INDEX_DIFFERENCES);
    if !accepted {
        return Err(command_failed(&output));
    }
    Ok(diff_from_text(&entry.path, &output.stdout))
}

/// A rename's previous path goes along, so git pairs the two.
fn diff_args(entry: &GitWorkingTreeEntry) -> Vec<&str> {
    let mut args = DIFF.to_vec();
    match entry.kind {
        GitEntryKind::Untracked => {
            args.extend([NO_INDEX, END_OF_PATHS, NULL_FILE, &entry.path]);
            return args;
        }
        GitEntryKind::Staged => args.extend(STAGED_DIFF),
        GitEntryKind::Unstaged | GitEntryKind::Conflicted => {}
    }
    args.extend([END_OF_PATHS, &entry.path]);
    args.extend(entry.previous_path.as_deref());
    args
}

pub fn diff_from_text(path: &str, text: &str) -> GitDiff {
    let is_truncated = text.len() > MAX_DIFF_TEXT_BYTES;
    let kept = if is_truncated {
        cut_after_last_line(text, MAX_DIFF_TEXT_BYTES)
    } else {
        text
    };
    GitDiff {
        path: path.to_string(),
        text: kept.to_string(),
        is_binary: kept
            .lines()
            .any(|line| line.starts_with(BINARY_PREFIX) && line.ends_with(BINARY_SUFFIX)),
        is_truncated,
    }
}

/// The whole lines within the first `max_bytes`.
fn cut_after_last_line(text: &str, max_bytes: usize) -> &str {
    let mut end = max_bytes.min(text.len());
    while !text.is_char_boundary(end) {
        end -= 1;
    }
    let head = &text[..end];
    head.rfind('\n').map_or("", |newline| &head[..=newline])
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(path: &str, kind: GitEntryKind, change: GitFileChange) -> GitWorkingTreeEntry {
        GitWorkingTreeEntry {
            path: path.to_string(),
            previous_path: None,
            kind,
            change,
            conflict: None,
        }
    }

    fn row(path: &str, kind: GitEntryKind, change: GitFileChange) -> DiscardEntry {
        DiscardEntry {
            path: WorkingTreePath::try_from(path).unwrap(),
            kind,
            change,
        }
    }

    #[test]
    fn should_plan_a_staged_addition_with_an_unstaged_change_for_the_recycle_bin_only() {
        // Arrange
        let entries = [
            entry("n.txt", GitEntryKind::Staged, GitFileChange::Added),
            entry("n.txt", GitEntryKind::Unstaged, GitFileChange::Modified),
        ];
        let rows = [
            row("n.txt", GitEntryKind::Staged, GitFileChange::Added),
            row("n.txt", GitEntryKind::Unstaged, GitFileChange::Modified),
        ];

        // Act
        let plan = DiscardPlan::of(&entries, &rows).unwrap();

        // Assert
        assert_eq!(
            plan,
            DiscardPlan {
                to_head: Vec::new(),
                from_index: Vec::new(),
                out_of_index: vec!["n.txt"],
                to_recycle: vec!["n.txt"],
            }
        );
    }

    #[test]
    fn should_plan_an_unstaged_rename_back_from_the_index() {
        // Arrange
        let renamed = GitWorkingTreeEntry {
            previous_path: Some("old.txt".to_string()),
            ..entry("new.txt", GitEntryKind::Unstaged, GitFileChange::Renamed)
        };
        let rows = [row(
            "new.txt",
            GitEntryKind::Unstaged,
            GitFileChange::Renamed,
        )];

        // Act
        let plan = DiscardPlan::of(std::slice::from_ref(&renamed), &rows).unwrap();

        // Assert
        assert_eq!(plan.from_index, vec!["old.txt"]);
        assert_eq!(plan.out_of_index, vec!["new.txt"]);
        assert_eq!(plan.to_recycle, vec!["new.txt"]);
        assert!(plan.to_head.is_empty());
    }

    #[test]
    fn should_cut_a_long_diff_after_its_last_whole_line() {
        // Arrange
        let line = "+ü line\n";
        let text = line.repeat(MAX_DIFF_TEXT_BYTES / line.len() + 2);

        // Act
        let diff = diff_from_text("a.txt", &text);

        // Assert
        assert!(diff.is_truncated);
        assert!(diff.text.len() <= MAX_DIFF_TEXT_BYTES);
        assert!(diff.text.ends_with(line));
        assert!(!diff.is_binary);
    }

    #[test]
    fn should_flag_binary_files() {
        // Arrange
        let text = "diff --git a/x.bin b/x.bin\nBinary files /dev/null and b/x.bin differ\n";

        // Act
        let diff = diff_from_text("x.bin", text);

        // Assert
        assert!(diff.is_binary);
        assert!(!diff.is_truncated);
    }

    #[test]
    fn should_refuse_more_paths_than_allowed_and_none() {
        // Arrange
        let counts = [0, MAX_PATHS_PER_REQUEST + 1];

        // Act
        let refused = counts.map(|count| check_path_count(count).is_err());

        // Assert
        assert_eq!(refused, [true, true]);
        assert!(check_path_count(MAX_PATHS_PER_REQUEST).is_ok());
    }
}
