use std::collections::HashMap;
use std::sync::{Mutex, MutexGuard, PoisonError};

use codecharta_core_api::error::ErrorCode;
use codecharta_core_api::methods::prompt::{
    MAX_PROMPT_ANSWER_CHARS, MAX_PROMPT_MESSAGE_CHARS, PromptClosed, PromptRequested,
};
use codecharta_core_api::protocol::RequestId;
use codecharta_core_api::secret::Secret;
use codecharta_core_api::values::PromptId;
use tokio::sync::{broadcast, oneshot};

use super::kind::classify;
use crate::error::{CoreError, CoreResult};
use crate::git::GitError;
use crate::git::askpass::AskpassHelpers;
use crate::ids::{new_askpass_token, new_prompt_id};
use crate::process::AskpassSetup;

const EVENT_CAPACITY: usize = 64;
const ANSWER_FORBIDDEN_CHARACTERS: [char; 3] = ['\0', '\r', '\n'];

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PromptEvent {
    Requested(PromptRequested),
    Closed(PromptClosed),
}

/// What the helper waiting on a prompt hands to git: the answer, or a non-zero exit.
#[derive(Debug)]
pub enum PromptReply {
    Answer(Secret),
    Cancel,
}

/// Where a helper reaches this broker, known while the askpass server listens.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AskpassTarget {
    pub endpoint: String,
    pub helpers: AskpassHelpers,
}

/// Who a prompt belongs to, as the renderer shows it.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct SessionRequest {
    pub request_id: Option<RequestId>,
    pub repository_label: Option<String>,
}

struct Session {
    token: Secret,
    request: SessionRequest,
    is_cancelled_by_user: bool,
}

struct PendingPrompt {
    session: u64,
    reply: oneshot::Sender<PromptReply>,
}

#[derive(Default)]
struct BrokerState {
    target: Option<AskpassTarget>,
    last_session: u64,
    sessions: HashMap<u64, Session>,
    pending: HashMap<PromptId, PendingPrompt>,
}

/// Hands git's and ssh's credential questions to the renderer and each answer back to exactly one waiting
/// helper. Nothing it holds outlives the operation that asked, and nothing is written anywhere.
pub struct PromptBroker {
    state: Mutex<BrokerState>,
    events: broadcast::Sender<PromptEvent>,
}

impl Default for PromptBroker {
    fn default() -> Self {
        Self {
            state: Mutex::default(),
            events: broadcast::channel(EVENT_CAPACITY).0,
        }
    }
}

impl PromptBroker {
    pub fn attach(&self, target: AskpassTarget) {
        self.lock().target = Some(target);
    }

    pub fn detach(&self) {
        self.lock().target = None;
    }

    pub fn subscribe(&self) -> broadcast::Receiver<PromptEvent> {
        self.events.subscribe()
    }

