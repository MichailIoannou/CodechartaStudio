use codecharta_core_api::methods::git::{GitHead, OperationInProgress, StatusCounts};

use crate::error::CoreResult;
use crate::git::error::parse_failed;
use crate::git::nul_separated::split_nul_fields;

pub const STATUS_ARGS: [&str; 6] = [
    "status",
    "--porcelain=v2",
    "--branch",
    "-z",
    "--untracked-files=normal",
    "--ignore-submodules=dirty",
];

const WHAT: &str = "the status";
const OID_HEADER: &str = "# branch.oid ";
const HEAD_HEADER: &str = "# branch.head ";
const UPSTREAM_HEADER: &str = "# branch.upstream ";
const AHEAD_BEHIND_HEADER: &str = "# branch.ab ";
const HEADER_MARK: &str = "# ";
const INITIAL_OID: &str = "(initial)";
const DETACHED_HEAD: &str = "(detached)";
const UNCHANGED: char = '.';
const ENTRY_TOKENS: usize = 1;
const RENAME_ENTRY_TOKENS: usize = 2;

/// Files in the worktree's git folder that tell which operation stopped half-way, in the order checked.
const OPERATION_MARKERS: [(&str, OperationInProgress); 6] = [
    ("rebase-merge", OperationInProgress::Rebase),
    ("rebase-apply", OperationInProgress::Rebase),
    ("MERGE_HEAD", OperationInProgress::Merge),
    ("CHERRY_PICK_HEAD", OperationInProgress::CherryPick),
    ("REVERT_HEAD", OperationInProgress::Revert),
    ("BISECT_LOG", OperationInProgress::Bisect),
];

/// The branch line of `status`; `ahead_behind` is missing when the upstream is gone.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StatusUpstream {
    pub name: String,
    pub ahead_behind: Option<(u32, u32)>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StatusSummary {
    pub head: GitHead,
    pub upstream: Option<StatusUpstream>,
    pub counts: StatusCounts,
}

#[derive(Debug, Default)]
struct Headers {
    oid: Option<String>,
    head: Option<String>,
    upstream: Option<String>,
    ahead_behind: Option<(u32, u32)>,
}

pub fn parse_status(stdout: &str) -> CoreResult<StatusSummary> {
    let tokens = split_nul_fields(stdout);
    let mut headers = Headers::default();
    let mut counts = StatusCounts::default();
    let mut index = 0;
    while let Some(token) = tokens.get(index) {
        index += if token.starts_with(HEADER_MARK) {
            read_header(token, &mut headers)?;
            ENTRY_TOKENS
        } else {
            count_entry(token, &mut counts)?
        };
    }
    Ok(StatusSummary {
        head: head_of(&headers)?,
        upstream: headers.upstream.map(|name| StatusUpstream {
            name,
            ahead_behind: headers.ahead_behind,
        }),
        counts,
    })
}

fn read_header(token: &str, headers: &mut Headers) -> CoreResult<()> {
    if let Some(oid) = token.strip_prefix(OID_HEADER) {
        headers.oid = (oid != INITIAL_OID).then(|| oid.to_string());
    } else if let Some(head) = token.strip_prefix(HEAD_HEADER) {
        headers.head = Some(head.to_string());
    } else if let Some(upstream) = token.strip_prefix(UPSTREAM_HEADER) {
        headers.upstream = Some(upstream.to_string());
    } else if let Some(counts) = token.strip_prefix(AHEAD_BEHIND_HEADER) {
        headers.ahead_behind = Some(parse_ahead_behind(counts)?);
    }
    Ok(())
}

fn parse_ahead_behind(counts: &str) -> CoreResult<(u32, u32)> {
    let parsed = counts.split_once(' ').and_then(|(ahead, behind)| {
        let ahead = ahead.strip_prefix('+')?.parse().ok()?;
        let behind = behind.strip_prefix('-')?.parse().ok()?;
        Some((ahead, behind))
    });
    parsed.ok_or_else(|| parse_failed(WHAT))
}

/// Counts one entry and answers how many tokens it took: a rename or copy is followed by its old path.
fn count_entry(token: &str, counts: &mut StatusCounts) -> CoreResult<usize> {
    let (kind, rest) = token.split_once(' ').ok_or_else(|| parse_failed(WHAT))?;
    match kind {
        "1" | "2" => {
            count_changed(rest, counts)?;
            Ok(if kind == "2" {
                RENAME_ENTRY_TOKENS
            } else {
                ENTRY_TOKENS
            })
        }
        "u" => {
            counts.conflicted += 1;
            Ok(ENTRY_TOKENS)
        }
        "?" => {
            counts.untracked += 1;
            Ok(ENTRY_TOKENS)
        }
        "!" => Ok(ENTRY_TOKENS),
        _ => Err(parse_failed(WHAT)),
    }
}

