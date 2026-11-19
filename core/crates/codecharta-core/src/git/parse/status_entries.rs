use codecharta_core_api::methods::git::{GitEntryKind, GitFileChange, GitWorkingTreeEntry};

use crate::error::CoreResult;
use crate::git::error::parse_failed;
use crate::git::nul::split_nul_fields;
use crate::git::parse::changed_files::{TWO_PATH_CHANGES, change_of_letter};

/// Every untracked file on its own line, so each one can be staged, shown and discarded by itself.
pub const WORKING_TREE_STATUS_ARGS: [&str; 5] = [
    "status",
    "--porcelain=v2",
    "-z",
    "--untracked-files=all",
    "--ignore-submodules=dirty",
];
pub const MAX_LISTED_ENTRIES: usize = 5000;

const WHAT: &str = "the working tree";
const HEADER_MARK: &str = "# ";
const UNCHANGED: char = '.';
const ORDINARY_FIELDS: usize = 9;
const RENAMED_FIELDS: usize = 10;
const UNMERGED_FIELDS: usize = 11;
const STATES_FIELD: usize = 1;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StatusEntries {
    pub entries: Vec<GitWorkingTreeEntry>,
    pub are_entries_truncated: bool,
}

/// The entries of `status --porcelain=v2 -z`, at most `MAX_LISTED_ENTRIES` of them.
pub fn parse_status_entries(stdout: &str) -> CoreResult<StatusEntries> {
    let mut tokens = split_nul_fields(stdout).into_iter();
    let mut entries = Vec::new();
    while let Some(token) = tokens.next() {
        if !token.starts_with(HEADER_MARK) {
            entries.extend(entries_of(token, &mut tokens)?);
        }
    }
    let are_entries_truncated = entries.len() > MAX_LISTED_ENTRIES;
    entries.truncate(MAX_LISTED_ENTRIES);
    Ok(StatusEntries {
        entries,
        are_entries_truncated,
    })
}

fn entries_of<'text>(
    token: &'text str,
    tokens: &mut impl Iterator<Item = &'text str>,
) -> CoreResult<Vec<GitWorkingTreeEntry>> {
    let (kind, rest) = token.split_once(' ').ok_or_else(|| parse_failed(WHAT))?;
    match kind {
        "1" => {
            let fields = fields_of(token, ORDINARY_FIELDS)?;
            changed_entries(fields[STATES_FIELD], fields[ORDINARY_FIELDS - 1], None)
        }
        "2" => {
            let fields = fields_of(token, RENAMED_FIELDS)?;
            let previous = tokens.next().ok_or_else(|| parse_failed(WHAT))?;
            changed_entries(
                fields[STATES_FIELD],
                fields[RENAMED_FIELDS - 1],
                Some(previous),
            )
        }
        "u" => {
            let fields = fields_of(token, UNMERGED_FIELDS)?;
            Ok(vec![conflicted_entry(
                fields[STATES_FIELD],
                fields[UNMERGED_FIELDS - 1],
            )])
        }
        "?" => Ok(vec![untracked_entry(rest)]),
        "!" => Ok(Vec::new()),
        _ => Err(parse_failed(WHAT)),
    }
}

/// The path is the last field and may itself contain spaces.
fn fields_of(token: &str, count: usize) -> CoreResult<Vec<&str>> {
    let fields: Vec<&str> = token.splitn(count, ' ').collect();
    if fields.len() == count {
        Ok(fields)
    } else {
        Err(parse_failed(WHAT))
    }
}

/// An index side (`X`) and a working-tree side (`Y`); each changed side is an entry of its own.
fn changed_entries(
    states: &str,
    path: &str,
    previous: Option<&str>,
) -> CoreResult<Vec<GitWorkingTreeEntry>> {
    let mut letters = states.chars();
    let (Some(index), Some(worktree)) = (letters.next(), letters.next()) else {
        return Err(parse_failed(WHAT));
    };
    let sides = [
        (index, GitEntryKind::Staged),
        (worktree, GitEntryKind::Unstaged),
    ];
    Ok(sides
        .into_iter()
        .filter(|(letter, _)| *letter != UNCHANGED)
        .map(|(letter, kind)| {
            let change = change_of_letter(letter);
            let previous_path = previous
                .filter(|_| TWO_PATH_CHANGES.contains(&change))
                .map(str::to_string);
            GitWorkingTreeEntry {
                path: path.to_string(),
                previous_path,
                kind,
                change,
                conflict: None,
            }
        })
        .collect())
}

