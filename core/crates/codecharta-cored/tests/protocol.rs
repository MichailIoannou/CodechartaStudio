mod support;

#[cfg(feature = "test-methods")]
use std::time::Instant;

use codecharta_core::CoreError;
use codecharta_core::store::Store;
use codecharta_core::store::lock::StoreLock;
use serde_json::{Value, json};
#[cfg(feature = "test-methods")]
use support::ANSWER_TIMEOUT;
use support::{PROTOCOL_VERSION, ServingCore, error_data_code, hello_params};

#[test]
fn should_answer_hello_with_versions() {
    // Arrange
    let mut core = ServingCore::start();

    // Act
    let answer = core.request(1, "core.hello", hello_params(PROTOCOL_VERSION));

    // Assert
    let result = &answer["result"];
    assert_eq!(result["coreVersion"], json!(env!("CARGO_PKG_VERSION")));
    assert_eq!(result["protocolVersion"], json!(PROTOCOL_VERSION));
    assert!(["win32", "darwin", "linux"].contains(&result["platform"].as_str().unwrap()));
    assert_eq!(
        result["dataDir"],
        json!(core.data_dir.path().to_str().unwrap())
    );
}

#[test]
fn should_refuse_requests_before_hello() {
    // Arrange
    let mut core = ServingCore::start();

    // Act
    let answer = core.request(1, "core.ping", json!({}));

    // Assert
    assert_eq!(answer["error"]["code"], json!(-32000));
    assert_eq!(error_data_code(&answer), &json!("BAD_REQUEST"));
}

#[test]
fn should_answer_protocol_mismatch() {
    // Arrange
    let mut core = ServingCore::start();

    // Act
    let answer = core.request(1, "core.hello", hello_params(PROTOCOL_VERSION + 1));

    // Assert
    assert_eq!(error_data_code(&answer), &json!("PROTOCOL_MISMATCH"));
    let refused_ping = core.request(2, "core.ping", json!({}));
    assert_eq!(error_data_code(&refused_ping), &json!("BAD_REQUEST"));
}

#[test]
fn should_answer_ping_after_hello() {
    // Arrange
    let mut core = ServingCore::started_and_greeted();

    // Act
    let answer = core.request(1, "core.ping", json!({}));

    // Assert
    assert_eq!(
        answer["result"],
        json!({ "coreVersion": env!("CARGO_PKG_VERSION") })
    );
}

#[test]
fn should_answer_unknown_method_with_32601() {
    // Arrange
    let mut core = ServingCore::started_and_greeted();

    // Act
    let answer = core.request(1, "core.doesNotExist", json!({}));

    // Assert
    assert_eq!(answer["error"]["code"], json!(-32601));
}

#[test]
fn should_answer_parse_error_and_keep_serving() {
    // Arrange
    let mut core = ServingCore::started_and_greeted();

    // Act
    core.send_line("this is not json");
    let parse_error = core.receive();
    let answer = core.request(1, "core.ping", json!({}));

    // Assert
    assert_eq!(parse_error["error"]["code"], json!(-32700));
    assert_eq!(parse_error["id"], Value::Null);
    assert!(answer.get("result").is_some());
}

#[test]
fn should_answer_a_request_with_a_string_id() {
    // Arrange
    let mut core = ServingCore::started_and_greeted();

    // Act
    core.send(json!({ "jsonrpc": "2.0", "id": "text-id", "method": "core.ping" }));
    let answer = core.receive_answer_to(&json!("text-id"));

    // Assert
    assert!(answer.get("result").is_some());
}

#[cfg(feature = "test-methods")]
#[test]
fn should_cancel_a_running_request() {
    // Arrange
    let mut core = ServingCore::started_and_greeted();
    let started = Instant::now();
    core.send(json!({ "jsonrpc": "2.0", "id": 5, "method": "core.sleep", "params": { "milliseconds": 60000 } }));
    let progress = core.receive();

    // Act
    core.send(json!({ "jsonrpc": "2.0", "method": "core.cancel", "params": { "id": 5 } }));
    let answer = core.receive_answer_to(&json!(5));

    // Assert
    assert_eq!(progress["method"], json!("core.progress"));
    assert_eq!(progress["params"]["requestId"], json!(5));
    assert_eq!(error_data_code(&answer), &json!("CANCELLED"));
    assert!(started.elapsed() < ANSWER_TIMEOUT);
}

