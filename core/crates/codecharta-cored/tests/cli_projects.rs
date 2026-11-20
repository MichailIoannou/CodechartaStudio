use std::path::Path;
use std::process::{Command, Output};

use serde_json::{Value, json};
use tempfile::TempDir;

const CORE_EXECUTABLE: &str = env!("CARGO_BIN_EXE_codecharta-core");
const USAGE_ERROR: i32 = 2;
const REFUSED: i32 = 1;

/// A data folder for the store and a home folder that keeps the user's git configuration out.
struct CommandLine {
    data_dir: TempDir,
    home: TempDir,
}

impl CommandLine {
    fn new() -> Self {
        Self {
            data_dir: tempfile::tempdir().expect("a temporary data folder"),
            home: tempfile::tempdir().expect("a temporary home folder"),
        }
    }

    fn projects(&self, args: &[&str]) -> Output {
        Command::new(CORE_EXECUTABLE)
            .arg("--data-dir")
            .arg(self.data_dir.path())
            .args(["--log-level", "off", "projects"])
            .args(args)
            .env("HOME", self.home.path())
            .env("XDG_CONFIG_HOME", self.home.path())
            .env("GIT_CONFIG_NOSYSTEM", "1")
            .output()
            .expect("the core binary runs")
    }

    fn stdout_of(&self, args: &[&str]) -> String {
        let output = self.projects(args);
        assert!(
            output.status.success(),
            "{args:?} failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        String::from_utf8(output.stdout).expect("the core writes UTF-8")
    }
}

fn text(path: &Path) -> &str {
    path.to_str().expect("the temporary path is UTF-8")
}

#[test]
fn should_list_no_projects_in_a_new_store() {
    // Arrange
    let command_line = CommandLine::new();

    // Act
    let output = command_line.projects(&["list"]);

    // Assert
    assert!(output.status.success());
    assert!(output.stdout.is_empty());
}

#[test]
fn should_create_a_project_from_folder_arguments() {
    // Arrange
    let command_line = CommandLine::new();
    let app = tempfile::tempdir().unwrap();
    let docs = tempfile::tempdir().unwrap();
    let app_argument = format!("{}=app:primary", text(app.path()));

    // Act
    let project_id = command_line.stdout_of(&[
        "create",
        "--name",
        "demo",
        "--folder",
        &app_argument,
        "--folder",
        text(docs.path()),
    ]);

    // Assert
    let listed = command_line.stdout_of(&["list"]);
    assert!(
        listed.starts_with(&format!("{}  demo  2 folders", project_id.trim())),
        "{listed}"
    );
}

#[test]
fn should_add_a_folder_with_label_and_role() {
    // Arrange
    let command_line = CommandLine::new();
    let app = tempfile::tempdir().unwrap();
    let fork = tempfile::tempdir().unwrap();
    let project_id =
        command_line.stdout_of(&["create", "--name", "demo", "--folder", text(app.path())]);

    // Act
    let printed = command_line.stdout_of(&[
        "add-folder",
        "--project",
        project_id.trim(),
        "--path",
        text(fork.path()),
        "--label",
        "upstream fork",
        "--role",
        "fork",
        "--json",
    ]);

    // Assert
    let project: Value = serde_json::from_str(&printed).unwrap();
    assert_eq!(project["folders"][1]["label"], json!("upstream fork"));
    assert_eq!(project["folders"][1]["role"], json!("fork"));
    assert_eq!(project["folders"][0]["role"], json!("primary"));
}

#[test]
fn should_exit_2_for_a_missing_argument() {
    // Arrange
    let command_line = CommandLine::new();
    let app = tempfile::tempdir().unwrap();

    // Act
    let without_name = command_line.projects(&["create", "--folder", text(app.path())]);
    let without_folder = command_line.projects(&["create", "--name", "demo"]);

    // Assert
    assert_eq!(without_name.status.code(), Some(USAGE_ERROR));
    assert_eq!(without_folder.status.code(), Some(USAGE_ERROR));
}

#[test]
fn should_exit_1_when_the_core_refuses_the_command() {
    // Arrange
    let command_line = CommandLine::new();
    let folder = tempfile::tempdir().unwrap();

    // Act
    let output = command_line.projects(&[
        "add-folder",
        "--project",
        "p-0000000000000000",
        "--path",
        text(folder.path()),
    ]);

    // Assert
    assert_eq!(output.status.code(), Some(REFUSED));
    assert!(String::from_utf8_lossy(&output.stderr).contains("p-0000000000000000"));
}

#[test]
fn should_print_json_with_json() {
    // Arrange
    let command_line = CommandLine::new();
    let app = tempfile::tempdir().unwrap();
    command_line.stdout_of(&["create", "--name", "demo", "--folder", text(app.path())]);

    // Act
    let printed = command_line.stdout_of(&["list", "--json"]);

    // Assert
    let summaries: Value = serde_json::from_str(&printed).unwrap();
    assert_eq!(summaries[0]["name"], json!("demo"));
    assert_eq!(summaries[0]["folderCount"], json!(1));
    assert_eq!(summaries[0]["problem"], Value::Null);
}
