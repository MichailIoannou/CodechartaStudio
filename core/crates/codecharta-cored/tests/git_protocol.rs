mod support;

#[allow(
    dead_code,
    reason = "the shared git fixture of the core's tests; this binary uses part of it"
)]
#[path = "../../codecharta-core/tests/support/git_fixture.rs"]
mod git_fixture;

use std::path::{Path, PathBuf};
use std::process::Command;

use git_fixture::TempRepo;
use serde_json::{Value, json};
use support::{CORE_EXECUTABLE, PROTOCOL_VERSION, ServingCore, error_data_code, hello_params};

const UNKNOWN_PROJECT: &str = "p-0000000000000000";
const UNKNOWN_FOLDER: &str = "f-0000000000000000";
const REPOSITORY_CHANGED: &str = "repository.changed";

/// The system git, found the way the core's own fixture expects it.
fn system_git() -> PathBuf {
    let path = std::env::var_os("PATH").unwrap_or_default();
    let file_name = format!("git{}", std::env::consts::EXE_SUFFIX);
    std::env::split_paths(&path)
        .map(|folder| folder.join(&file_name))
        .find(|candidate| candidate.is_file())
        .expect("git is installed on the test machine")
}

/// A serving core whose git sees only the fixture's hermetic configuration.
struct GitCore {
    core: ServingCore,
    next_id: i64,
}

impl GitCore {
    fn start(repo: &TempRepo) -> Self {
        let env = repo.env();
        let data_dir = tempfile::tempdir().expect("a temporary data folder");
        let mut core = ServingCore::launch(data_dir, move |command| {
            command.envs(env);
        });
        core.request(0, "core.hello", hello_params(PROTOCOL_VERSION));
        Self { core, next_id: 0 }
    }

    fn request(&mut self, method: &str, params: Value) -> Value {
        self.next_id += 1;
        self.core.request(self.next_id, method, params)
    }

    /// Creates a project of `folder` and returns the reference of its only folder.
    fn project_of(&mut self, folder: &Path) -> Value {
        let picked = self.request("projects.inspectFolder", json!({ "path": folder }));
        let token = picked["result"]["pickToken"].clone();
        let folders = json!([{ "pickToken": token, "label": "app", "role": "primary" }]);
        let project = self.request(
            "projects.create",
            json!({ "name": "Demo", "folders": folders }),
        );
        let project = &project["result"];
        json!({ "projectId": project["id"], "folderId": project["folders"][0]["id"] })
    }

    /// The answer to the request and the first `notification`, in whichever order they arrive.
    fn request_awaiting(
        &mut self,
        method: &str,
        params: Value,
        notification: &str,
    ) -> (Value, Value) {
        self.next_id += 1;
        let id = json!(self.next_id);
        self.core
            .send(json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params }));
        let (mut answer, mut notified) = (None, None);
        while answer.is_none() || notified.is_none() {
            let message = self.core.receive();
            if message["id"] == id {
                answer = Some(message);
            } else if message["method"] == notification {
                notified = Some(message);
            }
        }
        (answer.unwrap_or_default(), notified.unwrap_or_default())
    }
}

#[test]
fn should_answer_git_status_over_stdio_for_a_fixture_folder() {
    // Arrange
    let repo = TempRepo::new();
    let commit = repo.commit("Add a", &[("a.txt", "a")]);
    let mut core = GitCore::start(&repo);
    let folder = core.project_of(repo.path());

    // Act
    let answer = core.request("git.status", json!({ "repo": folder }));

    // Assert
    assert_eq!(
        answer["result"],
        json!({
            "head": { "kind": "branch", "name": "main", "commit": commit },
            "upstream": null,
            "counts": { "staged": 0, "unstaged": 0, "untracked": 0, "conflicted": 0 },
            "operationInProgress": null
        })
    );
    let info = core.request("git.repositoryInfo", json!({ "repo": folder }));
    assert_eq!(info["result"]["folderPrefix"], "");
}

