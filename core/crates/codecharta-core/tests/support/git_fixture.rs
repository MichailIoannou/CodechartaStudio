use std::ffi::OsString;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};
use std::sync::Mutex;
use std::sync::atomic::{AtomicU32, Ordering};

use codecharta_core::CoreError;
use codecharta_core::git::command::GitInvocation;
use codecharta_core::git::runner::{GIT_TIMEOUT, ProcessFuture, VersionFuture};
use codecharta_core::git::{GitFuture, GitOutput, GitProcess, GitRunner};
use codecharta_core::process::env::hardened_env;
use codecharta_core::process::{OutputChunk, OutputMode, ProcessRunner, RunRequest};
use codecharta_core::tools::version::read_version;
use codecharta_core_api::methods::tools::ToolId;
use tempfile::TempDir;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

use super::system_git;

pub const AUTHOR_NAME: &str = "Ada Author";
pub const AUTHOR_EMAIL: &str = "ada@example.test";
pub const COMMITTER_NAME: &str = "Carl Committer";
pub const COMMITTER_EMAIL: &str = "carl@example.test";
/// The first commit of every fixture is dated here; each further commit one minute later.
pub const FIRST_COMMIT_SECONDS: u64 = 1_700_000_000;
pub const SECONDS_BETWEEN_COMMITS: u64 = 60;
const INITIAL_BRANCH: &str = "main";
const EMPTY_CONFIG_FILE: &str = "empty.gitconfig";
/// Settings every fixture command gets, passed through `GIT_CONFIG_COUNT` so the runner sees them too.
const FIXED_SETTINGS: [(&str, &str); 3] = [
    ("init.defaultBranch", INITIAL_BRANCH),
    ("commit.gpgsign", "false"),
    ("core.autocrlf", "false"),
];
/// Variables of the developer's own shell that would point git elsewhere.
const INHERITED_GIT_VARIABLES: [&str; 3] = ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE"];
const IDENTITY_VARIABLES: [&str; 4] = [
    "GIT_AUTHOR_NAME",
    "GIT_AUTHOR_EMAIL",
    "GIT_COMMITTER_NAME",
    "GIT_COMMITTER_EMAIL",
];

/// A git repository in a temporary folder. git runs with a temporary `HOME`, empty global and system
/// configuration and fixed identities and dates, so commits are reproducible and the user's
/// configuration is never read.
pub struct TempRepo {
    folder: TempDir,
    home: TempDir,
    origin: Option<TempDir>,
    git: PathBuf,
    commits_made: AtomicU32,
}

impl TempRepo {
    pub fn new() -> Self {
        let repo = Self::in_new_folders(0);
        repo.git(&["init", "--quiet", "--initial-branch", INITIAL_BRANCH]);
        repo
    }

