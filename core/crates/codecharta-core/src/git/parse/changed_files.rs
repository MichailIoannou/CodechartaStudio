use std::collections::HashMap;

use codecharta_core_api::methods::git::{ChangeTotals, GitChangedFile, GitFileChange};

use crate::error::CoreResult;
use crate::git::error::parse_failed;
use crate::git::nul::split_nul_fields;

/// Both lists come from `diff-tree` with these options plus `--name-status` or `--numstat`.
pub const DIFF_TREE_ARGS: [&str; 6] = [
    "diff-tree",
    "-r",
    "-z",
    "--no-ext-diff",
    "--no-textconv",
    "-M",
];
pub const NAME_STATUS_ARG: &str = "--name-status";
pub const NUMSTAT_ARG: &str = "--numstat";
pub const MAX_LISTED_FILES: usize = 5000;

const WHAT: &str = "the changed files";
const NUMSTAT_SEPARATOR: char = '\t';
const BINARY_COUNT: &str = "-";
const STATUS_CHANGES: [(char, GitFileChange); 6] = [
    ('A', GitFileChange::Added),
    ('M', GitFileChange::Modified),
    ('D', GitFileChange::Deleted),
    ('R', GitFileChange::Renamed),
    ('C', GitFileChange::Copied),
    ('T', GitFileChange::TypeChanged),
];
const TWO_PATH_CHANGES: [GitFileChange; 2] = [GitFileChange::Renamed, GitFileChange::Copied];
const BINARY: LineCounts = LineCounts {
    insertions: None,
    deletions: None,
};

/// One entry of `--name-status -z`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NameStatus {
    pub change: GitFileChange,
    pub path: String,
    pub previous_path: Option<String>,
}

/// Insertions and deletions of one file of `--numstat -z`; `None` for a binary file.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct LineCounts {
    pub insertions: Option<u32>,
    pub deletions: Option<u32>,
}

/// The listed files, whether the list stops short of all of them, and totals over all of them.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ChangedFileList {
    pub files: Vec<GitChangedFile>,
    pub are_files_truncated: bool,
    pub totals: ChangeTotals,
}

/// `<status>\0<path>\0`, or `<status>\0<old>\0<new>\0` for a rename or copy.
pub fn parse_name_status(stdout: &str) -> CoreResult<Vec<NameStatus>> {
    let mut tokens = split_nul_fields(stdout).into_iter();
    let mut entries = Vec::new();
    while let Some(status) = tokens.next() {
        let change = change_of(status)?;
        let first = tokens.next().ok_or_else(|| parse_failed(WHAT))?;
        let entry = if TWO_PATH_CHANGES.contains(&change) {
            let second = tokens.next().ok_or_else(|| parse_failed(WHAT))?;
            NameStatus {
                change,
                path: second.to_string(),
                previous_path: Some(first.to_string()),
            }
        } else {
            NameStatus {
                change,
                path: first.to_string(),
                previous_path: None,
            }
        };
        entries.push(entry);
    }
    Ok(entries)
}

/// The first letter decides; a letter git may add later is `Unknown`, anything else a parse failure.
fn change_of(status: &str) -> CoreResult<GitFileChange> {
    let letter = status
        .chars()
        .next()
        .filter(char::is_ascii_uppercase)
        .ok_or_else(|| parse_failed(WHAT))?;
    Ok(STATUS_CHANGES
        .iter()
        .find(|(known, _)| *known == letter)
        .map_or(GitFileChange::Unknown, |(_, change)| *change))
}

/// `<ins>\t<del>\t<path>\0`, or `<ins>\t<del>\t\0<old>\0<new>\0` for a rename; keyed by the new path.
pub fn parse_numstat(stdout: &str) -> CoreResult<HashMap<String, LineCounts>> {
    let mut tokens = split_nul_fields(stdout).into_iter();
    let mut counts = HashMap::new();
    while let Some(token) = tokens.next() {
        let mut parts = token.splitn(3, NUMSTAT_SEPARATOR);
        let (Some(insertions), Some(deletions), Some(path)) =
            (parts.next(), parts.next(), parts.next())
        else {
            return Err(parse_failed(WHAT));
        };
        let path = if path.is_empty() {
            tokens.next().ok_or_else(|| parse_failed(WHAT))?;
            tokens.next().ok_or_else(|| parse_failed(WHAT))?
        } else {
            path
        };
        let line_counts = LineCounts {
            insertions: count_of(insertions)?,
            deletions: count_of(deletions)?,
        };
        counts.insert(path.to_string(), line_counts);
    }
    Ok(counts)
}

fn count_of(text: &str) -> CoreResult<Option<u32>> {
    if text == BINARY_COUNT {
        return Ok(None);
    }
    text.parse().map(Some).map_err(|_| parse_failed(WHAT))
}

