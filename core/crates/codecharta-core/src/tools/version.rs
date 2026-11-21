use std::cmp::Ordering;

use codecharta_core_api::methods::tools::ToolId;

const MAX_SEGMENTS: usize = 3;
const FULL_VERSION_SEGMENTS: usize = 3;
/// `java -version` may print just the feature release (`"25"`).
const JAVA_MIN_SEGMENTS: usize = 1;
const SEGMENT_SEPARATOR: char = '.';

/// Reads the version a tool prints; `None` when the text does not look like that tool's answer.
pub fn read_version(tool: ToolId, stdout: &str, stderr: &str) -> Option<String> {
    match tool {
        ToolId::Git => version_after(stdout, "git version ", FULL_VERSION_SEGMENTS),
        ToolId::Ccsh => version_after(stdout, "version \"", FULL_VERSION_SEGMENTS),
        ToolId::Java => version_after(stderr, "version \"", JAVA_MIN_SEGMENTS),
        ToolId::Gh => version_after(stdout, "gh version ", FULL_VERSION_SEGMENTS),
        ToolId::Glab => first_version(stdout),
    }
}

/// Compares numerically per dotted segment; a missing segment counts as 0, so "22" equals "22.0.0".
pub fn is_at_least(version: &str, minimum: &str) -> bool {
    let actual = numeric_segments(version);
    let required = numeric_segments(minimum);
    let length = actual.len().max(required.len());
    let segment = |segments: &[u64], index: usize| segments.get(index).copied().unwrap_or(0);
    let ordering = (0..length)
        .map(|index| segment(&actual, index).cmp(&segment(&required, index)))
        .find(|ordering| *ordering != Ordering::Equal)
        .unwrap_or(Ordering::Equal);
    ordering != Ordering::Less
}

fn numeric_segments(version: &str) -> Vec<u64> {
    version
        .split(SEGMENT_SEPARATOR)
        .map(|segment| {
            let digits: String = segment.chars().take_while(char::is_ascii_digit).collect();
            digits.parse().unwrap_or(0)
        })
        .collect()
}

fn version_after(text: &str, marker: &str, min_segments: usize) -> Option<String> {
    let start = text.find(marker)? + marker.len();
    leading_version(&text[start..], min_segments)
}

fn first_version(text: &str) -> Option<String> {
    text.char_indices()
        .filter(|(index, character)| character.is_ascii_digit() && starts_a_number(text, *index))
        .find_map(|(index, _)| leading_version(&text[index..], FULL_VERSION_SEGMENTS))
}

fn starts_a_number(text: &str, index: usize) -> bool {
    text[..index]
        .chars()
        .next_back()
        .is_none_or(|previous| !previous.is_ascii_digit() && previous != SEGMENT_SEPARATOR)
}

/// The dotted number at the start of `text`, at most three segments: "2.45.1.windows.1" → "2.45.1".
fn leading_version(text: &str, min_segments: usize) -> Option<String> {
    let mut segments: Vec<&str> = Vec::new();
    let mut rest = text;
    while segments.len() < MAX_SEGMENTS {
        let digits_length = rest.chars().take_while(char::is_ascii_digit).count();
        if digits_length == 0 {
            break;
        }
        segments.push(&rest[..digits_length]);
        match rest[digits_length..].strip_prefix(SEGMENT_SEPARATOR) {
            Some(after_separator) => rest = after_separator,
            None => break,
        }
    }
    (segments.len() >= min_segments).then(|| segments.join("."))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_read_git_version_from_a_windows_build_string() {
        // Arrange
        let stdout = "git version 2.45.1.windows.1\n";

        // Act
        let version = read_version(ToolId::Git, stdout, "");

        // Assert
        assert_eq!(version.as_deref(), Some("2.45.1"));
    }

    #[test]
    fn should_read_java_major_from_an_openjdk_banner() {
        // Arrange
        let stderr = "openjdk version \"25\" 2025-09-16 LTS\nOpenJDK Runtime Environment (build 25+36-LTS)\n";

        // Act
        let version = read_version(ToolId::Java, "", stderr);

        // Assert
        assert_eq!(version.as_deref(), Some("25"));
        assert!(is_at_least("25", "22"));
    }

    #[test]
    fn should_read_a_full_java_version() {
        // Arrange
        let stderr = "Picked up JAVA_TOOL_OPTIONS: -Xmx1g\nopenjdk version \"17.0.2\" 2022-01-18\n";

        // Act
        let version = read_version(ToolId::Java, "", stderr);

        // Assert
        assert_eq!(version.as_deref(), Some("17.0.2"));
        assert!(!is_at_least("17.0.2", "22"));
    }

    #[test]
    fn should_read_ccsh_version() {
        // Arrange
        let stdout = "version \"2.4.0\"\n";

        // Act
        let version = read_version(ToolId::Ccsh, stdout, "");

        // Assert
        assert_eq!(version.as_deref(), Some("2.4.0"));
    }

    #[test]
    fn should_read_gh_and_glab_versions() {
        // Arrange
        let gh =
            "gh version 2.40.1 (2023-12-13)\nhttps://github.com/cli/cli/releases/tag/v2.40.1\n";
        let glab = "glab 1.36.0 (2024-01-02)\n";

        // Act
        let versions = [
            read_version(ToolId::Gh, gh, ""),
            read_version(ToolId::Glab, glab, ""),
        ];

        // Assert
        assert_eq!(
            versions,
            [Some("2.40.1".to_string()), Some("1.36.0".to_string())]
        );
    }

    #[test]
    fn should_not_read_a_version_from_other_text() {
        // Arrange
        let stdout = "usage: something else\n";

        // Act
        let versions = [
            ToolId::Git,
            ToolId::Ccsh,
            ToolId::Java,
            ToolId::Gh,
            ToolId::Glab,
        ]
        .map(|tool| read_version(tool, stdout, stdout));

        // Assert
        assert!(versions.iter().all(Option::is_none), "{versions:?}");
    }

    #[test]
    fn should_compare_2_10_above_2_9() {
        // Arrange
        let (newer, older) = ("2.10", "2.9");

        // Act
        let comparisons = [is_at_least(newer, older), is_at_least(older, newer)];

        // Assert
        assert_eq!(comparisons, [true, false]);
    }

    #[test]
    fn should_treat_missing_segments_as_zero() {
        // Arrange
        let (short, long) = ("2.31", "2.31.0");

        // Act
        let comparisons = [
            is_at_least(short, long),
            is_at_least(long, short),
            is_at_least("2.30.9", long),
        ];

        // Assert
        assert_eq!(comparisons, [true, true, false]);
    }
}
