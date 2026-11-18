use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::time::Duration;

use crate::process::env::{ASKPASS_ENDPOINT_VARIABLE, ASKPASS_TOKEN_VARIABLE, EnvVars};

const KIBIBYTE: u64 = 1024;
const MEBIBYTE: u64 = 1024 * KIBIBYTE;

/// Every git call: no pager, literal paths, plain UTF-8 output whatever the user configured.
pub const GLOBAL_ARGS: [&str; 10] = [
    "--no-pager",
    "--literal-pathspecs",
    "-c",
    "core.quotepath=off",
    "-c",
    "color.ui=false",
    "-c",
    "log.showSignature=false",
    "-c",
    "i18n.logOutputEncoding=UTF-8",
];

/// Reads take no optional locks and never start a program the repository configured (G8).
pub const READ_ARGS: [&str; 3] = ["--no-optional-locks", "-c", "core.fsmonitor=false"];

const BASE_ENV: [(&str, &str); 4] = [
    ("GIT_TERMINAL_PROMPT", "0"),
    ("GIT_PAGER", "cat"),
    ("PAGER", "cat"),
    ("GCM_INTERACTIVE", "never"),
];

/// Reads parse English output in a fixed locale.
const READ_ENV: [(&str, &str); 3] = [("GIT_OPTIONAL_LOCKS", "0"), ("LC_ALL", "C"), ("LANG", "C")];

/// Mutations run hooks and gpg in the user's locale; only git's own messages are English.
const MUTATING_ENV: [(&str, &str); 5] = [
    ("LC_MESSAGES", "C"),
    ("LANGUAGE", ""),
    ("GIT_EDITOR", "true"),
    ("GIT_SEQUENCE_EDITOR", "true"),
    ("GIT_MERGE_AUTOEDIT", "no"),
];

const REMOVED_ENV: [&str; 5] = [
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_INDEX_FILE",
    ASKPASS_ENDPOINT_VARIABLE,
    ASKPASS_TOKEN_VARIABLE,
];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Limits {
    pub timeout: Duration,
    pub max_stdout_bytes: u64,
}

pub const REPOSITORY_LIMITS: Limits = Limits {
    timeout: Duration::from_secs(10),
    max_stdout_bytes: 64 * KIBIBYTE,
};

pub const STATUS_LIMITS: Limits = Limits {
    timeout: Duration::from_secs(30),
    max_stdout_bytes: 16 * MEBIBYTE,
};

pub const REFS_LIMITS: Limits = Limits {
    timeout: Duration::from_secs(30),
    max_stdout_bytes: 32 * MEBIBYTE,
};

pub const QUERY_LIMITS: Limits = Limits {
    timeout: Duration::from_secs(30),
    max_stdout_bytes: 64 * KIBIBYTE,
};

pub const LOG_LIMITS: Limits = Limits {
    timeout: Duration::from_secs(60),
    max_stdout_bytes: 8 * MEBIBYTE,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CommandKind {
    Read,
    Mutating,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GitCommand {
    pub folder: PathBuf,
    pub kind: CommandKind,
    pub args: Vec<OsString>,
    pub limits: Limits,
    /// Revisions and paths git reads with `--stdin`.
    pub stdin: Option<String>,
}

impl GitCommand {
    pub fn read(folder: &Path, args: &[&str], limits: Limits) -> Self {
        Self {
            folder: folder.to_path_buf(),
            kind: CommandKind::Read,
            args: args.iter().map(OsString::from).collect(),
            limits,
            stdin: None,
        }
    }

    pub fn with_stdin(self, stdin: String) -> Self {
        Self {
            stdin: Some(stdin),
            ..self
        }
    }
}

/// A git command as the process runner gets it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GitInvocation {
    pub args: Vec<OsString>,
    pub cwd: PathBuf,
    pub env: EnvVars,
    pub removed_env: Vec<OsString>,
    pub limits: Limits,
    pub stdin: Option<String>,
}

/// The repository goes in through `-C`; git itself starts in the core's data folder.
pub fn invocation_of(command: &GitCommand, data_dir: &Path) -> GitInvocation {
    let mut args: Vec<OsString> = GLOBAL_ARGS.iter().map(OsString::from).collect();
    if command.kind == CommandKind::Read {
        args.extend(READ_ARGS.iter().map(OsString::from));
    }
    args.push("-C".into());
    args.push(command.folder.clone().into_os_string());
    args.extend(command.args.iter().cloned());
    GitInvocation {
        args,
        cwd: data_dir.to_path_buf(),
        env: env_of(command.kind),
        removed_env: REMOVED_ENV.iter().map(OsString::from).collect(),
        limits: command.limits,
        stdin: command.stdin.clone(),
    }
}

fn env_of(kind: CommandKind) -> EnvVars {
    let kind_env: &[(&str, &str)] = match kind {
        CommandKind::Read => &READ_ENV,
        CommandKind::Mutating => &MUTATING_ENV,
    };
    BASE_ENV
        .iter()
        .chain(kind_env)
        .map(|(name, value)| (OsString::from(name), OsString::from(value)))
        .collect()
}
