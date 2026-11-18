use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, ExitStatus, Stdio};
use std::sync::mpsc::{self, Receiver};
use std::thread;
use std::time::{Duration, Instant};

use serde_json::{Value, json};

const CORE_EXECUTABLE: &str = env!("CARGO_BIN_EXE_codecharta-core");
const ANSWER_TIMEOUT: Duration = Duration::from_secs(5);
const EXIT_TIMEOUT: Duration = Duration::from_secs(5);
const EXIT_POLL_INTERVAL: Duration = Duration::from_millis(20);
const PROTOCOL_VERSION: u32 = 1;

struct ServingCore {
    child: Child,
    stdin: Option<ChildStdin>,
    stdout_lines: Receiver<String>,
    data_dir: tempfile::TempDir,
}

impl ServingCore {
    fn start() -> Self {
        Self::start_with(|_| {})
    }

    fn start_with(configure: impl FnOnce(&mut Command)) -> Self {
        let data_dir = tempfile::tempdir().expect("a temporary data folder");
        let mut command = Command::new(CORE_EXECUTABLE);
        configure(&mut command);
        let mut child = command
            .args(["--log-level", "debug", "--data-dir"])
            .arg(data_dir.path())
            .arg("serve")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .expect("the core binary starts");
        let stdin = child.stdin.take();
        let stdout = child.stdout.take().expect("stdout is piped");
        let (sender, stdout_lines) = mpsc::channel();
        thread::spawn(move || {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                if sender.send(line).is_err() {
                    return;
                }
            }
        });
        Self {
            child,
            stdin,
            stdout_lines,
            data_dir,
        }
    }

    fn started_and_greeted() -> Self {
        let mut core = Self::start();
        core.request(0, "core.hello", hello_params(PROTOCOL_VERSION));
        core
    }

    fn send_line(&mut self, line: &str) {
        let stdin = self.stdin.as_mut().expect("stdin is still open");
        writeln!(stdin, "{line}").expect("the core reads stdin");
        stdin.flush().expect("the core reads stdin");
    }

    fn send(&mut self, message: Value) {
        self.send_line(&message.to_string());
    }

    fn request(&mut self, id: i64, method: &str, params: Value) -> Value {
        self.send(json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params }));
        self.receive_answer_to(&json!(id))
    }

    fn receive(&self) -> Value {
        let line = self
            .stdout_lines
            .recv_timeout(ANSWER_TIMEOUT)
            .expect("the core answers in time");
        serde_json::from_str(&line).expect("the core writes JSON")
    }

    fn receive_answer_to(&self, id: &Value) -> Value {
        loop {
            let message = self.receive();
            if message.get("id") == Some(id) {
                return message;
            }
        }
    }

    fn close_stdin(&mut self) {
        self.stdin.take();
    }

    fn wait_for_exit(&mut self) -> ExitStatus {
        let deadline = Instant::now() + EXIT_TIMEOUT;
        while Instant::now() < deadline {
            if let Some(status) = self
                .child
                .try_wait()
                .expect("the core process can be polled")
            {
                return status;
            }
            thread::sleep(EXIT_POLL_INTERVAL);
        }
        self.child.kill().expect("the core process can be killed");
        panic!("the core did not exit within {EXIT_TIMEOUT:?}");
    }

    fn remaining_stdout(&self) -> Vec<String> {
        self.stdout_lines.iter().collect()
    }
}

impl Drop for ServingCore {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn hello_params(protocol_version: u32) -> Value {
    json!({ "clientName": "protocol test", "protocolVersion": protocol_version })
}

fn error_data_code(answer: &Value) -> &Value {
    &answer["error"]["data"]["code"]
}

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
fn should_keep_a_chosen_store_root_in_the_settings_file() {
    // Arrange
    let mut core = ServingCore::started_and_greeted();
    let chosen = tempfile::tempdir().unwrap();
    let path = chosen.path().to_str().unwrap();

    // Act
    let answer = core.request(1, "paths.setStoreRoot", json!({ "path": path }));

    // Assert
    assert_eq!(answer["result"]["storeRoot"], json!(path));
    let settings_file = core.data_dir.path().join("core-settings.json");
    assert!(
        std::fs::read_to_string(settings_file)
            .unwrap()
            .contains(path)
    );
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
