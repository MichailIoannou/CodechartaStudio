use std::fs::File;
use std::io::{self, BufReader, Read};
use std::path::Path;

use flate2::read::MultiGzDecoder;
use serde_json::Value;

/// Only the start of a map is read: cc.json 2.x writes `meta` first and the root node right after `files`.
pub const MAP_HEAD_BYTES: u64 = 64 * 1024;
const META_START: &str = "{\"meta\":";
const CHECKSUM_FIELD: &str = "checksum";
const ROOT_START: &str = "\"files\":[{\"id\":\"";
const NAME_FIELD_START: &str = ",\"name\":\"";
const QUOTE: char = '"';
const ESCAPE: char = '\\';

/// What the start of a stored map says; either part is `None` when it is not where cc.json 2.x puts it.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct MapHead {
    pub checksum: Option<String>,
    pub root_name: Option<String>,
}

/// A gzip map that ends early still answers what its readable start holds.
pub fn read_map_head(path: &Path) -> io::Result<MapHead> {
    let file = File::open(path)?;
    let text = decompressed_start(file);
    Ok(MapHead {
        checksum: checksum_of(&text),
        root_name: root_name_of(&text),
    })
}

fn decompressed_start(file: File) -> String {
    let mut bytes = Vec::new();
    let reading = MultiGzDecoder::new(BufReader::new(file))
        .take(MAP_HEAD_BYTES)
        .read_to_end(&mut bytes);
    if let Err(error) = reading {
        tracing::debug!("the stored map ends early: {error}");
    }
    String::from_utf8_lossy(&bytes).into_owned()
}

fn checksum_of(text: &str) -> Option<String> {
    let meta = text.strip_prefix(META_START)?;
    let end = meta.find('}')?;
    let object = meta.get(..=end)?;
    if object.get(1..)?.contains('{') {
        return None;
    }
    let meta: Value = serde_json::from_str(object).ok()?;
    meta.get(CHECKSUM_FIELD)?.as_str().map(str::to_string)
}

fn root_name_of(text: &str) -> Option<String> {
    let after_root = &text[text.find(ROOT_START)? + ROOT_START.len()..];
    let after_id = &after_root[after_root.find(QUOTE)?..];
    let name = after_id
        .strip_prefix(QUOTE)?
        .strip_prefix(NAME_FIELD_START)?;
    let quoted = name.get(..closing_quote_of(name)? + 1)?;
    serde_json::from_str(&format!("{QUOTE}{quoted}")).ok()
}

/// The byte index of the first quote that is not escaped.
fn closing_quote_of(text: &str) -> Option<usize> {
    let mut is_escaped = false;
    for (index, character) in text.char_indices() {
        match character {
            _ if is_escaped => is_escaped = false,
            ESCAPE => is_escaped = true,
            QUOTE => return Some(index),
            _ => {}
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::io::Write;

    use flate2::Compression;
    use flate2::write::GzEncoder;

    use super::*;

    const MAP: &str = r#"{"meta":{"projectName":"","apiVersion":"2.1","checksum":"f87c71b6aa"},"files":[{"id":"0","name":"ro\"ot","type":"Folder","children":[]}],"lenses":{}}"#;
    const TRUNCATED_LENGTH: usize = 12;

    fn gzip(content: &str) -> Vec<u8> {
        let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
        encoder.write_all(content.as_bytes()).unwrap();
        encoder.finish().unwrap()
    }

    fn stored(content: &[u8]) -> (tempfile::TempDir, std::path::PathBuf) {
        let folder = tempfile::tempdir().unwrap();
        let file = folder.path().join("map.cc.json.gz");
        fs::write(&file, content).unwrap();
        (folder, file)
    }

    #[test]
    fn should_read_checksum_and_root_name_from_a_gzipped_map() {
        // Arrange
        let (_folder, file) = stored(&gzip(MAP));

        // Act
        let head = read_map_head(&file).unwrap();

        // Assert
        assert_eq!(
            head,
            MapHead {
                checksum: Some("f87c71b6aa".to_string()),
                root_name: Some("ro\"ot".to_string()),
            }
        );
    }

    #[test]
    fn should_return_none_for_a_truncated_file() {
        // Arrange
        let compressed = gzip(MAP);
        let (_folder, file) = stored(&compressed[..TRUNCATED_LENGTH]);

        // Act
        let head = read_map_head(&file).unwrap();

        // Assert
        assert_eq!(head, MapHead::default());
    }

    #[test]
    fn should_not_read_past_64_kib() {
        // Arrange
        let long_id = "x".repeat(usize::try_from(MAP_HEAD_BYTES).unwrap());
        let map = format!(
            r#"{{"meta":{{"checksum":"abc"}},"files":[{{"id":"{long_id}","name":"root"}}]}}"#
        );
        let (_folder, file) = stored(&gzip(&map));

        // Act
        let head = read_map_head(&file).unwrap();

        // Assert
        assert_eq!(head.checksum.as_deref(), Some("abc"));
        assert_eq!(head.root_name, None);
    }

    #[test]
    fn should_return_none_when_meta_is_not_first_or_holds_an_object() {
        // Arrange
        let (_late, late_meta) = stored(&gzip(r#"{"files":[],"meta":{"checksum":"abc"}}"#));
        let (_nested, nested_meta) = stored(&gzip(r#"{"meta":{"x":{"checksum":"abc"}}}"#));

        // Act
        let late = read_map_head(&late_meta).unwrap();
        let nested = read_map_head(&nested_meta).unwrap();

        // Assert
        assert_eq!(late.checksum, None);
        assert_eq!(nested.checksum, None);
    }
}
