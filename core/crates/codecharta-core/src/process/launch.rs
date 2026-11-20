use std::ffi::OsString;
use std::path::Path;

use crate::error::{CoreError, CoreResult};

const BATCH_EXTENSIONS: [&str; 2] = ["cmd", "bat"];
const NUL: char = '\0';

/// `cmd.exe` expands `%` and `!` and treats `"` and line breaks specially however the arguments are
/// quoted, so these never reach a batch file. Rust's std refuses some of them too (CVE-2024-24576);
/// refusing them here first gives the user a message instead of an OS error.
const BATCH_REFUSED_CHARACTERS: [(char, &str); 6] = [
    ('"', "a double quote"),
    ('%', "a percent sign"),
    ('!', "an exclamation mark"),
    ('\r', "a carriage return"),
    ('\n', "a line break"),
    (NUL, "a NUL character"),
];

pub fn is_batch_file(program: &Path) -> bool {
    program
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            BATCH_EXTENSIONS
                .iter()
                .any(|batch| batch.eq_ignore_ascii_case(extension))
        })
}

pub fn check_args(args: &[OsString]) -> CoreResult<()> {
    match first_refused(args, &[(NUL, "a NUL character")]) {
        Some(refusal) => Err(refusal),
        None => Ok(()),
    }
}

pub fn check_batch_args(args: &[OsString]) -> CoreResult<()> {
    match first_refused(args, &BATCH_REFUSED_CHARACTERS) {
        Some(refusal) => Err(refusal),
        None => Ok(()),
    }
}

fn first_refused(args: &[OsString], refused: &[(char, &str)]) -> Option<CoreError> {
    args.iter().enumerate().find_map(|(index, argument)| {
        let text = argument.to_string_lossy();
        refused
            .iter()
            .find(|(character, _)| text.contains(*character))
            .map(|(_, description)| refusal(index, description))
    })
}

/// The argument itself stays out of the message: it may carry a URL with credentials.
fn refusal(index: usize, description: &str) -> CoreError {
    CoreError::BadRequest(format!(
        "Argument {} contains {description}, which cannot be passed to this program safely.",
        index + 1
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn arguments(values: &[&str]) -> Vec<OsString> {
        values.iter().map(OsString::from).collect()
    }

    #[test]
    fn should_detect_cmd_and_bat_case_insensitively() {
        // Arrange
        let programs = [
            "ccsh.cmd", "ccsh.CMD", "ccsh.Bat", "ccsh.exe", "ccsh", "cmd",
        ];

        // Act
        let detected: Vec<bool> = programs
            .iter()
            .map(|program| is_batch_file(Path::new(program)))
            .collect();

        // Assert
        assert_eq!(detected, [true, true, true, false, false, false]);
    }

    #[test]
    fn should_refuse_percent_quote_bang_and_newlines_for_batch_files() {
        // Arrange
        let refused = [
            "50%",
            "say \"hi\"",
            "bang!",
            "line\nbreak",
            "cr\rx",
            "nul\0x",
        ];

        // Act
        let results: Vec<bool> = refused
            .iter()
            .map(|argument| check_batch_args(&arguments(&["analyse", argument])).is_err())
            .collect();

        // Assert
        assert!(results.iter().all(|is_refused| *is_refused), "{results:?}");
    }

    #[test]
    fn should_accept_spaces_and_other_metacharacters_for_batch_files() {
        // Arrange
        let accepted = arguments(&["with space", "a&b", "a^b", "(paren)", "a|b", r"C:\dir\"]);

        // Act
        let result = check_batch_args(&accepted);

        // Assert
        assert!(result.is_ok());
    }

    #[test]
    fn should_name_the_refused_argument() {
        // Arrange
        let args = arguments(&["analyse", "/repo", "secret%token"]);

        // Act
        let error = check_batch_args(&args).unwrap_err();

        // Assert
        let message = error.to_string();
        assert!(
            message.starts_with("Argument 3 contains a percent sign"),
            "{message}"
        );
        assert!(!message.contains("secret"));
    }

    #[test]
    fn should_refuse_nul_for_every_program() {
        // Arrange
        let args = arguments(&["ok", "nul\0x"]);

        // Act
        let result = check_args(&args);

        // Assert
        assert!(matches!(result, Err(CoreError::BadRequest(_))));
        assert!(check_args(&arguments(&["50%", "bang!"])).is_ok());
    }
}
