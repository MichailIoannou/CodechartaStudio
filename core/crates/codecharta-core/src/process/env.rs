use std::ffi::{OsStr, OsString};
use std::path::PathBuf;

use codecharta_core_api::secret::Secret;

pub type EnvVars = Vec<(OsString, OsString)>;

/// Variables that would point git at another repository or change how Node-based tools start.
const REMOVED_VARIABLES: [&str; 5] = [
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_INDEX_FILE",
    "ELECTRON_RUN_AS_NODE",
    "NODE_OPTIONS",
];

/// Nothing a child starts may wait for terminal input, page its output or colour it.
const FIXED_VARIABLES: [(&str, &str); 9] = [
    ("GIT_TERMINAL_PROMPT", "0"),
    ("GCM_INTERACTIVE", "never"),
    ("GIT_OPTIONAL_LOCKS", "0"),
    ("GIT_PAGER", "cat"),
    ("PAGER", "cat"),
    ("NO_COLOR", "1"),
    ("TERM", "dumb"),
    ("GH_PROMPT_DISABLED", "1"),
    ("GH_NO_UPDATE_NOTIFIER", "1"),
];

const PATH_VARIABLE: &str = "PATH";
pub const ASKPASS_ENDPOINT_VARIABLE: &str = "CODECHARTA_ASKPASS_ENDPOINT";
pub const ASKPASS_TOKEN_VARIABLE: &str = "CODECHARTA_ASKPASS_TOKEN";
const GIT_ASKPASS_VARIABLE: &str = "GIT_ASKPASS";
const SSH_ASKPASS_VARIABLE: &str = "SSH_ASKPASS";
const SSH_ASKPASS_REQUIRE_VARIABLE: &str = "SSH_ASKPASS_REQUIRE";
const SSH_ASKPASS_REQUIRE_FORCE: &str = "force";

/// How a child reaches the core's credential prompt. Without an `ssh_helper` ssh cannot ask through the
/// core, so an `SSH_ASKPASS` the user configured is left out rather than half-used.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AskpassSetup {
    pub git_helper: PathBuf,
    pub ssh_helper: Option<PathBuf>,
    pub endpoint: String,
    pub token: Secret,
}

pub fn hardened_env(
    parent: impl Iterator<Item = (OsString, OsString)>,
    extra_search_folders: &[PathBuf],
) -> EnvVars {
    let mut env: EnvVars = parent
        .filter(|(name, _)| {
            !REMOVED_VARIABLES
                .iter()
                .any(|removed| is_same_name(name, removed.as_ref()))
        })
        .collect();
    for (name, value) in FIXED_VARIABLES {
        set_variable(&mut env, name.into(), value.into());
    }
    extend_path(&mut env, extra_search_folders);
    env
}

pub fn askpass_env(setup: &AskpassSetup) -> EnvVars {
    let mut env: EnvVars = vec![(
        GIT_ASKPASS_VARIABLE.into(),
        setup.git_helper.clone().into_os_string(),
    )];
    if let Some(ssh_helper) = &setup.ssh_helper {
        env.push((
            SSH_ASKPASS_VARIABLE.into(),
            ssh_helper.clone().into_os_string(),
        ));
        env.push((
            SSH_ASKPASS_REQUIRE_VARIABLE.into(),
            SSH_ASKPASS_REQUIRE_FORCE.into(),
        ));
    }
    env.push((
        ASKPASS_ENDPOINT_VARIABLE.into(),
        setup.endpoint.clone().into(),
    ));
    env.push((ASKPASS_TOKEN_VARIABLE.into(), setup.token.expose().into()));
    env
}

/// `removed` names leave the base first; the askpass variables come last so that nothing a caller passes
/// can replace the helper.
pub fn child_env(
    base: &EnvVars,
    removed: &[OsString],
    overrides: &EnvVars,
    askpass: Option<&AskpassSetup>,
) -> EnvVars {
    let mut env = base.clone();
    env.retain(|(name, _)| !removed.iter().any(|gone| is_same_name(name, gone)));
    for (name, value) in overrides {
        set_variable(&mut env, name.clone(), value.clone());
    }
    let Some(setup) = askpass else {
        return env;
    };
    if setup.ssh_helper.is_none() {
        env.retain(|(name, _)| {
            ![SSH_ASKPASS_VARIABLE, SSH_ASKPASS_REQUIRE_VARIABLE]
                .iter()
                .any(|ssh_name| is_same_name(name, ssh_name.as_ref()))
        });
    }
    for (name, value) in askpass_env(setup) {
        set_variable(&mut env, name, value);
    }
    env
}

