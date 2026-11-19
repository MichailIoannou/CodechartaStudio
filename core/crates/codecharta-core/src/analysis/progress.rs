use codecharta_core_api::methods::analysis::JobProgress;

/// Several parsers count the same files, each from 0 to 100 %, and `Byte` counts something else; only the
/// most advanced `Files` bar says how far the run is.
const COUNTED_UNIT: &str = "Files";
const MAX_RUNNING_PERCENT: u8 = 99;
const FULL_PERCENT: u64 = 100;
const SEGMENT_SEPARATORS: [char; 2] = ['\r', '\n'];
/// A bar is about 150 characters plus a file name; anything longer without a separator is not a bar.
const MAX_PENDING_CHARS: usize = 4096;
const PERCENT_OPENING: &str = "% [";
const BAR_CLOSING: char = ']';
const BAR_FILL: char = '=';
const BAR_HEAD: char = '>';
const COUNT_SEPARATOR: char = '/';
const ETA_MARKER: &str = ", ETA: ";
const UNKNOWN_ETA: &str = "N/A";
const ETA_SEPARATOR: char = ':';
const MAX_PERCENT_DIGITS: usize = 3;
const MIN_HOUR_DIGITS: usize = 2;
const MINUTE_AND_SECOND_DIGITS: usize = 2;

/// Reads ccsh's stderr as it arrives and follows its progress bars.
#[derive(Debug, Default)]
pub struct ProgressParser {
    pending: String,
    percent: Option<u8>,
}

struct Bar<'segment> {
    parsed: u64,
    total: u64,
    unit: &'segment str,
}

impl ProgressParser {
    pub fn new() -> Self {
        Self::default()
    }

    /// The new percent when this chunk moved it forward.
    pub fn push(&mut self, chunk: &str) -> Option<u8> {
        self.pending.push_str(chunk);
        let best = self
            .pending
            .split(SEGMENT_SEPARATORS)
            .filter_map(percent_of_segment)
            .max();
        self.keep_unfinished_segment();
        let advanced = best.filter(|percent| self.percent.is_none_or(|shown| *percent > shown))?;
        self.percent = Some(advanced);
        Some(advanced)
    }

    pub fn progress(&self) -> JobProgress {
        match self.percent {
            Some(percent) => JobProgress::Determinate { percent },
            None => JobProgress::Indeterminate,
        }
    }

    fn keep_unfinished_segment(&mut self) {
        let start = self
            .pending
            .rfind(SEGMENT_SEPARATORS)
            .map_or(0, |separator| separator + 1);
        self.pending.drain(..start);
        if self.pending.chars().count() > MAX_PENDING_CHARS {
            self.pending.clear();
        }
    }
}

/// An unfinished segment counts only once its ETA is complete, so a cut-off count is never read.
fn percent_of_segment(segment: &str) -> Option<u8> {
    let bar = parse_bar(segment)?;
    if bar.unit != COUNTED_UNIT || bar.total == 0 || bar.parsed > bar.total {
        return None;
    }
    let percent = bar.parsed * FULL_PERCENT / bar.total;
    let running = u8::try_from(percent).map_or(MAX_RUNNING_PERCENT, |percent| {
        percent.min(MAX_RUNNING_PERCENT)
    });
    Some(running)
}

fn parse_bar(segment: &str) -> Option<Bar<'_>> {
    let (percent, rest) = segment.split_once(PERCENT_OPENING)?;
    if !is_number(percent.trim_start(), MAX_PERCENT_DIGITS) {
        return None;
    }
    let (bar, rest) = rest.split_once(BAR_CLOSING)?;
    if !is_drawn_bar(bar) {
        return None;
    }
    let (counts, rest) = rest.trim_start().split_once(' ')?;
    let (parsed, total) = counts.split_once(COUNT_SEPARATOR)?;
    let (unit, eta) = rest.split_once(ETA_MARKER)?;
    if !is_complete_eta(eta) {
        return None;
    }
    Some(Bar {
        parsed: parsed.parse().ok()?,
        total: total.parse().ok()?,
        unit,
    })
}

fn is_number(text: &str, max_digits: usize) -> bool {
    (1..=max_digits).contains(&text.len()) && text.bytes().all(|byte| byte.is_ascii_digit())
}

fn is_drawn_bar(bar: &str) -> bool {
    bar.trim_end_matches(' ')
        .strip_suffix(BAR_HEAD)
        .is_some_and(|fill| fill.chars().all(|character| character == BAR_FILL))
}

