mod support;

use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};
use std::sync::Arc;
use std::time::Duration;

use codecharta_core::git::askpass::AskpassHelpers;
use codecharta_core::process::AskpassSetup;
use codecharta_core::process::env::askpass_env;
use codecharta_core::prompt::{AskpassServer, PromptBroker, PromptEvent, SessionRequest};
use codecharta_core_api::methods::prompt::{PromptKind, PromptRequested};
use codecharta_core_api::secret::Secret;
use serde_json::{Value, json};
use tokio::sync::broadcast;

use support::{CORE_EXECUTABLE, PROTOCOL_VERSION, ServingCore, error_data_code, hello_params};

const EVENT_TIMEOUT: Duration = Duration::from_secs(10);
const SHORT_WAIT: Duration = Duration::from_millis(300);
#[cfg(unix)]
const FIXTURE_PASSPHRASE: &str = "fixture-passphrase";

struct Broker {
    broker: Arc<PromptBroker>,
    _server: AskpassServer,
    events: tokio::sync::Mutex<broadcast::Receiver<PromptEvent>>,
}

impl Broker {
    fn start() -> Self {
        let broker = Arc::new(PromptBroker::default());
        let helper = PathBuf::from(CORE_EXECUTABLE);
        let helpers = AskpassHelpers {
            git: helper.clone(),
            ssh: Some(helper),
        };
        let server =
            AskpassServer::start(Arc::clone(&broker), helpers).expect("the server listens");
        let events = tokio::sync::Mutex::new(broker.subscribe());
        Self {
            broker,
            _server: server,
            events,
        }
    }

    async fn next_prompt(&self) -> PromptRequested {
        let mut events = self.events.lock().await;
        loop {
            let event = tokio::time::timeout(EVENT_TIMEOUT, events.recv())
                .await
                .expect("a prompt arrives in time")
                .expect("the broker is alive");
            if let PromptEvent::Requested(requested) = event {
                return requested;
            }
        }
    }

    fn answer(&self, prompt: &PromptRequested, answer: &str) {
        self.broker
            .answer(&prompt.prompt_id, Secret::new(answer.to_string()))
            .expect("the prompt is open");
    }
}

fn setup_of(broker: &Broker) -> (codecharta_core::prompt::PromptSession<'_>, AskpassSetup) {
    let session = broker
        .broker
        .open_session(SessionRequest::default())
        .expect("a session opens");
    let setup = session.askpass().expect("the server is attached").clone();
    (session, setup)
}

/// Runs a program the way git runs the helper: no terminal input, the askpass variables, nothing else
/// of the test's own askpass state.
fn spawn_with_askpass(
    program: &Path,
    args: &[&str],
    setup: &AskpassSetup,
) -> tokio::task::JoinHandle<Output> {
    let mut command = Command::new(program);
    command
        .args(args)
        .envs(askpass_env(setup))
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    tokio::task::spawn_blocking(move || command.output().expect("the program runs"))
}

fn text(bytes: &[u8]) -> String {
    String::from_utf8_lossy(bytes).into_owned()
}

#[tokio::test(flavor = "multi_thread")]
async fn should_print_exactly_the_answer_and_a_newline_and_exit_zero() {
    // Arrange
    let broker = Broker::start();
    let (_session, setup) = setup_of(&broker);
    let helper = spawn_with_askpass(Path::new(CORE_EXECUTABLE), &["Password for 'x': "], &setup);
    let prompt = broker.next_prompt().await;

    // Act
    broker.answer(&prompt, "pa\"ss%w&rd ü");
    let output = helper.await.expect("the helper finishes");

    // Assert
    assert_eq!(text(&output.stdout), "pa\"ss%w&rd ü\n");
    assert_eq!(text(&output.stderr), "");
    assert!(output.status.success());
    assert_eq!(prompt.message, "Password for 'x': ");
}

