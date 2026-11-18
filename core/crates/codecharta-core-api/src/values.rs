use std::fmt;

use serde::{Deserialize, Serialize};
use ts_rs::TS;

pub const FULL_COMMIT_LENGTH: usize = 40;
pub const SHORTEST_COMMIT_HASH_LENGTH: usize = 7;
pub const PICK_TOKEN_LENGTH: usize = 32;
pub const MAX_LABEL_CHARS: usize = 60;
pub const MAX_PROJECT_NAME_CHARS: usize = 80;
pub const MAX_DESCRIPTION_CHARS: usize = 500;
pub const MAX_EXCLUDE_PATTERN_CHARS: usize = 200;
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
}
