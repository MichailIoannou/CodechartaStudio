mod support;

use std::fs;
use std::path::{Path, PathBuf};

use serde_json::{Value, json};
use support::{PROTOCOL_VERSION, ServingCore, error_data_code, hello_params};
use tempfile::TempDir;

const MAP: &str = r#"{"projectName":"demo","apiVersion":"1.5","nodes":[]}"#;
const UNKNOWN_SNAPSHOT: &str = "imported-0000000000000000";

/// A serving core whose git reads no user or system configuration, and a folder `assets` with a map.
struct SnapshotsCore {
    core: ServingCore,
    _home: TempDir,
    maps: TempDir,
    next_id: i64,
}

impl SnapshotsCore {
    fn start() -> Self {
        let home = tempfile::tempdir().expect("a temporary home folder");
        let home_path = home.path().to_path_buf();
        let data_dir = tempfile::tempdir().expect("a temporary data folder");
        let mut core = ServingCore::launch(data_dir, move |command| {
            command
                .env("HOME", &home_path)
                .env("XDG_CONFIG_HOME", &home_path)
                .env("GIT_CONFIG_NOSYSTEM", "1");
        });
        core.request(0, "core.hello", hello_params(PROTOCOL_VERSION));
        let maps = tempfile::tempdir().expect("a temporary map folder");
        fs::create_dir_all(maps.path().join("assets")).expect("the map folder is created");
        fs::write(maps.path().join("assets").join("sample1.cc.json"), MAP)
            .expect("the map is written");
        Self {
            core,
            _home: home,
            maps,
            next_id: 1,
        }
    }

    fn map_file(&self) -> PathBuf {
        self.maps.path().join("assets").join("sample1.cc.json")
    }

    fn request(&mut self, method: &str, params: Value) -> Value {
        self.next_id += 1;
        self.core.request(self.next_id, method, params)
    }

    fn import_token(&mut self, file: &Path) -> String {
        let picked = self.request("snapshots.inspectImportFile", json!({ "path": file }));
        picked["result"]["importToken"]
            .as_str()
            .expect("the inspection answers a token")
            .to_string()
    }

    fn open(&mut self, token: &str) -> Value {
        self.request(
            "snapshots.openFile",
            json!({ "importToken": token, "target": null, "bindToCommit": null }),
        )
    }
}

#[test]
fn should_answer_a_map_location_inside_the_store_root() {
    // Arrange
    let mut core = SnapshotsCore::start();
    let token = core.import_token(&core.map_file());
    let opened = core.open(&token)["result"].clone();
    let snapshot_ref = opened["snapshot"]["ref"].clone();

    // Act
    let location = core.request("snapshots.mapLocation", snapshot_ref.clone());
    let resolved = core.request(
        "shell.resolvePath",
        json!({ "target": {
            "kind": "snapshotMap",
            "projectId": snapshot_ref["projectId"],
            "folderId": snapshot_ref["folderId"],
            "snapshotId": snapshot_ref["snapshotId"],
        } }),
    );

    // Assert
    let path = PathBuf::from(location["result"]["path"].as_str().expect("a path"));
    assert!(path.starts_with(core.core.store_root()), "{path:?}");
    assert!(path.ends_with("map.cc.json.gz"));
    assert!(path.is_file());
    assert_eq!(resolved["result"]["path"], location["result"]["path"]);
    assert_eq!(opened["project"]["name"], "assets");
    assert_eq!(opened["createdProject"], true);
}

#[test]
fn should_answer_not_found_for_an_unknown_snapshot() {
    // Arrange
    let mut core = SnapshotsCore::start();
    let token = core.import_token(&core.map_file());
    let opened = core.open(&token)["result"].clone();
    let mut snapshot_ref = opened["snapshot"]["ref"].clone();
    snapshot_ref["snapshotId"] = json!(UNKNOWN_SNAPSHOT);

    // Act
    let answer = core.request("snapshots.mapLocation", snapshot_ref);

    // Assert
    assert_eq!(error_data_code(&answer), "NOT_FOUND");
}

#[test]
fn should_report_a_file_opened_again_as_already_imported_and_list_it_once() {
    // Arrange
    let mut core = SnapshotsCore::start();
    let first_token = core.import_token(&core.map_file());
    let first = core.open(&first_token)["result"].clone();
    let second_token = core.import_token(&core.map_file());

    // Act
    let second = core.open(&second_token)["result"].clone();
    let listed = core.request(
        "snapshots.list",
        json!({
            "projectId": first["project"]["id"],
            "folderId": first["snapshot"]["ref"]["folderId"],
        }),
    );

    // Assert
    assert_eq!(second["wasAlreadyImported"], true);
    assert_eq!(second["createdProject"], false);
    assert_eq!(second["snapshot"], first["snapshot"]);
    assert_eq!(listed["result"]["snapshots"], json!([first["snapshot"]]));
}

#[test]
fn should_answer_token_expired_for_a_used_import_token() {
    // Arrange
    let mut core = SnapshotsCore::start();
    let token = core.import_token(&core.map_file());
    core.open(&token);

    // Act
    let answer = core.open(&token);

    // Assert
    assert_eq!(error_data_code(&answer), "TOKEN_EXPIRED");
}

#[test]
fn should_answer_bad_request_for_a_snapshot_map_target_that_is_not_an_id() {
    // Arrange
    let mut core = SnapshotsCore::start();

    // Act
    let answer = core.request(
        "shell.resolvePath",
        json!({ "target": {
            "kind": "snapshotMap",
            "projectId": "../p",
            "folderId": "f-1",
            "snapshotId": "s-1",
        } }),
    );

    // Assert
    assert_eq!(error_data_code(&answer), "BAD_REQUEST");
}

#[test]
fn should_move_and_delete_a_snapshot_over_json_rpc() {
    // Arrange
    let mut core = SnapshotsCore::start();
    let token = core.import_token(&core.map_file());
    let opened = core.open(&token)["result"].clone();
    let snapshot_ref = opened["snapshot"]["ref"].clone();
    let mut move_params = snapshot_ref.clone();
    move_params["toFolderId"] = snapshot_ref["folderId"].clone();
    move_params["bindToCommit"] = json!(null);
    let mut delete_params = snapshot_ref.clone();
    delete_params["permanently"] = json!(true);

    // Act
    let moved = core.request("snapshots.move", move_params);
    let deleted = core.request("snapshots.delete", delete_params);
    let listed = core.request(
        "snapshots.list",
        json!({ "projectId": snapshot_ref["projectId"], "folderId": snapshot_ref["folderId"] }),
    );

    // Assert
    assert_eq!(moved["result"]["ref"], snapshot_ref);
    assert_eq!(deleted["result"], json!(null));
    assert_eq!(listed["result"]["snapshots"], json!([]));
}
