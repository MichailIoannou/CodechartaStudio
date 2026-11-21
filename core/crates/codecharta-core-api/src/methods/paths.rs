use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::methods::core::EmptyParams;
use crate::registry::{Audience, Method};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct PathsInfo {
    pub data_dir: String,
    pub store_root: String,
    pub is_default_store_root: bool,
    pub logs_dir: String,
}

pub struct PathsGet;

impl Method for PathsGet {
    const NAME: &'static str = "paths.get";
    const AUDIENCE: Audience = Audience::Renderer;
    type Params = EmptyParams;
    type Result = PathsInfo;
}

/// Serves the store from the default folder again, adopting the store there or copying into it.
pub struct PathsResetStoreRoot;

impl Method for PathsResetStoreRoot {
    const NAME: &'static str = "paths.resetStoreRoot";
    const AUDIENCE: Audience = Audience::Renderer;
    type Params = EmptyParams;
    type Result = PathsInfo;
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn should_write_paths_info_in_camel_case() {
        // Arrange
        let info = PathsInfo {
            data_dir: "/data".to_string(),
            store_root: "/data/store".to_string(),
            is_default_store_root: true,
            logs_dir: "/data/logs".to_string(),
        };

        // Act
        let json = serde_json::to_value(info).unwrap();

        // Assert
        assert_eq!(
            json,
            json!({ "dataDir": "/data", "storeRoot": "/data/store", "isDefaultStoreRoot": true, "logsDir": "/data/logs" })
        );
    }
}
