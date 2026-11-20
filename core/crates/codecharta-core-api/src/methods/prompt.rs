use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::protocol::RequestId;
use crate::registry::{Audience, Event, method};
use crate::secret::Secret;
use crate::values::PromptId;

/// Longest prompt text git or ssh may ask; a longer one is refused instead of shortened.
pub const MAX_PROMPT_MESSAGE_CHARS: usize = 4096;
/// Longest answer; it may not contain NUL, CR or LF, because git reads only the first line.
pub const MAX_PROMPT_ANSWER_CHARS: usize = 4096;

/// How the renderer asks: `secret` masked (passwords, passphrases), `text` visible (user names),
/// `confirm` as yes / no (ssh host keys; the answer is `yes` or `no`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub enum PromptKind {
    Secret,
    Text,
    Confirm,
}

/// git or ssh needs an answer for a running request. `message` is their own text, verbatim and possibly
/// several lines long; `requestId` is the JSON-RPC id of the request that runs git (the shell maps it to
/// the renderer's operation id, as for `core.progress`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct PromptRequested {
    pub prompt_id: PromptId,
    pub request_id: Option<RequestId>,
    pub repository_label: Option<String>,
    pub kind: PromptKind,
    pub message: String,
}

/// The prompt no longer takes an answer: answered, cancelled, or its request ended.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct PromptClosed {
    pub prompt_id: PromptId,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PromptAnswerParams {
    pub prompt_id: PromptId,
    pub answer: Secret,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PromptCancelParams {
    pub prompt_id: PromptId,
}

method!(
    PromptAnswerMethod,
    "prompt.answer",
    Renderer,
    PromptAnswerParams,
    ()
);
method!(
    PromptCancelMethod,
    "prompt.cancel",
    Renderer,
    PromptCancelParams,
    ()
);

pub struct PromptRequestedEvent;

impl Event for PromptRequestedEvent {
    const NAME: &'static str = "prompt.requested";
    const AUDIENCE: Audience = Audience::Renderer;
    type Params = PromptRequested;
}

pub struct PromptClosedEvent;

impl Event for PromptClosedEvent {
    const NAME: &'static str = "prompt.closed";
    const AUDIENCE: Audience = Audience::Renderer;
    type Params = PromptClosed;
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn should_write_a_prompt_request_in_camel_case() {
        // Arrange
        let requested = PromptRequested {
            prompt_id: PromptId::try_from("p1").unwrap(),
            request_id: Some(RequestId::Number(7)),
            repository_label: None,
            kind: PromptKind::Confirm,
            message: "Are you sure (yes/no/[fingerprint])? ".to_string(),
        };

        // Act
        let json = serde_json::to_value(requested).unwrap();

        // Assert
        assert_eq!(
            json,
            json!({
                "promptId": "p1",
                "requestId": 7,
                "repositoryLabel": null,
                "kind": "confirm",
                "message": "Are you sure (yes/no/[fingerprint])? "
            })
        );
    }

    #[test]
    fn should_print_answer_params_without_the_answer() {
        // Arrange
        let params: PromptAnswerParams =
            serde_json::from_value(json!({ "promptId": "p1", "answer": "hunter2" })).unwrap();

        // Act
        let printed = format!("{params:?}");

        // Assert
        assert_eq!(params.answer.expose(), "hunter2");
        assert!(!printed.contains("hunter2"), "{printed}");
    }

    #[test]
    fn should_refuse_an_invalid_prompt_id_or_extra_fields() {
        // Arrange
        let candidates = [
            json!({ "promptId": "../x", "answer": "a" }),
            json!({ "promptId": "x".repeat(65), "answer": "a" }),
            json!({ "promptId": "p1", "answer": "a", "remember": true }),
        ];

        // Act
        let refused: Vec<bool> = candidates
            .into_iter()
            .map(|candidate| serde_json::from_value::<PromptAnswerParams>(candidate).is_err())
            .collect();

        // Assert
        assert_eq!(refused, vec![true; refused.len()]);
    }
}