fn is_complete_eta(text: &str) -> bool {
    let eta = text.split(' ').next().unwrap_or_default();
    if eta == UNKNOWN_ETA {
        return true;
    }
    let parts: Vec<&str> = eta.split(ETA_SEPARATOR).collect();
    let [hours, minutes, seconds] = parts.as_slice() else {
        return false;
    };
    hours.len() >= MIN_HOUR_DIGITS
        && is_number(hours, usize::MAX)
        && [minutes, seconds].iter().all(|part| {
            part.len() == MINUTE_AND_SECOND_DIGITS && is_number(part, MINUTE_AND_SECOND_DIGITS)
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    const LOGGER_LINE: &str = "[main] INFO de.maibornwolff.codecharta.analysers.parsers.unified.UnifiedParser - Parsing files\n";
    const JDK_WARNING: &str = "WARNING: Final field lineComments in class de.maibornwolff.codecharta.analysers.importers.tokei.TokeiLanguage has been mutated reflectively\n";

    /// The exact drawing of `ProgressTracker.kt` (ccsh 2.4.0).
    fn bar(parsed: u64, total: u64, unit: &str, file: &str) -> String {
        let percent = parsed * 100 / total;
        let lead = if percent == 0 {
            2
        } else {
            2 - percent.ilog10()
        };
        let gap = if parsed == 0 {
            total.ilog10()
        } else {
            total.ilog10() - parsed.ilog10()
        };
        let eta = if parsed == 0 { "N/A" } else { "00:00:07" };
        let mut drawn = format!(
            "\r{} {percent}% [{}>{}]{} {parsed}/{total} {unit}, ETA: {eta}",
            " ".repeat(lead as usize),
            "=".repeat(percent as usize),
            " ".repeat((100 - percent) as usize),
            " ".repeat(gap as usize),
        );
        if !file.is_empty() {
            drawn.push_str(&format!(" parsed file: {file}"));
        }
        drawn
    }

    #[test]
    fn should_report_nothing_before_the_first_bar() {
        // Arrange
        let mut parser = ProgressParser::new();

        // Act
        let pushed = parser.push(&format!("{LOGGER_LINE}{JDK_WARNING}"));

        // Assert
        assert_eq!(pushed, None);
        assert_eq!(parser.progress(), JobProgress::Indeterminate);
    }

    #[test]
    fn should_parse_a_single_tracker() {
        // Arrange
        let mut parser = ProgressParser::new();

        // Act
        let pushed = parser.push(&bar(123, 456, "Files", "src/Main.java"));

        // Assert
        assert_eq!(pushed, Some(26));
        assert_eq!(parser.progress(), JobProgress::Determinate { percent: 26 });
    }

    #[test]
    fn should_follow_the_most_advanced_of_two_interleaved_trackers() {
        // Arrange
        let mut parser = ProgressParser::new();
        let interleaved = [
            bar(10, 100, "Files", "a"),
            bar(50, 200, "Files", "b"),
            bar(30, 100, "Files", "c"),
            bar(60, 200, "Files", "d"),
        ];

        // Act
        let pushed: Vec<Option<u8>> = interleaved.iter().map(|chunk| parser.push(chunk)).collect();

        // Assert
        assert_eq!(pushed, [Some(10), Some(25), Some(30), None]);
        assert_eq!(parser.progress(), JobProgress::Determinate { percent: 30 });
    }

    #[test]
    fn should_survive_a_segment_split_across_chunks() {
        // Arrange
        let mut parser = ProgressParser::new();
        let drawn = bar(345, 1000, "Files", "Main.java");
        let (first, second) = drawn.split_at(drawn.find("/1").unwrap() + 2);

        // Act
        let pushed = (parser.push(first), parser.push(second));

        // Assert
        assert_eq!(pushed, (None, Some(34)));
    }

    #[test]
    fn should_not_read_a_count_cut_off_inside_the_eta() {
        // Arrange
        let mut parser = ProgressParser::new();
        let drawn = bar(5, 10, "Files", "");
        let (first, second) = drawn.split_at(drawn.len() - 1);

        // Act
        let pushed = (parser.push(first), parser.push(second));

        // Assert
        assert_eq!(pushed, (None, Some(50)));
    }

    #[test]
    fn should_never_decrease() {
        // Arrange
        let mut parser = ProgressParser::new();
        parser.push(&bar(80, 100, "Files", "late"));

        // Act
        let pushed = parser.push(&bar(5, 100, "Files", "next parser starts again"));

        // Assert
        assert_eq!(pushed, None);
        assert_eq!(parser.progress(), JobProgress::Determinate { percent: 80 });
    }

    #[test]
    fn should_cap_at_99() {
        // Arrange
        let mut parser = ProgressParser::new();

        // Act
        let pushed = parser.push(&bar(30000, 30000, "Files", "last.java"));

        // Assert
        assert_eq!(pushed, Some(MAX_RUNNING_PERCENT));
    }

    #[test]
    fn should_ignore_the_byte_unit() {
        // Arrange
        let mut parser = ProgressParser::new();

        // Act
        let pushed = parser.push(&bar(1_900_000, 1_952_115, "Byte", ""));

        // Assert
        assert_eq!(pushed, None);
        assert_eq!(parser.progress(), JobProgress::Indeterminate);
    }

    #[test]
    fn should_follow_a_parallel_run_mixed_with_log_lines() {
        // Arrange
        let mut parser = ProgressParser::new();
        let stderr = [
            JDK_WARNING.to_string(),
            bar(0, 30000, "Files", ""),
            bar(15000, 30000, "Files", "f15000.java"),
            format!("\n{LOGGER_LINE}"),
            bar(1_000_000, 1_952_115, "Byte", ""),
            bar(3000, 30000, "Files", "f3000.java"),
            bar(21000, 30000, "Files", "f21000.java"),
            "\nCreated Project with 30000 leaves.\n".to_string(),
        ];

        // Act
        let pushed: Vec<Option<u8>> = stderr.iter().map(|chunk| parser.push(chunk)).collect();

        // Assert
        assert_eq!(
            pushed,
            [None, Some(0), Some(50), None, None, None, Some(70), None]
        );
    }
}
