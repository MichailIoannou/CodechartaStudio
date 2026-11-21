use std::fmt;

use serde::{Deserialize, Serialize};
use ts_rs::TS;

pub const MAX_STORE_ID_LENGTH: usize = 96;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InvalidStoreId {
    value: String,
}

impl fmt::Display for InvalidStoreId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            formatter,
            "{:?} is not a valid id: use 1 to {MAX_STORE_ID_LENGTH} lowercase letters, digits or dashes",
            self.value
        )
    }
}

impl std::error::Error for InvalidStoreId {}

fn is_store_id(value: &str) -> bool {
    (1..=MAX_STORE_ID_LENGTH).contains(&value.len())
        && value
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
}

/// Store ids name directories, so only values that can never be a path separator, `..` or a drive
/// letter get through deserialisation.
macro_rules! store_id {
    ($name:ident) => {
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
            type Error = InvalidStoreId;

            fn try_from(value: String) -> Result<Self, Self::Error> {
                if is_store_id(&value) {
                    Ok(Self(value))
                } else {
                    Err(InvalidStoreId { value })
                }
            }
        }

        impl TryFrom<&str> for $name {
            type Error = InvalidStoreId;

            fn try_from(value: &str) -> Result<Self, Self::Error> {
                Self::try_from(value.to_string())
            }
        }

        impl From<$name> for String {
            fn from(id: $name) -> String {
                id.0
            }
        }

        impl fmt::Display for $name {
            fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
                formatter.write_str(&self.0)
            }
        }
    };
}

store_id!(ProjectId);
store_id!(FolderId);
store_id!(SnapshotId);

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn should_reject_an_id_with_a_path_separator() {
        // Arrange
        let candidates = ["p-1/..", "p-1\\x", "..", "C:", "Upper", "", "p 1"];

        // Act
        let parsed: Vec<bool> = candidates
            .iter()
            .map(|candidate| ProjectId::try_from(*candidate).is_ok())
            .collect();

        // Assert
        assert!(parsed.iter().all(|is_ok| !is_ok), "{parsed:?}");
    }

    #[test]
    fn should_reject_an_id_longer_than_the_limit() {
        // Arrange
        let too_long = "a".repeat(MAX_STORE_ID_LENGTH + 1);

        // Act
        let longest = FolderId::try_from("a".repeat(MAX_STORE_ID_LENGTH));
        let rejected = FolderId::try_from(too_long);

        // Assert
        assert!(longest.is_ok());
        assert!(rejected.is_err());
    }

    #[test]
    fn should_reject_an_invalid_id_while_deserialising() {
        // Arrange
        let value = json!("../escape");

        // Act
        let parsed = serde_json::from_value::<SnapshotId>(value);

        // Assert
        assert!(parsed.is_err());
    }

    #[test]
    fn should_round_trip_a_valid_id_as_a_plain_string() {
        // Arrange
        let id = ProjectId::try_from("p-3f9c2a7b1d4e5f60").unwrap();

        // Act
        let json = serde_json::to_value(&id).unwrap();
        let parsed: ProjectId = serde_json::from_value(json.clone()).unwrap();

        // Assert
        assert_eq!(json, json!("p-3f9c2a7b1d4e5f60"));
        assert_eq!(parsed, id);
    }
}
