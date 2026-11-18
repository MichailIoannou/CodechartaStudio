use std::fmt;

use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub enum ToolId {
    Git,
    Ccsh,
    Java,
    Gh,
    Glab,
}

impl ToolId {
    pub fn as_str(self) -> &'static str {
        match self {
            ToolId::Git => "git",
            ToolId::Ccsh => "ccsh",
            ToolId::Java => "java",
            ToolId::Gh => "gh",
            ToolId::Glab => "glab",
        }
    }
}

impl fmt::Display for ToolId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.as_str())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_display_a_tool_like_its_wire_name() {
        // Arrange
        let tools = [
            ToolId::Git,
            ToolId::Ccsh,
            ToolId::Java,
            ToolId::Gh,
            ToolId::Glab,
        ];

        // Act
        let mismatched: Vec<ToolId> = tools
            .into_iter()
            .filter(|tool| {
                serde_json::to_value(tool).unwrap() != serde_json::json!(tool.to_string())
            })
            .collect();

        // Assert
        assert!(mismatched.is_empty(), "mismatched: {mismatched:?}");
    }
}