pub fn variable<'env>(env: &'env EnvVars, name: &str) -> Option<&'env OsStr> {
    env.iter()
        .find(|(existing, _)| is_same_name(existing, name.as_ref()))
        .map(|(_, value)| value.as_os_str())
}

fn set_variable(env: &mut EnvVars, name: OsString, value: OsString) {
    env.retain(|(existing, _)| !is_same_name(existing, &name));
    env.push((name, value));
}

fn extend_path(env: &mut EnvVars, extra_search_folders: &[PathBuf]) {
    let Some(position) = env
        .iter()
        .position(|(name, _)| is_same_name(name, PATH_VARIABLE.as_ref()))
    else {
        if let Ok(path) = std::env::join_paths(extra_search_folders) {
            env.push((PATH_VARIABLE.into(), path));
        }
        return;
    };
    let mut folders: Vec<PathBuf> = std::env::split_paths(&env[position].1).collect();
    for folder in extra_search_folders {
        if !folders.contains(folder) {
            folders.push(folder.clone());
        }
    }
    if let Ok(path) = std::env::join_paths(folders) {
        env[position].1 = path;
    }
}

#[cfg(windows)]
fn is_same_name(name: &OsStr, other: &OsStr) -> bool {
    name.to_string_lossy()
        .eq_ignore_ascii_case(&other.to_string_lossy())
}

