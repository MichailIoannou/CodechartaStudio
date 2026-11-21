use std::process::ExitCode;

use codecharta_core::Core;
use codecharta_core_api::methods::tools::{ToolState, ToolStatus, ToolsReport};
use tokio_util::sync::CancellationToken;

const NOT_READY: u8 = 1;
const COULD_NOT_CHECK: u8 = 2;
const MISSING_VALUE: &str = "-";

pub struct DoctorOptions {
    pub json: bool,
    pub refresh: bool,
}

/// Exits 0 when every required tool is usable, 1 when one is not, 2 when the check itself failed.
pub fn run_doctor(
    core: &Core,
    runtime: &tokio::runtime::Runtime,
    options: &DoctorOptions,
) -> ExitCode {
    let checked = runtime.block_on(core.tools().doctor(
        options.refresh,
        &CancellationToken::new(),
        &|_, _| {},
    ));
    let report = match checked {
        Ok(report) => report,
        Err(error) => {
            eprintln!("could not check the tools: {error}");
            return ExitCode::from(COULD_NOT_CHECK);
        }
    };
    match render(&report, options.json) {
        Ok(text) => println!("{text}"),
        Err(error) => {
            eprintln!("could not print the report: {error}");
            return ExitCode::from(COULD_NOT_CHECK);
        }
    }
    if is_ready(&report) {
        ExitCode::SUCCESS
    } else {
        ExitCode::from(NOT_READY)
    }
}

fn render(report: &ToolsReport, json: bool) -> serde_json::Result<String> {
    if json {
        return serde_json::to_string_pretty(report);
    }
    Ok(report
        .tools
        .iter()
        .map(render_line)
        .collect::<Vec<_>>()
        .join("\n"))
}

fn render_line(status: &ToolStatus) -> String {
    let version = status.version.as_deref().unwrap_or(MISSING_VALUE);
    let path = status.path.as_deref().unwrap_or(MISSING_VALUE);
    let line = format!(
        "{:<6}{:<10}{version:<10}{path}",
        status.tool.as_str(),
        state_word(status)
    );
    match &status.problem {
        Some(problem) => format!("{line}  ({problem})"),
        None => line,
    }
}

fn state_word(status: &ToolStatus) -> &'static str {
    match status.state {
        ToolState::Ok => "ok",
        ToolState::Missing if !status.is_required => "absent",
        ToolState::Missing => "missing",
        ToolState::TooOld => "too old",
        ToolState::Failed => "failed",
    }
}

fn is_ready(report: &ToolsReport) -> bool {
    report
        .tools
        .iter()
        .filter(|status| status.is_required)
        .all(|status| status.state == ToolState::Ok)
}

#[cfg(test)]
mod tests {
    use codecharta_core_api::methods::tools::{ToolId, ToolSource};

    use super::*;

    fn status(tool: ToolId, is_required: bool, state: ToolState) -> ToolStatus {
        ToolStatus {
            tool,
            is_required,
            state,
            path: (state == ToolState::Ok).then(|| "/usr/bin/tool".to_string()),
            source: (state == ToolState::Ok).then_some(ToolSource::Path),
            version: (state == ToolState::Ok).then(|| "2.50.0".to_string()),
            minimum_version: None,
            problem: None,
        }
    }

    fn report(tools: Vec<ToolStatus>) -> ToolsReport {
        ToolsReport {
            checked_at: "2026-11-18T10:00:00Z".to_string(),
            tools,
            can_use_git: true,
            can_analyse: false,
        }
    }

    #[test]
    fn should_print_one_line_per_tool() {
        // Arrange
        let report = report(vec![
            status(ToolId::Git, true, ToolState::Ok),
            status(ToolId::Gh, false, ToolState::Missing),
        ]);

        // Act
        let text = render(&report, false).unwrap();

        // Assert
        assert_eq!(
            text,
            "git   ok        2.50.0    /usr/bin/tool\ngh    absent    -         -"
        );
    }

    #[test]
    fn should_be_ready_without_optional_tools() {
        // Arrange
        let ready = report(vec![
            status(ToolId::Git, true, ToolState::Ok),
            status(ToolId::Glab, false, ToolState::Missing),
        ]);
        let not_ready = report(vec![status(ToolId::Java, true, ToolState::TooOld)]);

        // Act
        let verdicts = [is_ready(&ready), is_ready(&not_ready)];

        // Assert
        assert_eq!(verdicts, [true, false]);
    }
}
