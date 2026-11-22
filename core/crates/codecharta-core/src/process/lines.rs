const LINE_END: char = '\n';
const CARRIAGE_RETURN: char = '\r';

/// Cuts streamed output into lines: a line split over two chunks waits for the rest. Lines come without
/// their line end (`\n` or `\r\n`).
#[derive(Debug, Default)]
pub struct LineSplitter {
    partial: String,
}

impl LineSplitter {
    /// The lines this chunk completes.
    pub fn push(&mut self, chunk: &str) -> Vec<String> {
        self.partial.push_str(chunk);
        let Some(last_end) = self.partial.rfind(LINE_END) else {
            return Vec::new();
        };
        let rest = self.partial.split_off(last_end + LINE_END.len_utf8());
        let complete = std::mem::replace(&mut self.partial, rest);
        complete.lines().map(str::to_string).collect()
    }

    /// The last line when the output did not end with a line end.
    pub fn finish(&mut self) -> Option<String> {
        let rest = std::mem::take(&mut self.partial);
        let line = rest.trim_end_matches(CARRIAGE_RETURN);
        (!line.is_empty()).then(|| line.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_hold_back_a_line_split_over_chunks() {
        // Arrange
        let mut lines = LineSplitter::default();

        // Act
        let first = lines.push("one\ntw");
        let second = lines.push("o\r\nthree");
        let last = lines.finish();

        // Assert
        assert_eq!(first, ["one"]);
        assert_eq!(second, ["two"]);
        assert_eq!(last.as_deref(), Some("three"));
        assert_eq!(lines.finish(), None);
    }

    #[test]
    fn should_give_nothing_for_a_chunk_without_line_end() {
        // Arrange
        let mut lines = LineSplitter::default();

        // Act
        let pushed = lines.push("partial");

        // Assert
        assert!(pushed.is_empty());
        assert_eq!(lines.finish().as_deref(), Some("partial"));
    }
}
