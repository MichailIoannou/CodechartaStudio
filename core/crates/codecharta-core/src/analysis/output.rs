use std::path::PathBuf;

use codecharta_core_api::methods::analysis::{AnalysisErrorCode, JobError};
use codecharta_core_api::methods::tools::ToolId;

use crate::error::CoreError;

const MAP_LINE_PREFIX: &str = "Map: ";
const NOT_IN_MAP_HEADING: &str = "Not in the map:";
const NOT_IN_MAP_INDENT: &str = "  ";
const KEPT_CONTROL_CHARACTERS: [char; 3] = ['\n', '\r', '\t'];
const ARGUMENT_ERROR_EXIT_CODE: i32 = 2;
const JAVA_TOO_OLD_MARKERS: [&str; 2] = [
    "ccsh needs Java",
    "Unrecognized option: --enable-native-access",
];
const UNKNOWN_COMMIT_MARKER: &str = "No commit found for";
const WORKTREE_FAILED_MARKER: &str = "Failed to create git worktree";
const GIT_TIMEOUT_MARKER: &str = "Git command timed out";

const OPEN_TOOLS_HINT: &str = "Check the tools in the settings.";
const REPORT_BUG_HINT: &str = "This is a bug in CodeCharta: please report it and attach the log.";
const FETCH_COMMIT_HINT: &str = "Fetch the commit, then analyse it again.";
const LONG_PATHS_HINT: &str = "Paths may exceed 260 characters: run `git config --global core.longpaths true`, or set a short worktree temp folder in the tools settings.";
const SHIM_REFUSED_HINT: &str =
    "Set the ccsh path to the ccsh.bat inside codecharta-analysis, or rename the folder.";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RunEnd {
    Exited {
        code: i32,
    },
    /// Ended by a signal the core did not send.
    Signalled,
    Cancelled,
    TimedOut,
    InteractiveTrap,
    OutputTooLarge,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CcshRunResult {
    pub end: RunEnd,
    pub stdout: String,
    pub stderr: String,
}

/// The git-log step writes bursts of control bytes to stdout; they would garble the log and the messages.
pub fn strip_control_characters(text: &str) -> String {
    text.chars()
        .filter(|character| !character.is_control() || KEPT_CONTROL_CHARACTERS.contains(character))
        .collect()
}

pub fn parse_map_line(stdout: &str) -> Option<PathBuf> {
    stdout
        .lines()
        .rev()
        .find_map(|line| line.strip_prefix(MAP_LINE_PREFIX))
        .map(|path| PathBuf::from(path.trim_end()))
}

pub fn parse_not_in_map(stdout: &str) -> Vec<String> {
    stdout
        .lines()
        .skip_while(|line| line.trim_end() != NOT_IN_MAP_HEADING)
        .skip(1)
        .take_while(|line| line.starts_with(NOT_IN_MAP_INDENT) && !line.trim().is_empty())
        .map(|line| line.trim().to_string())
        .collect()
}

/// For a run that left no map. `None` when the user cancelled it: that is no failure.
pub fn classify_failure(result: &CcshRunResult) -> Option<JobError> {
    if result.end == RunEnd::Cancelled {
        return None;
    }
    Some(
        java_too_old(&result.stderr)
            .or_else(|| stopped_by_the_core(result.end))
            .or_else(|| exited_with_error(result))
            .unwrap_or_else(|| {
                JobError::new(
                    AnalysisErrorCode::NoOutput,
                    "ccsh finished without writing a map.",
                )
            }),
    )
}

fn java_too_old(stderr: &str) -> Option<JobError> {
    let marked: Vec<&str> = stderr
        .lines()
        .filter(|line| {
            JAVA_TOO_OLD_MARKERS
                .iter()
                .any(|marker| line.contains(marker))
        })
        .collect();
    let first = marked.first()?;
    let explanation: Vec<&str> = stderr
        .lines()
        .skip_while(|line| line != first)
        .filter(|line| !line.trim().is_empty())
        .take(JAVA_TOO_OLD_MARKERS.len())
        .collect();
    Some(
        JobError::new(AnalysisErrorCode::JavaTooOld, first.trim())
            .with_hint(explanation.join("\n")),
    )
}

fn stopped_by_the_core(end: RunEnd) -> Option<JobError> {
    let (code, message) = match end {
        RunEnd::InteractiveTrap => (
            AnalysisErrorCode::InteractiveTrap,
            "ccsh started its interactive mode and was stopped.",
        ),
        RunEnd::TimedOut => (
            AnalysisErrorCode::Timeout,
            "The analysis took too long and was stopped.",
        ),
        RunEnd::OutputTooLarge => (
            AnalysisErrorCode::OutputTooLarge,
            "ccsh wrote more output than the core keeps and was stopped.",
        ),
        RunEnd::Signalled => (
            AnalysisErrorCode::Crashed,
            "ccsh was ended from outside the app.",
        ),
        RunEnd::Exited { .. } | RunEnd::Cancelled => return None,
    };
    let error = JobError::new(code, message);
    Some(match code {
        AnalysisErrorCode::InteractiveTrap => error.with_hint(REPORT_BUG_HINT),
        _ => error,
    })
}

fn exited_with_error(result: &CcshRunResult) -> Option<JobError> {
    let RunEnd::Exited { code } = result.end else {
        return None;
    };
    if code == ARGUMENT_ERROR_EXIT_CODE {
        let message = first_line(&result.stderr).unwrap_or("ccsh refused its arguments.");
        return Some(
            JobError::new(AnalysisErrorCode::InvalidArguments, message).with_hint(REPORT_BUG_HINT),
        );
    }
    stdout_marker(&result.stdout).or_else(|| (code != 0).then(|| analysis_failed(result, code)))
}

fn stdout_marker(stdout: &str) -> Option<JobError> {
    let markers = [
        (
            UNKNOWN_COMMIT_MARKER,
            AnalysisErrorCode::UnknownCommit,
            Some(FETCH_COMMIT_HINT),
        ),
        (
            WORKTREE_FAILED_MARKER,
            AnalysisErrorCode::WorktreeFailed,
            Some(LONG_PATHS_HINT),
        ),
        (GIT_TIMEOUT_MARKER, AnalysisErrorCode::GitTimeout, None),
    ];
    markers.into_iter().find_map(|(marker, code, hint)| {
        let line = stdout.lines().find(|line| line.contains(marker))?;
        let error = JobError::new(code, line.trim());
        Some(match hint {
            Some(hint) => error.with_hint(hint),
            None => error,
        })
    })
}

fn analysis_failed(result: &CcshRunResult, code: i32) -> JobError {
    let message = last_line(&result.stdout)
        .map(str::to_string)
        .unwrap_or_else(|| format!("ccsh exited with code {code}."));
    JobError::new(AnalysisErrorCode::AnalysisFailed, message)
}

fn first_line(text: &str) -> Option<&str> {
    text.lines().map(str::trim).find(|line| !line.is_empty())
}

fn last_line(text: &str) -> Option<&str> {
    text.lines()
        .rev()
        .map(str::trim)
        .find(|line| !line.is_empty())
}

/// The process could not be started at all; `CoreError::BadRequest` is the batch-file argument refusal.
pub fn classify_start_failure(error: &CoreError) -> JobError {
    match error {
        CoreError::ToolNotFound { tool: ToolId::Java } => {
            JobError::new(AnalysisErrorCode::JavaNotFound, error.to_string())
                .with_hint(OPEN_TOOLS_HINT)
        }
        CoreError::ToolNotFound { .. } => {
            JobError::new(AnalysisErrorCode::CcshNotFound, error.to_string())
                .with_hint(OPEN_TOOLS_HINT)
        }
        CoreError::BadRequest(message) => {
            JobError::new(AnalysisErrorCode::InvalidArguments, message.clone())
                .with_hint(SHIM_REFUSED_HINT)
        }
        _ => JobError::new(AnalysisErrorCode::AnalysisFailed, error.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SEPARATOR_LINE: &str =
        "────────────────────────────────────────────────────────────────────────";
    const COMMIT_RUN_TAIL: &str = "Analysis done: 4 files with rawtextparser, unifiedparser, dependencyparser, domainlanguageparser, git history\n\nMap: /tmp/ok/d8ced38.map.cc.json.gz\nNot in the map:\n  svn history: left out with --commit, which reads a git commit\n";
    const WITHOUT_X_STDOUT: &str = "--without does not know x. Leave out one of: rawtextparser, unifiedparser, dependencyparser, domainlanguageparser, git, svn\n";
    const UNKNOWN_OPTION_STDERR: &str =
        "Unknown option: '--nonsense'\nPossible solutions: --not-compressed\n";
    const MISSING_SHA_STDOUT: &str = "ccsh analyse failed: Failed to create git worktree for commit 0123456789abcdef0123456789abcdef01234567: Git command failed with exit code 128: git -c core.quotepath=off worktree add /tmp/codecharta-worktree-1\n";
    const JDK_WARNING_STDERR: &str = "WARNING: Final field lineComments in class de.maibornwolff.codecharta.analysers.importers.tokei.TokeiLanguage has been mutated reflectively\n";
    const JAVA_TOO_OLD_STDERR: &str = "ccsh needs Java 22 or newer, but was started with Java 21 from /usr/lib/jvm/21.\nInstall Java 22 or newer and set JAVA_HOME.\n";

    fn commit_run_stdout() -> String {
        format!(
            "Checking if RawTextParser is applicable...\nCreating git.log file...\n\u{e}\u{e}\u{e}Parsing files...\n\n{SEPARATOR_LINE}\n{COMMIT_RUN_TAIL}"
        )
    }

    fn exited(code: i32, stdout: &str, stderr: &str) -> CcshRunResult {
        ended(RunEnd::Exited { code }, stdout, stderr)
    }

    fn ended(end: RunEnd, stdout: &str, stderr: &str) -> CcshRunResult {
        CcshRunResult {
            end,
            stdout: stdout.to_string(),
            stderr: stderr.to_string(),
        }
    }

    fn code_of(result: &CcshRunResult) -> Option<AnalysisErrorCode> {
        classify_failure(result).map(|error| error.code)
    }

    #[test]
    fn should_read_the_map_path_from_the_last_map_line() {
        // Arrange
        let stdout = format!("Map: /tmp/earlier.cc.json.gz\n{}", commit_run_stdout());

        // Act
        let path = parse_map_line(&stdout);

        // Assert
        assert_eq!(path, Some(PathBuf::from("/tmp/ok/d8ced38.map.cc.json.gz")));
    }

    #[test]
    fn should_read_a_map_path_with_spaces_and_a_windows_line_end() {
        // Arrange
        let stdout = "Map: C:\\Users\\Ada Lovelace\\job\\map.cc.json.gz\r\n";

        // Act
        let path = parse_map_line(stdout);

        // Assert
        assert_eq!(
            path,
            Some(PathBuf::from(
                "C:\\Users\\Ada Lovelace\\job\\map.cc.json.gz"
            ))
        );
    }

    #[test]
    fn should_return_none_without_a_map_line() {
        // Arrange
        let stdout = WITHOUT_X_STDOUT;

        // Act
        let path = parse_map_line(stdout);

        // Assert
        assert_eq!(path, None);
    }

    #[test]
    fn should_read_the_not_in_the_map_block() {
        // Arrange
        let stdout = format!("{}\n", commit_run_stdout());

        // Act
        let reasons = parse_not_in_map(&stdout);

        // Assert
        assert_eq!(
            reasons,
            ["svn history: left out with --commit, which reads a git commit"]
        );
        assert!(parse_not_in_map(WITHOUT_X_STDOUT).is_empty());
    }

    #[test]
    fn should_strip_control_characters_but_keep_line_ends_and_tabs() {
        // Arrange
        let stdout = "Creating git.log file...\n\u{e}\u{e}\u{1b}[0mParsing\tfiles...\r\n─";

        // Act
        let cleaned = strip_control_characters(stdout);

        // Assert
        assert_eq!(
            cleaned,
            "Creating git.log file...\n[0mParsing\tfiles...\r\n─"
        );
    }

    #[test]
    fn should_classify_each_row_of_the_failure_table() {
        // Arrange
        let rows = [
            (
                exited(1, "", JAVA_TOO_OLD_STDERR),
                AnalysisErrorCode::JavaTooOld,
            ),
            (
                exited(
                    1,
                    "",
                    "Unrecognized option: --enable-native-access=ALL-UNNAMED\nError: Could not create the Java Virtual Machine.\n",
                ),
                AnalysisErrorCode::JavaTooOld,
            ),
            (
                ended(RunEnd::InteractiveTrap, "Select an analyser to execute", ""),
                AnalysisErrorCode::InteractiveTrap,
            ),
            (ended(RunEnd::TimedOut, "", ""), AnalysisErrorCode::Timeout),
            (
                exited(2, "", UNKNOWN_OPTION_STDERR),
                AnalysisErrorCode::InvalidArguments,
            ),
            (
                exited(1, "ccsh analyse failed: No commit found for v9\n", ""),
                AnalysisErrorCode::UnknownCommit,
            ),
            (
                exited(1, MISSING_SHA_STDOUT, ""),
                AnalysisErrorCode::WorktreeFailed,
            ),
            (
                exited(
                    1,
                    "ccsh analyse failed: Git command timed out after 3 minutes\n",
                    "",
                ),
                AnalysisErrorCode::GitTimeout,
            ),
            (
                exited(1, WITHOUT_X_STDOUT, ""),
                AnalysisErrorCode::AnalysisFailed,
            ),
            (
                exited(0, &commit_run_stdout(), JDK_WARNING_STDERR),
                AnalysisErrorCode::NoOutput,
            ),
        ];

        // Act
        let codes: Vec<Option<AnalysisErrorCode>> =
            rows.iter().map(|(result, _)| code_of(result)).collect();

        // Assert
        let expected: Vec<Option<AnalysisErrorCode>> =
            rows.iter().map(|(_, code)| Some(*code)).collect();
        assert_eq!(codes, expected);
    }

    #[test]
    fn should_read_the_message_of_an_exit_one_from_the_last_stdout_line() {
        // Arrange
        let result = exited(
            1,
            "Analysing /repo ...\nThe folder /missing does not exist.\n\n",
            JDK_WARNING_STDERR,
        );

        // Act
        let error = classify_failure(&result).unwrap();

        // Assert
        assert_eq!(error.code, AnalysisErrorCode::AnalysisFailed);
        assert_eq!(error.message, "The folder /missing does not exist.");
    }

    #[test]
    fn should_read_the_message_of_an_exit_two_from_stderr() {
        // Arrange
        let result = exited(2, "", UNKNOWN_OPTION_STDERR);

        // Act
        let error = classify_failure(&result).unwrap();

        // Assert
        assert_eq!(error.message, "Unknown option: '--nonsense'");
        assert_eq!(error.hint.as_deref(), Some(REPORT_BUG_HINT));
    }

    #[test]
    fn should_explain_java_too_old_with_both_stderr_lines() {
        // Arrange
        let result = exited(1, "", JAVA_TOO_OLD_STDERR);

        // Act
        let error = classify_failure(&result).unwrap();

        // Assert
        assert_eq!(error.hint.as_deref(), Some(JAVA_TOO_OLD_STDERR.trim_end()));
    }

    #[test]
    fn should_never_call_a_signal_or_a_cancel_an_analysis_failure() {
        // Arrange
        let signalled = ended(RunEnd::Signalled, "", "");
        let cancelled = ended(RunEnd::Cancelled, "", "");

        // Act
        let codes = (code_of(&signalled), code_of(&cancelled));

        // Assert
        assert_eq!(codes, (Some(AnalysisErrorCode::Crashed), None));
    }

    #[test]
    fn should_not_treat_jdk_warnings_on_stderr_as_a_failure_reason() {
        // Arrange
        let result = exited(1, WITHOUT_X_STDOUT, JDK_WARNING_STDERR);

        // Act
        let error = classify_failure(&result).unwrap();

        // Assert
        assert_eq!(error.message, WITHOUT_X_STDOUT.trim_end());
    }

    #[test]
    fn should_classify_start_failures() {
        // Arrange
        let errors = [
            CoreError::ToolNotFound { tool: ToolId::Java },
            CoreError::ToolNotFound { tool: ToolId::Ccsh },
            CoreError::BadRequest("Argument 2 contains a percent sign".to_string()),
        ];

        // Act
        let codes: Vec<AnalysisErrorCode> = errors
            .iter()
            .map(|error| classify_start_failure(error).code)
            .collect();

        // Assert
        assert_eq!(
            codes,
            [
                AnalysisErrorCode::JavaNotFound,
                AnalysisErrorCode::CcshNotFound,
                AnalysisErrorCode::InvalidArguments
            ]
        );
    }
}
