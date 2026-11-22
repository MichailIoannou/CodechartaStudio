use std::fmt;

use serde::{Deserialize, Serialize};
use ts_rs::TS;

pub const FULL_COMMIT_LENGTH: usize = 40;
pub const SHA256_COMMIT_LENGTH: usize = 64;
pub const MAX_FULL_REF_NAME_LENGTH: usize = 1024;
const FULL_REF_NAME_PREFIX: &str = "refs/";
const DELETE_CHARACTER: char = '\u{7f}';
pub const SHORTEST_COMMIT_HASH_LENGTH: usize = 7;
pub const PICK_TOKEN_LENGTH: usize = 32;
pub const MAX_LABEL_CHARS: usize = 60;
pub const MAX_PROJECT_NAME_CHARS: usize = 80;
pub const MAX_DESCRIPTION_CHARS: usize = 500;
pub const MAX_EXCLUDE_PATTERN_CHARS: usize = 200;
pub const MAX_MAP_CHECKSUM_LENGTH: usize = 128;
pub const MAX_ROOT_NAME_CHARS: usize = 255;
pub const MAX_LOG_CURSOR_LENGTH: usize = 128;
pub const MAX_PROMPT_ID_LENGTH: usize = 64;
pub const MAX_LOG_FILTER_CHARS: usize = 200;
pub const MAX_REPO_PATH_LENGTH: usize = 1024;
pub const MAX_BRANCH_NAME_CHARS: usize = 200;
pub const MAX_WORKING_TREE_PATH_LENGTH: usize = 4096;
pub const MAX_COMMIT_SUBJECT_CHARS: usize = 200;
pub const MAX_COMMIT_BODY_CHARS: usize = 20_000;
const LOCAL_BRANCH_PREFIX: &str = "refs/heads/";
const OPTION_PREFIX: char = '-';
const PARENT_SEGMENT: &str = "..";
const PATH_SEPARATORS: [char; 2] = ['/', '\\'];
const DRIVE_SEPARATOR: char = ':';
const NUL_CHARACTER: char = '\0';
const HEAD_REVISION: &str = "HEAD";
/// git reads a lone `@` as `HEAD`.
const HEAD_SHORTHAND: &str = "@";
const REF_COMPONENT_SEPARATOR: char = '/';
const REF_FORBIDDEN_SEQUENCES: [&str; 3] = ["..", "@{", "//"];
const REF_FORBIDDEN_CHARACTERS: [char; 8] = ['~', '^', ':', '?', '*', '[', '\\', ' '];
const REF_LOCK_SUFFIX: &str = ".lock";
const REF_COMPONENT_DOT: char = '.';
const PATH_SEPARATOR: char = '/';
const LABEL_FORBIDDEN_CHARACTERS: [char; 3] = ['/', '\\', ':'];
const LINE_BREAKS: [char; 2] = ['\n', '\r'];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InvalidValue {
    type_name: &'static str,
    rule: &'static str,
}

impl fmt::Display for InvalidValue {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "not a valid {}: {}", self.type_name, self.rule)
    }
}

impl std::error::Error for InvalidValue {}

