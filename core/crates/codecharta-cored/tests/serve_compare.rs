mod support;

use std::path::Path;
use std::process::{Command, Output};

use serde_json::{Value, json};
use support::analysis::{SCENARIO_VARIABLE, TestRepository, use_fake_tools, write_scenario};
use support::{CORE_EXECUTABLE, PROTOCOL_VERSION, ServingCore, error_data_code, hello_params};
use tempfile::TempDir;

const UNKNOWN_FOLDER: &str = "f-0000000000000000";

/// A project of one repository whose first commit was analysed with fake-ccsh and which has one more
/// commit, set up through the command line; then a core serves the same data folder.
struct ComparedProject {
    core: ServingCore,
    repository: TestRepository,
    scenario_file: std::path::PathBuf,
    _scenario_dir: TempDir,
    folder: Value,
    snapshot_id: String,
    newer: String,
}

impl ComparedProject {
    fn serve() -> Self {
        let data_dir = tempfile::tempdir().expect("a data folder");
        use_fake_tools(data_dir.path());
        let scenario_dir = tempfile::tempdir().expect("a scenario folder");
        let scenario_file = write_scenario(scenario_dir.path(), &json!({ "write_map": true }));
        let repository = TestRepository::with_commit();
        let command_line = CommandLine {
            data_dir: data_dir.path(),
            repository: &repository,
            scenario_file: &scenario_file,
        };
        let folder = command_line.create_project();
        let snapshot_id = command_line.analyse(&folder, &repository.head);
        let newer = repository.add_commit("b.txt");
        let mut core = ServingCore::launch(data_dir, |command| repository.isolate(command));
        core.request(0, "core.hello", hello_params(PROTOCOL_VERSION));
        Self {
            core,
            repository,
            scenario_file,
            _scenario_dir: scenario_dir,
            folder,
            snapshot_id,
            newer,
        }
    }

    fn command_line(&self) -> CommandLine<'_> {
        CommandLine {
            data_dir: self.core.data_dir.path(),
            repository: &self.repository,
            scenario_file: &self.scenario_file,
        }
    }

    fn resolve(&mut self, id: i64, folder: &Value, a: &str, b: &str) -> Value {
        self.core
            .request(id, "compare.resolve", commits_params(folder, a, b))
    }

    fn changed_files(&mut self, id: i64, folder: &Value, base: &str, head: &str) -> Value {
        let params =
            json!({ "baseFolder": folder, "headFolder": folder, "base": base, "head": head });
        self.core.request(id, "compare.changedFiles", params)
    }

    /// A second project, created over JSON-RPC while the core holds the store.
    fn project_of(&mut self, path: &Path) -> Value {
        let picked = self
            .core
            .request(10, "projects.inspectFolder", json!({ "path": path }));
        let folders = json!([{ "pickToken": picked["result"]["pickToken"], "label": "plain", "role": "primary" }]);
        let project = self.core.request(
            11,
            "projects.create",
            json!({ "name": "Plain", "folders": folders }),
        );
        json!({ "projectId": project["result"]["id"], "folderId": project["result"]["folders"][0]["id"] })
    }
}

/// The core binary run as a command on a data folder.
struct CommandLine<'workspace> {
    data_dir: &'workspace Path,
    repository: &'workspace TestRepository,
    scenario_file: &'workspace Path,
}

impl CommandLine<'_> {
    fn run(&self, args: &[&str]) -> Output {
        let mut command = Command::new(CORE_EXECUTABLE);
        self.repository.isolate(&mut command);
        let output = command
            .arg("--data-dir")
            .arg(self.data_dir)
            .args(["--log-level", "off"])
            .args(args)
            .env(SCENARIO_VARIABLE, self.scenario_file)
            .output()
            .expect("the core binary runs");
        assert!(
            output.status.success(),
            "{args:?} failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        output
    }

    fn create_project(&self) -> Value {
        let path = self.repository.path().to_str().expect("a UTF-8 path");
        let args = [
            "projects", "create", "--name", "demo", "--folder", path, "--json",
        ];
        let project: Value =
            serde_json::from_slice(&self.run(&args).stdout).expect("the project is JSON");
        json!({ "projectId": project["id"], "folderId": project["folders"][0]["id"] })
    }

    fn analyse(&self, folder: &Value, commit: &str) -> String {
        let args = [
            &["analyse"][..],
            &folder_args(folder),
            &["--commit", commit],
        ]
        .concat();
        String::from_utf8_lossy(&self.run(&args).stdout)
            .trim()
            .to_string()
    }

    fn resolve_json(&self, folder: &Value, base: &str, head: &str) -> Value {
        serde_json::from_str(
            &self.resolve_text(folder, &["--base", base, "--head", head, "--json"]),
        )
        .expect("the resolution is JSON")
    }

    fn changed_files_json(&self, folder: &Value, base: &str, head: &str) -> Value {
        let args = [
            &["compare", "changed-files"][..],
            &folder_args(folder),
            &["--base", base, "--head", head, "--json"],
        ]
        .concat();
        serde_json::from_slice(&self.run(&args).stdout).expect("the files are JSON")
    }

    fn changed_files_text(&self, folder: &Value, base: &str, head: &str) -> String {
        let args = [
            &["compare", "changed-files"][..],
            &folder_args(folder),
            &["--base", base, "--head", head],
        ]
        .concat();
        String::from_utf8_lossy(&self.run(&args).stdout).into_owned()
    }

    fn resolve_text(&self, folder: &Value, extra: &[&str]) -> String {
        let args = [&["compare", "resolve"][..], &folder_args(folder), extra].concat();
        String::from_utf8_lossy(&self.run(&args).stdout).into_owned()
    }
}

