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
const PAGED_COMMITS: u32 = 501;

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

#[test]
fn should_page_through_git_log_over_stdio() {
    // Arrange
    let repo = TempRepo::new();
    repo.linear_history(PAGED_COMMITS);
    let mut core = GitCore::start(&repo);
    let folder = core.project_of(repo.path());

    // Act
    let first = core.request(
        "git.log",
        json!({ "repo": folder, "scope": { "kind": "head" } }),
    );
    let cursor = first["result"]["nextCursor"].clone();
    let second = core.request(
        "git.log",
        json!({ "repo": folder, "scope": { "kind": "head" }, "cursor": cursor }),
    );

    // Assert
    let first = &first["result"];
    assert_eq!(first["commits"].as_array().map(Vec::len), Some(500));
    assert_eq!(first["commits"][0]["subject"], "Commit 500");
    assert_eq!(first["isGraphAvailable"], true);
    assert_eq!(second["result"]["commits"][0]["subject"], "Commit 0");
    assert_eq!(second["result"]["nextCursor"], Value::Null);
}

#[test]
fn should_answer_history_queries_over_stdio() {
    // Arrange
    let repo = TempRepo::new();
    let root = repo.commit("Root", &[("a.txt", "a")]);
    repo.branch("side");
    let main = repo.commit("Main", &[("main.txt", "main")]);
    repo.tag("v1", false);
    let mut core = GitCore::start(&repo);
    let folder = core.project_of(repo.path());

    // Act
    let details = core.request("git.commitDetails", json!({ "repo": folder, "sha": main }));
    let resolved = core.request(
        "git.resolveCommit",
        json!({ "repo": folder, "revision": "HEAD" }),
    );
    let count = core.request(
        "git.revListCount",
        json!({ "repo": folder, "from": root, "to": main }),
    );
    let base = core.request(
        "git.mergeBase",
        json!({ "repo": folder, "left": root, "right": main }),
    );
    let ancestor = core.request(
        "git.isAncestor",
        json!({ "repo": folder, "ancestor": main, "descendant": root }),
    );
    let distances = core.request(
        "git.measureDistances",
        json!({ "repo": folder, "target": main, "candidates": [root] }),
    );
    let refs = core.request("git.refsAt", json!({ "repo": folder, "sha": root }));
    let changed = core.request(
        "git.changedFiles",
        json!({ "repo": folder, "from": root, "to": main, "mode": "sinceMergeBase" }),
    );

    // Assert
    assert_eq!(details["result"]["subject"], "Main");
    assert_eq!(details["result"]["files"][0]["path"], "main.txt");
    assert_eq!(details["result"]["comparedToParent"], root);
    assert_eq!(resolved["result"]["sha"], main);
    assert_eq!(count["result"], 1);
    assert_eq!(base["result"], root);
    assert_eq!(ancestor["result"], false);
    assert_eq!(
        distances["result"],
        json!({ "distances": [{ "sha": root, "onlyInCandidate": 0, "onlyInTarget": 1 }] })
    );
    assert_eq!(refs["result"], json!({ "branches": ["side"], "tags": [] }));
    assert_eq!(changed["result"]["files"][0]["change"], "added");
    assert_eq!(changed["result"]["totals"]["filesChanged"], 1);
}

#[test]
fn should_reject_malformed_history_params_without_running_git() {
    // Arrange
    let empty_path = tempfile::tempdir().unwrap();
    let path = empty_path.path().to_path_buf();
    let mut core = ServingCore::start_with(move |command| {
        command.env("PATH", &path);
    });
    core.request(0, "core.hello", hello_params(PROTOCOL_VERSION));
    let repo = json!({ "projectId": UNKNOWN_PROJECT, "folderId": UNKNOWN_FOLDER });
    let sha = "0123456789abcdef0123456789abcdef01234567";
    let head = json!({ "kind": "head" });
    let malformed = [
        (
            "git.log",
            json!({ "repo": repo, "scope": head, "cursor": "a/b" }),
        ),
        (
            "git.log",
            json!({ "repo": repo, "scope": { "kind": "refs", "refNames": ["main"] } }),
        ),
        (
            "git.log",
            json!({ "repo": repo, "scope": head, "filter": { "path": "../etc" } }),
        ),
        (
            "git.log",
            json!({ "repo": repo, "scope": head, "filter": { "text": "a\nb" } }),
        ),
        (
            "git.log",
            json!({ "repo": repo, "scope": head, "limit": 5 }),
        ),
        ("git.commitDetails", json!({ "repo": repo, "sha": "HEAD" })),
        (
            "git.commitDetails",
            json!({ "repo": repo, "sha": sha.to_uppercase() }),
        ),
        (
            "git.resolveCommit",
            json!({ "repo": repo, "revision": "HEAD~1" }),
        ),
        (
            "git.resolveCommit",
            json!({ "repo": repo, "revision": "--all" }),
        ),
        (
            "git.revListCount",
            json!({ "repo": repo, "from": "-n", "to": sha }),
        ),
        ("git.mergeBase", json!({ "repo": repo, "left": sha })),
        (
            "git.isAncestor",
            json!({ "repo": repo, "ancestor": sha, "descendant": "main" }),
        ),
        (
            "git.measureDistances",
            json!({ "repo": repo, "target": sha, "candidates": vec![sha; 201] }),
        ),
        (
            "git.refsAt",
            json!({ "repo": repo, "sha": format!("{sha}0") }),
        ),
        (
            "git.changedFiles",
            json!({ "repo": repo, "from": sha, "to": sha, "mode": "both" }),
        ),
    ];

    // Act
    let codes: Vec<Value> = malformed
        .iter()
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
fn should_print_three_log_lines_from_cli_with_limit() {
    // Arrange
    let repo = TempRepo::new();
    repo.commit("One", &[("a.txt", "1")]);
    repo.commit("Two", &[("a.txt", "2")]);
    repo.commit("Three", &[("a.txt", "3")]);
    let newest = repo.commit("Four", &[("a.txt", "4")]);
    let data_dir = tempfile::tempdir().unwrap();

    // Act
    let output = Command::new(CORE_EXECUTABLE)
        .envs(repo.env())
        .arg("--data-dir")
        .arg(data_dir.path())
        .args([
            "--log-level",
            "warn",
            "git",
            "log",
            "--limit",
            "3",
            "--path",
        ])
        .arg(repo.path())
        .output()
        .unwrap();

    // Assert
    assert!(output.status.success(), "{output:?}");
    let stdout = String::from_utf8(output.stdout).unwrap();
    let lines: Vec<&str> = stdout.lines().collect();
    assert_eq!(lines.len(), 3);
    assert_eq!(
        lines[0],
        format!("{} 2023-11-14 Ada Author Four", &newest[..7])
    );
    assert!(lines[2].ends_with("Ada Author Two"));
}