#[tokio::test(flavor = "multi_thread")]
async fn should_exit_one_without_output_on_cancel() {
    // Arrange
    let broker = Broker::start();
    let (_session, setup) = setup_of(&broker);
    let helper = spawn_with_askpass(Path::new(CORE_EXECUTABLE), &["Password: "], &setup);
    let prompt = broker.next_prompt().await;

    // Act
    broker
        .broker
        .cancel(&prompt.prompt_id)
        .expect("the prompt is open");
    let output = helper.await.expect("the helper finishes");

    // Assert
    assert_eq!(output.status.code(), Some(1));
    assert_eq!(text(&output.stdout), "");
    assert_eq!(text(&output.stderr), "");
}

#[tokio::test(flavor = "multi_thread")]
async fn should_exit_one_without_output_on_a_wrong_token() {
    // Arrange
    let broker = Broker::start();
    let (_session, setup) = setup_of(&broker);
    let wrong = AskpassSetup {
        token: Secret::new("0".repeat(setup.token.expose().len())),
        ..setup
    };

    // Act
    let output = spawn_with_askpass(Path::new(CORE_EXECUTABLE), &["Password: "], &wrong)
        .await
        .expect("the helper finishes");

    // Assert
    assert_eq!(output.status.code(), Some(1));
    assert_eq!(text(&output.stdout), "");
    assert_eq!(text(&output.stderr), "");
    assert!(
        tokio::time::timeout(SHORT_WAIT, broker.events.lock().await.recv())
            .await
            .is_err()
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn should_ask_through_the_explicit_askpass_subcommand_too() {
    // Arrange
    let broker = Broker::start();
    let (_session, setup) = setup_of(&broker);
    let helper = spawn_with_askpass(
        Path::new(CORE_EXECUTABLE),
        &["askpass", "Username for 'https://example.test': "],
        &setup,
    );
    let prompt = broker.next_prompt().await;

    // Act
    broker.answer(&prompt, "ada");
    let output = helper.await.expect("the helper finishes");

    // Assert
    assert_eq!(text(&output.stdout), "ada\n");
    assert_eq!(prompt.kind, PromptKind::Text);
}

/// git with its own configuration hidden, so neither a credential helper nor stored credentials of the
/// machine running the tests can answer instead of the broker.
fn isolated_git_credential_fill(
    setup: &AskpassSetup,
    home: &Path,
) -> tokio::task::JoinHandle<Output> {
    let empty_config = home.join("empty.gitconfig");
    std::fs::write(&empty_config, "").expect("the config file is written");
    let mut command = Command::new("git");
    command
        .args(["-c", "credential.helper=", "credential", "fill"])
        .env("HOME", home)
        .env("GIT_CONFIG_GLOBAL", &empty_config)
        .env("GIT_CONFIG_NOSYSTEM", "1")
        .env("GIT_TERMINAL_PROMPT", "0")
        .envs(askpass_env(setup))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    tokio::task::spawn_blocking(move || {
        use std::io::Write;
        let mut child = command.spawn().expect("git starts");
        child
            .stdin
            .take()
            .expect("stdin is piped")
            .write_all(b"protocol=https\nhost=example.test\n\n")
            .expect("git reads the request");
        child.wait_with_output().expect("git finishes")
    })
}

#[tokio::test(flavor = "multi_thread")]
async fn should_ask_username_and_password_for_git_credential_fill() {
    // Arrange
    let broker = Broker::start();
    let (_session, setup) = setup_of(&broker);
    let home = tempfile::tempdir().expect("a temporary home");
    let git = isolated_git_credential_fill(&setup, home.path());

    // Act
    let username = broker.next_prompt().await;
    broker.answer(&username, "ada");
    let password = broker.next_prompt().await;
    broker.answer(&password, "pa\"ss%w&rd ü");
    let output = git.await.expect("git finishes");

    // Assert
    assert!(output.status.success(), "{}", text(&output.stderr));
    assert!(
        text(&output.stdout).contains("username=ada\npassword=pa\"ss%w&rd ü\n"),
        "{}",
        text(&output.stdout)
    );
    assert_eq!(username.message, "Username for 'https://example.test': ");
    assert_eq!(username.kind, PromptKind::Text);
    assert_eq!(
        password.message,
        "Password for 'https://ada@example.test': "
    );
    assert_eq!(password.kind, PromptKind::Secret);
}

#[cfg(unix)]
#[tokio::test(flavor = "multi_thread")]
async fn should_pass_the_passphrase_to_ssh_keygen() {
    // Arrange
    let broker = Broker::start();
    let (_session, setup) = setup_of(&broker);
    let folder = tempfile::tempdir().expect("a temporary folder");
    let key = folder.path().join("fixture key");
    let generated = Command::new("ssh-keygen")
        .args([
            "-q",
            "-t",
            "ed25519",
            "-N",
            FIXTURE_PASSPHRASE,
            "-C",
            "fixture",
            "-f",
        ])
        .arg(&key)
        .output()
        .expect("ssh-keygen runs");
    assert!(generated.status.success(), "{}", text(&generated.stderr));
    let key_argument = key.to_string_lossy().into_owned();
    let reading = spawn_with_askpass(
        Path::new("ssh-keygen"),
        &["-y", "-f", &key_argument],
        &setup,
    );

    // Act
    let prompt = broker.next_prompt().await;
    broker.answer(&prompt, FIXTURE_PASSPHRASE);
    let output = reading.await.expect("ssh-keygen finishes");

    // Assert
    assert!(output.status.success(), "{}", text(&output.stderr));
    assert!(text(&output.stdout).starts_with("ssh-ed25519 "));
    assert!(prompt.message.contains("passphrase"), "{}", prompt.message);
    assert_eq!(prompt.kind, PromptKind::Secret);
}

/// Keeps the notifications that arrive while waiting for an answer, so none is lost to the wait.
#[derive(Default)]
struct Inbox {
    notifications: std::collections::VecDeque<Value>,
}

impl Inbox {
    fn request(&mut self, core: &mut ServingCore, id: i64, method: &str, params: Value) -> Value {
        core.send(json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params }));
        self.answer_to(core, id)
    }

    fn answer_to(&mut self, core: &ServingCore, id: i64) -> Value {
        loop {
            let message = core.receive();
            if message.get("id") == Some(&json!(id)) {
                return message;
            }
            self.notifications.push_back(message);
        }
    }

    fn notification(&mut self, core: &ServingCore, method: &str) -> Value {
        if let Some(position) = self
            .notifications
            .iter()
            .position(|message| message["method"] == method)
        {
            let message = self.notifications.remove(position).expect("found");
            return message["params"].clone();
        }
        loop {
            let message = core.receive();
            if message["method"] == method {
                return message["params"].clone();
            }
            self.notifications.push_back(message);
        }
    }
}