#[test]
fn should_return_folder_not_found_for_unknown_or_detached_folder() {
    // Arrange
    let repo = TempRepo::new();
    repo.commit("Add a", &[("a.txt", "a")]);
    let mut core = GitCore::start(&repo);
    let folder = core.project_of(repo.path());
    let moved = repo.path().with_extension("moved");
    std::fs::rename(repo.path(), &moved).unwrap();

    // Act
    let unknown = core.request(
        "git.status",
        json!({ "repo": { "projectId": UNKNOWN_PROJECT, "folderId": UNKNOWN_FOLDER } }),
    );
    let detached = core.request("git.branches", json!({ "repo": folder }));

    // Assert
    std::fs::rename(&moved, repo.path()).unwrap();
    assert_eq!(error_data_code(&unknown), "NOT_FOUND");
    assert_eq!(error_data_code(&detached), "FOLDER_UNAVAILABLE");
}

#[test]
fn should_reject_malformed_params_without_running_git() {
    // Arrange
    let empty_path = tempfile::tempdir().unwrap();
    let path = empty_path.path().to_path_buf();
    let mut core = ServingCore::start_with(move |command| {
        command.env("PATH", &path);
    });
    core.request(0, "core.hello", hello_params(PROTOCOL_VERSION));
    let valid_repo = json!({ "projectId": UNKNOWN_PROJECT, "folderId": UNKNOWN_FOLDER });
    let malformed = [
        json!({}),
        json!({ "repo": { "projectId": "../p", "folderId": UNKNOWN_FOLDER } }),
        json!({ "repo": { "projectId": UNKNOWN_PROJECT } }),
        json!({ "repo": valid_repo, "path": "/etc" }),
        json!({ "repo": { "projectId": UNKNOWN_PROJECT, "folderId": UNKNOWN_FOLDER, "path": "/" } }),
    ];
    let methods = [
        "git.status",
        "git.branches",
        "git.repositoryInfo",
        "git.refsFingerprint",
    ];

    // Act
    let codes: Vec<Value> = methods
        .iter()
        .flat_map(|method| malformed.iter().map(move |params| (*method, params)))
        .enumerate()
        .map(|(index, (method, params))| {
            let id = i64::try_from(index).unwrap() + 1;
            error_data_code(&core.request(id, method, params.clone())).clone()
        })
        .collect();

    // Assert
    assert_eq!(codes, vec![json!("BAD_REQUEST"); codes.len()]);
}

#[test]
fn should_emit_repository_changed_when_fingerprint_changes() {
    // Arrange
    let repo = TempRepo::new();
    repo.commit("Add a", &[("a.txt", "a")]);
    let mut core = GitCore::start(&repo);
    let folder = core.project_of(repo.path());
    let before = core.request("git.refsFingerprint", json!({ "repo": folder }));
    repo.commit("Add b", &[("b.txt", "b")]);

    // Act
    let (branches, changed) = core.request_awaiting(
        "git.branches",
        json!({ "repo": folder }),
        REPOSITORY_CHANGED,
    );

    // Assert
    let fingerprint = &branches["result"]["fingerprint"];
    assert_ne!(&before["result"], fingerprint);
    assert_eq!(changed["params"]["fingerprint"], *fingerprint);
    assert_eq!(changed["params"]["repo"], folder);
    assert_eq!(changed["params"]["parts"], json!(["refs"]));
}

#[test]
fn should_print_status_and_branches_from_cli_with_path_and_json() {
    // Arrange
    let repo = TempRepo::new();
    let commit = repo.commit("Add a", &[("a.txt", "a")]);
    repo.branch("feature");
    let data_dir = tempfile::tempdir().unwrap();
    let run = |args: &[&str]| {
        let output = Command::new(CORE_EXECUTABLE)
            .envs(repo.env())
            .arg("--data-dir")
            .arg(data_dir.path())
            .args(["--log-level", "warn", "git"])
            .args(args)
            .arg("--path")
            .arg(repo.path())
            .output()
            .unwrap();
        assert!(output.status.success(), "{output:?}");
        String::from_utf8(output.stdout).unwrap()
    };

    // Act
    let status = run(&["status"]);
    let branches = run(&["branches"]);
    let json: Value = serde_json::from_str(&run(&["branches", "--json"])).unwrap();

    // Assert
    assert_eq!(status, "main · 0 staged, 0 unstaged, 0 untracked\n");
    let short = &commit[..7];
    assert_eq!(branches, format!("  feature  {short}\n* main  {short}\n"));
    assert_eq!(json["localBranches"][1]["name"], "main");
    assert_eq!(json["head"]["commit"], commit);
}
