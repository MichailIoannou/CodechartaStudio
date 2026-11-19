use std::fs::{self, File};
use std::io::{self, BufReader, Read};
use std::path::{Path, PathBuf};

use codecharta_core_api::methods::snapshots::CommitHint;
use codecharta_core_api::values::CommitHash;
use flate2::Compression;
use flate2::read::MultiGzDecoder;
use flate2::write::GzEncoder;
use sha2::{Digest, Sha256};

use crate::error::{CoreError, CoreResult};
use crate::snapshots::repository::io_error;
use crate::timestamps;

const GZIP_MAGIC: [u8; 2] = [0x1f, 0x8b];
const HINT_SEPARATOR: char = '.';

/// A cc.json file (plain or gzip) outside the store, about to be imported.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ImportFile {
    pub path: PathBuf,
    pub file_name: String,
    pub size_bytes: u64,
    pub modified_at: String,
    pub is_gzip: bool,
}

impl ImportFile {
    /// Only an existing regular file is accepted; a relative path is taken from the working directory.
    pub fn open(path: &Path) -> CoreResult<Self> {
        let path = std::path::absolute(path).map_err(|source| io_error("resolve", path, source))?;
        let metadata = fs::metadata(&path).map_err(|source| match source.kind() {
            io::ErrorKind::NotFound => {
                CoreError::NotFound(format!("There is no file {}.", path.display()))
            }
            _ => io_error("read", &path, source),
        })?;
        if !metadata.is_file() {
            return Err(CoreError::BadRequest(format!(
                "{} is not a regular file.",
                path.display()
            )));
        }
        let modified = metadata
            .modified()
            .map_err(|source| io_error("read the date of", &path, source))?;
        Ok(Self {
            file_name: file_name_of(&path),
            size_bytes: metadata.len(),
            modified_at: timestamps::of(modified),
            is_gzip: starts_with_gzip_magic(&path)?,
            path,
        })
    }

    /// SHA-256 of the uncompressed content, so a map and its gzip have the same hash.
    pub fn content_sha256(&self) -> CoreResult<String> {
        let mut hasher = Sha256::new();
        io::copy(&mut self.content_reader()?, &mut hasher).map_err(|source| {
            CoreError::BadRequest(format!(
                "{} could not be read as a map: {source}",
                self.file_name
            ))
        })?;
        Ok(format!("{:x}", hasher.finalize()))
    }

    /// Writes the file to `target` gzip-compressed; a gzip file is copied as it is.
    pub fn copy_as_gzip(&self, target: &Path) -> CoreResult<()> {
        if self.is_gzip {
            return fs::copy(&self.path, target)
                .map(|_| ())
                .map_err(|source| io_error("copy", &self.path, source));
        }
        let output = File::create(target).map_err(|source| io_error("create", target, source))?;
        let mut encoder = GzEncoder::new(output, Compression::default());
        let mut input = self.raw_reader()?;
        io::copy(&mut input, &mut encoder)
            .and_then(|_| encoder.finish())
            .and_then(|output| output.sync_all())
            .map_err(|source| io_error("compress", &self.path, source))
    }

    pub fn commit_hint(&self) -> Option<CommitHint> {
        commit_hint_of(&self.file_name)
    }

    fn content_reader(&self) -> CoreResult<Box<dyn Read>> {
        let raw = self.raw_reader()?;
        Ok(if self.is_gzip {
            Box::new(MultiGzDecoder::new(raw))
        } else {
            Box::new(raw)
        })
    }

    fn raw_reader(&self) -> CoreResult<BufReader<File>> {
        File::open(&self.path)
            .map(BufReader::new)
            .map_err(|source| io_error("open", &self.path, source))
    }
}

/// `ccsh analyse --commit` writes `<hash>.<name>.cc.json`; only such a name gives a hint.
pub fn commit_hint_of(file_name: &str) -> Option<CommitHint> {
    let (prefix, _) = file_name.split_once(HINT_SEPARATOR)?;
    CommitHash::try_from(prefix)
        .ok()
        .map(|hash| CommitHint { hash })
}

fn starts_with_gzip_magic(path: &Path) -> CoreResult<bool> {
    let mut start = [0u8; GZIP_MAGIC.len()];
    let mut file = File::open(path).map_err(|source| io_error("open", path, source))?;
    match file.read_exact(&mut start) {
        Ok(()) => Ok(start == GZIP_MAGIC),
        Err(error) if error.kind() == io::ErrorKind::UnexpectedEof => Ok(false),
        Err(source) => Err(io_error("read", path, source)),
    }
}

fn file_name_of(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use std::io::Write;

    use super::*;

    const MAP: &str = r#"{"projectName":"demo","apiVersion":"1.5","nodes":[]}"#;

    fn gzip(content: &str) -> Vec<u8> {
        let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
        encoder.write_all(content.as_bytes()).unwrap();
        encoder.finish().unwrap()
    }

    #[test]
    fn should_hash_the_uncompressed_content_so_a_json_and_its_gzip_are_one_content() {
        // Arrange
        let folder = tempfile::tempdir().unwrap();
        let plain = folder.path().join("map.cc.json");
        let zipped = folder.path().join("map.cc.json.gz");
        fs::write(&plain, MAP).unwrap();
        fs::write(&zipped, gzip(MAP)).unwrap();

        // Act
        let plain_hash = ImportFile::open(&plain).unwrap().content_sha256().unwrap();
        let zipped_hash = ImportFile::open(&zipped).unwrap().content_sha256().unwrap();

        // Assert
        assert_eq!(plain_hash, zipped_hash);
        assert_eq!(plain_hash.len(), 64);
    }

    #[test]
    fn should_detect_a_commit_hint_from_a_ccsh_file_name() {
        // Arrange
        let names = [
            "0123abc.codecharta.cc.json.gz",
            "0123456789abcdef0123456789abcdef01234567.map.cc.json",
        ];

        // Act
        let hints: Vec<String> = names
            .into_iter()
            .filter_map(commit_hint_of)
            .map(|hint| hint.hash.to_string())
            .collect();

        // Assert
        assert_eq!(
            hints,
            vec!["0123abc", "0123456789abcdef0123456789abcdef01234567"]
        );
    }

    #[test]
    fn should_not_take_a_hint_from_a_name_without_a_hex_prefix() {
        // Arrange
        let names = [
            "sample1.cc.json",
            "0123ab.cc.json",
            "0123ABC.cc.json",
            "0123abc",
            "0123abcx.cc.json",
        ];

        // Act
        let hints: Vec<Option<CommitHint>> = names.into_iter().map(commit_hint_of).collect();

        // Assert
        assert!(hints.iter().all(Option::is_none), "{hints:?}");
    }

    #[test]
    fn should_refuse_a_folder_and_a_broken_gzip_file() {
        // Arrange
        let folder = tempfile::tempdir().unwrap();
        let broken = folder.path().join("broken.cc.json.gz");
        fs::write(&broken, [GZIP_MAGIC[0], GZIP_MAGIC[1], 0, 1, 2]).unwrap();

        // Act
        let opened_folder = ImportFile::open(folder.path());
        let broken_hash = ImportFile::open(&broken).unwrap().content_sha256();

        // Assert
        assert!(
            matches!(opened_folder, Err(CoreError::BadRequest(_))),
            "{opened_folder:?}"
        );
        assert!(
            matches!(broken_hash, Err(CoreError::BadRequest(_))),
            "{broken_hash:?}"
        );
    }
}