fn is_lowercase_hex(value: &str, lengths: std::ops::RangeInclusive<usize>) -> bool {
    lengths.contains(&value.len())
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn is_full_commit(value: &str) -> bool {
    is_lowercase_hex(value, FULL_COMMIT_LENGTH..=FULL_COMMIT_LENGTH)
}

fn is_commit_sha(value: &str) -> bool {
    [FULL_COMMIT_LENGTH, SHA256_COMMIT_LENGTH]
        .into_iter()
        .any(|length| is_lowercase_hex(value, length..=length))
}

/// git's own `check-ref-format` runs where a ref is used; this rule keeps options and control characters
/// out before that.
fn is_full_ref_name(value: &str) -> bool {
    value.len() <= MAX_FULL_REF_NAME_LENGTH
        && value.starts_with(FULL_REF_NAME_PREFIX)
        && !value
            .chars()
            .any(|character| character < ' ' || character == DELETE_CHARACTER)
}

fn is_commit_hash(value: &str) -> bool {
    is_lowercase_hex(value, SHORTEST_COMMIT_HASH_LENGTH..=FULL_COMMIT_LENGTH)
}

fn is_pick_token(value: &str) -> bool {
    is_lowercase_hex(value, PICK_TOKEN_LENGTH..=PICK_TOKEN_LENGTH)
}

fn has_chars(value: &str, counts: std::ops::RangeInclusive<usize>) -> bool {
    counts.contains(&value.chars().count())
}

fn is_label(value: &str) -> bool {
    has_chars(value, 1..=MAX_LABEL_CHARS)
        && !value.chars().any(|character| {
            character.is_control() || LABEL_FORBIDDEN_CHARACTERS.contains(&character)
        })
}

fn is_project_name(value: &str) -> bool {
    has_chars(value, 1..=MAX_PROJECT_NAME_CHARS)
        && !value.trim().is_empty()
        && !value.chars().any(char::is_control)
}

fn is_description(value: &str) -> bool {
    has_chars(value, 0..=MAX_DESCRIPTION_CHARS)
}

fn is_exclude_pattern(value: &str) -> bool {
    has_chars(value, 1..=MAX_EXCLUDE_PATTERN_CHARS) && !value.contains(LINE_BREAKS)
}

fn is_map_checksum(value: &str) -> bool {
    (1..=MAX_MAP_CHECKSUM_LENGTH).contains(&value.len())
        && value.bytes().all(|byte| byte.is_ascii_alphanumeric())
}

fn is_root_name(value: &str) -> bool {
    has_chars(value, 1..=MAX_ROOT_NAME_CHARS)
        && !value
            .chars()
            .any(|character| character.is_control() || character == PATH_SEPARATOR)
}

fn is_token_text(value: &str, max_length: usize) -> bool {
    (1..=max_length).contains(&value.len())
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
}

fn is_log_cursor(value: &str) -> bool {
    is_token_text(value, MAX_LOG_CURSOR_LENGTH)
}

fn is_prompt_id(value: &str) -> bool {
    is_token_text(value, MAX_PROMPT_ID_LENGTH)
}

fn is_log_filter_text(value: &str) -> bool {
    has_chars(value, 1..=MAX_LOG_FILTER_CHARS) && !value.chars().any(char::is_control)
}

/// One line that is not only spaces: git would drop a blank message and refuse the commit.
fn is_commit_subject(value: &str) -> bool {
    has_chars(value, 1..=MAX_COMMIT_SUBJECT_CHARS)
        && !value.trim().is_empty()
        && !value.chars().any(char::is_control)
}

fn is_commit_body(value: &str) -> bool {
    has_chars(value, 0..=MAX_COMMIT_BODY_CHARS) && !value.contains(NUL_CHARACTER)
}

/// A path git reads from its standard input one per line: relative, inside the repository, one line.
fn is_repo_relative_path(value: &str) -> bool {
    (1..=MAX_REPO_PATH_LENGTH).contains(&value.len())
        && !value.starts_with(PATH_SEPARATORS)
        && !value.contains(DRIVE_SEPARATOR)
        && !value.chars().any(char::is_control)
        && !value
            .split(PATH_SEPARATORS)
            .any(|segment| segment == PARENT_SEGMENT)
}

/// A path of the working-tree listing as git prints it: relative, inside the repository, without NUL. The
/// core still accepts it only when the current listing names it.
fn is_working_tree_path(value: &str) -> bool {
    (1..=MAX_WORKING_TREE_PATH_LENGTH).contains(&value.len())
        && !value.contains(NUL_CHARACTER)
        && !value.starts_with(PATH_SEPARATORS)
        && !has_drive_prefix(value)
        && !value
            .split(PATH_SEPARATORS)
            .any(|segment| segment == PARENT_SEGMENT)
}

/// `C:` names a drive on Windows, so `C:x` would leave the repository there.
fn has_drive_prefix(value: &str) -> bool {
    let mut characters = value.chars();
    characters
        .next()
        .is_some_and(|first| first.is_ascii_alphabetic())
        && characters.next() == Some(DRIVE_SEPARATOR)
}

/// `HEAD`, a commit sha or a full ref name that git's `check-ref-format` would accept; never an expression
/// such as `HEAD~1`, `A..B` or `main@{1}`.
fn is_revision(value: &str) -> bool {
    value == HEAD_REVISION || is_commit_sha(value) || is_well_formed_full_ref_name(value)
}

fn is_well_formed_full_ref_name(value: &str) -> bool {
    is_full_ref_name(value)
        && !REF_FORBIDDEN_SEQUENCES
            .iter()
            .any(|sequence| value.contains(sequence))
        && !value.contains(REF_FORBIDDEN_CHARACTERS)
        && !value.ends_with([REF_COMPONENT_SEPARATOR, REF_COMPONENT_DOT])
        && value.split(REF_COMPONENT_SEPARATOR).all(|component| {
            !component.is_empty()
                && !component.starts_with(REF_COMPONENT_DOT)
                && !component.ends_with(REF_LOCK_SUFFIX)
        })
}

/// What `git check-ref-format refs/heads/<name>` accepts, without a leading `-` and never `HEAD` or `@`;
/// the core still asks git before it creates the branch.
fn is_branch_name(value: &str) -> bool {
    has_chars(value, 1..=MAX_BRANCH_NAME_CHARS)
        && !value.starts_with(OPTION_PREFIX)
        && value != HEAD_REVISION
        && value != HEAD_SHORTHAND
        && is_well_formed_full_ref_name(&format!("{LOCAL_BRANCH_PREFIX}{value}"))
}

/// A text value checked while it is deserialised, so a handler never sees an invalid one. The rule text
/// never repeats the value: it may be long or carry something the caller did not mean to log.
macro_rules! validated_text {
    ($name:ident, $is_valid:expr, $rule:expr) => {
        #[derive(
            Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, TS,
        )]
        #[serde(try_from = "String", into = "String")]
        pub struct $name(String);

        impl $name {
            pub fn as_str(&self) -> &str {
                &self.0
            }
        }

        impl TryFrom<String> for $name {
            type Error = InvalidValue;

            fn try_from(value: String) -> Result<Self, Self::Error> {
                let is_valid: fn(&str) -> bool = $is_valid;
                if is_valid(&value) {
                    Ok(Self(value))
                } else {
                    Err(InvalidValue {
                        type_name: stringify!($name),
                        rule: $rule,
                    })
                }
            }
        }

        impl TryFrom<&str> for $name {
            type Error = InvalidValue;

            fn try_from(value: &str) -> Result<Self, Self::Error> {
                Self::try_from(value.to_string())
            }
        }

        impl From<$name> for String {
            fn from(value: $name) -> String {
                value.0
            }
        }

        impl fmt::Display for $name {
            fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
                formatter.write_str(&self.0)
            }
        }
    };
}

