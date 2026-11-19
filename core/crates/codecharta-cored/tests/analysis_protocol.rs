mod support;

use std::fs::{self, File, OpenOptions};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use serde_json::{Value, json};
use support::analysis::{SCENARIO_VARIABLE, TestRepository, use_fake_tools, write_scenario};
use support::{PROTOCOL_VERSION, ServingCore, error_data_code, hello_params};

const UNKNOWN_PROJECT: &str = "p-0000000000000000";
const UNKNOWN_FOLDER: &str = "f-0000000000000000";
const JOB_EVENT_TIMEOUT: Duration = Duration::from_secs(20);
const POLL: Duration = Duration::from_millis(20);
const LEFTOVER_PROJECT: &str = "p-0123456789abcdef";
const LEFTOVER_FOLDER: &str = "f-0000000000000001";

/// A serving core whose ccsh and java are fake-ccsh, playing `scenario`, and a project of one repository.
struct AnalysisCore {
    core: ServingCore,
    repository: TestRepository,
    _scenario_dir: tempfile::TempDir,
    folder: Value,
    next_id: i64,
}

impl AnalysisCore {
    fn start(scenario: &Value) -> Self {
        let repository = TestRepository::with_commit();
        let scenario_dir = tempfile::tempdir().expect("a scenario folder");
        let scenario_file = write_scenario(scenario_dir.path(), scenario);
        let data_dir = tempfile::tempdir().expect("a data folder");
        use_fake_tools(data_dir.path());
        let mut core = ServingCore::launch(data_dir, |command| {
            repository.isolate(command);
            command.env(SCENARIO_VARIABLE, &scenario_file);
        });
        core.request(0, "core.hello", hello_params(PROTOCOL_VERSION));
        let mut started = Self {
            core,
            repository,
            _scenario_dir: scenario_dir,
            folder: Value::Null,
            next_id: 1,
        };
        started.folder = started.project_of_repository();
        started
    }

    fn request(&mut self, method: &str, params: Value) -> Value {
        self.next_id += 1;
        self.core.request(self.next_id, method, params)
    }

    fn project_of_repository(&mut self) -> Value {
        let path = self.repository.path().to_path_buf();
        let picked = self.request("projects.inspectFolder", json!({ "path": path }));
        let token = picked["result"]["pickToken"].clone();
        let folders = json!([{ "pickToken": token, "label": "app", "role": "primary" }]);
        let project = self.request(
            "projects.create",
            json!({ "name": "Demo", "folders": folders }),
        );
        json!({
            "projectId": project["result"]["id"],
            "folderId": project["result"]["folders"][0]["id"],
        })
    }

    fn head_target(&self) -> Value {
        let mut params = self.folder.clone();
        params["target"] = json!({ "kind": "commit", "sha": self.repository.head });
        params
    }

    fn enqueue_head(&mut self) -> Value {
        let params = self.head_target();
        self.request("analysis.enqueue", params)
    }

    /// Enqueues HEAD and answers the response and every notification up to and including the first one
    /// named `last`; notifications may arrive before the response.
    fn enqueue_head_until(&mut self, last: &str) -> (Value, Vec<Value>) {
        self.next_id += 1;
        let id = json!(self.next_id);
        let request = json!({
            "jsonrpc": "2.0", "id": id, "method": "analysis.enqueue", "params": self.head_target()
        });
        self.core.send(request);
        let deadline = Instant::now() + JOB_EVENT_TIMEOUT;
        let (mut answer, mut notifications) = (None, Vec::<Value>::new());
        while Instant::now() < deadline {
            let message = self.core.receive();
            if message.get("id") == Some(&id) {
                answer = Some(message);
            } else if message.get("id").is_none() {
                notifications.push(message);
            }
            let saw_last = notifications.iter().any(|seen| seen["method"] == last);
            if let (Some(answer), true) = (&answer, saw_last) {
                return (answer.clone(), notifications);
            }
        }
        panic!("no answer or {last} within {JOB_EVENT_TIMEOUT:?}: {notifications:?}");
    }
}

fn names(notifications: &[Value]) -> Vec<&str> {
    notifications
        .iter()
        .filter_map(|notification| notification["method"].as_str())
        .filter(|name| *name != "analysis.progress")
        .collect()
}