#[test]
fn should_refuse_answers_to_unknown_or_malformed_prompts_without_repeating_them() {
    // Arrange
    let mut core = ServingCore::started_and_greeted();
    let unknown = json!({ "promptId": "0123456789abcdef", "answer": "secret-4a1b" });
    let line_break = json!({ "promptId": "0123456789abcdef", "answer": "secret\n4a1b" });
    let bad_id = json!({ "promptId": "../x", "answer": "secret-4a1b" });

    // Act
    let answers = [
        core.request(1, "prompt.answer", unknown),
        core.request(2, "prompt.answer", line_break),
        core.request(3, "prompt.answer", bad_id),
        core.request(
            4,
            "prompt.cancel",
            json!({ "promptId": "0123456789abcdef" }),
        ),
    ];

    // Assert
    let codes: Vec<&Value> = answers.iter().map(error_data_code).collect();
    assert_eq!(
        codes,
        [
            &json!("NOT_FOUND"),
            &json!("BAD_REQUEST"),
            &json!("BAD_REQUEST"),
            &json!("NOT_FOUND")
        ]
    );
    for answer in &answers {
        assert!(!answer.to_string().contains("4a1b"), "{answer}");
    }
}

#[cfg(feature = "test-methods")]
#[test]
fn should_broker_git_credential_prompts_over_stdio_without_logging_the_answers() {
    // Arrange
    let home = tempfile::tempdir().expect("a temporary home");
    let empty_config = home.path().join("empty.gitconfig");
    std::fs::write(&empty_config, "").expect("the config file is written");
    let log_file = home.path().join("core.log");
    let log = std::fs::File::create(&log_file).expect("the log file is created");
    let data_dir = tempfile::tempdir().expect("a temporary data folder");
    let mut core = ServingCore::launch_logging_to(data_dir, log, |command| {
        command
            .env("HOME", home.path())
            .env("GIT_CONFIG_GLOBAL", &empty_config)
            .env("GIT_CONFIG_NOSYSTEM", "1");
    });
    core.request(0, "core.hello", hello_params(PROTOCOL_VERSION));

    // Act
    let mut inbox = Inbox::default();
    core.send(json!({ "jsonrpc": "2.0", "id": 5, "method": "core.credentialFill", "params": {} }));
    let username = inbox.notification(&core, "prompt.requested");
    let answered_username = inbox.request(
        &mut core,
        6,
        "prompt.answer",
        json!({ "promptId": username["promptId"], "answer": "user-7f3a" }),
    );
    let password = inbox.notification(&core, "prompt.requested");
    let answered_password = inbox.request(
        &mut core,
        7,
        "prompt.answer",
        json!({ "promptId": password["promptId"], "answer": "secret-9d2c" }),
    );
    let filled = inbox.answer_to(&core, 5);
    let closed = [
        inbox.notification(&core, "prompt.closed"),
        inbox.notification(&core, "prompt.closed"),
    ];
    inbox.request(&mut core, 8, "core.shutdown", json!({}));
    core.wait_for_exit();

    // Assert
    assert_eq!(closed[0]["promptId"], username["promptId"]);
    assert_eq!(closed[1]["promptId"], password["promptId"]);
    assert_eq!(username["requestId"], 5);
    assert_eq!(username["kind"], "text");
    assert_eq!(username["repositoryLabel"], "credential test");
    assert_eq!(password["kind"], "secret");
    assert_eq!(answered_username["result"], Value::Null);
    assert_eq!(answered_password["result"], Value::Null);
    let filled = filled["result"].as_str().expect("git's output").to_string();
    assert!(
        filled.contains("username=user-7f3a\npassword=secret-9d2c"),
        "{filled}"
    );
    let logged = std::fs::read_to_string(&log_file).expect("the log is readable");
    assert!(logged.contains("prompt.answer"), "{logged}");
    assert!(!logged.contains("user-7f3a"), "{logged}");
    assert!(!logged.contains("secret-9d2c"), "{logged}");
}

