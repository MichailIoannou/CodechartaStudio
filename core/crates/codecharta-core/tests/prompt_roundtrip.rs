use std::sync::Arc;
use std::time::Duration;

use codecharta_core::git::askpass::AskpassHelpers;
use codecharta_core::prompt::helper::{HelperOutcome, ask_broker, ask_broker_within};
use codecharta_core::prompt::server::AskpassRequest;
use codecharta_core::prompt::{AskpassServer, PromptBroker, PromptEvent, SessionRequest};
use codecharta_core_api::methods::prompt::{PromptKind, PromptRequested};
use codecharta_core_api::secret::Secret;
use tokio::sync::broadcast;

const EVENT_TIMEOUT: Duration = Duration::from_secs(5);
const SHORT_WAIT: Duration = Duration::from_millis(300);

fn start_server() -> (Arc<PromptBroker>, AskpassServer) {
    let broker = Arc::new(PromptBroker::default());
    let helper = std::env::temp_dir().join("codecharta-core");
    let helpers = AskpassHelpers {
        git: helper.clone(),
        ssh: Some(helper),
    };
    let server = AskpassServer::start(Arc::clone(&broker), helpers).expect("the server listens");
    (broker, server)
}

async fn next_request(events: &mut broadcast::Receiver<PromptEvent>) -> PromptRequested {
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

fn ask_in_background(
    endpoint: &str,
    token: &Secret,
    prompt: &'static str,
) -> tokio::task::JoinHandle<HelperOutcome> {
    let endpoint = endpoint.to_string();
    let token = token.clone();
    tokio::task::spawn_blocking(move || ask_broker(&endpoint, token, prompt))
}

#[tokio::test]
async fn should_hand_the_answer_to_the_helper() {
    // Arrange
    let (broker, server) = start_server();
    let mut events = broker.subscribe();
    let session = broker
        .open_session(SessionRequest::default())
        .expect("a session opens");
    let askpass = session.askpass().expect("the server is attached").clone();
    assert_eq!(askpass.endpoint, server.endpoint());
    let helper = ask_in_background(server.endpoint(), &askpass.token, "Password for 'x': ");
    let prompt = next_request(&mut events).await;

    // Act
    broker
        .answer(&prompt.prompt_id, Secret::new("pa\"ss%w&rd ü".to_string()))
        .expect("the prompt is open");
    let outcome = helper.await.expect("the helper finishes");

    // Assert
    assert_eq!(
        outcome,
        HelperOutcome::Answer(Secret::new("pa\"ss%w&rd ü".to_string()))
    );
    assert_eq!(prompt.kind, PromptKind::Secret);
    assert_eq!(prompt.message, "Password for 'x': ");
}

#[tokio::test]
async fn should_fail_the_helper_on_cancel() {
    // Arrange
    let (broker, server) = start_server();
    let mut events = broker.subscribe();
    let session = broker
        .open_session(SessionRequest::default())
        .expect("a session opens");
    let token = session.askpass().expect("attached").token.clone();
    let helper = ask_in_background(server.endpoint(), &token, "Password: ");
    let prompt = next_request(&mut events).await;

    // Act
    broker
        .cancel(&prompt.prompt_id)
        .expect("the prompt is open");
    let outcome = helper.await.expect("the helper finishes");

    // Assert
    assert_eq!(outcome, HelperOutcome::NoAnswer);
    assert!(session.is_cancelled_by_user());
}

#[tokio::test]
async fn should_fail_the_helper_when_the_operation_ends() {
    // Arrange
    let (broker, server) = start_server();
    let mut events = broker.subscribe();
    let session = broker
        .open_session(SessionRequest::default())
        .expect("a session opens");
    let token = session.askpass().expect("attached").token.clone();
    let helper = ask_in_background(server.endpoint(), &token, "Password: ");
    next_request(&mut events).await;

    // Act
    drop(session);
    let outcome = helper.await.expect("the helper finishes");

    // Assert
    assert_eq!(outcome, HelperOutcome::NoAnswer);
}

#[tokio::test]
async fn should_close_a_wrong_token_without_a_prompt() {
    // Arrange
    let (broker, server) = start_server();
    let mut events = broker.subscribe();
    let _session = broker
        .open_session(SessionRequest::default())
        .expect("a session opens");
    let endpoint = server.endpoint().to_string();

    // Act
    let outcome = tokio::task::spawn_blocking(move || {
        let request = AskpassRequest {
            token: Secret::new("f".repeat(64)),
            prompt: "Password: ".to_string(),
        };
        ask_broker_within(&endpoint, request, EVENT_TIMEOUT)
    })
    .await
    .expect("the helper finishes");

    // Assert
    assert_eq!(outcome, HelperOutcome::NoAnswer);
    assert!(
        tokio::time::timeout(SHORT_WAIT, events.recv())
            .await
            .is_err()
    );
}

#[tokio::test]
async fn should_stop_listening_when_the_server_is_dropped() {
    // Arrange
    let (broker, server) = start_server();
    let endpoint = server.endpoint().to_string();
    let session = broker
        .open_session(SessionRequest::default())
        .expect("a session opens");
    let token = session.askpass().expect("attached").token.clone();

    // Act
    drop(server);
    let outcome = tokio::task::spawn_blocking(move || ask_broker(&endpoint, token, "Password: "))
        .await
        .expect("the helper finishes");

    // Assert
    assert_eq!(outcome, HelperOutcome::NoAnswer);
    let later = broker
        .open_session(SessionRequest::default())
        .expect("a session opens");
    assert!(later.askpass().is_none());
}