fn conflicted_entry(states: &str, path: &str) -> GitWorkingTreeEntry {
    GitWorkingTreeEntry {
        path: path.to_string(),
        previous_path: None,
        kind: GitEntryKind::Conflicted,
        change: GitFileChange::Modified,
        conflict: Some(states.to_string()),
    }
}

fn untracked_entry(path: &str) -> GitWorkingTreeEntry {
    GitWorkingTreeEntry {
        path: path.to_string(),
        previous_path: None,
        kind: GitEntryKind::Untracked,
        change: GitFileChange::Added,
        conflict: None,
    }
}

#[cfg(test)]
mod tests {
    use codecharta_core_api::error::ErrorCode;

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

    fn listed(output: &str) -> Vec<GitWorkingTreeEntry> {
        parse_status_entries(output).unwrap().entries
    }

    #[test]
    fn should_list_a_file_changed_in_index_and_worktree_twice() {
        // Arrange
        let output = include_str!("testdata/status_ahead_behind.txt");

        // Act
        let entries = listed(output);

        // Assert
        let both: Vec<&GitWorkingTreeEntry> = entries
            .iter()
            .filter(|entry| entry.path == "l1.txt")
            .collect();
        assert_eq!(
            both,
            vec![
                &entry("l1.txt", GitEntryKind::Staged, GitFileChange::Modified),
                &entry("l1.txt", GitEntryKind::Unstaged, GitFileChange::Modified),
            ]
        );
        assert_eq!(entries.len(), 6);
    }

    #[test]
    fn should_list_a_rename_with_its_previous_path() {
        // Arrange
        let output = include_str!("testdata/status_ahead_behind.txt");

        // Act
        let entries = listed(output);

        // Assert
        let renamed = GitWorkingTreeEntry {
            previous_path: Some("d.txt".to_string()),
            ..entry("e.txt", GitEntryKind::Staged, GitFileChange::Renamed)
        };
        assert!(entries.contains(&renamed));
        assert!(entries.iter().all(|entry| entry.path != "d.txt"));
    }

    #[test]
    fn should_list_a_conflicted_file_with_its_code() {
        // Arrange
        let output = include_str!("testdata/status_conflict.txt");

        // Act
        let entries = listed(output);

        // Assert
        assert_eq!(
            entries,
            vec![
                entry("b.txt", GitEntryKind::Unstaged, GitFileChange::Modified),
                entry("c.txt", GitEntryKind::Staged, GitFileChange::Added),
                GitWorkingTreeEntry {
                    conflict: Some("UU".to_string()),
                    ..entry("a.txt", GitEntryKind::Conflicted, GitFileChange::Modified)
                },
                entry("u.txt", GitEntryKind::Untracked, GitFileChange::Added),
            ]
        );
    }

    #[test]
    fn should_list_an_untracked_file_with_spaces_in_its_path() {
        // Arrange
        let output = "1 .M N... 100644 100644 100644 63d8dbd40c23542e740659a7168a0ce3138ea748 \
                      63d8dbd40c23542e740659a7168a0ce3138ea748 dir/with space.txt\0? new [1].txt\0";

        // Act
        let entries = listed(output);

        // Assert
        assert_eq!(
            entries,
            vec![
                entry(
                    "dir/with space.txt",
                    GitEntryKind::Unstaged,
                    GitFileChange::Modified
                ),
                entry("new [1].txt", GitEntryKind::Untracked, GitFileChange::Added),
            ]
        );
    }

    #[test]
    fn should_stop_after_the_most_entries_listed() {
        // Arrange
        let output: String = (0..=MAX_LISTED_ENTRIES)
            .map(|number| format!("? file{number}.txt\0"))
            .collect();

        // Act
        let parsed = parse_status_entries(&output).unwrap();

        // Assert
        assert_eq!(parsed.entries.len(), MAX_LISTED_ENTRIES);
        assert!(parsed.are_entries_truncated);
    }

    #[test]
    fn should_fail_on_a_rename_without_its_previous_path() {
        // Arrange
        let output = "2 R. N... 100644 100644 100644 c59d9b6344f1af00e504ba698129f07a34bbed8d \
                      c59d9b6344f1af00e504ba698129f07a34bbed8d R100 e.txt\0";

        // Act
        let parsed = parse_status_entries(output);

        // Assert
        assert_eq!(parsed.unwrap_err().code(), ErrorCode::ParseFailed);
    }
}
