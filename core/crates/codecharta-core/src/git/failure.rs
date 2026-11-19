use codecharta_core_api::error::ErrorCode;

/// git's English messages (reads run with `LC_ALL=C`, mutations with `LC_MESSAGES=C`) and the code each
/// one means; the first match wins.
const RULES: [(&str, ErrorCode); 22] = [
    ("dubious ownership", ErrorCode::DubiousOwnership),
    ("not a git repository", ErrorCode::NotARepository),
    ("index.lock", ErrorCode::IndexLocked),
    ("bad object", ErrorCode::UnknownRevision),
    ("Invalid revision range", ErrorCode::UnknownRevision),
    (
        "Invalid symmetric difference expression",
        ErrorCode::UnknownRevision,
    ),
    ("Not a valid commit name", ErrorCode::UnknownRevision),
    ("unknown revision", ErrorCode::UnknownRevision),
    ("expected commit type", ErrorCode::UnknownRevision),
    (
        "terminal prompts disabled",
        ErrorCode::AuthenticationRequired,
    ),
    ("Authentication failed", ErrorCode::AuthenticationRequired),
    ("could not read Username", ErrorCode::AuthenticationRequired),
    (
        "Permission denied (publickey",
        ErrorCode::AuthenticationRequired,
    ),
    (
        "Host key verification failed",
        ErrorCode::AuthenticationRequired,
    ),
    ("Could not resolve host", ErrorCode::NetworkUnavailable),
    ("unable to access", ErrorCode::NetworkUnavailable),
    ("Connection timed out", ErrorCode::NetworkUnavailable),
    (
        "is already checked out at",
        ErrorCode::BranchCheckedOutElsewhere,
    ),
    ("used by worktree", ErrorCode::BranchCheckedOutElsewhere),
    ("already exists", ErrorCode::BranchExists),
    (
        "would be overwritten by",
        ErrorCode::LocalChangesWouldBeOverwritten,
    ),
    ("is not fully merged", ErrorCode::BranchNotFullyMerged),
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
    fn should_classify_an_unknown_commit_of_every_read_as_unknown_revision() {
        // Arrange
        let unknown = "0123456789abcdef0123456789abcdef01234567";
        let stderrs = [
            format!("fatal: bad object {unknown}"),
            format!("fatal: Invalid revision range {unknown}..{unknown}"),
            format!("fatal: Invalid symmetric difference expression {unknown}...{unknown}"),
            format!("fatal: Not a valid commit name {unknown}"),
            "fatal: ambiguous argument 'x': unknown revision or path not in the working tree."
                .to_string(),
            format!(
                "error: {unknown}^{{commit}}: expected commit type, but the object dereferences to blob type"
            ),
        ];

        // Act
        let codes: Vec<ErrorCode> = stderrs.iter().map(|stderr| classify(stderr)).collect();

        // Assert
        assert_eq!(codes, vec![ErrorCode::UnknownRevision; stderrs.len()]);
    }

    fn codes_of(stderrs: &[&str]) -> Vec<ErrorCode> {
        stderrs.iter().map(|stderr| classify(stderr)).collect()
    }

    #[test]
    fn should_classify_refused_branch_operations() {
        // Arrange
        let stderrs = [
            "error: Your local changes to the following files would be overwritten by checkout:\n\
             \ta.txt\nPlease commit your changes or stash them before you switch branches.\nAborting",
            "fatal: a branch named 'other' already exists",
            "error: the branch 'other' is not fully merged\n\
             hint: If you are sure you want to delete it, run 'git branch -D other'",
            "fatal: 'other' is already used by worktree at '/srv/wt'",
            "error: cannot delete branch 'other' used by worktree at '/srv/wt'",
            "fatal: 'other' is already checked out at '/srv/wt'",
        ];

        // Act
        let codes = codes_of(&stderrs);

        // Assert
        assert_eq!(
            codes,
            vec![
                ErrorCode::LocalChangesWouldBeOverwritten,
                ErrorCode::BranchExists,
                ErrorCode::BranchNotFullyMerged,
                ErrorCode::BranchCheckedOutElsewhere,
                ErrorCode::BranchCheckedOutElsewhere,
                ErrorCode::BranchCheckedOutElsewhere,
            ]
        );
    }

    #[test]
    fn should_classify_authentication_before_network_failures() {
        // Arrange
        let stderrs = [
            "fatal: could not read Username for 'https://example.test': terminal prompts disabled",
            "remote: Invalid username or password.\n\
             fatal: Authentication failed for 'https://example.test/repo.git/'",
            "git@example.test: Permission denied (publickey).\n\
             fatal: Could not read from remote repository.",
            "Host key verification failed.\nfatal: Could not read from remote repository.",
            "fatal: unable to access 'https://example.test/repo.git/': Could not resolve host: example.test",
            "ssh: connect to host example.test port 22: Connection timed out",
        ];

        // Act
        let codes = codes_of(&stderrs);

        // Assert
        assert_eq!(
            codes,
            vec![
                ErrorCode::AuthenticationRequired,
                ErrorCode::AuthenticationRequired,
                ErrorCode::AuthenticationRequired,
                ErrorCode::AuthenticationRequired,
                ErrorCode::NetworkUnavailable,
                ErrorCode::NetworkUnavailable,
            ]
        );
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
