use std::ffi::OsString;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use codecharta_core::git::runner::GIT_TIMEOUT;
use codecharta_core::git::{GitFuture, GitOutput, GitRunner};
use codecharta_core::process::env::hardened_env;
use codecharta_core::process::{ProcessRunner, RunRequest};
use codecharta_core_api::methods::tools::ToolId;
use tempfile::TempDir;
use tokio_util::sync::CancellationToken;

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
        let repo = Self::in_new_folders();
        repo.git(&["init", "--quiet", "--initial-branch", INITIAL_BRANCH]);
        repo
    }

    fn in_new_folders() -> Self {
        Self {
            folder: tempfile::tempdir().expect("a temporary repository folder"),
            home: tempfile::tempdir().expect("a temporary home folder"),
            git: system_git(),
        }
    }

    /// A clone of this repository whose `origin` points here.
    pub fn clone_full(&self) -> TempRepo {
        self.clone_with(&[])
    }

    /// A clone of the latest commit only; its root commit is a graft point.
    pub fn clone_shallow(&self) -> TempRepo {
        self.clone_with(&["--depth", "1"])
    }

    fn clone_with(&self, options: &[&str]) -> TempRepo {
        let clone = Self::in_new_folders();
        let source = file_url(self.path());
        let target = clone.path().to_string_lossy().into_owned();
        let mut args = vec!["clone", "--quiet"];
        args.extend_from_slice(options);
        args.extend([source.as_str(), target.as_str()]);
        self.git(&args);
        clone
    }

    pub fn add_remote(&self, name: &str, url: &str) {
        self.git(&["remote", "add", name, url]);
    }

    /// Creates a folder inside the repository and returns its path.
    pub fn subfolder(&self, name: &str) -> PathBuf {
        let folder = self.path().join(name);
        fs::create_dir_all(&folder).expect("the subfolder can be created");
        folder
    }

    /// Runs git the way the core does, with this repository's hermetic variables.
    pub fn runner(&self) -> FixtureGit {
        FixtureGit {
            runner: ProcessRunner::new(hardened_env(std::env::vars_os(), &[])),
            program: self.git.clone(),
            env: self.env(),
        }
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

/// `--depth` needs a `file://` url; with a plain path git clones everything.
fn file_url(path: &Path) -> String {
    let forward = path.to_string_lossy().replace('\\', "/");
    if forward.starts_with('/') {
        format!("file://{forward}")
    } else {
        format!("file:///{forward}")
    }
}

/// The git runner of the integration tests: the system git, started by the core's own process runner.
pub struct FixtureGit {
    runner: ProcessRunner,
    program: PathBuf,
    env: Vec<(OsString, OsString)>,
}

impl GitRunner for FixtureGit {
    fn run<'call>(&'call self, cwd: &'call Path, args: &'call [&'call str]) -> GitFuture<'call> {
        Box::pin(async move {
            let args = args.iter().map(OsString::from).collect();
            let request = RunRequest {
                cwd: Some(cwd.to_path_buf()),
                env: self.env.clone(),
                ..RunRequest::new(ToolId::Git, self.program.clone(), args, GIT_TIMEOUT)
            };
            let output = self.runner.run(request, &CancellationToken::new()).await?;
            Ok(GitOutput {
                exit_code: output.exit_code,
                stdout: output.stdout,
            })
        })
    }
}