    /// The session's prompts close when it is dropped, which the operation does when it ends.
    pub fn open_session(&self, request: SessionRequest) -> CoreResult<PromptSession<'_>> {
        let token = new_askpass_token()?;
        let mut state = self.lock();
        let askpass = state.target.as_ref().map(|target| AskpassSetup {
            git_helper: target.helpers.git.clone(),
            ssh_helper: target.helpers.ssh.clone(),
            endpoint: target.endpoint.clone(),
            token: token.clone(),
        });
        state.last_session += 1;
        let id = state.last_session;
        state.sessions.insert(
            id,
            Session {
                token,
                request,
                is_cancelled_by_user: false,
            },
        );
        Ok(PromptSession {
            broker: self,
            id,
            askpass,
        })
    }

    /// `None` closes the helper's connection without an answer: an unknown token, a closed session or an
    /// overlong prompt.
    pub fn ask(&self, token: &str, message: &str) -> Option<oneshot::Receiver<PromptReply>> {
        if message.chars().count() > MAX_PROMPT_MESSAGE_CHARS {
            return None;
        }
        let prompt_id = new_prompt_id()
            .inspect_err(|error| tracing::warn!("could not open a prompt: {error}"))
            .ok()?;
        let (reply, answer) = oneshot::channel();
        let requested = self.open_prompt(token, message, prompt_id, reply)?;
        self.emit(PromptEvent::Requested(requested));
        Some(answer)
    }

    fn open_prompt(
        &self,
        token: &str,
        message: &str,
        prompt_id: PromptId,
        reply: oneshot::Sender<PromptReply>,
    ) -> Option<PromptRequested> {
        let mut state = self.lock();
        let session = session_of_token(&state.sessions, token)?;
        let request = &state.sessions.get(&session)?.request;
        let requested = PromptRequested {
            prompt_id: prompt_id.clone(),
            request_id: request.request_id.clone(),
            repository_label: request.repository_label.clone(),
            kind: classify(message),
            message: message.to_string(),
        };
        state
            .pending
            .insert(prompt_id, PendingPrompt { session, reply });
        Some(requested)
    }

    pub fn answer(&self, prompt_id: &PromptId, answer: Secret) -> CoreResult<()> {
        check_answer(&answer)?;
        let pending = self.take_pending(prompt_id)?;
        self.deliver(prompt_id, pending, PromptReply::Answer(answer));
        Ok(())
    }

    /// The operation then fails with `AUTHENTICATION_CANCELLED` instead of git's own complaint.
    pub fn cancel(&self, prompt_id: &PromptId) -> CoreResult<()> {
        let pending = self.take_pending(prompt_id)?;
        if let Some(session) = self.lock().sessions.get_mut(&pending.session) {
            session.is_cancelled_by_user = true;
        }
        self.deliver(prompt_id, pending, PromptReply::Cancel);
        Ok(())
    }

    fn take_pending(&self, prompt_id: &PromptId) -> CoreResult<PendingPrompt> {
        self.lock()
            .pending
            .remove(prompt_id)
            .ok_or_else(|| CoreError::NotFound("The prompt is no longer open.".to_string()))
    }

    /// A helper that went away meanwhile no longer needs the reply.
    fn deliver(&self, prompt_id: &PromptId, pending: PendingPrompt, reply: PromptReply) {
        let _gone = pending.reply.send(reply);
        self.emit_closed(prompt_id.clone());
    }

    fn close_session(&self, session_id: u64) {
        let closed: Vec<PromptId> = {
            let mut state = self.lock();
            state.sessions.remove(&session_id);
            let ids: Vec<PromptId> = state
                .pending
                .iter()
                .filter(|(_, pending)| pending.session == session_id)
                .map(|(prompt_id, _)| prompt_id.clone())
                .collect();
            ids.iter().for_each(|prompt_id| {
                state.pending.remove(prompt_id);
            });
            ids
        };
        closed
            .into_iter()
            .for_each(|prompt_id| self.emit_closed(prompt_id));
    }

    fn is_cancelled_by_user(&self, session_id: u64) -> bool {
        self.lock()
            .sessions
            .get(&session_id)
            .is_some_and(|session| session.is_cancelled_by_user)
    }

    fn emit_closed(&self, prompt_id: PromptId) {
        self.emit(PromptEvent::Closed(PromptClosed { prompt_id }));
    }

    /// Without a listener (no renderer attached) the event has nobody to reach.
    fn emit(&self, event: PromptEvent) {
        let _unheard = self.events.send(event);
    }

    fn lock(&self) -> MutexGuard<'_, BrokerState> {
        self.state.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

/// Every open session is compared, without stopping at a match, and each comparison takes the same time
/// whatever the bytes, so the time to refuse says nothing about a token.
fn session_of_token(sessions: &HashMap<u64, Session>, offered: &str) -> Option<u64> {
    sessions
        .iter()
        .filter(|(_, session)| is_same_token(session.token.expose(), offered))
        .map(|(id, _)| *id)
        .last()
}

fn is_same_token(expected: &str, offered: &str) -> bool {
    if expected.len() != offered.len() {
        return false;
    }
    let difference = expected
        .bytes()
        .zip(offered.bytes())
        .fold(0u8, |difference, (left, right)| difference | (left ^ right));
    std::hint::black_box(difference) == 0
}

fn check_answer(answer: &Secret) -> CoreResult<()> {
    let text = answer.expose();
    if text.chars().count() > MAX_PROMPT_ANSWER_CHARS || text.contains(ANSWER_FORBIDDEN_CHARACTERS)
    {
        return Err(CoreError::BadRequest(format!(
            "An answer is one line of at most {MAX_PROMPT_ANSWER_CHARS} characters."
        )));
    }
    Ok(())
}

/// The prompts of one operation. `askpass` is `None` while no askpass server listens: nothing can prompt
/// then, and git fails as it would without a terminal.
pub struct PromptSession<'broker> {
    broker: &'broker PromptBroker,
    id: u64,
    askpass: Option<AskpassSetup>,
}

