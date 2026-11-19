use std::collections::BTreeMap;
use std::ffi::OsString;
use std::path::{Path, PathBuf};

use codecharta_core_api::methods::analysis::{AnalysisErrorCode, JobError};
use codecharta_core_api::methods::tools::{ToolId, ToolState, ToolStatus, ToolsReport};

use super::output::{OPEN_TOOLS_HINT, classify_start_failure};
use crate::process::launch::{check_batch_args, is_batch_file};

pub const CCSH_LAUNCHER_CLASS: &str = "de.maibornwolff.codecharta.ccsh.launcher.CcshLauncher";
const NATIVE_ACCESS_OPTION: &str = "--enable-native-access=ALL-UNNAMED";
const STDOUT_ENCODING_OPTION: &str = "-Dstdout.encoding=UTF-8";
const STDERR_ENCODING_OPTION: &str = "-Dstderr.encoding=UTF-8";
const TEMP_DIR_OPTION: &str = "-Djava.io.tmpdir=";
const CLASSPATH_OPTION: &str = "-classpath";
const LIB_FOLDER: &str = "lib";
const BIN_FOLDER: &str = "bin";
const ALL_JARS: &str = "*";
const CCSH_JAR_PREFIX: &str = "ccsh";
const JAR_EXTENSION: &str = "jar";
const CMD_EXTENSION: &str = "cmd";
const BAT_EXTENSION: &str = "bat";
const BATCH_TARGET_SUFFIX: &str = "ccsh.bat";
const SCRIPT_FOLDER_VARIABLES: [&str; 2] = ["%dp0%", "%~dp0"];
const QUOTE: char = '"';
const SHIM_PATH_SEPARATORS: [char; 2] = ['\\', '/'];
const CURRENT_FOLDER: &str = ".";
const PARENT_FOLDER: &str = "..";
const CCSH_OPTS_VARIABLE: &str = "CCSH_OPTS";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LaunchMode {
    /// java with ccsh's own class path: no shell, no script, the core's JVM options.
    JavaDirect,
    Executable,
    /// A Windows batch file whose installation could not be resolved; cmd.exe parses the arguments.
    CmdShim,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CcshLaunch {
    pub command: PathBuf,
    pub prefix_args: Vec<OsString>,
    pub env: BTreeMap<String, String>,
    pub mode: LaunchMode,
}

impl CcshLaunch {
    /// Which tool a start failure is about: java when the core starts java itself.
    pub fn tool(&self) -> ToolId {
        match self.mode {
            LaunchMode::JavaDirect => ToolId::Java,
            LaunchMode::Executable | LaunchMode::CmdShim => ToolId::Ccsh,
        }
    }

    /// cmd.exe expands `%` and breaks on `"` however the arguments are quoted; refusing first names the fix.
    pub fn check_arguments(&self, argv: &[OsString]) -> Result<(), JobError> {
        if self.mode != LaunchMode::CmdShim {
            return Ok(());
        }
        check_batch_args(argv).map_err(|error| classify_start_failure(&error))
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LaunchOverride {
    Executable(PathBuf),
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct LaunchOptions {
    /// Where the JVM puts ccsh's temporary worktree and parser files; only java-direct can move it.
    pub worktree_temp_dir: Option<PathBuf>,
    pub launch_override: Option<LaunchOverride>,
}

/// Explicit, so the Windows resolution is unit-tested on every platform.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TargetOs {
    Windows,
    Unix,
}

impl TargetOs {
    pub fn current() -> Self {
        if cfg!(windows) {
            TargetOs::Windows
        } else {
            TargetOs::Unix
        }
    }
}

pub fn resolve_ccsh_launch(
    tools: &ToolsReport,
    os: TargetOs,
    options: &LaunchOptions,
) -> Result<CcshLaunch, JobError> {
    if let Some(LaunchOverride::Executable(path)) = &options.launch_override {
        return Ok(executable(path.clone(), LaunchMode::Executable));
    }
    let ccsh = usable_path(tools, ToolId::Ccsh)?;
    match app_home(&ccsh, os) {
        Some(home) => java_direct(tools, &home, options),
        None if os == TargetOs::Windows && is_batch_file(&ccsh) => {
            Ok(executable(ccsh, LaunchMode::CmdShim))
        }
        None => Ok(executable(ccsh, LaunchMode::Executable)),
    }
}

fn executable(command: PathBuf, mode: LaunchMode) -> CcshLaunch {
    let encoding = [STDOUT_ENCODING_OPTION, STDERR_ENCODING_OPTION].join(" ");
    CcshLaunch {
        command,
        prefix_args: Vec::new(),
        env: BTreeMap::from([(CCSH_OPTS_VARIABLE.to_string(), encoding)]),
        mode,
    }
}

fn java_direct(
    tools: &ToolsReport,
    home: &Path,
    options: &LaunchOptions,
) -> Result<CcshLaunch, JobError> {
    let mut prefix_args: Vec<OsString> = vec![
        NATIVE_ACCESS_OPTION.into(),
        STDOUT_ENCODING_OPTION.into(),
        STDERR_ENCODING_OPTION.into(),
    ];
    if let Some(temp_dir) = &options.worktree_temp_dir {
        let mut option = OsString::from(TEMP_DIR_OPTION);
        option.push(temp_dir);
        prefix_args.push(option);
    }
    prefix_args.push(CLASSPATH_OPTION.into());
    prefix_args.push(home.join(LIB_FOLDER).join(ALL_JARS).into());
    prefix_args.push(CCSH_LAUNCHER_CLASS.into());
    Ok(CcshLaunch {
        command: usable_path(tools, ToolId::Java)?,
        prefix_args,
        env: BTreeMap::new(),
        mode: LaunchMode::JavaDirect,
    })
}

/// The installation folder holding `bin/` and `lib/ccsh-*.jar`, as Gradle's `installDist` lays it out.
fn app_home(ccsh: &Path, os: TargetOs) -> Option<PathBuf> {
    let start_script = match os {
        TargetOs::Windows => windows_start_script(ccsh)?,
        TargetOs::Unix => ccsh.canonicalize().ok()?,
    };
    let bin = start_script.parent()?;
    let is_bin = bin
        .file_name()
        .is_some_and(|name| name.eq_ignore_ascii_case(BIN_FOLDER));
    let home = bin.parent()?;
    (is_bin && has_ccsh_jar(&home.join(LIB_FOLDER))).then(|| home.to_path_buf())
}

fn windows_start_script(ccsh: &Path) -> Option<PathBuf> {
    if has_extension(ccsh, BAT_EXTENSION) {
        return Some(ccsh.to_path_buf());
    }
    if !has_extension(ccsh, CMD_EXTENSION) {
        return None;
    }
    let shim = std::fs::read(ccsh).ok()?;
    let target = String::from_utf8_lossy(&shim)
        .split(QUOTE)
        .find(|quoted| quoted.to_ascii_lowercase().ends_with(BATCH_TARGET_SUFFIX))?
        .to_string();
    resolve_shim_target(&target, ccsh.parent()?)
}

fn resolve_shim_target(target: &str, script_folder: &Path) -> Option<PathBuf> {
    let relative = SCRIPT_FOLDER_VARIABLES.iter().find_map(|variable| {
        let prefix = target.get(..variable.len())?;
        prefix
            .eq_ignore_ascii_case(variable)
            .then(|| &target[variable.len()..])
    });
    let Some(relative) = relative else {
        let absolute = PathBuf::from(target);
        return absolute.is_absolute().then_some(absolute);
    };
    let mut resolved = script_folder.to_path_buf();
    for part in relative.split(SHIM_PATH_SEPARATORS) {
        match part {
            "" | CURRENT_FOLDER => {}
            PARENT_FOLDER => {
                resolved.pop();
            }
            name => resolved.push(name),
        }
    }
    Some(resolved)
}

fn has_extension(path: &Path, extension: &str) -> bool {
    path.extension()
        .is_some_and(|found| found.eq_ignore_ascii_case(extension))
}

fn has_ccsh_jar(lib: &Path) -> bool {
    let Ok(entries) = std::fs::read_dir(lib) else {
        return false;
    };
    entries.flatten().any(|entry| {
        let path = entry.path();
        let is_ccsh = path
            .file_name()
            .is_some_and(|name| name.to_string_lossy().starts_with(CCSH_JAR_PREFIX));
        is_ccsh && has_extension(&path, JAR_EXTENSION) && path.is_file()
    })
}

fn usable_path(tools: &ToolsReport, tool: ToolId) -> Result<PathBuf, JobError> {
    let status = tools.tools.iter().find(|status| status.tool == tool);
    match status {
        Some(ToolStatus {
            state: ToolState::Ok,
            path: Some(path),
            ..
        }) => Ok(PathBuf::from(path)),
        Some(status) => Err(unusable(status)),
        None => Err(not_found(tool, None)),
    }
}

fn unusable(status: &ToolStatus) -> JobError {
    let too_old = match status.tool {
        ToolId::Java => AnalysisErrorCode::JavaTooOld,
        _ => AnalysisErrorCode::CcshTooOld,
    };
    match status.state {
        ToolState::TooOld => JobError::new(too_old, status.problem.clone().unwrap_or_default())
            .with_hint(OPEN_TOOLS_HINT),
        _ => not_found(status.tool, status.problem.as_deref()),
    }
}

fn not_found(tool: ToolId, problem: Option<&str>) -> JobError {
    let code = match tool {
        ToolId::Java => AnalysisErrorCode::JavaNotFound,
        _ => AnalysisErrorCode::CcshNotFound,
    };
    let message = problem.map_or_else(|| format!("{tool} was not found."), str::to_string);
    JobError::new(code, message).with_hint(OPEN_TOOLS_HINT)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::analysis::output::SHIM_REFUSED_HINT;
    use std::fs;

    const GLOBAL_SHIM: &str = "@ECHO off\r\nGOTO start\r\n:find_dp0\r\nSET dp0=%~dp0\r\nEXIT /b\r\n:start\r\nSETLOCAL\r\nCALL :find_dp0\r\n\r\n\"%dp0%\\node_modules\\codecharta-analysis\\public\\bin\\ccsh.bat\" %*\r\n";
    const LOCAL_SHIM: &str = "@ECHO off\r\nGOTO start\r\n:find_dp0\r\nSET dp0=%~dp0\r\nEXIT /b\r\n:start\r\nSETLOCAL\r\nCALL :find_dp0\r\n\r\n\"%dp0%\\..\\codecharta-analysis\\public\\bin\\ccsh.bat\" %*\r\n";

    struct Install {
        _root: tempfile::TempDir,
        root: PathBuf,
        java: PathBuf,
    }

    impl Install {
        fn new() -> Self {
            let root_dir = tempfile::tempdir().unwrap();
            let root = root_dir.path().join("with space & 100%");
            let java = touch(&root.join("jdk").join("bin").join("java.exe"));
            Self {
                _root: root_dir,
                root,
                java,
            }
        }

        /// `public/bin/ccsh.bat` and, with a jar, `public/lib/ccsh-2.4.0.jar`, as the npm package ships them.
        fn package(&self, package: &Path, with_jar: bool) -> PathBuf {
            let bat = touch(&package.join("bin").join("ccsh.bat"));
            fs::create_dir_all(package.join("lib")).unwrap();
            if with_jar {
                touch(&package.join("lib").join("ccsh-2.4.0.jar"));
            }
            bat
        }

        fn report(&self, ccsh: &Path) -> ToolsReport {
            report(&[
                (ToolId::Ccsh, ccsh, ToolState::Ok),
                (ToolId::Java, &self.java, ToolState::Ok),
            ])
        }
    }

    fn touch(file: &Path) -> PathBuf {
        fs::create_dir_all(file.parent().unwrap()).unwrap();
        fs::write(file, "").unwrap();
        file.to_path_buf()
    }

    fn status(tool: ToolId, path: &Path, state: ToolState) -> ToolStatus {
        ToolStatus {
            tool,
            is_required: true,
            state,
            path: Some(path.to_string_lossy().into_owned()),
            source: None,
            version: Some("2.4.0".to_string()),
            minimum_version: None,
            problem: (state != ToolState::Ok)
                .then(|| "Version 21 is older than the minimum 22.".to_string()),
        }
    }

    fn report(tools: &[(ToolId, &Path, ToolState)]) -> ToolsReport {
        ToolsReport {
            checked_at: "2026-11-19T00:00:00Z".to_string(),
            tools: tools
                .iter()
                .map(|(tool, path, state)| status(*tool, path, *state))
                .collect(),
            can_use_git: true,
            can_analyse: true,
        }
    }

    fn options_with_temp_dir(temp_dir: &Path) -> LaunchOptions {
        LaunchOptions {
            worktree_temp_dir: Some(temp_dir.to_path_buf()),
            launch_override: None,
        }
    }

    fn java_direct_args(home: &Path, temp_dir: &Path) -> Vec<OsString> {
        let mut temp_option = OsString::from("-Djava.io.tmpdir=");
        temp_option.push(temp_dir);
        vec![
            "--enable-native-access=ALL-UNNAMED".into(),
            "-Dstdout.encoding=UTF-8".into(),
            "-Dstderr.encoding=UTF-8".into(),
            temp_option,
            "-classpath".into(),
            home.join("lib").join("*").into(),
            "de.maibornwolff.codecharta.ccsh.launcher.CcshLauncher".into(),
        ]
    }

    #[test]
    fn should_resolve_java_direct_from_a_global_ccsh_cmd() {
        // Arrange
        let install = Install::new();
        let prefix = install.root.join("npm");
        let home = prefix
            .join("node_modules")
            .join("codecharta-analysis")
            .join("public");
        install.package(&home, true);
        let shim = prefix.join("ccsh.cmd");
        fs::write(&shim, GLOBAL_SHIM).unwrap();
        let temp_dir = install.root.join("job temp");

        // Act
        let launch = resolve_ccsh_launch(
            &install.report(&shim),
            TargetOs::Windows,
            &options_with_temp_dir(&temp_dir),
        )
        .unwrap();

        // Assert
        assert_eq!(launch.mode, LaunchMode::JavaDirect);
        assert_eq!(launch.command, install.java);
        assert_eq!(launch.prefix_args, java_direct_args(&home, &temp_dir));
        assert!(launch.env.is_empty());
        assert_eq!(launch.tool(), ToolId::Java);
    }

    #[test]
    fn should_resolve_java_direct_from_a_local_ccsh_cmd() {
        // Arrange
        let install = Install::new();
        let node_modules = install.root.join("project").join("node_modules");
        let home = node_modules.join("codecharta-analysis").join("public");
        install.package(&home, true);
        let shim = node_modules.join(".bin").join("ccsh.cmd");
        fs::create_dir_all(shim.parent().unwrap()).unwrap();
        fs::write(&shim, LOCAL_SHIM).unwrap();

        // Act
        let launch = resolve_ccsh_launch(
            &install.report(&shim),
            TargetOs::Windows,
            &LaunchOptions::default(),
        )
        .unwrap();

        // Assert
        assert_eq!(launch.mode, LaunchMode::JavaDirect);
        assert!(
            launch
                .prefix_args
                .contains(&home.join("lib").join("*").into())
        );
        assert!(
            !launch
                .prefix_args
                .iter()
                .any(|argument| argument.to_string_lossy().starts_with("-Djava.io.tmpdir"))
        );
    }

    #[test]
    fn should_resolve_java_direct_from_a_ccsh_bat() {
        // Arrange
        let install = Install::new();
        let home = install.root.join("codecharta-analysis");
        let bat = install.package(&home, true);
        let temp_dir = install.root.join("tmp");

        // Act
        let launch = resolve_ccsh_launch(
            &install.report(&bat),
            TargetOs::Windows,
            &options_with_temp_dir(&temp_dir),
        )
        .unwrap();

        // Assert
        assert_eq!(launch.mode, LaunchMode::JavaDirect);
        assert_eq!(launch.prefix_args, java_direct_args(&home, &temp_dir));
    }

    #[test]
    fn should_start_the_java_the_tools_check_resolved() {
        // Arrange
        let install = Install::new();
        let home = install.root.join("codecharta-analysis");
        let bat = install.package(&home, true);
        let java_home_java = touch(&install.root.join("java home").join("bin").join("java.exe"));
        let tools = report(&[
            (ToolId::Ccsh, &bat, ToolState::Ok),
            (ToolId::Java, &java_home_java, ToolState::Ok),
        ]);

        // Act
        let launch =
            resolve_ccsh_launch(&tools, TargetOs::Windows, &LaunchOptions::default()).unwrap();

        // Assert
        assert_eq!(launch.command, java_home_java);
    }

    #[test]
    fn should_refuse_java_that_is_too_old_or_missing() {
        // Arrange
        let install = Install::new();
        let bat = install.package(&install.root.join("codecharta-analysis"), true);
        let too_old = report(&[
            (ToolId::Ccsh, &bat, ToolState::Ok),
            (ToolId::Java, &install.java, ToolState::TooOld),
        ]);
        let missing = report(&[(ToolId::Ccsh, &bat, ToolState::Ok)]);

        // Act
        let codes = [too_old, missing].map(|tools| {
            resolve_ccsh_launch(&tools, TargetOs::Windows, &LaunchOptions::default())
                .unwrap_err()
                .code
        });

        // Assert
        assert_eq!(
            codes,
            [
                AnalysisErrorCode::JavaTooOld,
                AnalysisErrorCode::JavaNotFound
            ]
        );
    }

    #[test]
    fn should_refuse_a_missing_or_too_old_ccsh() {
        // Arrange
        let install = Install::new();
        let bat = install.package(&install.root.join("codecharta-analysis"), true);
        let missing = report(&[
            (ToolId::Ccsh, &bat, ToolState::Missing),
            (ToolId::Java, &install.java, ToolState::Ok),
        ]);
        let too_old = report(&[
            (ToolId::Ccsh, &bat, ToolState::TooOld),
            (ToolId::Java, &install.java, ToolState::Ok),
        ]);

        // Act
        let codes = [missing, too_old].map(|tools| {
            resolve_ccsh_launch(&tools, TargetOs::Windows, &LaunchOptions::default())
                .unwrap_err()
                .code
        });

        // Assert
        assert_eq!(
            codes,
            [
                AnalysisErrorCode::CcshNotFound,
                AnalysisErrorCode::CcshTooOld
            ]
        );
    }

    #[test]
    fn should_fall_back_to_cmd_shim_when_lib_is_missing() {
        // Arrange
        let install = Install::new();
        let prefix = install.root.join("npm");
        install.package(
            &prefix
                .join("node_modules")
                .join("codecharta-analysis")
                .join("public"),
            false,
        );
        let shim = prefix.join("ccsh.cmd");
        fs::write(&shim, GLOBAL_SHIM).unwrap();

        // Act
        let launch = resolve_ccsh_launch(
            &install.report(&shim),
            TargetOs::Windows,
            &options_with_temp_dir(&install.root),
        )
        .unwrap();

        // Assert
        assert_eq!(launch.mode, LaunchMode::CmdShim);
        assert_eq!(launch.command, shim);
        assert!(launch.prefix_args.is_empty());
        assert_eq!(
            launch.env.get("CCSH_OPTS").map(String::as_str),
            Some("-Dstdout.encoding=UTF-8 -Dstderr.encoding=UTF-8")
        );
    }

    #[test]
    fn should_reject_a_cmd_shim_argument_containing_percent_or_quote() {
        // Arrange
        let install = Install::new();
        let shim = touch(&install.root.join("ccsh.cmd"));
        let launch = resolve_ccsh_launch(
            &install.report(&shim),
            TargetOs::Windows,
            &LaunchOptions::default(),
        )
        .unwrap();
        let arguments = |folder: &str| -> Vec<OsString> {
            ["analyse", folder, "-o", r"C:\jobs\map"]
                .map(OsString::from)
                .to_vec()
        };

        // Act
        let results = [
            launch.check_arguments(&arguments(r"C:\repos\100%")),
            launch.check_arguments(&arguments(r#"C:\repos\say "hi""#)),
            launch.check_arguments(&arguments(r"C:\repos\a & b")),
        ];

        // Assert
        assert_eq!(launch.mode, LaunchMode::CmdShim);
        let [percent, quote, ampersand] = results;
        for refused in [percent, quote] {
            let error = refused.unwrap_err();
            assert_eq!(error.code, AnalysisErrorCode::InvalidArguments);
            assert_eq!(error.hint.as_deref(), Some(SHIM_REFUSED_HINT));
        }
        assert!(ampersand.is_ok());
    }

    #[test]
    fn should_accept_any_argument_for_java_direct() {
        // Arrange
        let install = Install::new();
        let bat = install.package(&install.root.join("codecharta-analysis"), true);
        let launch = resolve_ccsh_launch(
            &install.report(&bat),
            TargetOs::Windows,
            &LaunchOptions::default(),
        )
        .unwrap();

        // Act
        let result = launch.check_arguments(&[OsString::from(r#"C:\a "b" 100%"#)]);

        // Assert
        assert!(result.is_ok());
    }

    #[test]
    fn should_use_the_executable_itself_on_unix() {
        // Arrange
        let install = Install::new();
        let ccsh = touch(&install.root.join("custom").join("ccsh"));

        // Act
        let launch = resolve_ccsh_launch(
            &install.report(&ccsh),
            TargetOs::Unix,
            &options_with_temp_dir(&install.root),
        )
        .unwrap();

        // Assert
        assert_eq!(launch.mode, LaunchMode::Executable);
        assert_eq!(launch.command, ccsh);
        assert!(launch.prefix_args.is_empty());
        assert_eq!(launch.tool(), ToolId::Ccsh);
    }

    #[cfg(unix)]
    #[test]
    fn should_resolve_java_direct_through_a_symlinked_gradle_install_on_unix() {
        // Arrange
        let install = Install::new();
        let home = install
            .root
            .join("lib")
            .join("node_modules")
            .join("codecharta-analysis")
            .join("public");
        install.package(&home, true);
        let script = touch(&home.join("bin").join("ccsh"));
        let link = install.root.join("bin").join("ccsh");
        fs::create_dir_all(link.parent().unwrap()).unwrap();
        std::os::unix::fs::symlink(&script, &link).unwrap();
        let temp_dir = install.root.join("tmp");

        // Act
        let launch = resolve_ccsh_launch(
            &install.report(&link),
            TargetOs::Unix,
            &options_with_temp_dir(&temp_dir),
        )
        .unwrap();

        // Assert
        assert_eq!(launch.mode, LaunchMode::JavaDirect);
        assert_eq!(
            launch.prefix_args,
            java_direct_args(&home.canonicalize().unwrap(), &temp_dir)
        );
    }

    #[test]
    fn should_not_take_a_lib_folder_without_a_ccsh_jar_for_an_install() {
        // Arrange
        let install = Install::new();
        let home = install.root.join("usr");
        let ccsh = touch(&home.join("bin").join("ccsh"));
        touch(&home.join("lib").join("unrelated.jar"));

        // Act
        let launch = resolve_ccsh_launch(
            &install.report(&ccsh),
            TargetOs::Unix,
            &LaunchOptions::default(),
        )
        .unwrap();

        // Assert
        assert_eq!(launch.mode, LaunchMode::Executable);
    }

    #[test]
    fn should_use_the_override_without_a_tools_report() {
        // Arrange
        let fake = PathBuf::from("/opt/fake-ccsh");
        let options = LaunchOptions {
            worktree_temp_dir: None,
            launch_override: Some(LaunchOverride::Executable(fake.clone())),
        };

        // Act
        let launch = resolve_ccsh_launch(&report(&[]), TargetOs::Windows, &options).unwrap();

        // Assert
        assert_eq!(launch.mode, LaunchMode::Executable);
        assert_eq!(launch.command, fake);
    }
}
