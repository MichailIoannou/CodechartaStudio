use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::methods::core::EmptyParams;
use crate::registry::{Audience, Method};

/// Why the store could not be opened when the core started; `IO` covers every other cause.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum StoreProblemCode {
    StoreLocked,
    StoreNewerSchema,
    Io,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct StoreStatus {
    pub problem: Option<StoreProblemCode>,
}

pub struct StoreGetStatus;

impl Method for StoreGetStatus {
    const NAME: &'static str = "store.status";
    const AUDIENCE: Audience = Audience::Renderer;
    type Params = EmptyParams;
    type Result = StoreStatus;
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn should_write_the_problem_code_like_the_error_code() {
        // Arrange
        let statuses = [
            StoreStatus { problem: None },
            StoreStatus {
                problem: Some(StoreProblemCode::StoreNewerSchema),
            },
            StoreStatus {
                problem: Some(StoreProblemCode::Io),
            },
        ];

        // Act
        let json = serde_json::to_value(statuses).unwrap();

        // Assert
        assert_eq!(
            json,
            json!([{ "problem": null }, { "problem": "STORE_NEWER_SCHEMA" }, { "problem": "IO" }])
        );
    }
}
