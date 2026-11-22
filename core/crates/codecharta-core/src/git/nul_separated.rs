const NUL: char = '\0';

/// git's `-z` output terminates every field with NUL, so the text after the last NUL is empty.
pub fn split_nul_fields(text: &str) -> Vec<&str> {
    let mut fields: Vec<&str> = text.split(NUL).collect();
    if fields.last() == Some(&"") {
        fields.pop();
    }
    fields
}

/// `None` when the fields do not make whole records of `size` fields.
pub fn chunk_records<'fields, 'text>(
    fields: &'fields [&'text str],
    size: usize,
) -> Option<Vec<&'fields [&'text str]>> {
    if size == 0 || !fields.len().is_multiple_of(size) {
        return None;
    }
    Some(fields.chunks(size).collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_split_nul_fields_and_drop_trailing_empty() {
        // Arrange
        let output = "a\0\0b c\0";

        // Act
        let fields = split_nul_fields(output);

        // Assert
        assert_eq!(fields, vec!["a", "", "b c"]);
        assert!(split_nul_fields("").is_empty());
    }

    #[test]
    fn should_reject_record_count_not_multiple() {
        // Arrange
        let fields = ["a", "b", "c", "d", "e"];

        // Act
        let uneven = chunk_records(&fields, 2);
        let even = chunk_records(&fields[..4], 2);

        // Assert
        assert!(uneven.is_none());
        assert_eq!(even, Some(vec![&["a", "b"][..], &["c", "d"][..]]));
    }
}
