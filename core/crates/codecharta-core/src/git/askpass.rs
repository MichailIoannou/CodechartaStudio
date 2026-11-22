use std::path::{Path, PathBuf};

const SPACE: char = ' ';
const COPIED_HELPER_FOLDER: &str = "askpass";
const COPIED_HELPER_NAME: &str = "codecharta-core.exe";

/// The executables git and ssh run to ask for credentials: both are the core binary itself. `ssh` is
/// `None` when no path without a space exists, because Git for Windows' ssh cannot start a helper from
/// a path with a space; HTTPS prompts still work then.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AskpassHelpers {
    pub git: PathBuf,
    pub ssh: Option<PathBuf>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HelperPlatform {
    Windows,
    Other,
}

impl HelperPlatform {
    pub fn current() -> Self {
        if cfg!(windows) {
            HelperPlatform::Windows
        } else {
            HelperPlatform::Other
        }
    }
}

/// The file system as the helper lookup needs it, so the Windows rules can be tested anywhere.
pub trait HelperFiles {
    /// The 8.3 short form of an existing path, where the volume keeps short names.
    fn short_path(&self, path: &Path) -> Option<PathBuf>;

    /// Copies `from` to `to` unless `to` already has the same size and modification time.
    fn copy_when_changed(&self, from: &Path, to: &Path) -> std::io::Result<()>;
}

pub struct HelperLocation<'call> {
    pub executable: &'call Path,
    pub data_dir: &'call Path,
    pub platform: HelperPlatform,
}

pub fn askpass_helpers(location: &HelperLocation<'_>, files: &dyn HelperFiles) -> AskpassHelpers {
    AskpassHelpers {
        git: location.executable.to_path_buf(),
        ssh: space_free_helper(location, files),
    }
}

fn space_free_helper(location: &HelperLocation<'_>, files: &dyn HelperFiles) -> Option<PathBuf> {
    if location.platform == HelperPlatform::Other || !has_space(location.executable) {
        return Some(location.executable.to_path_buf());
    }
    if let Some(short) = files
        .short_path(location.executable)
        .filter(|short| !has_space(short))
    {
        return Some(short);
    }
    copied_helper(location, files)
}

fn copied_helper(location: &HelperLocation<'_>, files: &dyn HelperFiles) -> Option<PathBuf> {
    let copy = location
        .data_dir
        .join(COPIED_HELPER_FOLDER)
        .join(COPIED_HELPER_NAME);
    if has_space(&copy) {
        return None;
    }
    files
        .copy_when_changed(location.executable, &copy)
        .inspect_err(|error| tracing::warn!("could not copy the askpass helper: {error}"))
        .ok()
        .map(|()| copy)
}

fn has_space(path: &Path) -> bool {
    path.to_string_lossy().contains(SPACE)
}

pub struct SystemHelperFiles;

impl HelperFiles for SystemHelperFiles {
    fn short_path(&self, path: &Path) -> Option<PathBuf> {
        short_path_of(path)
    }

    fn copy_when_changed(&self, from: &Path, to: &Path) -> std::io::Result<()> {
        let source = std::fs::metadata(from)?;
        let is_current = std::fs::metadata(to).is_ok_and(|copy| {
            copy.len() == source.len() && copy.modified().ok() == source.modified().ok()
        });
        if is_current {
            return Ok(());
        }
        if let Some(folder) = to.parent() {
            std::fs::create_dir_all(folder)?;
        }
        std::fs::copy(from, to)?;
        let copy = std::fs::File::options().write(true).open(to)?;
        copy.set_modified(source.modified()?)
    }
}

#[cfg(not(windows))]
fn short_path_of(_path: &Path) -> Option<PathBuf> {
    None
}

/// The one unsafe call of the core (plan 04, section 6): Windows offers short names only through this
/// Win32 function.
#[cfg(windows)]
#[allow(unsafe_code)]
fn short_path_of(path: &Path) -> Option<PathBuf> {
    use std::os::windows::ffi::{OsStrExt, OsStringExt};
    use windows_sys::Win32::Storage::FileSystem::GetShortPathNameW;

    const MAX_WIDE_PATH: usize = 32_768;
    let wide: Vec<u16> = path.as_os_str().encode_wide().chain([0]).collect();
    let mut buffer = vec![0u16; MAX_WIDE_PATH];
    let capacity = u32::try_from(buffer.len()).ok()?;
    // SAFETY: `wide` is NUL-terminated and outlives the call; `buffer` holds `capacity` u16 values.
    let written = unsafe { GetShortPathNameW(wide.as_ptr(), buffer.as_mut_ptr(), capacity) };
    let length = usize::try_from(written).ok()?;
    if length == 0 || length >= buffer.len() {
        return None;
    }
    buffer.truncate(length);
    Some(PathBuf::from(std::ffi::OsString::from_wide(&buffer)))
}

