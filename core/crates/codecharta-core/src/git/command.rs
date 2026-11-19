use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::time::Duration;

use crate::process::AskpassSetup;
use crate::process::env::{ASKPASS_ENDPOINT_VARIABLE, ASKPASS_TOKEN_VARIABLE, EnvVars};
use crate::process::runner::MAX_OUTPUT_CEILING_BYTES;

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

/// `LC_ALL` outranks `LC_MESSAGES`, so a mutation drops it and hands its value to these categories
/// instead: hooks keep the user's locale, git's own messages stay English.
const LOCALE_ALL_VARIABLE: &str = "LC_ALL";
const LOCALE_CATEGORIES: [&str; 5] = [
    "LC_CTYPE",
    "LC_COLLATE",
    "LC_NUMERIC",
    "LC_TIME",
    "LC_MONETARY",
];

/// The credential manager may show its own window during a network command unless the user said no.
const GCM_INTERACTIVE_VARIABLE: &str = "GCM_INTERACTIVE";
/// OpenSSH before 8.4 asks through `SSH_ASKPASS` only when a display is set.
const DISPLAY_VARIABLE: &str = "DISPLAY";
const FALLBACK_DISPLAY: &str = ":0";

/// The values of the user's own environment that git commands adjust; the process runner's base
/// environment has already replaced some of them.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct UserEnvironment {
    pub locale_all: Option<OsString>,
    pub gcm_interactive: Option<OsString>,
    pub display: Option<OsString>,
}

impl UserEnvironment {
    /// An empty value counts as unset.
    pub fn read(lookup: &dyn Fn(&str) -> Option<OsString>) -> Self {
        let non_empty = |name: &str| lookup(name).filter(|value| !value.is_empty());
        Self {
            locale_all: non_empty(LOCALE_ALL_VARIABLE),
            gcm_interactive: non_empty(GCM_INTERACTIVE_VARIABLE),
            display: non_empty(DISPLAY_VARIABLE),
        }
    }
}

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

pub const DETAILS_LIMITS: Limits = Limits {
    timeout: Duration::from_secs(30),
    max_stdout_bytes: 8 * MEBIBYTE,
};

/// A streamed rev-list may walk a whole history; its output is read as it comes, so the cap is only the
/// process runner's ceiling.
pub const REV_LIST_LIMITS: Limits = Limits {
    timeout: Duration::from_secs(300),
    max_stdout_bytes: MAX_OUTPUT_CEILING_BYTES,
};

/// Branch commands run hooks such as `post-checkout`.
pub const BRANCH_LIMITS: Limits = Limits {
    timeout: Duration::from_secs(120),
    max_stdout_bytes: MEBIBYTE,
};

/// Staging runs filters such as LFS on the files it adds.
pub const WORKING_TREE_LIMITS: Limits = Limits {
    timeout: Duration::from_secs(60),
    max_stdout_bytes: MEBIBYTE,
};

/// A longer diff fails with `OUTPUT_TOO_LARGE`; a shorter one is cut to `MAX_DIFF_TEXT_BYTES`.
pub const DIFF_LIMITS: Limits = Limits {
    timeout: Duration::from_secs(30),
    max_stdout_bytes: 4 * MEBIBYTE,
};

