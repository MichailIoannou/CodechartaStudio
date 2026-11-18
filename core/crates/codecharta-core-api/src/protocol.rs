use serde::{Deserialize, Deserializer, Serialize, Serializer, de};
use ts_rs::TS;

use crate::error::{ErrorCode, ErrorPayload};

pub const JSONRPC_VERSION: &str = "2.0";

pub const PARSE_ERROR: i32 = -32700;
pub const INVALID_REQUEST: i32 = -32600;
pub const METHOD_NOT_FOUND: i32 = -32601;
pub const INVALID_PARAMS: i32 = -32602;
pub const DOMAIN_ERROR: i32 = -32000;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct JsonRpcVersion;

impl Serialize for JsonRpcVersion {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(JSONRPC_VERSION)
    }
}

impl<'de> Deserialize<'de> for JsonRpcVersion {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let version = String::deserialize(deserializer)?;
        if version == JSONRPC_VERSION {
            Ok(JsonRpcVersion)
        } else {
            Err(de::Error::custom(format!(
                "jsonrpc must be \"{JSONRPC_VERSION}\""
            )))
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(untagged)]
pub enum RequestId {
    Number(i64),
    Text(String),
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Request {
    pub jsonrpc: JsonRpcVersion,
    pub id: RequestId,
    pub method: String,
    #[serde(default)]
    pub params: serde_json::Value,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Notification {
    pub jsonrpc: JsonRpcVersion,
    pub method: String,
    #[serde(default)]
    pub params: serde_json::Value,
}

impl Notification {
    pub fn new(method: impl Into<String>, params: serde_json::Value) -> Self {
        Self {
            jsonrpc: JsonRpcVersion,
            method: method.into(),
            params,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ResponseError {
    pub code: i32,
    pub message: String,
    pub data: ErrorPayload,
}

impl ResponseError {
    pub fn domain(payload: ErrorPayload) -> Self {
        Self {
            code: DOMAIN_ERROR,
            message: payload.message.clone(),
            data: payload,
        }
    }

    pub fn framing(code: i32, data_code: ErrorCode, message: impl Into<String>) -> Self {
        let payload = ErrorPayload::new(data_code, message);
        Self {
            code,
            message: payload.message.clone(),
            data: payload,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Response {
    Success {
        jsonrpc: JsonRpcVersion,
        id: RequestId,
        result: serde_json::Value,
    },
    Failure {
        jsonrpc: JsonRpcVersion,
        id: Option<RequestId>,
        error: ResponseError,
    },
}

impl Response {
    pub fn success(id: RequestId, result: serde_json::Value) -> Self {
        Response::Success {
            jsonrpc: JsonRpcVersion,
            id,
            result,
        }
    }

    pub fn failure(id: Option<RequestId>, error: ResponseError) -> Self {
        Response::Failure {
            jsonrpc: JsonRpcVersion,
            id,
            error,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn should_round_trip_a_request_with_string_and_number_ids() {
        // Arrange
        let lines = [
            json!({ "jsonrpc": "2.0", "id": 7, "method": "core.ping", "params": {} }),
            json!({ "jsonrpc": "2.0", "id": "seven", "method": "core.ping", "params": {} }),
        ];

        // Act
        let round_tripped: Vec<serde_json::Value> = lines
            .iter()
            .map(|line| serde_json::from_value::<Request>(line.clone()).unwrap())
            .map(|request| serde_json::to_value(request).unwrap())
            .collect();

        // Assert
        assert_eq!(round_tripped, lines);
    }

    #[test]
    fn should_reject_a_request_with_another_jsonrpc_version() {
        // Arrange
        let line = json!({ "jsonrpc": "1.0", "id": 1, "method": "core.ping" });

        // Act
        let parsed = serde_json::from_value::<Request>(line);

        // Assert
        assert!(parsed.is_err());
    }

    #[test]
    fn should_default_missing_params_to_null() {
        // Arrange
        let line = json!({ "jsonrpc": "2.0", "id": 1, "method": "core.ping" });

        // Act
        let request = serde_json::from_value::<Request>(line).unwrap();

        // Assert
        assert_eq!(request.params, serde_json::Value::Null);
    }

    #[test]
    fn should_serialize_a_domain_failure_with_the_payload_as_data() {
        // Arrange
        let payload = ErrorPayload::new(ErrorCode::Cancelled, "The request was cancelled.");
        let response =
            Response::failure(Some(RequestId::Number(3)), ResponseError::domain(payload));

        // Act
        let json = serde_json::to_value(response).unwrap();

        // Assert
        assert_eq!(
            json,
            json!({
                "jsonrpc": "2.0",
                "id": 3,
                "error": {
                    "code": -32000,
                    "message": "The request was cancelled.",
                    "data": { "code": "CANCELLED", "message": "The request was cancelled.", "details": {} }
                }
            })
        );
    }

    #[test]
    fn should_serialize_a_failure_without_id_as_null() {
        // Arrange
        let error = ResponseError::framing(PARSE_ERROR, ErrorCode::BadRequest, "Not JSON.");

        // Act
        let json = serde_json::to_value(Response::failure(None, error)).unwrap();

        // Assert
        assert_eq!(json["id"], serde_json::Value::Null);
        assert_eq!(json["error"]["code"], json!(-32700));
    }
}