validated_text!(
    FullCommit,
    is_full_commit,
    "use the 40 lowercase hexadecimal digits of a commit"
);

validated_text!(
    CommitHash,
    is_commit_hash,
    "use 7 to 40 lowercase hexadecimal digits of a commit"
);

validated_text!(
    CommitSha,
    is_commit_sha,
    "use the 40 or 64 lowercase hexadecimal digits of a commit"
);

validated_text!(
    FullRefName,
    is_full_ref_name,
    "use a full ref name starting with refs/, at most 1024 characters, without control characters"
);

validated_text!(PickToken, is_pick_token, "use the token the pick answered");

validated_text!(
    Label,
    is_label,
    "use 1 to 60 characters without /, \\, : or control characters"
);

validated_text!(
    ProjectName,
    is_project_name,
    "use 1 to 80 characters, not only spaces, without control characters"
);

validated_text!(Description, is_description, "use at most 500 characters");

validated_text!(
    ExcludePattern,
    is_exclude_pattern,
    "use 1 to 200 characters without line breaks"
);

validated_text!(
    MapChecksum,
    is_map_checksum,
    "use 1 to 128 ASCII letters or digits"
);

validated_text!(
    RootName,
    is_root_name,
    "use 1 to 255 characters without / or control characters"
);

validated_text!(
    Revision,
    is_revision,
    "use HEAD, the 40 or 64 lowercase hexadecimal digits of a commit, or a full ref name"
);