#[cfg(feature = "test-methods")]
#[test]
fn should_fail_with_authentication_cancelled_when_the_prompt_is_cancelled_over_stdio() {
    // Arrange
    let home = tempfile::tempdir().expect("a temporary home");
    let empty_config = home.path().join("empty.gitconfig");
    std::fs::write(&empty_config, "").expect("the config file is written");
    let mut core = ServingCore::start_with(|command| {
        command
            .env("HOME", home.path())
            .env("GIT_CONFIG_GLOBAL", &empty_config)
            .env("GIT_CONFIG_NOSYSTEM", "1");
    });
    core.request(0, "core.hello", hello_params(PROTOCOL_VERSION));
    let mut inbox = Inbox::default();
    core.send(json!({ "jsonrpc": "2.0", "id": 5, "method": "core.credentialFill", "params": {} }));
    let username = inbox.notification(&core, "prompt.requested");

    // Act
    let cancelled = inbox.request(
        &mut core,
        6,
        "prompt.cancel",
        json!({ "promptId": username["promptId"] }),
    );
    let filled = inbox.answer_to(&core, 5);

    // Assert
    assert_eq!(cancelled["result"], Value::Null);
    assert_eq!(error_data_code(&filled), &json!("AUTHENTICATION_CANCELLED"));
}