#[test]
fn should_reject_a_malformed_sha_an_unknown_project_and_a_path_like_snapshot_id() {
    // Arrange
    let mut core = AnalysisCore::start(&json!({ "write_map": true }));
    let mut malformed_sha = core.folder.clone();
    malformed_sha["target"] = json!({ "kind": "commit", "sha": "HEAD~1" });
    let unknown_project = json!({
        "projectId": UNKNOWN_PROJECT,
        "folderId": UNKNOWN_FOLDER,
        "target": { "kind": "workingTree" }
    });
    let mut path_like = core.folder.clone();
    path_like["snapshotId"] = json!("../../escape");

    // Act
    let sha_answer = core.request("analysis.enqueue", malformed_sha);
    let project_answer = core.request("analysis.enqueue", unknown_project.clone());
    let preflight_answer = core.request("analysis.preflight", unknown_project);
    let log_answer = core.request("snapshots.readLog", path_like);
    let cancel_answer = core.request(
        "analysis.cancel",
        json!({ "jobId": "job-0000000000000000" }),
    );

    // Assert
    assert_eq!(error_data_code(&sha_answer), "BAD_REQUEST");
    assert_eq!(error_data_code(&project_answer), "NOT_FOUND");
    assert_eq!(error_data_code(&preflight_answer), "NOT_FOUND");
    assert_eq!(error_data_code(&log_answer), "BAD_REQUEST");
    assert_eq!(error_data_code(&cancel_answer), "NOT_FOUND");
}

#[test]
fn should_emit_analysis_queued_started_and_finished_over_serve() {
    // Arrange
    let mut core = AnalysisCore::start(&json!({ "write_map": true }));

    // Act
    let (enqueued, notifications) = core.enqueue_head_until("snapshots.changed");
    let again = core.enqueue_head();

    // Assert
    assert_eq!(enqueued["result"]["status"], "queued", "{enqueued}");
    assert_eq!(
        names(&notifications),
        [
            "analysis.queued",
            "analysis.started",
            "analysis.finished",
            "snapshots.changed"
        ]
    );
    let finished = &notifications[notifications.len() - 2]["params"]["job"];
    let snapshot_id = finished["snapshotId"].clone();
    assert_eq!(finished["state"], "done");
    assert_eq!(again["result"]["status"], "alreadyAnalysed");
    assert_eq!(again["result"]["snapshotId"], snapshot_id);
    let listed = core.request("snapshots.list", core.folder.clone());
    assert_eq!(
        listed["result"]["snapshots"][0]["ref"]["snapshotId"],
        snapshot_id
    );
    let mut snapshot_ref = core.folder.clone();
    snapshot_ref["snapshotId"] = snapshot_id;
    let log = core.request("snapshots.readLog", snapshot_ref);
    assert!(
        log["result"]["log"]
            .as_str()
            .is_some_and(|text| text.contains("Map:")),
        "{log}"
    );
    let jobs = core.request("analysis.list", json!({}));
    assert_eq!(jobs["result"]["jobs"][0]["state"], "done");
}

#[test]
fn should_report_a_failed_analysis_and_forget_it_on_clear() {
    // Arrange
    let mut core = AnalysisCore::start(&json!({ "exit_code": 1, "stdout": ["Something broke"] }));

    // Act
    let (_, notifications) = core.enqueue_head_until("analysis.failed");
    core.request("analysis.clearFinished", json!({}));
    let jobs = core.request("analysis.list", json!({}));

    // Assert
    let failed = &notifications[notifications.len() - 1]["params"]["job"];
    assert_eq!(failed["state"], "failed");
    assert_eq!(failed["error"]["code"], "ANALYSIS_FAILED");
    assert_eq!(jobs["result"]["jobs"], json!([]));
}

const PLAIN_MAP: &str = r#"{"projectName":"demo","apiVersion":"1.5","nodes":[]}"#;

fn resolve_params(folder: &Value, target: Value) -> Value {
    let mut params = folder.clone();
    params["target"] = target;
    params
}

