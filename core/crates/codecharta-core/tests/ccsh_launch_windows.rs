#![cfg(windows)]

mod support;

use std::fs;
use std::path::Path;
use std::time::Duration;

use codecharta_core::analysis::launcher::{
    LaunchMode, LaunchOptions, TargetOs, resolve_ccsh_launch,
};
use codecharta_core::process::env::hardened_env;
use codecharta_core::process::{ProcessRunner, RunRequest};
use codecharta_core_api::methods::analysis::AnalysisErrorCode;
use codecharta_core_api::methods::tools::{ToolId, ToolState, ToolStatus, ToolsReport};
use tokio_util::sync::CancellationToken;

use support::{args, install_fake_tool};

const TIMEOUT: Duration = Duration::from_secs(20);
const SHIM: &str = "@echo off\r\n\"%~dp0cc-fake-tool.exe\" %*\r\n";

fn ok_status(tool: ToolId, path: &Path) -> ToolStatus {
    ToolStatus {
        tool,
        is_required: true,
        state: ToolState::Ok,
        path: Some(path.to_string_lossy().into_owned()),
        source: None,
        version: Some("2.4.0".to_string()),
        minimum_version: None,
        problem: None,
    }
}

fn shim_in_folder_with_spaces(root: &Path) -> std::path::PathBuf {
    let folder = root.join("folder with spaces");
    let java = install_fake_tool(&folder, "java");
    install_fake_tool(&folder, "cc-fake-tool");
    let shim = folder.join("ccsh.cmd");
    fs::write(&shim, SHIM).expect("the shim can be written");
    let report = ToolsReport {
        checked_at: "2026-11-19T00:00:00Z".to_string(),
        tools: vec![
            ok_status(ToolId::Ccsh, &shim),
            ok_status(ToolId::Java, &java),
        ],
        can_use_git: true,
        can_analyse: true,
    };
    let launch = resolve_ccsh_launch(&report, TargetOs::Windows, &LaunchOptions::default())
        .expect("the shim resolves");
    assert_eq!(launch.mode, LaunchMode::CmdShim);
    launch.command
}

#[tokio::test]
async fn should_pass_an_argument_with_spaces_through_a_cmd_shim_in_a_folder_with_spaces() {
    // Arrange
    let root = tempfile::tempdir().unwrap();
    let shim = shim_in_folder_with_spaces(root.path());
    let runner = ProcessRunner::new(hardened_env(std::env::vars_os(), &[]));
    let request = RunRequest::new(
        ToolId::Ccsh,
        shim,
        args(&["echo-args", r"C:\a folder\x", "a&b", "c^d"]),
        TIMEOUT,
    );

    // Act
    let output = runner
        .run(request, &CancellationToken::new())
        .await
        .unwrap();

    // Assert
    assert_eq!(output.exit_code, 0);
    let echoed: Vec<String> = serde_json::from_str(output.stdout.trim()).unwrap();
    assert_eq!(echoed, [r"C:\a folder\x", "a&b", "c^d"]);
}

#[tokio::test]
async fn should_refuse_percent() {
    // Arrange
    let root = tempfile::tempdir().unwrap();
    let shim = shim_in_folder_with_spaces(root.path());
    let report = ToolsReport {
        checked_at: "2026-11-19T00:00:00Z".to_string(),
        tools: vec![ok_status(ToolId::Ccsh, &shim)],
        can_use_git: true,
        can_analyse: true,
    };
    let launch =
        resolve_ccsh_launch(&report, TargetOs::Windows, &LaunchOptions::default()).unwrap();

    // Act
    let error = launch
        .check_arguments(&args(&["analyse", r"C:\repos\100%"]))
        .unwrap_err();

    // Assert
    assert_eq!(error.code, AnalysisErrorCode::InvalidArguments);
}
