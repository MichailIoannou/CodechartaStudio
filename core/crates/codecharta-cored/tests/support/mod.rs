#![allow(
    dead_code,
    reason = "each integration test binary compiles this module and uses a different part of it"
)]

use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, ExitStatus, Stdio};
use std::sync::mpsc::{self, Receiver};
use std::thread;
use std::time::{Duration, Instant};

use serde_json::{Value, json};

pub const CORE_EXECUTABLE: &str = env!("CARGO_BIN_EXE_codecharta-core");
pub const ANSWER_TIMEOUT: Duration = Duration::from_secs(5);
const EXIT_TIMEOUT: Duration = Duration::from_secs(5);
const EXIT_POLL_INTERVAL: Duration = Duration::from_millis(20);
pub const PROTOCOL_VERSION: u32 = 1;

pub struct ServingCore {
    pub child: Child,
    stdin: Option<ChildStdin>,
    stdout_lines: Receiver<String>,
    pub data_dir: tempfile::TempDir,
}

impl ServingCore {
    pub fn start() -> Self {
        Self::start_with(|_| {})
    }

    pub fn start_with(configure: impl FnOnce(&mut Command)) -> Self {
        Self::launch(
            tempfile::tempdir().expect("a temporary data folder"),
            configure,
        )
    }

    pub fn launch(data_dir: tempfile::TempDir, configure: impl FnOnce(&mut Command)) -> Self {
        Self::spawn(data_dir, Stdio::null(), configure)
    }

    /// The core's log goes to `log` at the most detailed level.
    pub fn launch_logging_to(
        data_dir: tempfile::TempDir,
        log: std::fs::File,
        configure: impl FnOnce(&mut Command),
    ) -> Self {
        Self::spawn(data_dir, Stdio::from(log), |command| {
            configure(command);
            command.args(["--log-level", "trace"]);
        })
    }

    fn spawn(
        data_dir: tempfile::TempDir,
        stderr: Stdio,
        configure: impl FnOnce(&mut Command),
    ) -> Self {
        let mut command = Command::new(CORE_EXECUTABLE);
        configure(&mut command);
        if !command.get_args().any(|arg| arg == "--log-level") {
            command.args(["--log-level", "debug"]);
        }
        let mut child = command
            .arg("--data-dir")
            .arg(data_dir.path())
            .arg("serve")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(stderr)
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

    pub fn started_and_greeted() -> Self {
        let mut core = Self::start();
        core.request(0, "core.hello", hello_params(PROTOCOL_VERSION));
        core
    }

    pub fn started_and_greeted_in(data_dir: tempfile::TempDir) -> Self {
        let mut core = Self::launch(data_dir, |_| {});
        core.request(0, "core.hello", hello_params(PROTOCOL_VERSION));
        core
    }

    pub fn store_root(&self) -> std::path::PathBuf {
        self.data_dir.path().join("store")
    }

    pub fn send_line(&mut self, line: &str) {
        let stdin = self.stdin.as_mut().expect("stdin is still open");
        writeln!(stdin, "{line}").expect("the core reads stdin");
        stdin.flush().expect("the core reads stdin");
    }

    pub fn send(&mut self, message: Value) {
        self.send_line(&message.to_string());
    }

    pub fn request(&mut self, id: i64, method: &str, params: Value) -> Value {
        self.send(json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params }));
        self.receive_answer_to(&json!(id))
    }

    pub fn receive(&self) -> Value {
        let line = self
            .stdout_lines
            .recv_timeout(ANSWER_TIMEOUT)
            .expect("the core answers in time");
        serde_json::from_str(&line).expect("the core writes JSON")
    }

    pub fn receive_answer_to(&self, id: &Value) -> Value {
        loop {
            let message = self.receive();
            if message.get("id") == Some(id) {
                return message;
            }
        }
    }

    pub fn close_stdin(&mut self) {
        self.stdin.take();
    }

    pub fn wait_for_exit(&mut self) -> ExitStatus {
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

    pub fn remaining_stdout(&self) -> Vec<String> {
        self.stdout_lines.iter().collect()
    }
}

impl Drop for ServingCore {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

pub fn hello_params(protocol_version: u32) -> Value {
    json!({ "clientName": "protocol test", "protocolVersion": protocol_version })
}

pub fn error_data_code(answer: &Value) -> &Value {
    &answer["error"]["data"]["code"]
}