fn folder_args(folder: &Value) -> [&str; 4] {
    [
        "--project",
        folder["projectId"].as_str().expect("a project id"),
        "--folder",
        folder["folderId"].as_str().expect("a folder id"),
    ]
}

fn commits_params(folder: &Value, a: &str, b: &str) -> Value {
    json!({
        "intent": { "kind": "commits", "folder": folder, "a": a, "b": b },
        "shownCommit": null
    })
}

#[test]
fn should_resolve_a_comparison_over_json_rpc() {
    // Arrange
    let mut project = ComparedProject::serve();
    let (folder, older, newer) = (
        project.folder.clone(),
        project.repository.head.clone(),
        project.newer.clone(),
    );

    // Act
    let answer = project.resolve(1, &folder, &newer, &older);

    // Assert
    let result = &answer["result"];
    assert_eq!(result["status"], json!({ "kind": "ready" }), "{answer}");
    assert_eq!(result["baseMode"], "tip");
    assert_eq!(result["base"]["requested"]["commit"], older.as_str());
    assert_eq!(result["base"]["status"]["status"], "exact");
    assert_eq!(
        result["base"]["status"]["snapshot"]["ref"]["snapshotId"],
        project.snapshot_id.as_str()
    );
    assert_eq!(result["head"]["requested"]["commit"], newer.as_str());
    assert_eq!(result["head"]["status"]["status"], "missing");
    assert_eq!(result["head"]["status"]["nearest"]["relation"], "ancestor");
    assert_eq!(result["head"]["status"]["nearest"]["staleBy"], 1);
    assert_eq!(result["preflight"]["identicalChecksums"], true);
}

#[test]
fn should_answer_an_unknown_folder_an_expression_and_a_plain_folder_with_typed_errors() {
    // Arrange
    let mut project = ComparedProject::serve();
    let folder = project.folder.clone();
    let unknown_folder = json!({ "projectId": folder["projectId"], "folderId": UNKNOWN_FOLDER });
    let plain_dir = tempfile::tempdir().expect("a plain folder");
    let plain_folder = project.project_of(plain_dir.path());

    // Act
    let unknown = project.resolve(1, &unknown_folder, "HEAD", "HEAD");
    let expression = project.resolve(2, &folder, "HEAD~1", "HEAD");
    let plain = project.resolve(3, &plain_folder, "HEAD", "HEAD");

    // Assert
    assert_eq!(error_data_code(&unknown), "NOT_FOUND");
    assert_eq!(error_data_code(&expression), "BAD_REQUEST");
    assert_eq!(error_data_code(&plain), "NOT_A_REPOSITORY", "{plain}");
}

fn explicit_params(base_folder: &Value, head_folder: &Value) -> Value {
    let side =
        |folder: &Value| json!({ "folder": folder, "rev": { "kind": "rev", "name": "HEAD" } });
    json!({
        "intent": { "kind": "explicit", "base": side(base_folder), "head": side(head_folder), "baseMode": "tip" },
        "shownCommit": null
    })
}

const IMPORTED_MAP: &str = r#"{"projectName":"demo","apiVersion":"1.5","nodes":[]}"#;