validated_text!(
    LogCursor,
    is_log_cursor,
    "use the cursor of the previous page: 1 to 128 ASCII letters, digits, _ or -"
);

validated_text!(
    PromptId,
    is_prompt_id,
    "use the id of an open prompt: 1 to 64 ASCII letters, digits, _ or -"
);

validated_text!(
    LogFilterText,
    is_log_filter_text,
    "use 1 to 200 characters without control characters"
);

validated_text!(
    RepoRelativePath,
    is_repo_relative_path,
    "use a relative path inside the repository: at most 1024 bytes, no .. segment, no : and no control characters"
);

validated_text!(
    WorkingTreePath,
    is_working_tree_path,
    "use a path of the working-tree listing: relative, at most 4096 bytes, no .. segment, no drive and no NUL"
);

validated_text!(
    CommitSubject,
    is_commit_subject,
    "use 1 to 200 characters on one line, not only spaces, without control characters"
);

validated_text!(
    CommitBody,
    is_commit_body,
    "use at most 20000 characters without NUL"
);

validated_text!(
    BranchName,
    is_branch_name,
    "use 1 to 200 characters git accepts as a branch name: no leading -, not HEAD or @, no .., @{, spaces, control characters or ~^:?*[\\"
);

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn should_accept_only_a_full_lowercase_commit_hash() {
        // Arrange
        let full = "0123456789abcdef0123456789abcdef01234567";
        let candidates = [
            full.to_uppercase(),
            full[..FULL_COMMIT_LENGTH - 1].to_string(),
            format!("{full}0"),
        ];

        // Act
        let accepted = FullCommit::try_from(full);
        let rejected: Vec<bool> = candidates
            .into_iter()
            .map(|candidate| FullCommit::try_from(candidate).is_err())
            .collect();

        // Assert
        assert_eq!(accepted.unwrap().as_str(), full);
        assert_eq!(rejected, vec![true, true, true]);
    }

    #[test]
    fn should_accept_40_and_64_hex_shas_and_reject_upper_case_short_and_dash() {
        // Arrange
        let sha1 = "0123456789abcdef0123456789abcdef01234567";
        let sha256 = format!("{sha1}0123456789abcdef01234567");
        let candidates = [
            sha1.to_uppercase(),
            sha1[..FULL_COMMIT_LENGTH - 1].to_string(),
            format!("-{}", &sha1[1..]),
            format!("{sha1}0"),
        ];

        // Act
        let accepted = [
            CommitSha::try_from(sha1),
            CommitSha::try_from(sha256.as_str()),
        ];
        let rejected: Vec<bool> = candidates
            .into_iter()
            .map(|candidate| CommitSha::try_from(candidate).is_err())
            .collect();

        // Assert
        assert!(accepted.iter().all(Result::is_ok));
        assert_eq!(rejected, vec![true; 4]);
    }

    #[test]
    fn should_reject_ref_names_with_control_chars_leading_dash_or_without_refs_prefix() {
        // Arrange
        let candidates = [
            "refs/heads/a\u{1}b".to_string(),
            "refs/heads/tab\there".to_string(),
            "refs/heads/delete\u{7f}".to_string(),
            "-refs/heads/main".to_string(),
            "heads/main".to_string(),
            "main".to_string(),
            format!("refs/heads/{}", "x".repeat(MAX_FULL_REF_NAME_LENGTH)),
        ];

        // Act
        let rejected: Vec<bool> = candidates
            .into_iter()
            .map(|candidate| serde_json::from_value::<FullRefName>(json!(candidate)).is_err())
            .collect();

        // Assert
        assert_eq!(rejected, vec![true; rejected.len()]);
        assert!(FullRefName::try_from("refs/remotes/team/fork/feature-x").is_ok());
    }

    #[test]
    fn should_refuse_a_commit_hash_that_could_be_an_option() {
        // Arrange
        let candidates = ["--output=x", "-abcdef0", "abc", "ABCDEF0", "abcdef0^"];

        // Act
        let accepted: Vec<bool> = candidates
            .into_iter()
            .map(|candidate| CommitHash::try_from(candidate).is_ok())
            .collect();

        // Assert
        assert_eq!(accepted, vec![false; candidates.len()]);
        assert!(CommitHash::try_from("abcdef0").is_ok());
    }

    #[test]
    fn should_reject_a_label_containing_a_path_separator_at_deserialisation() {
        // Arrange
        let candidates = [
            json!("src/main"),
            json!("src\\main"),
            json!("C:"),
            json!("tab\there"),
            json!(""),
            json!("x".repeat(MAX_LABEL_CHARS + 1)),
        ];

        // Act
        let rejected: Vec<bool> = candidates
            .into_iter()
            .map(|candidate| serde_json::from_value::<Label>(candidate).is_err())
            .collect();

        // Assert
        assert_eq!(rejected, vec![true; rejected.len()]);
        assert!(serde_json::from_value::<Label>(json!("codecharta fork 2")).is_ok());
    }

    #[test]
    fn should_reject_a_blank_project_name_and_a_long_description() {
        // Arrange
        let long_description = "x".repeat(MAX_DESCRIPTION_CHARS + 1);

        // Act
        let blank = ProjectName::try_from("   ");
        let long = Description::try_from(long_description);
        let empty = Description::try_from("");

        // Assert
        assert!(blank.is_err());
        assert!(long.is_err());
        assert!(empty.is_ok());
    }

    #[test]
    fn should_not_repeat_the_value_in_the_error() {
        // Arrange
        let value = json!("secret-looking-value");

        // Act
        let error = serde_json::from_value::<FullCommit>(value).unwrap_err();

        // Assert
        assert!(
            !error.to_string().contains("secret-looking-value"),
            "{error}"
        );
    }

    #[test]
    fn should_accept_a_map_checksum_and_a_root_name_only_without_separators() {
        // Arrange
        let checksum = "d41d8cd98f00b204e9800998ecf8427e";

        // Act
        let accepted = (MapChecksum::try_from(checksum), RootName::try_from("root"));
        let rejected = (
            MapChecksum::try_from("../etc"),
            RootName::try_from("root/sub"),
            RootName::try_from(""),
        );

        // Assert
        assert!(accepted.0.is_ok() && accepted.1.is_ok());
        assert!(rejected.0.is_err() && rejected.1.is_err() && rejected.2.is_err());
    }

    #[test]
    fn should_accept_head_a_sha_and_a_full_ref_but_no_expression() {
        // Arrange
        let sha = "0123456789abcdef0123456789abcdef01234567";
        let accepted = [
            "HEAD".to_string(),
            sha.to_string(),
            "refs/heads/feature/x-1".to_string(),
            "refs/tags/v1.0".to_string(),
        ];
        let rejected = [
            "HEAD~1",
            "HEAD^",
            "refs/heads/a..b",
            "refs/heads/main@{1}",
            "refs/heads/a b",
            "refs/heads/.hidden",
            "refs/heads/x.lock",
            "refs/heads/x/",
            "refs/heads//x",
            "main",
            "-refs/heads/main",
        ];

        // Act
        let accepted: Vec<bool> = accepted
            .into_iter()
            .map(|candidate| Revision::try_from(candidate).is_ok())
            .collect();
        let rejected: Vec<bool> = rejected
            .into_iter()
            .map(|candidate| Revision::try_from(candidate).is_err())
            .collect();

        // Assert
        assert_eq!(accepted, vec![true; accepted.len()]);
        assert_eq!(rejected, vec![true; rejected.len()]);
    }

    #[test]
    fn should_accept_only_cursor_characters_in_a_log_cursor() {
        // Arrange
        let candidates = [
            "".to_string(),
            "a b".to_string(),
            "a/b".to_string(),
            "x".repeat(MAX_LOG_CURSOR_LENGTH + 1),
        ];

        // Act
        let rejected: Vec<bool> = candidates
            .into_iter()
            .map(|candidate| LogCursor::try_from(candidate).is_err())
            .collect();

        // Assert
        assert_eq!(rejected, vec![true; rejected.len()]);
        assert!(LogCursor::try_from("0f3a_500").is_ok());
    }

    #[test]
    fn should_reject_absolute_parent_and_multi_line_filter_paths() {
        // Arrange
        let candidates = [
            "/etc/passwd",
            "\\\\server\\share",
            "C:/repo",
            "src/../../etc",
            "..",
            "src\\..\\x",
            "two\nlines",
            "",
        ];

        // Act
        let rejected: Vec<bool> = candidates
            .into_iter()
            .map(|candidate| RepoRelativePath::try_from(candidate).is_err())
            .collect();

        // Assert
        assert_eq!(rejected, vec![true; rejected.len()]);
        assert!(RepoRelativePath::try_from("docs/with space [1]/a..b.md").is_ok());
    }

    #[test]
    fn should_reject_working_tree_paths_that_could_leave_the_repository() {
        // Arrange
        let candidates = [
            "/etc/passwd".to_string(),
            "\\\\server\\share".to_string(),
            "C:/repo".to_string(),
            "c:relative".to_string(),
            "src/../../etc".to_string(),
            "..".to_string(),
            "src\\..\\x".to_string(),
            "nul\0byte".to_string(),
            String::new(),
            "x".repeat(MAX_WORKING_TREE_PATH_LENGTH + 1),
        ];

        // Act
        let rejected: Vec<bool> = candidates
            .into_iter()
            .map(|candidate| WorkingTreePath::try_from(candidate).is_err())
            .collect();

        // Assert
        assert_eq!(rejected, vec![true; rejected.len()]);
        let accepted = ["docs/with space [1]/a..b.md", "notes:1.txt", "-n", "*.txt"];
        assert!(
            accepted
                .into_iter()
                .all(|path| WorkingTreePath::try_from(path).is_ok())
        );
    }

    #[test]
    fn should_reject_control_characters_and_long_filter_texts() {
        // Arrange
        let long = "x".repeat(MAX_LOG_FILTER_CHARS + 1);

        // Act
        let rejected = [
            LogFilterText::try_from("line\nbreak").is_err(),
            LogFilterText::try_from(long).is_err(),
            LogFilterText::try_from("").is_err(),
        ];

        // Assert
        assert_eq!(rejected, [true; 3]);
        assert!(LogFilterText::try_from("Fix \"quoted\" [bug]").is_ok());
    }

    #[test]
    fn should_reject_invalid_branch_names() {
        // Arrange
        let candidates = [
            "-x".to_string(),
            "a..b".to_string(),
            "a@{1}".to_string(),
            "HEAD".to_string(),
            "@".to_string(),
            "tab\there".to_string(),
            "bell\u{7}".to_string(),
            "with space".to_string(),
            "ends.lock".to_string(),
            "trailing/".to_string(),
            String::new(),
            "x".repeat(MAX_BRANCH_NAME_CHARS + 1),
        ];

        // Act
        let rejected: Vec<bool> = candidates
            .into_iter()
            .map(|candidate| serde_json::from_value::<BranchName>(json!(candidate)).is_err())
            .collect();

        // Assert
        assert_eq!(rejected, vec![true; rejected.len()]);
        assert!(BranchName::try_from("feature/login-form").is_ok());
        assert!(BranchName::try_from("fix-ü").is_ok());
    }

    #[test]
    fn should_reject_blank_multi_line_and_long_commit_subjects_and_bodies_with_nul() {
        // Arrange
        let long_subject = "x".repeat(MAX_COMMIT_SUBJECT_CHARS + 1);
        let long_body = "x".repeat(MAX_COMMIT_BODY_CHARS + 1);

        // Act
        let rejected = [
            CommitSubject::try_from("").is_err(),
            CommitSubject::try_from("   ").is_err(),
            CommitSubject::try_from("two\nlines").is_err(),
            CommitSubject::try_from(long_subject).is_err(),
            CommitBody::try_from("nul\0inside").is_err(),
            CommitBody::try_from(long_body).is_err(),
        ];

        // Assert
        assert_eq!(rejected, [true; 6]);
        assert!(CommitSubject::try_from("Fix \"quoted\" bug in ü").is_ok());
        assert!(CommitBody::try_from("").is_ok());
        assert!(CommitBody::try_from("# kept\r\n\nsecond paragraph").is_ok());
    }
}
