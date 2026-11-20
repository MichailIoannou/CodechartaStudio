use std::ffi::OsString;
use std::io::Write;
use std::process::ExitCode;

use clap::CommandFactory;
use codecharta_core::process::env::{ASKPASS_ENDPOINT_VARIABLE, ASKPASS_TOKEN_VARIABLE};
use codecharta_core::prompt::helper::{HelperOutcome, ask_broker};
use codecharta_core_api::secret::Secret;

use crate::cli::Cli;

const HELP_SUBCOMMAND: &str = "help";

/// git and ssh run the helper with the prompt as the only argument, so the mode cannot be a subcommand:
/// it is chosen by the endpoint variable, which only the core's own network commands set (the process
/// runner removes it everywhere else), together with one argument that names no subcommand.
pub fn askpass_prompt(
    arguments: &[OsString],
    lookup: &dyn Fn(&str) -> Option<OsString>,
) -> Option<String> {
    lookup(ASKPASS_ENDPOINT_VARIABLE)?;
    let [_, prompt] = arguments else {
        return None;
    };
    let prompt = prompt.to_string_lossy().into_owned();
    (!is_subcommand(&prompt)).then_some(prompt)
}

fn is_subcommand(argument: &str) -> bool {
    argument == HELP_SUBCOMMAND
        || Cli::command()
            .get_subcommands()
            .any(|subcommand| subcommand.get_name() == argument)
}

/// Prints exactly the answer and a newline and exits 0; exits 1 without output when there is no answer.
/// Nothing goes to stderr: git would show it to the user.
pub fn run_askpass(prompt: &str, lookup: &dyn Fn(&str) -> Option<OsString>) -> ExitCode {
    let (Some(endpoint), Some(token)) = (
        lookup(ASKPASS_ENDPOINT_VARIABLE),
        lookup(ASKPASS_TOKEN_VARIABLE),
    ) else {
        return ExitCode::FAILURE;
    };
    let token = Secret::new(token.to_string_lossy().into_owned());
    match ask_broker(&endpoint.to_string_lossy(), token, prompt) {
        HelperOutcome::Answer(answer) => print_answer(&answer),
        HelperOutcome::NoAnswer => ExitCode::FAILURE,
    }
}

fn print_answer(answer: &Secret) -> ExitCode {
    let mut stdout = std::io::stdout().lock();
    let written = stdout
        .write_all(answer.expose().as_bytes())
        .and_then(|()| stdout.write_all(b"\n"))
        .and_then(|()| stdout.flush());
    if written.is_ok() {
        ExitCode::SUCCESS
    } else {
        ExitCode::FAILURE
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn arguments(values: &[&str]) -> Vec<OsString> {
        values.iter().map(OsString::from).collect()
    }

    fn with_endpoint(name: &str) -> Option<OsString> {
        (name == ASKPASS_ENDPOINT_VARIABLE).then(|| OsString::from("/tmp/endpoint"))
    }

    type Lookup = fn(&str) -> Option<OsString>;

    fn without_endpoint(_name: &str) -> Option<OsString> {
        None
    }

    #[test]
    fn should_take_the_only_argument_as_prompt_when_the_endpoint_is_set() {
        // Arrange
        let prompt = "Password for 'https://ada@example.test': ";

        // Act
        let chosen = askpass_prompt(&arguments(&["codecharta-core", prompt]), &with_endpoint);

        // Assert
        assert_eq!(chosen.as_deref(), Some(prompt));
    }

    #[test]
    fn should_stay_a_command_line_without_endpoint_or_for_subcommands() {
        // Arrange
        let cases: [(&[&str], Lookup); 5] = [
            (&["codecharta-core", "Password: "], without_endpoint),
            (&["codecharta-core", "serve"], with_endpoint),
            (&["codecharta-core", "help"], with_endpoint),
            (&["codecharta-core", "askpass"], with_endpoint),
            (&["codecharta-core", "git", "status"], with_endpoint),
        ];

        // Act
        let chosen: Vec<Option<String>> = cases
            .into_iter()
            .map(|(values, lookup)| askpass_prompt(&arguments(values), &lookup))
            .collect();

        // Assert
        assert_eq!(chosen, vec![None; 5]);
    }

    #[test]
    fn should_fail_without_endpoint_or_token() {
        // Arrange
        let only_endpoint = with_endpoint;

        // Act
        let without_both = run_askpass("Password: ", &without_endpoint);
        let without_token = run_askpass("Password: ", &only_endpoint);

        // Assert
        assert_eq!(without_both, ExitCode::FAILURE);
        assert_eq!(without_token, ExitCode::FAILURE);
    }
}
