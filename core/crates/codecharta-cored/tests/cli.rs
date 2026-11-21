use std::path::Path;
use std::process::{Command, Output};

use serde_json::json;

const CORE_EXECUTABLE: &str = env!("CARGO_BIN_EXE_codecharta-core");

#[test]
fn should_report_version() {
    // Arrange
    let mut command = Command::new(CORE_EXECUTABLE);
    command.arg("--version");

    // Act
    let output = command.output().unwrap();

    // Assert
    assert!(output.status.success());
    let stdout = String::from_utf8(output.stdout).unwrap();
    assert_eq!(
        stdout.trim(),
        format!("codecharta-core {}", env!("CARGO_PKG_VERSION"))
    );
}

fn doctor_without_tools(data_dir: &Path, extra_args: &[&str]) -> Output {
    let missing_git = data_dir.join("missing").join("git");
    let settings = json!({ "schemaVersion": 1, "toolPaths": { "git": missing_git } });
    std::fs::write(data_dir.join("core-settings.json"), settings.to_string())
        .expect("settings written");
    let empty_folder = data_dir.join("empty");
    std::fs::create_dir_all(&empty_folder).expect("folder created");
    Command::new(CORE_EXECUTABLE)
        .arg("--data-dir")
        .arg(data_dir)
        .arg("doctor")
        .args(extra_args)
        .env("PATH", &empty_folder)
        .env("HOME", &empty_folder)
        .env_remove("JAVA_HOME")
        .output()
        .expect("the core binary runs")
}

#[test]
fn should_exit_1_when_a_required_tool_is_missing() {
    // Arrange
    let data_dir = tempfile::tempdir().unwrap();

    // Act
    let output = doctor_without_tools(data_dir.path(), &[]);

    // Assert
    assert_eq!(output.status.code(), Some(1));
    let stdout = String::from_utf8(output.stdout).unwrap();
    assert!(stdout.starts_with("git   missing"), "{stdout}");
    assert_eq!(stdout.lines().count(), 5);
}

#[test]
fn should_print_the_report_as_json() {
    // Arrange
    let data_dir = tempfile::tempdir().unwrap();

    // Act
    let output = doctor_without_tools(data_dir.path(), &["--json", "--refresh"]);

    // Assert
    let report: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(report["tools"][0]["tool"], json!("git"));
    assert_eq!(report["tools"][0]["state"], json!("missing"));
    assert_eq!(report["canUseGit"], json!(false));
}
