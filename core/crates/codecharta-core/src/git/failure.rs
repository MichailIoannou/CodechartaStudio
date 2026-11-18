use codecharta_core_api::error::ErrorCode;

/// git's English messages (reads run with `LC_ALL=C`) and the code each one means; the first match wins.
const RULES: [(&str, ErrorCode); 3] = [
    ("dubious ownership", ErrorCode::DubiousOwnership),
    ("not a git repository", ErrorCode::NotARepository),
    ("index.lock", ErrorCode::IndexLocked),
];

pub fn classify(stderr: &str) -> ErrorCode {
    RULES
        .iter()
        .find(|(text, _)| stderr.contains(text))
        .map_or(ErrorCode::CommandFailed, |(_, code)| *code)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_classify_dubious_ownership() {
        // Arrange
        let stderr = "fatal: detected dubious ownership in repository at '/srv/repo'\n\
                      To add an exception for this directory, call:\n\n\
                      \tgit config --global --add safe.directory /srv/repo\n";

        // Act
        let code = classify(stderr);

        // Assert
        assert_eq!(code, ErrorCode::DubiousOwnership);
    }

    #[test]
    fn should_classify_not_a_repository() {
        // Arrange
        let stderr = include_str!("parse/testdata/rev_parse_plain.stderr");

        // Act
        let code = classify(stderr);

        // Assert
        assert_eq!(code, ErrorCode::NotARepository);
    }

    #[test]
    fn should_classify_a_locked_index() {
        // Arrange
        let stderr = "fatal: Unable to create '/srv/repo/.git/index.lock': File exists.\n\n\
                      Another git process seems to be running in this repository";

        // Act
        let code = classify(stderr);

        // Assert
        assert_eq!(code, ErrorCode::IndexLocked);
    }

    #[test]
    fn should_classify_any_other_failure_as_command_failed() {
        // Arrange
        let stderr = include_str!("parse/testdata/rev_parse_bare.stderr");

        // Act
        let code = classify(stderr);

        // Assert
        assert_eq!(code, ErrorCode::CommandFailed);
    }
}
