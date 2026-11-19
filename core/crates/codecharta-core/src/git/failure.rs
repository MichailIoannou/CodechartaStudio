use codecharta_core_api::error::ErrorCode;

/// git's English messages (reads run with `LC_ALL=C`, mutations with `LC_MESSAGES=C`) and the code each
/// one means; the first match wins. A push reports a stale lease next to "failed to push some refs", and
/// a refused tag push as "already exists", so the pull and push rules come before the branch rules.
const RULES: [(&str, ErrorCode); 33] = [
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
    ("pre-receive hook declined", ErrorCode::PushRejected),
    (
        "Diverging branches can't be fast-forwarded",
        ErrorCode::NotFastForward,
    ),
    ("Not possible to fast-forward", ErrorCode::NotFastForward),
    ("stale info", ErrorCode::StalePushLease),
    ("[rejected]", ErrorCode::PushRejected),
    ("[remote rejected]", ErrorCode::PushRejected),
    ("failed to push some refs", ErrorCode::PushRejected),
    ("has no upstream branch", ErrorCode::NoUpstream),
    ("There is no tracking information", ErrorCode::NoUpstream),
    ("CONFLICT", ErrorCode::Conflicts),
    ("could not apply", ErrorCode::Conflicts),
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
    classify_streams(&[stderr])
}

/// For commands that report on stdout too: a merge names its conflicts there, a porcelain push its
/// refused refs.
pub fn classify_streams(streams: &[&str]) -> ErrorCode {
    RULES
        .iter()
        .find(|(text, _)| streams.iter().any(|stream| stream.contains(text)))
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
    fn should_classify_refused_pulls_and_pushes_in_stderr_and_stdout() {
        // Arrange
        let refused = "error: failed to push some refs to '../origin.git'";
        let outputs = [
            [
                "hint: Diverging branches can't be fast-forwarded, you need to either:\n\
              fatal: Not possible to fast-forward, aborting.",
                "",
            ],
            ["fatal: Not possible to fast-forward, aborting.", ""],
            [
                refused,
                "To ../origin.git\n!\trefs/heads/main:refs/heads/main\t[rejected] (stale info)\nDone",
            ],
            [
                refused,
                "To ../origin.git\n!\trefs/heads/main:refs/heads/main\t[rejected] (non-fast-forward)",
            ],
            [
                refused,
                "!\trefs/heads/main:refs/heads/main\t[remote rejected] (pre-receive hook declined)",
            ],
            [
                refused,
                "!\trefs/tags/v1:refs/tags/v1\t[rejected] (already exists)",
            ],
            [" ! [rejected]        main -> main (fetch first)", ""],
            [
                "fatal: The current branch lonely has no upstream branch.",
                "",
            ],
            [
                "There is no tracking information for the current branch.",
                "",
            ],
            [
                "",
                "Auto-merging f.txt\nCONFLICT (content): Merge conflict in f.txt\n\
                  Automatic merge failed; fix conflicts and then commit the result.",
            ],
            [
                "error: could not apply 3c97af6... local",
                "CONFLICT (content): Merge conflict in f.txt",
            ],
        ];

        // Act
        let codes: Vec<ErrorCode> = outputs
            .iter()
            .map(|streams| classify_streams(streams))
            .collect();

        // Assert
        assert_eq!(
            codes,
            vec![
                ErrorCode::NotFastForward,
                ErrorCode::NotFastForward,
                ErrorCode::StalePushLease,
                ErrorCode::PushRejected,
                ErrorCode::PushRejected,
                ErrorCode::PushRejected,
                ErrorCode::PushRejected,
                ErrorCode::NoUpstream,
                ErrorCode::NoUpstream,
                ErrorCode::Conflicts,
                ErrorCode::Conflicts,
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