#[test]
fn should_resolve_a_commit_against_an_imported_snapshot_over_json_rpc() {
    // Arrange
    let mut project = ComparedProject::serve();
    let folder = project.folder.clone();
    let maps = tempfile::tempdir().expect("a folder for the map");
    let map_file = maps.path().join("export.cc.json");
    std::fs::write(&map_file, IMPORTED_MAP).expect("the map is written");
    let picked = project.core.request(
        1,
        "snapshots.inspectImportFile",
        json!({ "path": map_file }),
    );
    let import = json!({
        "projectId": folder["projectId"], "folderId": folder["folderId"],
        "importToken": picked["result"]["importToken"], "bindToCommit": null
    });
    let imported = project.core.request(2, "snapshots.import", import);
    let snapshot_id = imported["result"]["ref"]["snapshotId"].clone();
    let mut params = explicit_params(&folder, &folder);
    params["intent"]["head"]["rev"] = json!({ "kind": "imported", "snapshotId": snapshot_id });

    // Act
    let answer = project.core.request(3, "compare.resolve", params);

    // Assert
    let head = &answer["result"]["head"];
    assert_eq!(head["requested"]["kind"], "imported", "{answer} {imported}");
    assert_eq!(head["requested"]["commit"], Value::Null);
    assert_eq!(head["requested"]["label"]["name"], "export.cc.json");
    assert_eq!(head["status"]["status"], "exact");
    assert_eq!(answer["result"]["baseMode"], "tip");
}

#[test]
fn should_refuse_a_comparison_across_two_projects() {
    // Arrange
    let mut project = ComparedProject::serve();
    let folder = project.folder.clone();
    let plain_dir = tempfile::tempdir().expect("a plain folder");
    let other_project = project.project_of(plain_dir.path());

    // Act
    let answer = project.core.request(
        1,
        "compare.resolve",
        explicit_params(&folder, &other_project),
    );

    // Assert
    assert_eq!(error_data_code(&answer), "BAD_REQUEST", "{answer}");
}

#[test]
fn should_print_the_same_resolution_as_json_on_the_command_line() {
    // Arrange
    let mut project = ComparedProject::serve();
    let (folder, older, newer) = (
        project.folder.clone(),
        project.repository.head.clone(),
        project.newer.clone(),
    );
    let served = project.resolve(1, &folder, &newer, &older);

    // Act
    let printed = project.command_line().resolve_json(&folder, &newer, &older);
    let text = project
        .command_line()
        .resolve_text(&folder, &["--base", &newer, "--head", &older]);

    // Assert
    assert_eq!(printed, served["result"]);
    let lines: Vec<&str> = text.lines().collect();
    assert_eq!(lines[0], "ready");
    assert_eq!(
        lines[1],
        format!(
            "base  {0}  {0}  exact {1}",
            &older[..7],
            project.snapshot_id
        )
    );
    assert!(
        lines[2].ends_with("stale by 1"),
        "the head line is {}",
        lines[2]
    );
}

#[test]
fn should_list_the_changed_files_over_json_rpc() {
    // Arrange
    let mut project = ComparedProject::serve();
    let (folder, older, newer) = (
        project.folder.clone(),
        project.repository.head.clone(),
        project.newer.clone(),
    );

    // Act
    let answer = project.changed_files(1, &folder, &older, &newer);

    // Assert
    assert_eq!(
        answer["result"],
        json!({
            "source": "git",
            "files": [{ "change": "added", "path": "b.txt", "previousPath": null }]
        }),
        "{answer}"
    );
}

#[test]
fn should_answer_changed_files_of_an_unknown_folder_and_a_malformed_commit_with_typed_errors() {
    // Arrange
    let mut project = ComparedProject::serve();
    let (folder, older) = (project.folder.clone(), project.repository.head.clone());
    let unknown_folder = json!({ "projectId": folder["projectId"], "folderId": UNKNOWN_FOLDER });

    // Act
    let unknown = project.changed_files(1, &unknown_folder, &older, &older);
    let malformed = project.changed_files(2, &folder, "HEAD", &older);

    // Assert
    assert_eq!(error_data_code(&unknown), "NOT_FOUND", "{unknown}");
    assert_eq!(error_data_code(&malformed), "BAD_REQUEST", "{malformed}");
}

#[test]
fn should_print_the_changed_files_as_json_and_as_lines_on_the_command_line() {
    // Arrange
    let mut project = ComparedProject::serve();
    let (folder, older, newer) = (
        project.folder.clone(),
        project.repository.head.clone(),
        project.newer.clone(),
    );
    let served = project.changed_files(1, &folder, &older, &newer);

    // Act
    let printed = project
        .command_line()
        .changed_files_json(&folder, &older, &newer);
    let text = project
        .command_line()
        .changed_files_text(&folder, &older, &newer);

    // Assert
    assert_eq!(printed, served["result"]);
    assert_eq!(text, "git\nA  b.txt\n");
}
