use std::fmt;

use serde::{Deserialize, Deserializer, Serialize, Serializer};
use ts_rs::TS;
use zeroize::Zeroizing;

const REDACTED: &str = "***";

/// A credential on its way between the user and git: printed as `***` by `Debug` and `Display`, and
/// overwritten in memory when dropped. Only `expose` hands out the text.
#[derive(Clone, PartialEq, Eq, TS)]
#[ts(type = "string")]
pub struct Secret(Zeroizing<String>);

impl Secret {
    pub fn new(text: String) -> Self {
        Self(Zeroizing::new(text))
    }

    pub fn expose(&self) -> &str {
        &self.0
    }
}

impl fmt::Debug for Secret {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(REDACTED)
    }
}

impl fmt::Display for Secret {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(REDACTED)
    }
}

impl Serialize for Secret {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(self.expose())
    }
}

impl<'de> Deserialize<'de> for Secret {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        String::deserialize(deserializer).map(Secret::new)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_print_stars_for_debug_and_display() {
        // Arrange
        let secret = Secret::new("hunter2".to_string());

        // Act
        let printed = [format!("{secret:?}"), format!("{secret}")];

        // Assert
        assert_eq!(printed, [REDACTED, REDACTED]);
    }

    #[test]
    fn should_keep_the_text_through_json() {
        // Arrange
        let json = serde_json::json!("pa\"ss%w&rd ü");

        // Act
        let secret: Secret = serde_json::from_value(json.clone()).unwrap();

        // Assert
        assert_eq!(secret.expose(), "pa\"ss%w&rd ü");
        assert_eq!(serde_json::to_value(&secret).unwrap(), json);
    }
}