/// Joins both lists by the new path, keeps at most `MAX_LISTED_FILES` and totals all of them.
pub fn join_changed_files(
    entries: Vec<NameStatus>,
    counts: &HashMap<String, LineCounts>,
) -> ChangedFileList {
    let files_changed = u32::try_from(entries.len()).unwrap_or(u32::MAX);
    let mut totals = ChangeTotals {
        files_changed,
        ..ChangeTotals::default()
    };
    let are_files_truncated = entries.len() > MAX_LISTED_FILES;
    let mut files = Vec::with_capacity(entries.len().min(MAX_LISTED_FILES));
    for entry in entries {
        let line_counts = counts.get(&entry.path).copied().unwrap_or(BINARY);
        totals.insertions += line_counts.insertions.unwrap_or_default();
        totals.deletions += line_counts.deletions.unwrap_or_default();
        if files.len() < MAX_LISTED_FILES {
            files.push(changed_file(entry, line_counts));
        }
    }
    ChangedFileList {
        files,
        are_files_truncated,
        totals,
    }
}

fn changed_file(entry: NameStatus, line_counts: LineCounts) -> GitChangedFile {
    GitChangedFile {
        change: entry.change,
        path: entry.path,
        previous_path: entry.previous_path,
        insertions: line_counts.insertions,
        deletions: line_counts.deletions,
    }
}

#[cfg(test)]
mod tests {
    use codecharta_core_api::error::ErrorCode;

    use super::*;

    const NAME_STATUS: &str = include_str!("testdata/diff_tree_name_status.txt");
    const NUMSTAT: &str = include_str!("testdata/diff_tree_numstat.txt");
    const RENAMED: &str = "c renamed ü.txt";

    fn changes(entries: &[NameStatus]) -> Vec<(GitFileChange, &str)> {
        entries
            .iter()
            .map(|entry| (entry.change, entry.path.as_str()))
            .collect()
    }

    #[test]
    fn should_parse_added_modified_deleted_and_renamed() {
        // Arrange
        let stdout = NAME_STATUS;

        // Act
        let entries = parse_name_status(stdout).unwrap();

        // Assert
        assert_eq!(
            changes(&entries),
            [
                (GitFileChange::Modified, "a.txt"),
                (GitFileChange::Deleted, "b.txt"),
                (GitFileChange::Renamed, RENAMED),
                (GitFileChange::Modified, "d.bin"),
                (GitFileChange::Added, "e.txt"),
            ]
        );
        assert_eq!(entries[2].previous_path.as_deref(), Some("c.txt"));
        assert_eq!(entries[0].previous_path, None);
    }

    #[test]
    fn should_join_numstat_by_the_new_path() {
        // Arrange
        let entries = parse_name_status(NAME_STATUS).unwrap();
        let counts = parse_numstat(NUMSTAT).unwrap();

        // Act
        let list = join_changed_files(entries, &counts);

        // Assert
        let renamed = &list.files[2];
        assert_eq!((renamed.insertions, renamed.deletions), (Some(0), Some(0)));
        assert_eq!(
            (list.files[0].insertions, list.files[0].deletions),
            (Some(3), Some(2))
        );
        assert_eq!(
            list.totals,
            ChangeTotals {
                files_changed: 5,
                insertions: 5,
                deletions: 3,
            }
        );
        assert!(!list.are_files_truncated);
    }

    #[test]
    fn should_list_every_file_of_a_root_commit_as_added() {
        // Arrange
        let stdout = include_str!("testdata/diff_tree_root_name_status.txt");

        // Act
        let entries = parse_name_status(stdout).unwrap();

        // Assert
        assert_eq!(
            changes(&entries),
            [
                (GitFileChange::Added, "a.txt"),
                (GitFileChange::Added, "b.txt"),
                (GitFileChange::Added, "c.txt"),
                (GitFileChange::Added, "d.bin"),
            ]
        );
    }

    #[test]
    fn should_count_a_binary_file_as_none() {
        // Arrange
        let stdout = NUMSTAT;

        // Act
        let counts = parse_numstat(stdout).unwrap();

        // Assert
        assert_eq!(
            counts["d.bin"],
            LineCounts {
                insertions: None,
                deletions: None,
            }
        );
    }

    #[test]
    fn should_fail_parse_on_a_missing_path_or_count() {
        // Arrange
        let missing_path = "M\0";
        let missing_count = "3\ta.txt\0";

        // Act
        let errors = [
            parse_name_status(missing_path).unwrap_err().code(),
            parse_numstat(missing_count).unwrap_err().code(),
            parse_name_status("?\0a\0").unwrap_err().code(),
        ];

        // Assert
        assert_eq!(errors, [ErrorCode::ParseFailed; 3]);
        assert_eq!(
            parse_name_status("X\0a\0").unwrap()[0].change,
            GitFileChange::Unknown
        );
    }
}