#[cfg(feature = "test-methods")]
#[test]
fn should_answer_other_requests_while_one_is_running() {
    // Arrange
    let mut core = ServingCore::started_and_greeted();
    core.send(json!({ "jsonrpc": "2.0", "id": 5, "method": "core.sleep", "params": { "milliseconds": 60000 } }));

    // Act
    let answer = core.request(6, "core.ping", json!({}));

    // Assert
    assert!(answer.get("result").is_some());
}

#[test]
fn should_exit_cleanly_on_stdin_eof() {
    // Arrange
    let mut core = ServingCore::started_and_greeted();

    // Act
    core.close_stdin();
    let status = core.wait_for_exit();

    // Assert
    assert!(status.success());
}

#[test]
fn should_exit_cleanly_after_a_shutdown_request() {
    // Arrange
    let mut core = ServingCore::started_and_greeted();

    // Act
    let answer = core.request(1, "core.shutdown", json!({}));
    let status = core.wait_for_exit();

    // Assert
    assert_eq!(answer["result"], Value::Null);
    assert!(status.success());
}

#[test]
fn should_write_nothing_but_json_to_stdout() {
    // Arrange
    let mut core = ServingCore::start();
    core.send(json!({ "jsonrpc": "2.0", "id": 1, "method": "core.hello", "params": hello_params(PROTOCOL_VERSION) }));
    core.send(json!({ "jsonrpc": "2.0", "id": 2, "method": "core.ping" }));
    core.send_line("{ broken");
    core.send(json!({ "jsonrpc": "2.0", "id": 3, "method": "core.unknown" }));

    // Act
    core.close_stdin();
    core.wait_for_exit();
    let lines = core.remaining_stdout();

    // Assert
    assert_eq!(lines.len(), 4);
    for line in lines {
        let message: Value = serde_json::from_str(&line).unwrap();
        assert_eq!(message["jsonrpc"], json!("2.0"), "{line}");
    }
}

#[test]
fn should_answer_paths_inside_the_data_dir() {
    // Arrange
    let mut core = ServingCore::started_and_greeted();

    // Act
    let answer = core.request(1, "paths.get", json!({}));

    // Assert
    let store_root = core.data_dir.path().join("store");
    assert_eq!(
        answer["result"]["storeRoot"],
        json!(store_root.to_str().unwrap())
    );
    assert_eq!(answer["result"]["isDefaultStoreRoot"], json!(true));
}

#[test]
fn should_copy_the_store_into_a_chosen_folder_and_keep_it_in_the_settings_file() {
    // Arrange
    let mut core = ServingCore::started_and_greeted();
    let chosen = tempfile::tempdir().unwrap();
    let path = chosen.path().to_str().unwrap();

    // Act
    let answer = core.request(1, "store.changeRoot", json!({ "path": path }));
    let paths = core.request(2, "paths.get", json!({}));

    // Assert
    assert_eq!(
        answer["result"],
        json!({ "storeRoot": path, "adopted": false })
    );
    assert_eq!(paths["result"]["storeRoot"], json!(path));
    assert_eq!(paths["result"]["isDefaultStoreRoot"], json!(false));
    let settings_file = core.data_dir.path().join("core-settings.json");
    let settings: Value =
        serde_json::from_str(&std::fs::read_to_string(settings_file).unwrap()).unwrap();
    assert_eq!(settings["storeRoot"], json!(path));
    assert!(chosen.path().join("store.json").is_file());
    assert!(chosen.path().join(".lock").is_file());
    assert!(core.store_root().join("store.json").is_file());
}

#[test]
fn should_refuse_a_store_folder_that_is_neither_empty_nor_a_store() {
    // Arrange
    let mut core = ServingCore::started_and_greeted();
    let chosen = tempfile::tempdir().unwrap();
    std::fs::write(chosen.path().join("notes.txt"), "mine").unwrap();

    // Act
    let answer = core.request(1, "store.changeRoot", json!({ "path": chosen.path() }));
    let paths = core.request(2, "paths.get", json!({}));

    // Assert
    assert_eq!(error_data_code(&answer), &json!("BAD_REQUEST"));
    assert_eq!(paths["result"]["isDefaultStoreRoot"], json!(true));
}

