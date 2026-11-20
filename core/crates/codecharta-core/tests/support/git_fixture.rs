use std::ffi::OsString;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use tempfile::TempDir;

use super::system_git;

const AUTHOR_NAME: &str = "Ada Tester";
const AUTHOR_EMAIL: &str = "ada@example.invalid";
const FIXED_DATE: &str = "2026-01-02T03:04:05+00:00";
const INITIAL_BRANCH: &str = "main";
/// Variables of the developer's own shell that would point git elsewhere.
const INHERITED_GIT_VARIABLES: [&str; 3] = ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE"];

/// A git repository in a temporary folder. git runs with a temporary `HOME`, no system config and fixed
/// author/committer names and dates, so commits are reproducible and the user's config is never read.
pub struct TempRepo {
    folder: TempDir,
    home: TempDir,
    git: PathBuf,
}

impl TempRepo {
    pub fn new() -> Self {
        let repo = Self {
            folder: tempfile::tempdir().expect("a temporary repository folder"),
            home: tempfile::tempdir().expect("a temporary home folder"),
            git: system_git(),
        };
        repo.git(&["init", "--quiet", "--initial-branch", INITIAL_BRANCH]);
        repo
    }

    pub fn path(&self) -> &Path {
        self.folder.path()
    }

    pub fn git_executable(&self) -> &Path {
        &self.git
    }

    /// The variables every git call in a test must carry; pass them to the runner too.
    pub fn env(&self) -> Vec<(OsString, OsString)> {
        let home = self.home.path().as_os_str().to_owned();
        [
            ("HOME", home.clone()),
            ("XDG_CONFIG_HOME", home),
            ("GIT_CONFIG_NOSYSTEM", "1".into()),
            ("GIT_AUTHOR_NAME", AUTHOR_NAME.into()),
            ("GIT_AUTHOR_EMAIL", AUTHOR_EMAIL.into()),
            ("GIT_AUTHOR_DATE", FIXED_DATE.into()),
            ("GIT_COMMITTER_NAME", AUTHOR_NAME.into()),
            ("GIT_COMMITTER_EMAIL", AUTHOR_EMAIL.into()),
            ("GIT_COMMITTER_DATE", FIXED_DATE.into()),
        ]
        .into_iter()
        .map(|(name, value)| (OsString::from(name), value))
        .collect()
    }

    pub fn git(&self, args: &[&str]) -> String {
        let mut command = Command::new(&self.git);
        command.args(args).current_dir(self.path()).envs(self.env());
        INHERITED_GIT_VARIABLES.iter().for_each(|name| {
            command.env_remove(name);
        });
        let output = command.output().expect("git runs");
        assert!(
            output.status.success(),
            "git {args:?} failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        String::from_utf8(output.stdout)
            .expect("git writes UTF-8")
            .trim_end()
            .to_string()
    }

    /// Writes `name` with `content`, commits it and returns the full commit hash.
    pub fn commit_file(&self, name: &str, content: &str, message: &str) -> String {
        fs::write(self.path().join(name), content).expect("the file can be written");
        self.git(&["add", "--", name]);
        self.git(&["commit", "--quiet", "--message", message]);
        self.git(&["rev-parse", "HEAD"])
    }
}