impl PromptSession<'_> {
    pub fn askpass(&self) -> Option<&AskpassSetup> {
        self.askpass.as_ref()
    }

    pub fn is_cancelled_by_user(&self) -> bool {
        self.broker.is_cancelled_by_user(self.id)
    }

    /// A failure after the user cancelled a prompt of this operation is that cancellation.
    pub fn settle<T>(&self, result: CoreResult<T>) -> CoreResult<T> {
        result.map_err(|error| {
            if self.is_cancelled_by_user() {
                authentication_cancelled()
            } else {
                error
            }
        })
    }
}

impl Drop for PromptSession<'_> {
    fn drop(&mut self) {
        self.broker.close_session(self.id);
    }
}

pub fn authentication_cancelled() -> CoreError {
    GitError::new(
        ErrorCode::AuthenticationCancelled,
        "The git operation stopped because a credential prompt was cancelled.",
    )
    .into()
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::*;

    fn attached_broker() -> PromptBroker {
        let broker = PromptBroker::default();
        let helper = PathBuf::from("/opt/codecharta-core");
        broker.attach(AskpassTarget {
            endpoint: "endpoint".to_string(),
            helpers: AskpassHelpers {
                git: helper.clone(),
                ssh: Some(helper),
            },
        });
        broker
    }

    fn token_of(session: &PromptSession<'_>) -> String {
        session
            .askpass()
            .expect("an attached broker sets up askpass")
            .token
            .expose()
            .to_string()
    }

    fn requested(events: &mut broadcast::Receiver<PromptEvent>) -> PromptRequested {
        match events.try_recv() {
            Ok(PromptEvent::Requested(requested)) => requested,
            other => panic!("expected a prompt request, got {other:?}"),
        }
    }

    fn closed(events: &mut broadcast::Receiver<PromptEvent>) -> PromptId {
        match events.try_recv() {
            Ok(PromptEvent::Closed(closed)) => closed.prompt_id,
            other => panic!("expected a closed prompt, got {other:?}"),
        }
    }

    #[test]
    fn should_refuse_a_wrong_token_and_send_nothing() {
        // Arrange
        let broker = attached_broker();
        let mut events = broker.subscribe();
        let session = broker.open_session(SessionRequest::default()).unwrap();
        let token = token_of(&session);
        let mut wrong = token.clone();
        wrong.replace_range(..1, if token.starts_with('0') { "1" } else { "0" });

        // Act
        let refusals = [
            broker.ask(&wrong, "Password: ").is_none(),
            broker.ask(&token[1..], "Password: ").is_none(),
            broker.ask("", "Password: ").is_none(),
        ];

        // Assert
        assert_eq!(refusals, [true; 3]);
        assert!(events.try_recv().is_err());
    }

    #[test]
    fn should_refuse_a_token_of_a_closed_session() {
        // Arrange
        let broker = attached_broker();
        let mut events = broker.subscribe();
        let session = broker.open_session(SessionRequest::default()).unwrap();
        let token = token_of(&session);
        drop(session);

        // Act
        let asked = broker.ask(&token, "Password: ");

        // Assert
        assert!(asked.is_none());
        assert!(events.try_recv().is_err());
    }

    #[tokio::test]
    async fn should_answer_each_prompt_once() {
        // Arrange
        let broker = attached_broker();
        let mut events = broker.subscribe();
        let request = SessionRequest {
            request_id: Some(RequestId::Number(4)),
            repository_label: Some("web".to_string()),
        };
        let session = broker.open_session(request).unwrap();
        let reply = broker
            .ask(&token_of(&session), "Username for 'https://x': ")
            .unwrap();
        let prompt = requested(&mut events);

        // Act
        let first = broker.answer(&prompt.prompt_id, Secret::new("ada".to_string()));
        let second = broker.answer(&prompt.prompt_id, Secret::new("eve".to_string()));

        // Assert
        assert!(first.is_ok());
        assert!(matches!(second, Err(CoreError::NotFound(_))));
        assert!(matches!(reply.await, Ok(PromptReply::Answer(answer)) if answer.expose() == "ada"));
        assert_eq!(closed(&mut events), prompt.prompt_id);
        assert_eq!(prompt.request_id, Some(RequestId::Number(4)));
        assert_eq!(prompt.repository_label.as_deref(), Some("web"));
        assert_eq!(prompt.message, "Username for 'https://x': ");
    }

    #[tokio::test]
    async fn should_close_pending_prompts_when_the_operation_ends() {
        // Arrange
        let broker = attached_broker();
        let mut events = broker.subscribe();
        let session = broker.open_session(SessionRequest::default()).unwrap();
        let reply = broker.ask(&token_of(&session), "Password: ").unwrap();
        let prompt = requested(&mut events);

        // Act
        drop(session);

        // Assert
        assert_eq!(closed(&mut events), prompt.prompt_id);
        assert!(reply.await.is_err());
        assert!(matches!(
            broker.answer(&prompt.prompt_id, Secret::new("late".to_string())),
            Err(CoreError::NotFound(_))
        ));
    }

    #[tokio::test]
    async fn should_fail_with_authentication_cancelled_after_the_user_cancelled() {
        // Arrange
        let broker = attached_broker();
        let mut events = broker.subscribe();
        let session = broker.open_session(SessionRequest::default()).unwrap();
        let reply = broker.ask(&token_of(&session), "Password: ").unwrap();
        let prompt = requested(&mut events);
        let untouched = broker.open_session(SessionRequest::default()).unwrap();

        // Act
        broker.cancel(&prompt.prompt_id).unwrap();
        let settled = session.settle::<()>(Err(CoreError::Cancelled));
        let other = untouched.settle::<()>(Err(CoreError::Cancelled));

        // Assert
        assert!(matches!(reply.await, Ok(PromptReply::Cancel)));
        assert_eq!(closed(&mut events), prompt.prompt_id);
        assert_eq!(
            settled.unwrap_err().code(),
            ErrorCode::AuthenticationCancelled
        );
        assert_eq!(other.unwrap_err().code(), ErrorCode::Cancelled);
    }

    #[test]
    fn should_refuse_an_answer_with_a_line_break_without_repeating_it() {
        // Arrange
        let broker = attached_broker();
        let mut events = broker.subscribe();
        let session = broker.open_session(SessionRequest::default()).unwrap();
        let _reply = broker.ask(&token_of(&session), "Password: ").unwrap();
        let prompt = requested(&mut events);
        let answers = ["sec\nret", "sec\rret", "sec\0ret"]
            .map(String::from)
            .into_iter()
            .chain([("x".repeat(MAX_PROMPT_ANSWER_CHARS + 1))]);

        // Act
        let refusals: Vec<String> = answers
            .map(|answer| {
                broker
                    .answer(&prompt.prompt_id, Secret::new(answer))
                    .unwrap_err()
                    .to_string()
            })
            .collect();

        // Assert
        assert!(refusals.iter().all(|refusal| !refusal.contains("sec")));
        assert!(
            broker
                .answer(&prompt.prompt_id, Secret::new("pa\"ss%w&rd ü".to_string()))
                .is_ok()
        );
    }

    #[test]
    fn should_refuse_an_overlong_prompt() {
        // Arrange
        let broker = attached_broker();
        let session = broker.open_session(SessionRequest::default()).unwrap();

        // Act
        let asked = broker.ask(
            &token_of(&session),
            &"x".repeat(MAX_PROMPT_MESSAGE_CHARS + 1),
        );

        // Assert
        assert!(asked.is_none());
    }

    #[test]
    fn should_offer_no_askpass_without_a_listening_server() {
        // Arrange
        let broker = attached_broker();
        broker.detach();

        // Act
        let session = broker.open_session(SessionRequest::default()).unwrap();

        // Assert
        assert!(session.askpass().is_none());
    }

    #[test]
    fn should_give_every_session_its_own_token() {
        // Arrange
        let broker = attached_broker();

        // Act
        let first = broker.open_session(SessionRequest::default()).unwrap();
        let second = broker.open_session(SessionRequest::default()).unwrap();

        // Assert
        assert_ne!(token_of(&first), token_of(&second));
        assert_eq!(token_of(&first).len(), 64);
    }

    #[test]
    fn should_match_only_the_same_token() {
        // Arrange
        let pairs = [("abc", "abc"), ("abc", "abd"), ("abc", "ab"), ("", "")];

        // Act
        let matches: Vec<bool> = pairs
            .into_iter()
            .map(|(expected, offered)| is_same_token(expected, offered))
            .collect();

        // Assert
        assert_eq!(matches, [true, false, false, true]);
    }
}
