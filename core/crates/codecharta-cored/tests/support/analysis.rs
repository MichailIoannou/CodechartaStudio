use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::OnceLock;

use serde_json::{Value, json};
use tempfile::TempDir;

use super::CORE_EXECUTABLE;

pub const SCENARIO_VARIABLE: &str = "FAKE_CCSH_SCENARIO";
const SETTINGS_FILE: &str = "core-settings.json";
const SCENARIO_FILE: &str = "fake-ccsh-scenario.json";

/// fake-ccsh is a binary of `codecharta-core`, so cargo names it only to that package's tests; it lies
/// beside the core binary once the workspace's tests were built, and is built here otherwise.
pub fn fake_ccsh() -> PathBuf {
    static LOCATED: OnceLock<PathBuf> = OnceLock::new();
    LOCATED
        .get_or_init(|| {
            let file_name = format!("fake-ccsh{}", std::env::consts::EXE_SUFFIX);
            let fake = Path::new(CORE_EXECUTABLE).with_file_name(file_name);
            if !fake.is_file() {
                build_fake_ccsh();
            }
            assert!(fake.is_file(), "fake-ccsh is not at {}", fake.display());
            fake
        })
        .clone()
}

fn build_fake_ccsh() {
    let status = Command::new(env!("CARGO"))
        .args([
            "build",
            "--quiet",
            "-p",
            "codecharta-core",
            "--bin",
            "fake-ccsh",
        ])
        .current_dir(env!("CARGO_MANIFEST_DIR"))
        .status()
        .expect("cargo runs");
    assert!(status.success(), "fake-ccsh could not be built");
}

/// fake-ccsh answers like ccsh 2.4.0 and like a JDK 25, so the tools check accepts it as both.
pub fn use_fake_tools(data_dir: &Path) {
    let fake = fake_ccsh();
    let settings = json!({
        "schemaVersion": 1,
        "toolPaths": { "ccsh": fake, "java": fake }
    });
    fs::create_dir_all(data_dir).expect("the data folder is created");
    fs::write(data_dir.join(SETTINGS_FILE), settings.to_string()).expect("settings written");
}

pub fn write_scenario(folder: &Path, scenario: &Value) -> PathBuf {
    let file = folder.join(SCENARIO_FILE);
    fs::write(&file, scenario.to_string()).expect("the scenario is written");
    file
}

/// A git repository with one commit whose git reads no user or system configuration.
pub struct TestRepository {
    pub folder: TempDir,
    pub home: TempDir,
    pub head: String,
}

impl TestRepository {
    pub fn with_commit() -> Self {
        let folder = tempfile::tempdir().expect("a repository folder");
        let home = tempfile::tempdir().expect("a home folder");
        let mut repository = Self {
            folder,
            home,
            head: String::new(),
        };
        repository.git(&["init", "--quiet"]);
        fs::write(repository.path().join("a.txt"), "a").expect("a file is written");
        repository.git(&["add", "a.txt"]);
        repository.git(&["commit", "--quiet", "-m", "Add a"]);
        repository.head = repository.git(&["rev-parse", "HEAD"]).trim().to_string();
        repository
    }

    pub fn path(&self) -> &Path {
        self.folder.path()
    }

    /// The environment a process that runs git for this repository needs.
    pub fn isolate(&self, command: &mut Command) {
        command
            .env("HOME", self.home.path())
            .env("XDG_CONFIG_HOME", self.home.path())
            .env("GIT_CONFIG_NOSYSTEM", "1");
    }

    fn git(&self, args: &[&str]) -> String {
        let mut command = Command::new("git");
        self.isolate(&mut command);
        let output = command
            .args(args)
            .current_dir(self.path())
            .env("GIT_AUTHOR_NAME", "Test")
            .env("GIT_AUTHOR_EMAIL", "test@example.com")
            .env("GIT_COMMITTER_NAME", "Test")
            .env("GIT_COMMITTER_EMAIL", "test@example.com")
            .output()
            .expect("git runs");
        assert!(
            output.status.success(),
            "git {args:?} failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        String::from_utf8(output.stdout).expect("git writes UTF-8")
    }
}
