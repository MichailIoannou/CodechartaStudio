use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};

use serde_json::Value;
use tempfile::TempDir;

const CORE_EXECUTABLE: &str = env!("CARGO_BIN_EXE_codecharta-core");
const REFUSED: i32 = 1;
const MAP: &str = r#"{"projectName":"demo","apiVersion":"1.5","nodes":[]}"#;
const UNKNOWN_FOLDER: &str = "f-0000000000000000";

/// A data folder for the store, a home folder that keeps the user's git configuration out, and a
/// project with one folder that holds a map.
struct CommandLine {
    data_dir: TempDir,
    home: TempDir,
    folder: TempDir,
    project_id: String,
    folder_id: String,
}

impl CommandLine {
    fn with_project() -> Self {
        let mut command_line = Self {
            data_dir: tempfile::tempdir().expect("a temporary data folder"),
            home: tempfile::tempdir().expect("a temporary home folder"),
            folder: tempfile::tempdir().expect("a temporary project folder"),
            project_id: String::new(),
            folder_id: String::new(),
        };
        fs::write(command_line.map_file(), MAP).expect("the map is written");
        let folder = text(command_line.folder.path()).to_string();
        let created = command_line.stdout_of(&[
            "projects", "create", "--name", "demo", "--folder", &folder, "--json",
        ]);
        let project: Value = serde_json::from_str(&created).expect("the project is JSON");
        command_line.project_id = project["id"].as_str().expect("an id").to_string();
        command_line.folder_id = project["folders"][0]["id"]
            .as_str()
            .expect("a folder id")
            .to_string();
        command_line
    }

    fn map_file(&self) -> PathBuf {
        self.folder.path().join("sample1.cc.json")
    }

    fn run(&self, args: &[&str]) -> Output {
        Command::new(CORE_EXECUTABLE)
            .arg("--data-dir")
            .arg(self.data_dir.path())
            .args(["--log-level", "off"])
            .args(args)
            .env("HOME", self.home.path())
            .env("XDG_CONFIG_HOME", self.home.path())
            .env("GIT_CONFIG_NOSYSTEM", "1")
            .output()
            .expect("the core binary runs")
    }

    fn stdout_of(&self, args: &[&str]) -> String {
        let output = self.run(args);
        assert!(
            output.status.success(),
            "{args:?} failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        String::from_utf8(output.stdout).expect("the core writes UTF-8")
    }

    fn import(&self, folder_id: &str) -> Output {
        let file = text(&self.map_file()).to_string();
        self.run(&[
            "snapshots",
            "import",
            "--project",
            &self.project_id,
            "--folder",
            folder_id,
            "--file",
            &file,
        ])
    }

    fn list(&self) -> String {
        self.stdout_of(&[
            "snapshots",
            "list",
            "--project",
            &self.project_id,
            "--folder",
            &self.folder_id,
        ])
    }
}

fn text(path: &Path) -> &str {
    path.to_str().expect("the temporary path is UTF-8")
}

fn stdout(output: &Output) -> String {
    String::from_utf8_lossy(&output.stdout).trim().to_string()
}

#[test]
fn should_import_a_file_and_list_it() {
    // Arrange
    let command_line = CommandLine::with_project();

    // Act
    let imported = command_line.import(&command_line.folder_id);
    let listed = command_line.list();

    // Assert
    assert!(imported.status.success());
    let snapshot_id = stdout(&imported);
    assert!(snapshot_id.starts_with("imported-"), "{snapshot_id}");
    let lines: Vec<&str> = listed.lines().collect();
    assert_eq!(lines.len(), 1);
    assert!(
        lines[0].starts_with(&format!("{snapshot_id}  imported  ")),
        "{}",
        lines[0]
    );
    assert!(lines[0].ends_with("  -  sample1.cc.json"), "{}", lines[0]);
    let snapshot_dir = command_line
        .data_dir
        .path()
        .join("store/projects")
        .join(&command_line.project_id)
        .join("snapshots")
        .join(&command_line.folder_id)
        .join(&snapshot_id);
    assert!(snapshot_dir.join("snapshot.json").is_file());
    assert!(snapshot_dir.join("map.cc.json.gz").is_file());
}

#[test]
fn should_print_the_existing_snapshot_when_importing_the_same_file_twice() {
    // Arrange
    let command_line = CommandLine::with_project();
    let first = stdout(&command_line.import(&command_line.folder_id));

    // Act
    let second = command_line.import(&command_line.folder_id);

    // Assert
    assert!(second.status.success());
    assert_eq!(stdout(&second), first);
    assert!(String::from_utf8_lossy(&second.stderr).contains("imported before"));
    assert_eq!(command_line.list().lines().count(), 1);
}

#[test]
fn should_exit_1_with_the_error_code_for_an_unknown_folder() {
    // Arrange
    let command_line = CommandLine::with_project();

    // Act
    let output = command_line.import(UNKNOWN_FOLDER);

    // Assert
    assert_eq!(output.status.code(), Some(REFUSED));
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(stderr.starts_with("NOT_FOUND: "), "{stderr}");
    assert!(stderr.contains(UNKNOWN_FOLDER), "{stderr}");
}

#[test]
fn should_print_the_listed_snapshots_as_json() {
    // Arrange
    let command_line = CommandLine::with_project();
    let snapshot_id = stdout(&command_line.import(&command_line.folder_id));

    // Act
    let listed = command_line.stdout_of(&[
        "snapshots",
        "list",
        "--project",
        &command_line.project_id,
        "--folder",
        &command_line.folder_id,
        "--json",
    ]);

    // Assert
    let summaries: Value = serde_json::from_str(&listed).unwrap();
    assert_eq!(summaries[0]["ref"]["snapshotId"], snapshot_id.as_str());
    assert_eq!(summaries[0]["source"], "imported");
}