/// A person may be answering a credential prompt meanwhile.
pub const NETWORK_LIMITS: Limits = Limits {
    timeout: Duration::from_secs(1800),
    max_stdout_bytes: MEBIBYTE,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CommandKind {
    Read,
    Mutating,
    /// A mutation that may talk to a remote, and so may need to ask for credentials.
    Network,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GitCommand {
    pub folder: PathBuf,
    pub kind: CommandKind,
    pub args: Vec<OsString>,
    pub limits: Limits,
    /// Revisions and paths git reads with `--stdin`.
    pub stdin: Option<String>,
    /// Only a network command passes it on; without it nothing can prompt.
    pub askpass: Option<AskpassSetup>,
}

impl GitCommand {
    pub fn read(folder: &Path, args: &[&str], limits: Limits) -> Self {
        Self {
            folder: folder.to_path_buf(),
            kind: CommandKind::Read,
            args: args.iter().map(OsString::from).collect(),
            limits,
            stdin: None,
            askpass: None,
        }
    }

    pub fn mutating(folder: &Path, args: &[&str], limits: Limits) -> Self {
        Self {
            kind: CommandKind::Mutating,
            ..Self::read(folder, args, limits)
        }
    }

    pub fn network(
        folder: &Path,
        args: &[&str],
        limits: Limits,
        askpass: Option<AskpassSetup>,
    ) -> Self {
        Self {
            kind: CommandKind::Network,
            askpass,
            ..Self::read(folder, args, limits)
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
    pub askpass: Option<AskpassSetup>,
}

/// The repository goes in through `-C`; git itself starts in the core's data folder.
pub fn invocation_of(
    command: &GitCommand,
    data_dir: &Path,
    user: &UserEnvironment,
) -> GitInvocation {
    let mut args: Vec<OsString> = GLOBAL_ARGS.iter().map(OsString::from).collect();
    if command.kind == CommandKind::Read {
        args.extend(READ_ARGS.iter().map(OsString::from));
    }
    args.push("-C".into());
    args.push(command.folder.clone().into_os_string());
    args.extend(command.args.iter().cloned());
    let environment = environment_of(command.kind, user);
    GitInvocation {
        args,
        cwd: data_dir.to_path_buf(),
        env: environment.set,
        removed_env: environment.removed,
        limits: command.limits,
        stdin: command.stdin.clone(),
        askpass: command
            .askpass
            .clone()
            .filter(|_| command.kind == CommandKind::Network),
    }
}

struct CommandEnvironment {
    set: EnvVars,
    removed: Vec<OsString>,
}

impl CommandEnvironment {
    fn of(variables: &[(&str, &str)]) -> Self {
        Self {
            set: variables
                .iter()
                .map(|(name, value)| (OsString::from(name), OsString::from(value)))
                .collect(),
            removed: REMOVED_ENV.iter().map(OsString::from).collect(),
        }
    }

    fn set(&mut self, name: &str, value: OsString) {
        self.set.retain(|(existing, _)| existing != name);
        self.set.push((name.into(), value));
    }

    fn remove(&mut self, name: &str) {
        self.set.retain(|(existing, _)| existing != name);
        self.removed.push(name.into());
    }
}

fn environment_of(kind: CommandKind, user: &UserEnvironment) -> CommandEnvironment {
    let kind_env: &[(&str, &str)] = match kind {
        CommandKind::Read => &READ_ENV,
        CommandKind::Mutating | CommandKind::Network => &MUTATING_ENV,
    };
    let variables: Vec<(&str, &str)> = BASE_ENV.iter().chain(kind_env).copied().collect();
    let mut environment = CommandEnvironment::of(&variables);
    if kind != CommandKind::Read {
        keep_user_locale_without_messages(&mut environment, user);
    }
    if kind == CommandKind::Network {
        allow_prompts_of_the_user_tools(&mut environment, user);
    }
    environment
}

fn keep_user_locale_without_messages(environment: &mut CommandEnvironment, user: &UserEnvironment) {
    environment.remove(LOCALE_ALL_VARIABLE);
    if let Some(locale) = &user.locale_all {
        for category in LOCALE_CATEGORIES {
            environment.set(category, locale.clone());
        }
    }
}

fn allow_prompts_of_the_user_tools(environment: &mut CommandEnvironment, user: &UserEnvironment) {
    match &user.gcm_interactive {
        Some(choice) => environment.set(GCM_INTERACTIVE_VARIABLE, choice.clone()),
        None => environment.remove(GCM_INTERACTIVE_VARIABLE),
    }
    if user.display.is_none() {
        environment.set(DISPLAY_VARIABLE, FALLBACK_DISPLAY.into());
    }
}

#[cfg(test)]
mod tests {
    use codecharta_core_api::secret::Secret;

    use super::*;

    const TOKEN: &str = "fedcba9876543210fedcba9876543210";

    fn askpass_setup() -> AskpassSetup {
        let helper = std::env::temp_dir().join("codecharta-core");
        AskpassSetup {
            git_helper: helper.clone(),
            ssh_helper: Some(helper),
            endpoint: "endpoint".to_string(),
            token: Secret::new(TOKEN.to_string()),
        }
    }

    fn command_of(kind: CommandKind) -> GitCommand {
        GitCommand {
            kind,
            ..GitCommand::network(
                &std::env::temp_dir(),
                &["fetch"],
                QUERY_LIMITS,
                Some(askpass_setup()),
            )
        }
    }

    fn invocation(kind: CommandKind, user: &UserEnvironment) -> GitInvocation {
        invocation_of(&command_of(kind), &std::env::temp_dir(), user)
    }

    fn value_of(invocation: &GitInvocation, name: &str) -> Option<String> {
        invocation
            .env
            .iter()
            .find(|(existing, _)| existing == name)
            .map(|(_, value)| value.to_string_lossy().into_owned())
    }

    fn is_removed(invocation: &GitInvocation, name: &str) -> bool {
        invocation.removed_env.iter().any(|removed| removed == name)
    }

    #[test]
    fn should_set_askpass_variables_only_for_network_commands() {
        // Arrange
        let user = UserEnvironment::default();

        // Act
        let read = invocation(CommandKind::Read, &user);
        let mutating = invocation(CommandKind::Mutating, &user);
        let network = invocation(CommandKind::Network, &user);

        // Assert
        assert_eq!(read.askpass, None);
        assert_eq!(mutating.askpass, None);
        assert_eq!(network.askpass, Some(askpass_setup()));
        for removed_everywhere in [ASKPASS_ENDPOINT_VARIABLE, ASKPASS_TOKEN_VARIABLE] {
            assert!(is_removed(&read, removed_everywhere));
            assert!(is_removed(&network, removed_everywhere));
        }
        assert_eq!(value_of(&network, "LC_MESSAGES").as_deref(), Some("C"));
    }

    #[test]
    fn should_remove_gcm_interactive_unless_user_set() {
        // Arrange
        let unset = UserEnvironment::default();
        let chosen = UserEnvironment {
            gcm_interactive: Some("always".into()),
            ..UserEnvironment::default()
        };

        // Act
        let without_choice = invocation(CommandKind::Network, &unset);
        let with_choice = invocation(CommandKind::Network, &chosen);
        let read = invocation(CommandKind::Read, &chosen);

        // Assert
        assert_eq!(value_of(&without_choice, GCM_INTERACTIVE_VARIABLE), None);
        assert!(is_removed(&without_choice, GCM_INTERACTIVE_VARIABLE));
        assert_eq!(
            value_of(&with_choice, GCM_INTERACTIVE_VARIABLE).as_deref(),
            Some("always")
        );
        assert!(!is_removed(&with_choice, GCM_INTERACTIVE_VARIABLE));
        assert_eq!(
            value_of(&read, GCM_INTERACTIVE_VARIABLE).as_deref(),
            Some("never")
        );
    }

    #[test]
    fn should_set_display_only_when_unset() {
        // Arrange
        let without_display = UserEnvironment::default();
        let with_display = UserEnvironment {
            display: Some(":1".into()),
            ..UserEnvironment::default()
        };

        // Act
        let fallback = invocation(CommandKind::Network, &without_display);
        let kept = invocation(CommandKind::Network, &with_display);
        let mutating = invocation(CommandKind::Mutating, &without_display);

        // Assert
        assert_eq!(
            value_of(&fallback, DISPLAY_VARIABLE).as_deref(),
            Some(FALLBACK_DISPLAY)
        );
        assert_eq!(value_of(&kept, DISPLAY_VARIABLE), None);
        assert_eq!(value_of(&mutating, DISPLAY_VARIABLE), None);
    }

    #[test]
    fn should_drop_lc_all_but_keep_its_locale_for_hooks() {
        // Arrange
        let user = UserEnvironment {
            locale_all: Some("de_DE.UTF-8".into()),
            ..UserEnvironment::default()
        };

        // Act
        let mutating = invocation(CommandKind::Mutating, &user);
        let read = invocation(CommandKind::Read, &user);

        // Assert
        assert!(is_removed(&mutating, LOCALE_ALL_VARIABLE));
        assert_eq!(value_of(&mutating, "LC_MESSAGES").as_deref(), Some("C"));
        for category in LOCALE_CATEGORIES {
            assert_eq!(
                value_of(&mutating, category).as_deref(),
                Some("de_DE.UTF-8")
            );
        }
        assert_eq!(value_of(&read, LOCALE_ALL_VARIABLE).as_deref(), Some("C"));
    }

    #[test]
    fn should_read_empty_user_values_as_unset() {
        // Arrange
        let lookup = |name: &str| match name {
            "LC_ALL" => Some(OsString::new()),
            "DISPLAY" => Some(OsString::from(":1")),
            _ => None,
        };

        // Act
        let user = UserEnvironment::read(&lookup);

        // Assert
        assert_eq!(
            user,
            UserEnvironment {
                locale_all: None,
                gcm_interactive: None,
                display: Some(":1".into()),
            }
        );
    }

    #[test]
    fn should_never_print_the_token_of_an_invocation() {
        // Arrange
        let network = invocation(CommandKind::Network, &UserEnvironment::default());

        // Act
        let printed = format!("{network:?}");

        // Assert
        assert!(!printed.contains(TOKEN), "{printed}");
    }
}
