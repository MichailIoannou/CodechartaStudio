use std::time::Duration;

use codecharta_core_api::methods::tools::ToolId;

/// A JVM start (ccsh, java) can take a while on a cold machine.
const JVM_VERSION_TIMEOUT: Duration = Duration::from_secs(30);
const NATIVE_VERSION_TIMEOUT: Duration = Duration::from_secs(10);
const LONG_VERSION_FLAG: &[&str] = &["--version"];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ToolDefinition {
    pub id: ToolId,
    pub is_required: bool,
    pub windows_names: &'static [&'static str],
    pub unix_names: &'static [&'static str],
    pub version_args: &'static [&'static str],
    pub minimum: Option<&'static str>,
    pub version_timeout: Duration,
}

impl ToolDefinition {
    pub fn names(&self) -> &'static [&'static str] {
        if cfg!(windows) {
            self.windows_names
        } else {
            self.unix_names
        }
    }
}

pub const TOOLS: [ToolDefinition; 5] = [
    ToolDefinition {
        id: ToolId::Git,
        is_required: true,
        windows_names: &["git.exe"],
        unix_names: &["git"],
        version_args: LONG_VERSION_FLAG,
        minimum: Some("2.31.0"),
        version_timeout: NATIVE_VERSION_TIMEOUT,
    },
    ToolDefinition {
        id: ToolId::Ccsh,
        is_required: true,
        windows_names: &["ccsh.cmd", "ccsh.bat"],
        unix_names: &["ccsh"],
        version_args: LONG_VERSION_FLAG,
        minimum: Some("2.2.1"),
        version_timeout: JVM_VERSION_TIMEOUT,
    },
    ToolDefinition {
        id: ToolId::Java,
        is_required: true,
        windows_names: &["java.exe"],
        unix_names: &["java"],
        version_args: &["-version"],
        minimum: Some("22"),
        version_timeout: JVM_VERSION_TIMEOUT,
    },
    ToolDefinition {
        id: ToolId::Gh,
        is_required: false,
        windows_names: &["gh.exe"],
        unix_names: &["gh"],
        version_args: LONG_VERSION_FLAG,
        minimum: None,
        version_timeout: NATIVE_VERSION_TIMEOUT,
    },
    ToolDefinition {
        id: ToolId::Glab,
        is_required: false,
        windows_names: &["glab.exe"],
        unix_names: &["glab"],
        version_args: LONG_VERSION_FLAG,
        minimum: None,
        version_timeout: NATIVE_VERSION_TIMEOUT,
    },
];

pub fn definition(tool: ToolId) -> &'static ToolDefinition {
    match tool {
        ToolId::Git => &TOOLS[0],
        ToolId::Ccsh => &TOOLS[1],
        ToolId::Java => &TOOLS[2],
        ToolId::Gh => &TOOLS[3],
        ToolId::Glab => &TOOLS[4],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_find_the_definition_of_every_tool() {
        // Arrange
        let tools = TOOLS.map(|definition| definition.id);

        // Act
        let mismatched: Vec<ToolId> = tools
            .into_iter()
            .filter(|tool| definition(*tool).id != *tool)
            .collect();

        // Assert
        assert!(mismatched.is_empty(), "{mismatched:?}");
    }
}
