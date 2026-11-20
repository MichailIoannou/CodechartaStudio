use std::path::{Path, PathBuf};

use codecharta_core_api::methods::tools::{ToolId, ToolSource};

use crate::config::paths::EnvLookup;
use crate::tools::definitions::ToolDefinition;

const QUOTE: char = '"';
const PATH_VARIABLE: &str = "PATH";
const JAVA_HOME_VARIABLE: &str = "JAVA_HOME";
const BIN_FOLDER: &str = "bin";

/// Where tools are looked for, in order. No `where`/`which` child process is started.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct SearchLocations {
    pub java_home_bin: Option<PathBuf>,
    pub path_folders: Vec<PathBuf>,
    pub well_known_folders: Vec<PathBuf>,
}

impl SearchLocations {
    pub fn from_environment(env: EnvLookup) -> Self {
        Self {
            java_home_bin: env(JAVA_HOME_VARIABLE)
                .map(|java_home| unquote(&java_home))
                .filter(|java_home| java_home.is_absolute())
                .map(|java_home| java_home.join(BIN_FOLDER)),
            path_folders: path_folders(env),
            well_known_folders: well_known_folders(env, &home_dir(env)),
        }
    }

    /// Only these folders, as if they were the whole `PATH`.
    pub fn only(folders: Vec<PathBuf>) -> Self {
        Self {
            path_folders: folders,
            ..Self::default()
        }
    }

    pub fn find(&self, definition: &ToolDefinition) -> Option<(PathBuf, ToolSource)> {
        let is_file = |candidate: &Path| candidate.is_file();
        let java_home: Vec<PathBuf> = self.java_home_bin.iter().cloned().collect();
        let groups = [
            (
                java_home.as_slice(),
                ToolSource::JavaHome,
                definition.id == ToolId::Java,
            ),
            (self.path_folders.as_slice(), ToolSource::Path, true),
            (
                self.well_known_folders.as_slice(),
                ToolSource::WellKnownFolder,
                true,
            ),
        ];
        groups
            .into_iter()
            .filter(|(_, _, applies)| *applies)
            .find_map(|(folders, source, _)| {
                find_executable(definition.names(), folders, &is_file).map(|path| (path, source))
            })
    }
}

pub fn search_folders(env: EnvLookup, home: &Path) -> Vec<PathBuf> {
    let mut folders = path_folders(env);
    folders.extend(well_known_folders(env, home));
    folders
}

pub fn find_executable(
    names: &[&str],
    folders: &[PathBuf],
    is_file: &dyn Fn(&Path) -> bool,
) -> Option<PathBuf> {
    folders.iter().find_map(|folder| {
        names
            .iter()
            .map(|name| folder.join(name))
            .find(|candidate| is_file(candidate))
    })
}

/// Absolute entries only: a relative `PATH` entry would depend on the core's working folder.
fn path_folders(env: EnvLookup) -> Vec<PathBuf> {
    env(PATH_VARIABLE)
        .map(|path| {
            std::env::split_paths(&path)
                .map(|folder| unquote(folder.as_os_str()))
                .filter(|folder| folder.is_absolute())
                .collect()
        })
        .unwrap_or_default()
}

fn unquote(value: &std::ffi::OsStr) -> PathBuf {
    let text = value.to_string_lossy();
    let trimmed = text.trim().trim_matches(QUOTE);
    if trimmed.len() == text.len() {
        PathBuf::from(value)
    } else {
        PathBuf::from(trimmed)
    }
}

/// A GUI-started app (macOS especially) gets a minimal `PATH`; these are where the tools usually live.
#[cfg(windows)]
pub fn well_known_folders(env: EnvLookup, _home: &Path) -> Vec<PathBuf> {
    let under = |variable: &str, parts: &[&str]| {
        env(variable)
            .map(PathBuf::from)
            .filter(|base| base.is_absolute())
            .map(|base| parts.iter().fold(base, |folder, part| folder.join(part)))
    };
    [
        under("ProgramFiles", &["Git", "cmd"]),
        under("LocalAppData", &["Programs", "Git", "cmd"]),
        under("AppData", &["npm"]),
    ]
    .into_iter()
    .flatten()
    .collect()
}

#[cfg(not(windows))]
pub fn well_known_folders(_env: EnvLookup, home: &Path) -> Vec<PathBuf> {
    let mut folders = vec![
        PathBuf::from("/opt/homebrew/bin"),
        PathBuf::from("/usr/local/bin"),
    ];
    if home.is_absolute() {
        folders.push(home.join(".local").join(BIN_FOLDER));
    }
    folders
}

#[cfg(windows)]
fn home_dir(env: EnvLookup) -> PathBuf {
    env("USERPROFILE").map(PathBuf::from).unwrap_or_default()
}

#[cfg(not(windows))]
fn home_dir(env: EnvLookup) -> PathBuf {
    env("HOME").map(PathBuf::from).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;
    use std::ffi::OsString;

    use super::*;

    fn folder(name: &str) -> PathBuf {
        std::env::temp_dir().join(name)
    }

    fn with_path(path: OsString) -> impl Fn(&str) -> Option<OsString> {
        move |name| (name == PATH_VARIABLE).then(|| path.clone())
    }

    #[test]
    fn should_prefer_the_first_path_folder() {
        // Arrange
        let folders = [folder("first"), folder("second")];
        let existing: HashSet<PathBuf> = folders.iter().map(|folder| folder.join("git")).collect();

        // Act
        let found = find_executable(&["git"], &folders, &|candidate| {
            existing.contains(candidate)
        });

        // Assert
        assert_eq!(found, Some(folder("first").join("git")));
    }

    #[test]
    fn should_skip_relative_path_entries() {
        // Arrange
        let path =
            std::env::join_paths([PathBuf::from("relative/bin"), folder("absolute")]).unwrap();
        let env = with_path(path);

        // Act
        let folders = path_folders(&env);

        // Assert
        assert_eq!(folders, vec![folder("absolute")]);
    }

    #[test]
    fn should_strip_quotes_around_path_entries() {
        // Arrange
        let quoted = format!("\"{}\"", folder("quoted").display());
        let env = with_path(OsString::from(quoted));

        // Act
        let folders = path_folders(&env);

        // Assert
        assert_eq!(folders, vec![folder("quoted")]);
    }

    #[test]
    fn should_try_each_windows_name() {
        // Arrange
        let folders = [folder("tools")];
        let existing = folder("tools").join("ccsh.bat");

        // Act
        let found = find_executable(&["ccsh.cmd", "ccsh.bat"], &folders, &|candidate| {
            candidate == existing
        });

        // Assert
        assert_eq!(found, Some(existing));
    }

    #[test]
    fn should_fall_back_to_well_known_folders() {
        // Arrange
        let home = folder("home");
        let env = with_path(std::env::join_paths([folder("on-path")]).unwrap());

        // Act
        let folders = search_folders(&env, &home);

        // Assert
        assert_eq!(folders.first(), Some(&folder("on-path")));
        assert_eq!(folders[1..], well_known_folders(&env, &home)[..]);
        if cfg!(not(windows)) {
            assert_eq!(folders.last(), Some(&home.join(".local").join("bin")));
        }
    }
}
