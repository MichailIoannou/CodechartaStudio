use std::fs::File;
use std::io::{BufWriter, Write};
use std::path::Path;

use super::progress::is_progress_bar;

const LINE_END: &str = "\n";
const SEGMENT_SEPARATORS: [char; 2] = ['\r', '\n'];

/// `run.log`: stdout as it came, stderr cut at `\r` and `\n` into lines, and of each run of progress bars
/// only the last one. A failed write is logged and the analysis goes on: the log is a diagnosis aid.
pub struct RunLog {
    file: BufWriter<File>,
    unfinished_stderr: String,
    held_bar: Option<String>,
}

impl RunLog {
    pub fn create(path: &Path) -> std::io::Result<Self> {
        Ok(Self {
            file: BufWriter::new(File::create(path)?),
            unfinished_stderr: String::new(),
            held_bar: None,
        })
    }

    pub fn stdout(&mut self, text: &str) {
        self.write_held_bar();
        self.write(text);
    }

    pub fn stderr(&mut self, text: &str) {
        self.unfinished_stderr.push_str(text);
        let Some(end) = self.unfinished_stderr.rfind(SEGMENT_SEPARATORS) else {
            return;
        };
        let rest = self.unfinished_stderr.split_off(end + 1);
        let finished = std::mem::replace(&mut self.unfinished_stderr, rest);
        for segment in finished.split(SEGMENT_SEPARATORS) {
            self.stderr_segment(segment);
        }
    }

    pub fn finish(mut self) {
        let rest = std::mem::take(&mut self.unfinished_stderr);
        self.stderr_segment(&rest);
        self.write_held_bar();
        if let Err(error) = self.file.flush() {
            tracing::warn!("could not write the analysis log: {error}");
        }
    }

    fn stderr_segment(&mut self, segment: &str) {
        if segment.trim().is_empty() {
            return;
        }
        if is_progress_bar(segment) {
            self.held_bar = Some(segment.trim().to_string());
            return;
        }
        self.write_held_bar();
        self.write_line(segment);
    }

    fn write_held_bar(&mut self) {
        if let Some(bar) = self.held_bar.take() {
            self.write_line(&bar);
        }
    }

    fn write_line(&mut self, line: &str) {
        self.write(line);
        self.write(LINE_END);
    }

    fn write(&mut self, text: &str) {
        if let Err(error) = self.file.write_all(text.as_bytes()) {
            tracing::warn!("could not write the analysis log: {error}");
        }
    }
}
