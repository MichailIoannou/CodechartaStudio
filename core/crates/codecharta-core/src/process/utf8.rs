const REPLACEMENT: char = char::REPLACEMENT_CHARACTER;

/// Turns a byte stream into text chunk by chunk without ever splitting a character: an incomplete
/// sequence at the end of a chunk waits for the next one; only invalid bytes become U+FFFD.
#[derive(Debug, Default)]
pub struct Utf8Decoder {
    pending: Vec<u8>,
}

impl Utf8Decoder {
    pub fn decode(&mut self, bytes: &[u8]) -> String {
        self.pending.extend_from_slice(bytes);
        let mut text = String::new();
        loop {
            match std::str::from_utf8(&self.pending) {
                Ok(valid) => {
                    text.push_str(valid);
                    self.pending.clear();
                    return text;
                }
                Err(error) => {
                    let valid_length = error.valid_up_to();
                    text.push_str(&String::from_utf8_lossy(&self.pending[..valid_length]));
                    let Some(invalid_length) = error.error_len() else {
                        self.pending.drain(..valid_length);
                        return text;
                    };
                    text.push(REPLACEMENT);
                    self.pending.drain(..valid_length + invalid_length);
                }
            }
        }
    }

    pub fn finish(&mut self) -> String {
        let rest = String::from_utf8_lossy(&self.pending).into_owned();
        self.pending.clear();
        rest
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_hold_back_an_incomplete_character() {
        // Arrange
        let euro = "€".as_bytes();
        let mut decoder = Utf8Decoder::default();

        // Act
        let first = decoder.decode(&[b'a', euro[0], euro[1]]);
        let second = decoder.decode(&[euro[2], b'b']);

        // Assert
        assert_eq!((first.as_str(), second.as_str()), ("a", "€b"));
    }

    #[test]
    fn should_replace_invalid_bytes_and_keep_going() {
        // Arrange
        let mut decoder = Utf8Decoder::default();

        // Act
        let text = decoder.decode(&[b'a', 0xFF, b'b']);

        // Assert
        assert_eq!(text, "a\u{FFFD}b");
    }

    #[test]
    fn should_flush_a_truncated_character_at_the_end() {
        // Arrange
        let mut decoder = Utf8Decoder::default();
        decoder.decode(&"€".as_bytes()[..2]);

        // Act
        let rest = decoder.finish();

        // Assert
        assert_eq!(rest, "\u{FFFD}");
    }
}
