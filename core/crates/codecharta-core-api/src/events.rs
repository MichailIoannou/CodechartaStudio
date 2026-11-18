use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::protocol::RequestId;
use crate::registry::{Audience, Event};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ProgressParams {
    pub request_id: RequestId,
    pub message: String,
    pub done: Option<u32>,
    pub total: Option<u32>,
}

pub struct CoreProgress;

impl Event for CoreProgress {
    const NAME: &'static str = "core.progress";
    const AUDIENCE: Audience = Audience::Renderer;
    type Params = ProgressParams;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_write_missing_counts_as_null() {
        // Arrange
        let progress = ProgressParams {
            request_id: RequestId::Text("doctor".to_string()),
            message: "Checking git".to_string(),
            done: None,
            total: None,
        };

        // Act
        let json = serde_json::to_value(progress).unwrap();

        // Assert
        assert_eq!(
            json,
            serde_json::json!({ "requestId": "doctor", "message": "Checking git", "done": null, "total": null })
        );
    }
}
