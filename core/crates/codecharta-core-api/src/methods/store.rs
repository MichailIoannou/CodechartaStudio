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

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ChangeStoreRootParams {
    pub path: String,
}

/// The folder the core serves the store from now on; `adopted` when it already held a store, so
/// nothing was copied.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct StoreRootChange {
    pub store_root: String,
    pub adopted: bool,
}

/// Only after the shell's folder picker: the path must not come from page content.
pub struct StoreChangeRoot;

impl Method for StoreChangeRoot {
    const NAME: &'static str = "store.changeRoot";
    const AUDIENCE: Audience = Audience::Shell;
    type Params = ChangeStoreRootParams;
    type Result = StoreRootChange;
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

    #[test]
    fn should_write_the_store_root_change_in_camel_case() {
        // Arrange
        let change = StoreRootChange {
            store_root: "/elsewhere/store".to_string(),
            adopted: false,
        };

        // Act
        let json = serde_json::to_value(change).unwrap();

        // Assert
        assert_eq!(
            json,
            json!({ "storeRoot": "/elsewhere/store", "adopted": false })
        );
    }
}
