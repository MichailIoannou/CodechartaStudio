use std::fmt;

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::registry::{Audience, Method};

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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub enum ToolState {
    Ok,
    Missing,
    TooOld,
    Failed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub enum ToolSource {
    Custom,
    JavaHome,
    Path,
    WellKnownFolder,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ToolStatus {
    pub tool: ToolId,
    pub is_required: bool,
    pub state: ToolState,
    pub path: Option<String>,
    pub source: Option<ToolSource>,
    pub version: Option<String>,
    pub minimum_version: Option<String>,
    pub problem: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ToolsReport {
    /// RFC 3339, UTC.
    pub checked_at: String,
    pub tools: Vec<ToolStatus>,
    pub can_use_git: bool,
    pub can_analyse: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DoctorParams {
    pub refresh: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SetToolPathParams {
    pub tool: ToolId,
    pub path: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ClearToolPathParams {
    pub tool: ToolId,
}

pub struct ToolsDoctor;

impl Method for ToolsDoctor {
    const NAME: &'static str = "tools.doctor";
    const AUDIENCE: Audience = Audience::Renderer;
    type Params = DoctorParams;
    type Result = ToolsReport;
}

/// Shell only: the path must come from the shell's native file picker, never from page content.
pub struct ToolsSetPath;

impl Method for ToolsSetPath {
    const NAME: &'static str = "tools.setPath";
    const AUDIENCE: Audience = Audience::Shell;
    type Params = SetToolPathParams;
    type Result = ToolsReport;
}

pub struct ToolsClearPath;

impl Method for ToolsClearPath {
    const NAME: &'static str = "tools.clearPath";
    const AUDIENCE: Audience = Audience::Renderer;
    type Params = ClearToolPathParams;
    type Result = ToolsReport;
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
