const LINE_SEPARATORS: [char; 2] = ['\r', '\n'];
const REMOTE_PREFIX: &str = "remote: ";
const PERCENT_SIGN: char = '%';
const PERCENT_TOTAL: u32 = 100;

/// One progress report of a git command talking to a remote, as `core.progress` carries it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProgressUpdate {
    pub message: String,
    pub done: Option<u32>,
    pub total: Option<u32>,
}

/// git redraws its progress with `\r`; only the newest non-empty line counts.
pub fn last_progress_line(text: &str) -> Option<&str> {
    text.split(LINE_SEPARATORS)
        .map(str::trim_end)
        .rfind(|line| !line.is_empty())
}

/// `Receiving objects:  45% (450/1000)` is 45 of 100 done; a line without a percentage has no counts.
pub fn progress_of(line: &str) -> ProgressUpdate {
    let message = line
        .strip_prefix(REMOTE_PREFIX)
        .unwrap_or(line)
        .trim_end()
        .to_string();
    let done = percentage_in(&message);
    ProgressUpdate {
        done,
        total: done.map(|_| PERCENT_TOTAL),
        message,
    }
}

fn percentage_in(message: &str) -> Option<u32> {
    message
        .split_whitespace()
        .find_map(|word| word.strip_suffix(PERCENT_SIGN)?.parse::<u32>().ok())
        .filter(|percent| *percent <= PERCENT_TOTAL)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_keep_the_last_line_of_a_carriage_return_stream() {
        // Arrange
        let stream = "Counting objects:  10% (1/10)\rCounting objects:  60% (6/10)\rCounting objects: 100% (10/10), done.\r\n\r\n";

        // Act
        let line = last_progress_line(stream);

        // Assert
        assert_eq!(line, Some("Counting objects: 100% (10/10), done."));
        assert_eq!(last_progress_line("\r\n  \r"), None);
    }

    #[test]
    fn should_read_nn_percent_as_done_of_100() {
        // Arrange
        let line = "Receiving objects:  45% (450/1000), 1.20 MiB | 2.00 MiB/s";

        // Act
        let update = progress_of(line);

        // Assert
        assert_eq!(update.done, Some(45));
        assert_eq!(update.total, Some(100));
        assert_eq!(update.message, line);
    }

    #[test]
    fn should_strip_remote_prefix_and_trailing_spaces() {
        // Arrange
        let line = "remote: Compressing objects:   7% (3/40)        ";

        // Act
        let update = progress_of(line);

        // Assert
        assert_eq!(update.message, "Compressing objects:   7% (3/40)");
        assert_eq!(update.done, Some(7));
    }

    #[test]
    fn should_have_no_counts_without_a_percentage() {
        // Arrange
        let lines = [
            "From ../origin",
            "Unpacking: 250% odd",
            "remote: Enumerating objects: 5",
        ];

        // Act
        let updates: Vec<ProgressUpdate> = lines.into_iter().map(progress_of).collect();

        // Assert
        assert!(
            updates
                .iter()
                .all(|update| update.done.is_none() && update.total.is_none())
        );
        assert_eq!(updates[2].message, "Enumerating objects: 5");
    }
}