    fn in_new_folders(commits_made: u32) -> Self {
        let home = tempfile::tempdir().expect("a temporary home folder");
        fs::write(home.path().join(EMPTY_CONFIG_FILE), "").expect("the empty config is written");
        Self {
            folder: tempfile::tempdir().expect("a temporary repository folder"),
            home,
            origin: None,
            git: system_git(),
            commits_made: AtomicU32::new(commits_made),
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
        clone_into(self, &file_url(self.path()), options)
    }

    /// Adds a bare repository as `origin` and pushes the current branch there with tracking.
    pub fn with_bare_origin(mut self) -> Self {
        let origin = tempfile::tempdir().expect("a temporary origin folder");
        let origin_path = origin.path().to_string_lossy().into_owned();
        self.git(&["init", "--quiet", "--bare", &origin_path]);
        self.git(&["remote", "add", "origin", &origin_path]);
        self.git(&["push", "--quiet", "--set-upstream", "origin", "HEAD"]);
        self.origin = Some(origin);
        self
    }

    /// A second working clone of the bare origin, to move the remote behind this repository's back.
    pub fn clone_of_origin(&self) -> TempRepo {
        let origin = self.origin_path().to_string_lossy().into_owned();
        clone_into(self, &origin, &[])
    }

    pub fn origin_path(&self) -> &Path {
        self.origin
            .as_ref()
            .expect("with_bare_origin was called")
            .path()
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

    /// Writes a file relative to the repository root, creating its folders.
    pub fn write_file(&self, name: &str, content: &str) {
        let file = self.path().join(name);
        if let Some(parent) = file.parent() {
            fs::create_dir_all(parent).expect("the file's folder can be created");
        }
        fs::write(file, content).expect("the file can be written");
    }

    /// Writes and stages `files`, commits them and returns the full commit hash.
    pub fn commit(&self, message: &str, files: &[(&str, &str)]) -> String {
        for (name, content) in files {
            self.write_file(name, content);
            self.git(&["add", "--", name]);
        }
        self.git(&["commit", "--quiet", "--allow-empty", "--message", message]);
        self.count_commit();
        self.git(&["rev-parse", "HEAD"])
    }

    /// Writes `name` with `content`, commits it and returns the full commit hash.
    pub fn commit_file(&self, name: &str, content: &str, message: &str) -> String {
        self.commit(message, &[(name, content)])
    }

    pub fn branch(&self, name: &str) {
        self.git(&["branch", "--quiet", name]);
    }

    pub fn checkout(&self, name: &str) {
        self.git(&["checkout", "--quiet", name]);
    }

    /// Merges `names` into the current branch with a merge commit and returns its hash.
    pub fn merge(&self, names: &[&str], message: &str) -> String {
        let mut args = vec!["merge", "--quiet", "--no-ff", "--message", message];
        args.extend_from_slice(names);
        self.git(&args);
        self.count_commit();
        self.git(&["rev-parse", "HEAD"])
    }

    pub fn tag(&self, name: &str, is_annotated: bool) {
        if is_annotated {
            self.git(&["tag", "--annotate", "--message", name, name]);
            self.count_commit();
        } else {
            self.git(&["tag", name]);
        }
    }

    /// Appends `count` commits to the current branch in one `git fast-import` run and checks them out.
    pub fn linear_history(&self, count: u32) -> String {
        let branch = self.git(&["symbolic-ref", "HEAD"]);
        let parent = self.try_git(&["rev-parse", "--verify", "--quiet", "HEAD"]);
        let stream = self.fast_import_stream(&branch, parent.as_deref(), count);
        self.git_with_input(&["fast-import", "--quiet"], &stream);
        self.git(&["reset", "--quiet", "--hard"]);
        self.git(&["rev-parse", "HEAD"])
    }

    fn fast_import_stream(&self, branch: &str, parent: Option<&str>, count: u32) -> String {
        let mut stream = String::new();
        for number in 0..count {
            let seconds = self.next_commit_seconds();
            self.count_commit();
            stream.push_str(&format!(
                "commit {branch}\nauthor {AUTHOR_NAME} <{AUTHOR_EMAIL}> {seconds} +0000\n\
                 committer {COMMITTER_NAME} <{COMMITTER_EMAIL}> {seconds} +0000\n\
                 data <<END\nCommit {number}\nEND\n"
            ));
            if let (0, Some(parent)) = (number, parent) {
                stream.push_str(&format!("from {parent}\n"));
            }
            stream.push_str(&format!(
                "M 100644 inline history.txt\ndata <<END\n{number}\nEND\n\n"
            ));
        }
        stream
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

    /// An existing folder outside the repository, to stand in for the core's data folder.
    pub fn data_dir(&self) -> &Path {
        self.home.path()
    }

    pub fn git_executable(&self) -> &Path {
        &self.git
    }

    /// The variables every git call in a test must carry; pass them to the runner too.
    pub fn env(&self) -> Vec<(OsString, OsString)> {
        let home = self.home.path().as_os_str().to_owned();
        let empty_config = self.home.path().join(EMPTY_CONFIG_FILE).into_os_string();
        let date = OsString::from(format!("@{} +0000", self.next_commit_seconds()));
        let mut env: Vec<(OsString, OsString)> = [
            ("HOME", home.clone()),
            ("USERPROFILE", home.clone()),
            ("XDG_CONFIG_HOME", home),
            ("GIT_CONFIG_GLOBAL", empty_config.clone()),
            ("GIT_CONFIG_SYSTEM", empty_config),
            ("GIT_CONFIG_NOSYSTEM", "1".into()),
            ("GIT_AUTHOR_NAME", AUTHOR_NAME.into()),
            ("GIT_AUTHOR_EMAIL", AUTHOR_EMAIL.into()),
            ("GIT_AUTHOR_DATE", date.clone()),
            ("GIT_COMMITTER_NAME", COMMITTER_NAME.into()),
            ("GIT_COMMITTER_EMAIL", COMMITTER_EMAIL.into()),
            ("GIT_COMMITTER_DATE", date),
        ]
        .into_iter()
        .map(|(name, value)| (OsString::from(name), value))
        .collect();
        env.extend(fixed_settings_env());
        env
    }

    pub fn git(&self, args: &[&str]) -> String {
        let output = self.command(args).output().expect("git runs");
        successful_stdout(args, &output)
    }

    /// `None` when git exits non-zero.
    pub fn try_git(&self, args: &[&str]) -> Option<String> {
        let output = self.command(args).output().expect("git runs");
        output
            .status
            .success()
            .then(|| successful_stdout(args, &output))
    }

    /// Runs git without any author or committer identity in the environment.
    pub fn git_without_identity(&self, args: &[&str]) -> Output {
        let mut command = self.command(args);
        for name in IDENTITY_VARIABLES {
            command.env_remove(name);
        }
        command.output().expect("git runs")
    }

    fn git_with_input(&self, args: &[&str], input: &str) -> String {
        let mut child = self
            .command(args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .expect("git starts");
        child
            .stdin
            .take()
            .expect("stdin is piped")
            .write_all(input.as_bytes())
            .expect("git reads its input");
        let output = child.wait_with_output().expect("git finishes");
        successful_stdout(args, &output)
    }

    fn command(&self, args: &[&str]) -> Command {
        let mut command = Command::new(&self.git);
        command.args(args).current_dir(self.path()).envs(self.env());
        for name in INHERITED_GIT_VARIABLES {
            command.env_remove(name);
        }
        command
    }

    fn next_commit_seconds(&self) -> u64 {
        FIRST_COMMIT_SECONDS
            + SECONDS_BETWEEN_COMMITS * u64::from(self.commits_made.load(Ordering::SeqCst))
    }

    fn count_commit(&self) {
        self.commits_made.fetch_add(1, Ordering::SeqCst);
    }
}

/// The clone keeps counting commit dates where `source` stopped.
fn clone_into(source: &TempRepo, url: &str, options: &[&str]) -> TempRepo {
    let clone = TempRepo::in_new_folders(source.commits_made.load(Ordering::SeqCst));
    let target = clone.path().to_string_lossy().into_owned();
    let mut args = vec!["clone", "--quiet"];
    args.extend_from_slice(options);
    args.extend([url, target.as_str()]);
    source.git(&args);
    clone
}

fn fixed_settings_env() -> Vec<(OsString, OsString)> {
    let mut env = vec![(
        OsString::from("GIT_CONFIG_COUNT"),
        OsString::from(FIXED_SETTINGS.len().to_string()),
    )];
    for (index, (key, value)) in FIXED_SETTINGS.iter().enumerate() {
        env.push((format!("GIT_CONFIG_KEY_{index}").into(), (*key).into()));
        env.push((format!("GIT_CONFIG_VALUE_{index}").into(), (*value).into()));
    }
    env
}

fn successful_stdout(args: &[&str], output: &Output) -> String {
    assert!(
        output.status.success(),
        "git {args:?} failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    String::from_utf8(output.stdout.clone())
        .expect("git writes UTF-8")
        .trim_end()
        .to_string()
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

impl GitProcess for FixtureGit {
    fn version(&self) -> VersionFuture<'_> {
        Box::pin(async move {
            let request = RunRequest::new(
                ToolId::Git,
                self.program.clone(),
                vec![OsString::from("--version")],
                GIT_TIMEOUT,
            );
            let output = self.runner.run(request, &CancellationToken::new()).await?;
            read_version(ToolId::Git, &output.stdout, &output.stderr)
                .ok_or_else(|| CoreError::Internal("git answered no version".to_string()))
        })
    }

    fn execute<'call>(
        &'call self,
        invocation: GitInvocation,
        cancel: &'call CancellationToken,
    ) -> ProcessFuture<'call> {
        Box::pin(async move {
            let request = self.request_of(invocation, OutputMode::Collect);
            self.runner.run(request, cancel).await
        })
    }

    fn stream<'call>(
        &'call self,
        invocation: GitInvocation,
        chunks: mpsc::Sender<OutputChunk>,
        cancel: &'call CancellationToken,
    ) -> ProcessFuture<'call> {
        Box::pin(async move {
            let request = self.request_of(invocation, OutputMode::Stream(chunks));
            self.runner.run(request, cancel).await
        })
    }
}

impl FixtureGit {
    /// The fixture's variables first, so the core's own ones win where both name a variable.
    fn request_of(&self, invocation: GitInvocation, output: OutputMode) -> RunRequest {
        let mut env = self.env.clone();
        env.extend(invocation.env);
        RunRequest {
            cwd: Some(invocation.cwd),
            env,
            env_remove: invocation.removed_env,
            max_output_bytes: invocation.limits.max_stdout_bytes,
            stdin: invocation.stdin,
            askpass: invocation.askpass,
            output,
            ..RunRequest::new(
                ToolId::Git,
                self.program.clone(),
                invocation.args,
                invocation.limits.timeout,
            )
        }
    }
}

/// The fixture's git, remembering every invocation the core sends through it.
pub struct RecordingGit {
    inner: FixtureGit,
    invocations: Mutex<Vec<GitInvocation>>,
}

impl RecordingGit {
    pub fn new(inner: FixtureGit) -> Self {
        Self {
            inner,
            invocations: Mutex::default(),
        }
    }

    pub fn invocations(&self) -> Vec<GitInvocation> {
        self.invocations.lock().expect("not poisoned").clone()
    }

    /// The invocations with `subcommand` among their arguments.
    pub fn runs_of(&self, subcommand: &str) -> Vec<GitInvocation> {
        self.invocations()
            .into_iter()
            .filter(|invocation| invocation.args.iter().any(|arg| arg == subcommand))
            .collect()
    }

    fn record(&self, invocation: &GitInvocation) {
        self.invocations
            .lock()
            .expect("not poisoned")
            .push(invocation.clone());
    }
}

impl GitProcess for RecordingGit {
    fn version(&self) -> VersionFuture<'_> {
        self.inner.version()
    }

    fn execute<'call>(
        &'call self,
        invocation: GitInvocation,
        cancel: &'call CancellationToken,
    ) -> ProcessFuture<'call> {
        self.record(&invocation);
        self.inner.execute(invocation, cancel)
    }

    fn stream<'call>(
        &'call self,
        invocation: GitInvocation,
        chunks: mpsc::Sender<OutputChunk>,
        cancel: &'call CancellationToken,
    ) -> ProcessFuture<'call> {
        self.record(&invocation);
        self.inner.stream(invocation, chunks, cancel)
    }
}
