use codecharta_core_api::methods::git::GitCommitSummary;
use codecharta_core_api::values::CommitSha;

use crate::error::CoreResult;
use crate::git::error::parse_failed;
use crate::git::nul::{chunk_records, split_nul_fields};

/// One commit per record: sha, parents, author name and email, author and committer time, subject.
pub const SUMMARY_FORMAT: &str = "--format=tformat:%H%x00%P%x00%aN%x00%aE%x00%at%x00%ct%x00%s";
pub const SUMMARY_FIELDS: usize = 7;
/// `SUMMARY_FORMAT`, then committer name and email and the whole message.
pub const DETAILS_FORMAT: &str =
    "--format=tformat:%H%x00%P%x00%aN%x00%aE%x00%at%x00%ct%x00%s%x00%cN%x00%cE%x00%B";
const DETAILS_FIELDS: usize = 10;
const MESSAGE_END: char = '\n';

/// One commit as `show` prints it in `DETAILS_FORMAT`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CommitText {
    pub summary: GitCommitSummary,
    pub committer_name: String,
    pub committer_email: String,
    pub message: String,
}

pub fn parse_details(stdout: &str) -> CoreResult<CommitText> {
    let fields = split_nul_fields(stdout);
    let [.., committer_name, committer_email, message] = fields.as_slice() else {
        return Err(parse_failed(WHAT));
    };
    if fields.len() != DETAILS_FIELDS {
        return Err(parse_failed(WHAT));
    }
    Ok(CommitText {
        summary: summary_of(&fields)?,
        committer_name: clean_text(committer_name),
        committer_email: clean_text(committer_email),
        message: clean_text(message.trim_end_matches(MESSAGE_END)),
    })
}

const WHAT: &str = "the commit history";
const KEPT_CONTROL_CHARACTERS: [char; 2] = ['\t', '\n'];

pub fn parse_log(stdout: &str) -> CoreResult<Vec<GitCommitSummary>> {
    let fields = split_nul_fields(stdout);
    let records = chunk_records(&fields, SUMMARY_FIELDS).ok_or_else(|| parse_failed(WHAT))?;
    records.into_iter().map(summary_of).collect()
}

/// The first seven fields of a record in `SUMMARY_FORMAT`.
pub fn summary_of(fields: &[&str]) -> CoreResult<GitCommitSummary> {
    let [
        sha,
        parents,
        author_name,
        author_email,
        authored_at,
        committed_at,
        subject,
        ..,
    ] = fields
    else {
        return Err(parse_failed(WHAT));
    };
    Ok(GitCommitSummary {
        sha: commit_sha(sha)?,
        parents: parents
            .split_whitespace()
            .map(commit_sha)
            .collect::<CoreResult<_>>()?,
        author_name: clean_text(author_name),
        author_email: clean_text(author_email),
        authored_at: seconds(authored_at)?,
        committed_at: seconds(committed_at)?,
        subject: clean_text(subject),
    })
}

pub fn commit_sha(text: &str) -> CoreResult<String> {
    CommitSha::try_from(text)
        .map(String::from)
        .map_err(|_| parse_failed(WHAT))
}

fn seconds(text: &str) -> CoreResult<i64> {
    text.parse().map_err(|_| parse_failed(WHAT))
}

/// Commit text is shown as it is, apart from control characters other than tab and newline.
pub fn clean_text(text: &str) -> String {
    text.chars()
        .map(|character| {
            if character.is_control() && !KEPT_CONTROL_CHARACTERS.contains(&character) {
                char::REPLACEMENT_CHARACTER
            } else {
                character
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use codecharta_core_api::error::ErrorCode;

    use super::*;

    const HISTORY: &str = include_str!("testdata/log_history.txt");
    const MERGE: &str = "b191cc5c2a8d4f5da89a719b9c9809ecbd426655";
    const FIRST_PARENT: &str = "628bb935fa6a93e9690b4810f4a2a925a0bf956a";
    const SECOND_PARENT: &str = "eabb56d0d0a4a61d7ee5dc1ad65b03c88b7de1ab";

    #[test]
    fn should_parse_seven_fields_per_commit() {
        // Arrange
        let stdout = HISTORY;

        // Act
        let commits = parse_log(stdout).unwrap();

        // Assert
        assert_eq!(commits.len(), 4);
        assert_eq!(
            commits[0],
            GitCommitSummary {
                sha: MERGE.to_string(),
                parents: vec![FIRST_PARENT.to_string(), SECOND_PARENT.to_string()],
                author_name: "Ada Author".to_string(),
                author_email: "ada@example.test".to_string(),
                authored_at: 1_700_000_840,
                committed_at: 1_700_000_840,
                subject: "Merge side".to_string(),
            }
        );
        assert!(commits[3].parents.is_empty());
        assert_eq!(commits[3].subject, "Root");
    }

    #[test]
    fn should_fail_parse_when_the_first_field_is_not_a_sha() {
        // Arrange
        let stdout = "not-a-sha\0\0Ada\0ada@example.test\x001\x001\0Subject\0";

        // Act
        let error = parse_log(stdout).unwrap_err();

        // Assert
        assert_eq!(error.code(), ErrorCode::ParseFailed);
        assert_eq!(
            parse_log("only\0three\0fields\0").unwrap_err().code(),
            ErrorCode::ParseFailed
        );
    }

    #[test]
    fn should_keep_quotes_tabs_and_non_ascii_in_the_subject() {
        // Arrange
        let stdout = HISTORY;

        // Act
        let commits = parse_log(stdout).unwrap();

        // Assert
        assert_eq!(commits[2].subject, "Quote \"it\"\tand tab – ü 日本");
    }

    #[test]
    fn should_parse_details_with_committer_and_message_without_trailing_newlines() {
        // Arrange
        let stdout = include_str!("testdata/show_details.txt");

        // Act
        let details = parse_details(stdout).unwrap();

        // Assert
        assert_eq!(details.summary.subject, "Change files");
        assert_eq!(details.summary.parents.len(), 1);
        assert_eq!(details.committer_name, "Carl Committer");
        assert_eq!(details.committer_email, "carl@example.test");
        assert_eq!(details.message, "Change files\n\nWith a body line.");
        assert_eq!(
            parse_details(HISTORY).unwrap_err().code(),
            ErrorCode::ParseFailed
        );
    }

    #[test]
    fn should_replace_control_characters() {
        // Arrange
        let stdout = HISTORY;

        // Act
        let commits = parse_log(stdout).unwrap();

        // Assert
        assert_eq!(commits[1].subject, "Bell\u{FFFD} here");
        assert_eq!(clean_text("a\u{1b}[31mb\nc"), "a\u{FFFD}[31mb\nc");
    }
}