#[cfg(not(windows))]
fn is_same_name(name: &OsStr, other: &OsStr) -> bool {
    name == other
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parent(variables: &[(&str, &str)]) -> impl Iterator<Item = (OsString, OsString)> {
        variables
            .iter()
            .map(|(name, value)| (OsString::from(name), OsString::from(value)))
            .collect::<Vec<_>>()
            .into_iter()
    }

    const TOKEN: &str = "0123456789abcdef0123456789abcdef";

    fn askpass_setup() -> AskpassSetup {
        let helper = std::env::temp_dir().join("codecharta-core");
        AskpassSetup {
            git_helper: helper.clone(),
            ssh_helper: Some(helper),
            endpoint: "endpoint-1".to_string(),
            token: Secret::new(TOKEN.to_string()),
        }
    }

    fn value_of(env: &EnvVars, name: &str) -> Option<String> {
        variable(env, name).map(|value| value.to_string_lossy().into_owned())
    }

    #[test]
    fn should_disable_git_prompts() {
        // Arrange
        let parent = parent(&[("GIT_TERMINAL_PROMPT", "1"), ("HOME", "/home/user")]);

        // Act
        let env = hardened_env(parent, &[]);

        // Assert
        assert_eq!(value_of(&env, "GIT_TERMINAL_PROMPT").as_deref(), Some("0"));
        assert_eq!(value_of(&env, "GCM_INTERACTIVE").as_deref(), Some("never"));
        assert_eq!(value_of(&env, "GH_PROMPT_DISABLED").as_deref(), Some("1"));
        assert_eq!(value_of(&env, "HOME").as_deref(), Some("/home/user"));
    }

    #[test]
    fn should_drop_git_dir_and_node_options() {
        // Arrange
        let parent = parent(&[
            ("GIT_DIR", "/elsewhere/.git"),
            ("GIT_WORK_TREE", "/elsewhere"),
            ("GIT_INDEX_FILE", "/elsewhere/index"),
            ("NODE_OPTIONS", "--inspect"),
            ("ELECTRON_RUN_AS_NODE", "1"),
        ]);

        // Act
        let env = hardened_env(parent, &[]);

        // Assert
        let dropped: Vec<&str> = REMOVED_VARIABLES
            .into_iter()
            .filter(|name| variable(&env, name).is_none())
            .collect();
        assert_eq!(dropped, REMOVED_VARIABLES.to_vec());
    }

    #[test]
    fn should_append_search_folders_to_path() {
        // Arrange
        let first = std::env::temp_dir().join("first");
        let extra = std::env::temp_dir().join("extra");
        let path = std::env::join_paths([&first]).unwrap();
        let parent = vec![(OsString::from(PATH_VARIABLE), path)].into_iter();

        // Act
        let env = hardened_env(parent, &[extra.clone(), first.clone()]);

        // Assert
        let expected = std::env::join_paths([first, extra]).unwrap();
        assert_eq!(variable(&env, PATH_VARIABLE), Some(expected.as_os_str()));
    }

    #[test]
    fn should_add_askpass_variables_last() {
        // Arrange
        let base = hardened_env(parent(&[("SSH_ASKPASS", "/usr/bin/other")]), &[]);
        let overrides = vec![(OsString::from("GIT_ASKPASS"), OsString::from("/tmp/evil"))];

        // Act
        let env = child_env(&base, &[], &overrides, Some(&askpass_setup()));

        // Assert
        let last_names: Vec<String> = env[env.len() - 5..]
            .iter()
            .map(|(name, _)| name.to_string_lossy().into_owned())
            .collect();
        assert_eq!(
            last_names,
            [
                "GIT_ASKPASS",
                "SSH_ASKPASS",
                "SSH_ASKPASS_REQUIRE",
                ASKPASS_ENDPOINT_VARIABLE,
                ASKPASS_TOKEN_VARIABLE
            ]
        );
        let helper = askpass_setup().git_helper.to_string_lossy().into_owned();
        assert_eq!(value_of(&env, "GIT_ASKPASS"), Some(helper.clone()));
        assert_eq!(value_of(&env, "SSH_ASKPASS"), Some(helper));
        assert_eq!(
            value_of(&env, ASKPASS_TOKEN_VARIABLE).as_deref(),
            Some(TOKEN)
        );
    }

    #[test]
    fn should_leave_the_users_ssh_askpass_out_without_an_ssh_helper() {
        // Arrange
        let base = hardened_env(
            parent(&[
                ("SSH_ASKPASS", "/usr/bin/ksshaskpass"),
                ("SSH_ASKPASS_REQUIRE", "prefer"),
            ]),
            &[],
        );
        let setup = AskpassSetup {
            ssh_helper: None,
            ..askpass_setup()
        };

        // Act
        let env = child_env(&base, &[], &Vec::new(), Some(&setup));

        // Assert
        assert_eq!(value_of(&env, "SSH_ASKPASS"), None);
        assert_eq!(value_of(&env, "SSH_ASKPASS_REQUIRE"), None);
        assert!(value_of(&env, "GIT_ASKPASS").is_some());
    }

    #[test]
    fn should_print_the_token_of_a_setup_as_stars() {
        // Arrange
        let setup = askpass_setup();

        // Act
        let printed = format!("{setup:?}");

        // Assert
        assert!(!printed.contains(TOKEN), "{printed}");
        assert!(printed.contains("***"));
    }

    #[test]
    fn should_remove_listed_variables_before_adding_askpass_ones() {
        // Arrange
        let base = hardened_env(
            parent(&[
                (ASKPASS_ENDPOINT_VARIABLE, "inherited"),
                ("LC_ALL", "de_DE"),
            ]),
            &[],
        );
        let removed = [
            OsString::from(ASKPASS_ENDPOINT_VARIABLE),
            OsString::from("LC_ALL"),
        ];

        // Act
        let without_askpass = child_env(&base, &removed, &Vec::new(), None);
        let with_askpass = child_env(&base, &removed, &Vec::new(), Some(&askpass_setup()));

        // Assert
        assert_eq!(value_of(&without_askpass, ASKPASS_ENDPOINT_VARIABLE), None);
        assert_eq!(value_of(&without_askpass, "LC_ALL"), None);
        assert_eq!(
            value_of(&with_askpass, ASKPASS_ENDPOINT_VARIABLE).as_deref(),
            Some("endpoint-1")
        );
    }

    #[test]
    fn should_keep_terminal_prompt_off_with_askpass() {
        // Arrange
        let base = hardened_env(parent(&[]), &[]);

        // Act
        let env = child_env(&base, &[], &Vec::new(), Some(&askpass_setup()));

        // Assert
        assert_eq!(value_of(&env, "GIT_TERMINAL_PROMPT").as_deref(), Some("0"));
        assert_eq!(
            value_of(&env, "SSH_ASKPASS_REQUIRE").as_deref(),
            Some("force")
        );
    }
}
