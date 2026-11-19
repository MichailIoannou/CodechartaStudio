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