#[cfg(test)]
mod tests {
    use std::cell::RefCell;

    use super::*;

    #[derive(Default)]
    struct FakeFiles {
        short: Option<PathBuf>,
        copies: RefCell<Vec<PathBuf>>,
    }

    impl HelperFiles for FakeFiles {
        fn short_path(&self, _path: &Path) -> Option<PathBuf> {
            self.short.clone()
        }

        fn copy_when_changed(&self, _from: &Path, to: &Path) -> std::io::Result<()> {
            self.copies.borrow_mut().push(to.to_path_buf());
            Ok(())
        }
    }

    fn helpers_on_windows(executable: &str, data_dir: &str, files: &FakeFiles) -> AskpassHelpers {
        let location = HelperLocation {
            executable: Path::new(executable),
            data_dir: Path::new(data_dir),
            platform: HelperPlatform::Windows,
        };
        askpass_helpers(&location, files)
    }

    #[test]
    fn should_use_the_executable_when_its_path_has_no_space() {
        // Arrange
        let files = FakeFiles::default();

        // Act
        let helpers = helpers_on_windows("C:/App/codecharta-core.exe", "C:/Data", &files);

        // Assert
        assert_eq!(
            helpers.ssh.as_deref(),
            Some(Path::new("C:/App/codecharta-core.exe"))
        );
        assert!(files.copies.borrow().is_empty());
    }

    #[test]
    fn should_use_short_path_or_copy_when_exe_path_has_space() {
        // Arrange
        let with_short_names = FakeFiles {
            short: Some(PathBuf::from("C:/PROGRA~1/CODECH~1/CODECH~1.EXE")),
            ..FakeFiles::default()
        };
        let without_short_names = FakeFiles::default();
        let executable = "C:/Program Files/CodeCharta/codecharta-core.exe";

        // Act
        let short = helpers_on_windows(executable, "C:/Data", &with_short_names);
        let copied = helpers_on_windows(executable, "C:/Data", &without_short_names);

        // Assert
        assert_eq!(
            short.ssh.as_deref(),
            Some(Path::new("C:/PROGRA~1/CODECH~1/CODECH~1.EXE"))
        );
        let copy = Path::new("C:/Data")
            .join("askpass")
            .join("codecharta-core.exe");
        assert_eq!(copied.ssh.as_deref(), Some(copy.as_path()));
        assert_eq!(*without_short_names.copies.borrow(), vec![copy]);
        assert_eq!(copied.git, Path::new(executable));
    }

    #[test]
    fn should_leave_ssh_askpass_unset_without_space_free_path() {
        // Arrange
        let files = FakeFiles {
            short: Some(PathBuf::from("C:/Users/Ada Lovelace/app.exe")),
            ..FakeFiles::default()
        };

        // Act
        let helpers = helpers_on_windows(
            "C:/Users/Ada Lovelace/App/codecharta-core.exe",
            "C:/Users/Ada Lovelace/AppData",
            &files,
        );

        // Assert
        assert_eq!(helpers.ssh, None);
        assert!(files.copies.borrow().is_empty());
    }

    #[test]
    fn should_keep_a_path_with_a_space_elsewhere() {
        // Arrange
        let files = FakeFiles::default();
        let location = HelperLocation {
            executable: Path::new("/opt/Code Charta/codecharta-core"),
            data_dir: Path::new("/home/ada/.config"),
            platform: HelperPlatform::Other,
        };

        // Act
        let helpers = askpass_helpers(&location, &files);

        // Assert
        assert_eq!(
            helpers.ssh.as_deref(),
            Some(Path::new("/opt/Code Charta/codecharta-core"))
        );
    }

    #[test]
    fn should_copy_only_when_the_executable_changed() {
        // Arrange
        let folder = tempfile::tempdir().unwrap();
        let executable = folder.path().join("core");
        std::fs::write(&executable, b"first").unwrap();
        let copy = folder.path().join("askpass").join("copy");
        SystemHelperFiles
            .copy_when_changed(&executable, &copy)
            .unwrap();
        std::fs::write(&copy, b"edits").unwrap();
        let source_time = std::fs::metadata(&executable).unwrap().modified().unwrap();
        std::fs::File::options()
            .write(true)
            .open(&copy)
            .unwrap()
            .set_modified(source_time)
            .unwrap();
        SystemHelperFiles
            .copy_when_changed(&executable, &copy)
            .unwrap();
        let unchanged_copy = std::fs::read(&copy).unwrap();
        std::fs::write(&executable, b"second!").unwrap();

        // Act
        SystemHelperFiles
            .copy_when_changed(&executable, &copy)
            .unwrap();

        // Assert
        assert_eq!(unchanged_copy, b"edits");
        assert_eq!(std::fs::read(&copy).unwrap(), b"second!");
    }
}
