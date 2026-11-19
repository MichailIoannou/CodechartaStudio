mod support;

use std::fs;
use std::path::Path;
use std::process::{Command, Output};

use serde_json::{Value, json};
use support::CORE_EXECUTABLE;
use support::analysis::{SCENARIO_VARIABLE, TestRepository, use_fake_tools, write_scenario};
use tempfile::TempDir;

const REFUSED: i32 = 1;
const USAGE_ERROR: i32 = 2;

/// A data folder whose ccsh and java are fake-ccsh, and a project of one git repository.
struct CommandLine {
    data_dir: TempDir,
    repository: TestRepository,
    scenario_dir: TempDir,
    project_id: String,
    folder_id: String,
}

impl CommandLine {
    fn with_project() -> Self {
        let data_dir = tempfile::tempdir().expect("a data folder");
        use_fake_tools(data_dir.path());
        let mut command_line = Self {
            data_dir,
            repository: TestRepository::with_commit(),
            scenario_dir: tempfile::tempdir().expect("a scenario folder"),
            project_id: String::new(),
            folder_id: String::new(),
        };
        let folder = text(command_line.repository.path()).to_string();
        let created = command_line.run(&[
            "projects", "create", "--name", "demo", "--folder", &folder, "--json",
        ]);
        assert!(created.status.success(), "{}", stderr_of(&created));
        let project: Value = serde_json::from_slice(&created.stdout).expect("the project is JSON");
        command_line.project_id = project["id"].as_str().expect("an id").to_string();
        command_line.folder_id = project["folders"][0]["id"]
            .as_str()
            .expect("a folder id")
            .to_string();
        command_line
    }

    fn play(&self, scenario: &Value) {
        write_scenario(self.scenario_dir.path(), scenario);
    }

    fn run(&self, args: &[&str]) -> Output {
        let scenario = self.scenario_dir.path().join("fake-ccsh-scenario.json");
        let mut command = Command::new(CORE_EXECUTABLE);
        self.repository.isolate(&mut command);
        command
            .arg("--data-dir")
            .arg(self.data_dir.path())
            .args(["--log-level", "off"])
            .args(args)
            .env(SCENARIO_VARIABLE, scenario)
            .output()
            .expect("the core binary runs")
    }

    fn analyse(&self, extra: &[&str]) -> Output {
        let folder_args = [
            "analyse",
            "--project",
            &self.project_id,
            "--folder",
            &self.folder_id,
        ];
        self.run(&[&folder_args[..], extra].concat())
    }

    fn snapshot_dir(&self, snapshot_id: &str) -> std::path::PathBuf {
        self.data_dir
            .path()
            .join("store")
            .join("projects")
            .join(&self.project_id)
            .join("snapshots")
            .join(&self.folder_id)
            .join(snapshot_id)
    }
}

fn text(path: &Path) -> &str {
    path.to_str().expect("the temporary path is UTF-8")
}

fn stdout_of(output: &Output) -> String {
    String::from_utf8_lossy(&output.stdout).trim().to_string()
}

fn stderr_of(output: &Output) -> String {
    String::from_utf8_lossy(&output.stderr).into_owned()
}

#[test]
fn should_print_the_snapshot_id_and_exit_0() {
    // Arrange
    let command_line = CommandLine::with_project();
    command_line.play(&json!({ "write_map": true }));

    // Act
    let output = command_line.analyse(&[]);

    // Assert
    assert!(output.status.success(), "{}", stderr_of(&output));
    let snapshot_id = stdout_of(&output);
    assert!(snapshot_id.starts_with("worktree-"), "{snapshot_id}");
    let snapshot_dir = command_line.snapshot_dir(&snapshot_id);
    let mut files: Vec<String> = fs::read_dir(&snapshot_dir)
        .expect("the snapshot folder exists")
        .map(|entry| {
            entry
                .expect("an entry")
                .file_name()
                .to_string_lossy()
                .into_owned()
        })
        .collect();
    files.sort();
    assert_eq!(files, ["map.cc.json.gz", "run.log", "snapshot.json"]);
}

#[test]
fn should_print_a_commit_snapshot_as_json_and_report_it_analysed_the_second_time() {
    // Arrange
    let command_line = CommandLine::with_project();
    command_line.play(&json!({ "write_map": true }));
    let head = command_line.repository.head.clone();

    // Act
    let first = command_line.analyse(&["--commit", &head, "--json"]);
    let second = command_line.analyse(&["--commit", &head, "--json"]);

    // Assert
    assert!(first.status.success(), "{}", stderr_of(&first));
    let analysed: Value = serde_json::from_slice(&first.stdout).expect("the answer is JSON");
    let snapshot_id = analysed["snapshotId"].as_str().expect("a snapshot id");
    assert!(
        snapshot_id.starts_with(&format!("{head}-")),
        "{snapshot_id}"
    );
    assert_eq!(analysed["wasAlreadyAnalysed"], false);
    assert_eq!(analysed["job"]["state"], "done");
    assert!(second.status.success(), "{}", stderr_of(&second));
    let again: Value = serde_json::from_slice(&second.stdout).expect("the answer is JSON");
    assert_eq!(again["snapshotId"], snapshot_id);
    assert_eq!(again["wasAlreadyAnalysed"], true);
}

#[test]
fn should_exit_1_with_the_error_code_on_failure() {
    // Arrange
    let command_line = CommandLine::with_project();
    command_line.play(&json!({ "exit_code": 1, "stdout": ["Something broke"] }));

    // Act
    let output = command_line.analyse(&[]);

    // Assert
    assert_eq!(output.status.code(), Some(REFUSED));
    assert!(output.stdout.is_empty());
    assert!(
        stderr_of(&output).contains("ANALYSIS_FAILED: "),
        "{}",
        stderr_of(&output)
    );
}

#[test]
fn should_exit_2_for_a_bad_sha() {
    // Arrange
    let command_line = CommandLine::with_project();

    // Act
    let output = command_line.analyse(&["--commit", "HEAD"]);

    // Assert
    assert_eq!(output.status.code(), Some(USAGE_ERROR));
}

#[test]
fn should_exit_1_with_the_preflight_error_code_for_an_unknown_commit() {
    // Arrange
    let command_line = CommandLine::with_project();
    let unknown = "0123456789abcdef0123456789abcdef01234567";

    // Act
    let output = command_line.analyse(&["--commit", unknown]);

    // Assert
    assert_eq!(output.status.code(), Some(REFUSED));
    assert!(
        stderr_of(&output).contains("UNKNOWN_COMMIT: "),
        "{}",
        stderr_of(&output)
    );
}

#[test]
fn should_resolve_no_snapshot_until_the_nearest_search_exists() {
    // Arrange
    let command_line = CommandLine::with_project();
    let folder_args = [
        "snapshots",
        "resolve",
        "--project",
        command_line.project_id.as_str(),
        "--folder",
        command_line.folder_id.as_str(),
    ];

    // Act
    let text_output = command_line.run(&folder_args);
    let json_output = command_line.run(&[&folder_args[..], &["--json"]].concat());

    // Assert
    assert!(text_output.status.success(), "{}", stderr_of(&text_output));
    assert_eq!(stdout_of(&text_output), "none");
    let resolution: Value = serde_json::from_slice(&json_output.stdout).expect("JSON");
    assert_eq!(resolution, json!({ "kind": "none" }));
}
