use tokio::io::{AsyncBufRead, AsyncBufReadExt};

pub const MAX_LINE_BYTES: usize = 64 * 1024 * 1024;
const LINE_END: u8 = b'\n';

#[derive(Debug, PartialEq, Eq)]
pub enum Frame {
    Line(Vec<u8>),
    TooLong,
}

pub struct LineReader<Input> {
    input: Input,
    max_line_bytes: usize,
}

struct PartialLine {
    bytes: Vec<u8>,
    is_too_long: bool,
}

impl PartialLine {
    fn append(&mut self, chunk: &[u8], max_line_bytes: usize) {
        if self.is_too_long {
            return;
        }
        if self.bytes.len() + chunk.len() > max_line_bytes {
            self.is_too_long = true;
            self.bytes = Vec::new();
        } else {
            self.bytes.extend_from_slice(chunk);
        }
    }

    fn into_frame(self) -> Frame {
        if self.is_too_long {
            Frame::TooLong
        } else {
            Frame::Line(self.bytes)
        }
    }

    fn is_empty(&self) -> bool {
        self.bytes.is_empty() && !self.is_too_long
    }
}

impl<Input: AsyncBufRead + Unpin> LineReader<Input> {
    pub fn new(input: Input, max_line_bytes: usize) -> Self {
        Self {
            input,
            max_line_bytes,
        }
    }

    pub async fn next_frame(&mut self) -> std::io::Result<Option<Frame>> {
        let mut line = PartialLine {
            bytes: Vec::new(),
            is_too_long: false,
        };
        loop {
            let available = self.input.fill_buf().await?;
            if available.is_empty() {
                return Ok((!line.is_empty()).then(|| line.into_frame()));
            }
            let line_end = available.iter().position(|byte| *byte == LINE_END);
            let chunk_length = line_end.unwrap_or(available.len());
            line.append(&available[..chunk_length], self.max_line_bytes);
            self.input
                .consume(chunk_length + usize::from(line_end.is_some()));
            if line_end.is_some() {
                return Ok(Some(line.into_frame()));
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::BufReader;

    const SMALL_READ_BYTES: usize = 3;

    async fn read_all_frames(input: &[u8], max_line_bytes: usize) -> Vec<Frame> {
        let mut reader = LineReader::new(
            BufReader::with_capacity(SMALL_READ_BYTES, input),
            max_line_bytes,
        );
        let mut frames = Vec::new();
        while let Some(frame) = reader.next_frame().await.unwrap() {
            frames.push(frame);
        }
        frames
    }

    #[tokio::test]
    async fn should_split_lines_across_reads() {
        // Arrange
        let input = b"{\"a\":1}\n{\"bb\":22}\nlast";

        // Act
        let frames = read_all_frames(input, MAX_LINE_BYTES).await;

        // Assert
        assert_eq!(
            frames,
            vec![
                Frame::Line(b"{\"a\":1}".to_vec()),
                Frame::Line(b"{\"bb\":22}".to_vec()),
                Frame::Line(b"last".to_vec()),
            ]
        );
    }

    #[tokio::test]
    async fn should_reject_an_oversized_line() {
        // Arrange
        let input = b"0123456789\nok\n";

        // Act
        let frames = read_all_frames(input, 5).await;

        // Assert
        assert_eq!(frames, vec![Frame::TooLong, Frame::Line(b"ok".to_vec())]);
    }

    #[tokio::test]
    async fn should_keep_empty_lines_between_messages() {
        // Arrange
        let input = b"\n{}\n";

        // Act
        let frames = read_all_frames(input, MAX_LINE_BYTES).await;

        // Assert
        assert_eq!(
            frames,
            vec![Frame::Line(Vec::new()), Frame::Line(b"{}".to_vec())]
        );
    }
}