#[test]
fn should_emit_progress_during_doctor() {
    // Arrange
    let empty_folder = tempfile::tempdir().unwrap();
    let mut core = ServingCore::start_with(|command| {
        command
            .env("PATH", empty_folder.path())
            .env("HOME", empty_folder.path())
            .env_remove("JAVA_HOME");
    });
    core.request(0, "core.hello", hello_params(PROTOCOL_VERSION));

    // Act
    core.send(json!({ "jsonrpc": "2.0", "id": 1, "method": "tools.doctor", "params": { "refresh": true } }));
    let mut progress = Vec::new();
    let answer = loop {
        let message = core.receive();
        if message.get("id") == Some(&json!(1)) {
            break message;
        }
        progress.push(message);
    };

    // Assert
    assert_eq!(answer["result"]["tools"].as_array().unwrap().len(), 5);
    let counts: Vec<(&Value, &Value)> = progress
        .iter()
        .filter(|message| message["method"] == json!("core.progress"))
        .filter(|message| message["params"]["requestId"] == json!(1))
        .map(|message| (&message["params"]["done"], &message["params"]["total"]))
        .collect();
    assert_eq!(counts.len(), 5);
    assert!(counts.iter().all(|(_, total)| **total == json!(5)));
}

#[test]
fn should_resolve_shell_path_targets() {
    // Arrange
    let mut core = ServingCore::started_and_greeted();
    let snapshot_map =
        json!({ "kind": "snapshotMap", "projectId": "p", "folderId": "f", "snapshotId": "s" });

    // Act
    let logs = core.request(
        1,
        "shell.resolvePath",
        json!({ "target": { "kind": "logsFolder" } }),
    );
    let map = core.request(2, "shell.resolvePath", json!({ "target": snapshot_map }));

    // Assert
    let logs_dir = core.data_dir.path().join("logs");
    assert_eq!(logs["result"]["path"], json!(logs_dir.to_str().unwrap()));
    assert_eq!(error_data_code(&map), &json!("NOT_FOUND"));
}

#[test]
fn should_answer_store_status_with_null_for_a_healthy_store() {
    // Arrange
    let mut core = ServingCore::started_and_greeted();

    // Act
    let answer = core.request(1, "store.status", json!({}));

    // Assert
    assert_eq!(answer["result"], json!({ "problem": null }));
    let store_root = core.store_root();
    assert!(store_root.join("store.json").is_file());
    assert!(store_root.join(".lock").is_file());
    let second_writer = Store::open(&store_root);
    assert!(matches!(second_writer, Err(CoreError::StoreLocked { .. })));
}

#[test]
fn should_report_store_newer_schema_and_still_answer_paths_get() {
    // Arrange
    let data_dir = tempfile::tempdir().unwrap();
    let store_root = data_dir.path().join("store");
    std::fs::create_dir_all(&store_root).unwrap();
    std::fs::write(store_root.join("store.json"), r#"{ "schemaVersion": 999 }"#).unwrap();
    let mut core = ServingCore::started_and_greeted_in(data_dir);

    // Act
    let status = core.request(1, "store.status", json!({}));
    let paths = core.request(2, "paths.get", json!({}));

    // Assert
    assert_eq!(status["result"], json!({ "problem": "STORE_NEWER_SCHEMA" }));
    assert_eq!(
        paths["result"]["storeRoot"],
        json!(store_root.to_str().unwrap())
    );
}

#[test]
fn should_report_store_locked_while_another_process_holds_the_store() {
    // Arrange
    let data_dir = tempfile::tempdir().unwrap();
    let store_root = data_dir.path().join("store");
    let _holder = StoreLock::acquire(&store_root).unwrap();
    let mut core = ServingCore::started_and_greeted_in(data_dir);

    // Act
    let status = core.request(1, "store.status", json!({}));

    // Assert
    assert_eq!(status["result"], json!({ "problem": "STORE_LOCKED" }));
    assert!(!store_root.join("store.json").exists());
}