/// A project of one folder without git whose only snapshot is an imported map.
fn plain_project_with_import(core: &mut AnalysisCore, plain: &Path) -> Value {
    fs::write(plain.join("map.cc.json"), PLAIN_MAP).expect("the map is written");
    let picked = core.request("projects.inspectFolder", json!({ "path": plain }));
    let folders = json!([{ "pickToken": picked["result"]["pickToken"], "label": "plain", "role": "primary" }]);
    let project = core.request(
        "projects.create",
        json!({ "name": "Plain", "folders": folders }),
    );
    let folder = json!({
        "projectId": project["result"]["id"],
        "folderId": project["result"]["folders"][0]["id"],
    });
    let file = core.request(
        "snapshots.inspectImportFile",
        json!({ "path": plain.join("map.cc.json") }),
    );
    let mut import = folder.clone();
    import["importToken"] = file["result"]["importToken"].clone();
    import["bindToCommit"] = Value::Null;
    let imported = core.request("snapshots.import", import);
    assert!(imported.get("result").is_some(), "{imported}");
    folder
}

#[test]
fn should_return_each_resolution_kind_over_json_rpc() {
    // Arrange
    let mut core = AnalysisCore::start(&json!({ "write_map": true }));
    let head_target = json!({ "kind": "commit", "sha": core.repository.head });
    let plain = tempfile::tempdir().expect("a plain folder");
    let plain_folder = plain_project_with_import(&mut core, plain.path());

    // Act
    let none = core.request(
        "snapshots.resolveForCommit",
        resolve_params(&core.folder, head_target.clone()),
    );
    core.enqueue_head_until("snapshots.changed");
    let exact = core.request(
        "snapshots.resolveForCommit",
        resolve_params(&core.folder, head_target),
    );
    let next = core.repository.add_commit("b.txt");
    let nearest = core.request(
        "snapshots.resolveForCommit",
        resolve_params(&core.folder, json!({ "kind": "commit", "sha": next })),
    );
    let latest = core.request(
        "snapshots.resolveForCommit",
        resolve_params(&plain_folder, json!({ "kind": "workingTree" })),
    );

    // Assert
    assert_eq!(
        none["result"],
        json!({ "kind": "none", "reason": "NO_SNAPSHOTS" })
    );
    assert_eq!(exact["result"]["kind"], "exact", "{exact}");
    assert_eq!(exact["result"]["isCurrentProfile"], true);
    let analysed = exact["result"]["snapshot"]["ref"]["snapshotId"].clone();
    assert_eq!(nearest["result"]["kind"], "nearest", "{nearest}");
    assert_eq!(nearest["result"]["snapshot"]["ref"]["snapshotId"], analysed);
    assert_eq!(nearest["result"]["relation"], "ancestor");
    assert_eq!(nearest["result"]["behind"], 1);
    assert_eq!(nearest["result"]["ahead"], 0);
    assert_eq!(latest["result"]["kind"], "latest", "{latest}");
    assert_eq!(latest["result"]["reason"], "PLAIN_FOLDER");
    assert_eq!(latest["result"]["snapshot"]["source"], "imported");
}

fn leftover(snapshots_dir: &Path, name: &str) -> PathBuf {
    let folder = snapshots_dir.join(name);
    fs::create_dir_all(&folder).expect("the leftover folder is created");
    let job =
        json!({ "repositoryPath": null, "sha": null, "worktreesBefore": [], "pid": 4_000_000 });
    fs::write(folder.join("job.json"), job.to_string()).expect("the job file is written");
    folder
}

fn hold_lock(folder: &Path) -> File {
    let lock = OpenOptions::new()
        .create(true)
        .truncate(false)
        .write(true)
        .open(folder.join("job.lock"))
        .expect("the lock file opens");
    lock.try_lock().expect("the test holds the lock");
    lock
}

#[test]
fn should_clean_a_leftover_temp_folder_of_a_dead_pid_on_start_and_leave_one_of_a_live_pid() {
    // Arrange
    let data_dir = tempfile::tempdir().expect("a data folder");
    let snapshots_dir = data_dir
        .path()
        .join("store")
        .join("projects")
        .join(LEFTOVER_PROJECT)
        .join("snapshots")
        .join(LEFTOVER_FOLDER);
    let dead = leftover(&snapshots_dir, ".incoming-0000dead");
    let live = leftover(&snapshots_dir, ".incoming-0000a11e");
    let _held = hold_lock(&live);

    // Act
    let mut core = ServingCore::launch(data_dir, |_| {});
    core.request(0, "core.hello", hello_params(PROTOCOL_VERSION));
    let deadline = Instant::now() + JOB_EVENT_TIMEOUT;
    while dead.exists() && Instant::now() < deadline {
        std::thread::sleep(POLL);
    }

    // Assert
    assert!(!dead.exists());
    assert!(live.join("job.json").is_file());
}