fn count_changed(rest: &str, counts: &mut StatusCounts) -> CoreResult<()> {
    let mut states = rest.chars();
    let (Some(staged), Some(unstaged)) = (states.next(), states.next()) else {
        return Err(parse_failed(WHAT));
    };
    counts.staged += u32::from(staged != UNCHANGED);
    counts.unstaged += u32::from(unstaged != UNCHANGED);
    Ok(())
}

fn head_of(headers: &Headers) -> CoreResult<GitHead> {
    match (headers.head.as_deref(), headers.oid.clone()) {
        (Some(DETACHED_HEAD), Some(commit)) => Ok(GitHead::Detached { commit }),
        (Some(DETACHED_HEAD), None) | (None, _) => Err(parse_failed(WHAT)),
        (Some(name), commit) => Ok(GitHead::Branch {
            name: name.to_string(),
            commit,
        }),
    }
}

/// `has_marker(name)` answers whether the worktree's git folder holds `name`.
pub fn operation_in_progress(has_marker: impl Fn(&str) -> bool) -> Option<OperationInProgress> {
    OPERATION_MARKERS
        .iter()
        .find(|(marker, _)| has_marker(marker))
        .map(|(_, operation)| *operation)
}

#[cfg(test)]
mod tests {
    use codecharta_core_api::error::ErrorCode;

    use super::*;

    fn counts(staged: u32, unstaged: u32, untracked: u32, conflicted: u32) -> StatusCounts {
        StatusCounts {
            staged,
            unstaged,
            untracked,
            conflicted,
        }
    }

    #[test]
    fn should_read_branch_upstream_and_ahead_behind() {
        // Arrange
        let output = include_str!("testdata/status_ahead_behind.txt");

        // Act
        let summary = parse_status(output).unwrap();

        // Assert
        assert_eq!(
            summary.head,
            GitHead::Branch {
                name: "main".to_string(),
                commit: Some("f7342471725a4b46acaccb10caadbe12a88370f4".to_string()),
            }
        );
        assert_eq!(
            summary.upstream,
            Some(StatusUpstream {
                name: "origin/main".to_string(),
                ahead_behind: Some((1, 2)),
            })
        );
    }

    #[test]
    fn should_read_a_gone_upstream_without_ahead_behind() {
        // Arrange
        let output = include_str!("testdata/status_gone_upstream.txt");

        // Act
        let summary = parse_status(output).unwrap();

        // Assert
        assert_eq!(
            summary.upstream,
            Some(StatusUpstream {
                name: "origin/topic".to_string(),
                ahead_behind: None,
            })
        );
    }

    #[test]
    fn should_read_a_detached_head() {
        // Arrange
        let output = include_str!("testdata/status_detached.txt");

        // Act
        let summary = parse_status(output).unwrap();

        // Assert
        assert_eq!(
            summary.head,
            GitHead::Detached {
                commit: "ab5c057683ac44f9153f87c4e92f43ccac988b19".to_string(),
            }
        );
        assert_eq!(summary.upstream, None);
    }

    #[test]
    fn should_read_a_branch_without_commits() {
        // Arrange
        let output = include_str!("testdata/status_initial.txt");

        // Act
        let summary = parse_status(output).unwrap();

        // Assert
        assert_eq!(
            summary.head,
            GitHead::Branch {
                name: "main".to_string(),
                commit: None,
            }
        );
        assert_eq!(summary.counts, counts(0, 0, 1, 0));
    }

    #[test]
    fn should_count_all_four_kinds() {
        // Arrange
        let output = include_str!("testdata/status_conflict.txt");

        // Act
        let summary = parse_status(output).unwrap();

        // Assert
        assert_eq!(summary.counts, counts(1, 1, 1, 1));
    }

    #[test]
    fn should_consume_the_original_path_of_a_rename() {
        // Arrange
        let output = include_str!("testdata/status_ahead_behind.txt");

        // Act
        let summary = parse_status(output).unwrap();

        // Assert
        assert_eq!(summary.counts, counts(3, 2, 1, 0));
    }

    #[test]
    fn should_fail_on_an_unknown_entry() {
        // Arrange
        let output = "# branch.oid (initial)\0# branch.head main\0x what\0";

        // Act
        let parsed = parse_status(output);

        // Assert
        assert_eq!(parsed.unwrap_err().code(), ErrorCode::ParseFailed);
    }

    #[test]
    fn should_find_a_rebase_before_a_merge() {
        // Arrange
        let markers = ["MERGE_HEAD", "rebase-apply"];

        // Act
        let operation = operation_in_progress(|name| markers.contains(&name));

        // Assert
        assert_eq!(operation, Some(OperationInProgress::Rebase));
        assert_eq!(operation_in_progress(|_| false), None);
    }
}
