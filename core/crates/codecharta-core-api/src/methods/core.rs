use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::protocol::RequestId;
use crate::registry::{Audience, Event, Method};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HelloParams {
    pub client_name: String,
    pub protocol_version: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub enum Platform {
    Win32,
    Darwin,
    Linux,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct HelloResult {
    pub core_version: String,
    pub protocol_version: u32,
    pub platform: Platform,
    pub data_dir: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
pub struct EmptyParams {}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct PingResult {
    pub core_version: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CancelParams {
    pub id: RequestId,
}

pub struct CoreHello;

impl Method for CoreHello {
    const NAME: &'static str = "core.hello";
    const AUDIENCE: Audience = Audience::Shell;
    type Params = HelloParams;
    type Result = HelloResult;
}

pub struct CorePing;

impl Method for CorePing {
    const NAME: &'static str = "core.ping";
    const AUDIENCE: Audience = Audience::Renderer;
    type Params = EmptyParams;
    type Result = PingResult;
}

pub struct CoreShutdown;

impl Method for CoreShutdown {
    const NAME: &'static str = "core.shutdown";
    const AUDIENCE: Audience = Audience::Shell;
    type Params = EmptyParams;
    type Result = ();
}

pub struct CoreCancel;

impl Event for CoreCancel {
    const NAME: &'static str = "core.cancel";
    const AUDIENCE: Audience = Audience::Shell;
    type Params = CancelParams;
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn should_reject_unknown_params_fields() {
        // Arrange
        let params = json!({ "clientName": "shell", "protocolVersion": 1, "extra": true });

        // Act
        let parsed = serde_json::from_value::<HelloParams>(params);

        // Assert
        assert!(parsed.is_err());
    }

    #[test]
    fn should_read_hello_params_in_camel_case() {
        // Arrange
        let params = json!({ "clientName": "shell", "protocolVersion": 1 });

        // Act
        let parsed = serde_json::from_value::<HelloParams>(params).unwrap();

        // Assert
        assert_eq!(
            parsed,
            HelloParams {
                client_name: "shell".to_string(),
                protocol_version: 1
            }
        );
    }

    #[test]
    fn should_write_platforms_as_node_names() {
        // Arrange
        let platforms = [Platform::Win32, Platform::Darwin, Platform::Linux];

        // Act
        let json = serde_json::to_value(platforms).unwrap();

        // Assert
        assert_eq!(json, json!(["win32", "darwin", "linux"]));
    }

    #[test]
    fn should_reject_fields_in_empty_params() {
        // Arrange
        let params = json!({ "unexpected": 1 });

        // Act
        let parsed = serde_json::from_value::<EmptyParams>(params);

        // Assert
        assert!(parsed.is_err());
    }
}
