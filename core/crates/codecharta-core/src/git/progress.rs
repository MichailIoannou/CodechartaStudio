use std::time::{Duration, Instant};

use super::parse::progress::{ProgressUpdate, last_progress_line, progress_of};

/// At most one progress report per operation in this interval.
pub const PROGRESS_INTERVAL: Duration = Duration::from_millis(200);
const LINE_SEPARATORS: [char; 2] = ['\r', '\n'];

pub type ProgressSink<'call> = &'call (dyn Fn(ProgressUpdate) + Send + Sync);

#[derive(Debug)]
pub struct ProgressThrottle {
    interval: Duration,
    last_admitted: Option<Instant>,
}

impl ProgressThrottle {
    pub fn new(interval: Duration) -> Self {
        Self {
            interval,
            last_admitted: None,
        }
    }

    /// The first report passes, then one per interval; the ones in between are dropped.
    pub fn admit(&mut self, now: Instant) -> bool {
        let is_due = self
            .last_admitted
            .is_none_or(|last| now.saturating_duration_since(last) >= self.interval);
        if is_due {
            self.last_admitted = Some(now);
        }
        is_due
    }
}

/// Turns a git command's stderr, as it arrives, into throttled progress reports. A line is reported once
/// its `\r` or `\n` has arrived.
pub struct ProgressReporter<'call> {
    sink: ProgressSink<'call>,
    throttle: ProgressThrottle,
    unfinished: String,
}

impl<'call> ProgressReporter<'call> {
    pub fn new(sink: ProgressSink<'call>) -> Self {
        Self {
            sink,
            throttle: ProgressThrottle::new(PROGRESS_INTERVAL),
            unfinished: String::new(),
        }
    }

    pub fn push(&mut self, stderr: &str, now: Instant) {
        self.unfinished.push_str(stderr);
        let Some(end) = self.unfinished.rfind(LINE_SEPARATORS) else {
            return;
        };
        let rest = self.unfinished.split_off(end + 1);
        let finished = std::mem::replace(&mut self.unfinished, rest);
        if let Some(line) = last_progress_line(&finished)
            && self.throttle.admit(now)
        {
            (self.sink)(progress_of(line));
        }
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use super::*;

    const LESS_THAN_THE_INTERVAL: Duration = Duration::from_millis(150);

    #[test]
    fn should_throttle_progress_to_200_ms() {
        // Arrange
        let start = Instant::now();
        let mut throttle = ProgressThrottle::new(PROGRESS_INTERVAL);

        // Act
        let admitted = [
            throttle.admit(start),
            throttle.admit(start + LESS_THAN_THE_INTERVAL),
            throttle.admit(start + PROGRESS_INTERVAL),
            throttle.admit(start + PROGRESS_INTERVAL + LESS_THAN_THE_INTERVAL),
            throttle.admit(start + PROGRESS_INTERVAL * 2),
        ];

        // Assert
        assert_eq!(admitted, [true, false, true, false, true]);
    }

    #[test]
    fn should_report_only_finished_lines_and_drop_reports_within_the_interval() {
        // Arrange
        let reports = Mutex::new(Vec::new());
        let sink = |update: ProgressUpdate| reports.lock().unwrap().push(update);
        let mut reporter = ProgressReporter::new(&sink);
        let start = Instant::now();

        // Act
        reporter.push("Receiving objects:  1", start);
        reporter.push("0% (1/10)\rReceiving objects:  20% (2/10)\r", start);
        reporter.push(
            "Receiving objects:  30% (3/10)\r",
            start + LESS_THAN_THE_INTERVAL,
        );
        reporter.push(
            "remote: Resolving deltas: 100% (4/4)\n",
            start + PROGRESS_INTERVAL,
        );

        // Assert
        let reported: Vec<(String, Option<u32>)> = reports
            .lock()
            .unwrap()
            .iter()
            .map(|update| (update.message.clone(), update.done))
            .collect();
        assert_eq!(
            reported,
            [
                ("Receiving objects:  20% (2/10)".to_string(), Some(20)),
                ("Resolving deltas: 100% (4/4)".to_string(), Some(100)),
            ]
        );
    }
}
