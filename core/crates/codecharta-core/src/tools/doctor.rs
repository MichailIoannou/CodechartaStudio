use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicU32, Ordering};
use std::time::{Duration, SystemTime};

use codecharta_core_api::methods::tools::{ToolId, ToolSource, ToolState, ToolStatus, ToolsReport};
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;

use crate::config::settings::{CoreSettings, SettingsStore};
use crate::error::{CoreError, CoreResult};
use crate::path_to_wire;
use crate::process::env::EnvVars;
use crate::process::runner::DEFAULT_MAX_OUTPUT_BYTES;
use crate::process::{AskpassSetup, OutputMode, ProcessRunner, RunOutput, RunRequest};
use crate::tools::definitions::{TOOLS, ToolDefinition, definition};
use crate::tools::finder::SearchLocations;
use crate::tools::version::{is_at_least, read_version};

const VERSION_OUTPUT_LIMIT_BYTES: u64 = 64 * 1024;
const JAVA_HOME_VARIABLE: &str = "JAVA_HOME";
const TOOLS_NEEDED_FOR_ANALYSIS: [ToolId; 3] = [ToolId::Git, ToolId::Ccsh, ToolId::Java];

pub type CheckedCallback<'callback> = &'callback (dyn Fn(u32, u32) + Sync);

pub struct ToolsSetup {
    pub settings: Arc<SettingsStore>,
    pub runner: Arc<ProcessRunner>,
    pub locations: SearchLocations,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedTool {
    pub tool: ToolId,
    pub path: PathBuf,
    pub version: String,
}

pub struct ToolRunOptions {
    pub cwd: Option<PathBuf>,
    pub env: EnvVars,
    pub timeout: Duration,
    pub max_output_bytes: Option<u64>,
    pub askpass: Option<AskpassSetup>,
    pub output: OutputMode,
}

impl ToolRunOptions {
    pub fn new(timeout: Duration) -> Self {
        Self {
            cwd: None,
            env: Vec::new(),
            timeout,
            max_output_bytes: None,
            askpass: None,
            output: OutputMode::Collect,
        }
    }
}

/// Finds git, ccsh, java, gh and glab and is the only way the core runs them.
pub struct Tools {
    setup: ToolsSetup,
    cached: Mutex<Option<ToolsReport>>,
}

impl Tools {
    pub fn new(setup: ToolsSetup) -> Self {
        Self {
            setup,
            cached: Mutex::new(None),
        }
    }

    /// Answers the cached report unless `refresh`; `on_checked(done, total)` follows each finished check.
    pub async fn doctor(
        &self,
        refresh: bool,
        cancel: &CancellationToken,
        on_checked: CheckedCallback<'_>,
    ) -> CoreResult<ToolsReport> {
        let mut cached = self.cached.lock().await;
        if let Some(report) = cached.as_ref().filter(|_| !refresh) {
            return Ok(report.clone());
        }
        let report = self.check_all(cancel, on_checked).await?;
        *cached = Some(report.clone());
        Ok(report)
    }

    pub async fn resolve(&self, tool: ToolId) -> CoreResult<ResolvedTool> {
        resolved_from(status_of(&self.report().await?, tool)?)
    }

    pub async fn run(
        &self,
        tool: ToolId,
        args: Vec<OsString>,
        options: ToolRunOptions,
        cancel: &CancellationToken,
    ) -> CoreResult<RunOutput> {
        let report = self.report().await?;
        let resolved = resolved_from(status_of(&report, tool)?)?;
        let mut env = java_home_for(tool, &report);
        env.extend(options.env);
        let request = RunRequest {
            env,
            cwd: options.cwd,
            max_output_bytes: options.max_output_bytes.unwrap_or(DEFAULT_MAX_OUTPUT_BYTES),
            askpass: options.askpass,
            output: options.output,
            ..RunRequest::new(tool, resolved.path, args, options.timeout)
        };
        self.setup.runner.run(request, cancel).await
    }

    /// Settings stay untouched when the file does not answer like the tool.
    pub async fn set_path(&self, tool: ToolId, path: PathBuf) -> CoreResult<ToolsReport> {
        if !path.is_absolute() || !path.is_file() {
            return Err(CoreError::ToolFailed {
                tool,
                message: "the chosen file does not exist".to_string(),
            });
        }
        self.query_version(definition(tool), &path, &CancellationToken::new())
            .await
            .map_err(|problem| CoreError::ToolFailed {
                tool,
                message: problem,
            })?;
        let chosen = path_to_wire(&path)?;
        self.setup
            .settings
            .update(|settings| {
                settings.tool_paths.insert(tool, chosen);
            })
            .await?;
        self.refresh().await
    }

    pub async fn clear_path(&self, tool: ToolId) -> CoreResult<ToolsReport> {
        self.setup
            .settings
            .update(|settings| {
                settings.tool_paths.remove(&tool);
            })
            .await?;
        self.refresh().await
    }

    async fn report(&self) -> CoreResult<ToolsReport> {
        self.doctor(false, &CancellationToken::new(), &|_, _| {})
            .await
    }

    async fn refresh(&self) -> CoreResult<ToolsReport> {
        self.doctor(true, &CancellationToken::new(), &|_, _| {})
            .await
    }

    async fn check_all(
        &self,
        cancel: &CancellationToken,
        on_checked: CheckedCallback<'_>,
    ) -> CoreResult<ToolsReport> {
        let settings = self.setup.settings.get();
        let done = AtomicU32::new(0);
        let total = u32::try_from(TOOLS.len()).unwrap_or(u32::MAX);
        let check = |definition: &'static ToolDefinition| {
            let (settings, done) = (&settings, &done);
            async move {
                let status = self.check(definition, settings, cancel).await;
                on_checked(done.fetch_add(1, Ordering::SeqCst) + 1, total);
                status
            }
        };
        let [git, ccsh, java, gh, glab] = &TOOLS;
        let checked = tokio::join!(check(git), check(ccsh), check(java), check(gh), check(glab));
        if cancel.is_cancelled() {
            return Err(CoreError::Cancelled);
        }
        let (git, ccsh, java, gh, glab) = checked;
        Ok(report_of(vec![git, ccsh, java, gh, glab]))
    }

    async fn check(
        &self,
        definition: &ToolDefinition,
        settings: &CoreSettings,
        cancel: &CancellationToken,
    ) -> ToolStatus {
        let Some(location) = self.locate(definition, settings) else {
            return status(definition, ToolState::Missing, Finding::default());
        };
        if !location.0.is_file() {
            let problem = "The chosen file no longer exists.".to_string();
            return status(
                definition,
                ToolState::Missing,
                Finding::at(location).with_problem(problem),
            );
        }
        match self.query_version(definition, &location.0, cancel).await {
            Ok(version) => judge_version(definition, Finding::at(location), version),
            Err(problem) => status(
                definition,
                ToolState::Failed,
                Finding::at(location).with_problem(problem),
            ),
        }
    }

    fn locate(
        &self,
        definition: &ToolDefinition,
        settings: &CoreSettings,
    ) -> Option<(PathBuf, ToolSource)> {
        match settings.tool_paths.get(&definition.id) {
            Some(custom) => Some((PathBuf::from(custom), ToolSource::Custom)),
            None => self.setup.locations.find(definition),
        }
    }

    async fn query_version(
        &self,
        definition: &ToolDefinition,
        path: &Path,
        cancel: &CancellationToken,
    ) -> Result<String, String> {
        let args = definition.version_args.iter().map(OsString::from).collect();
        let request = RunRequest {
            max_output_bytes: VERSION_OUTPUT_LIMIT_BYTES,
            ..RunRequest::new(
                definition.id,
                path.to_path_buf(),
                args,
                definition.version_timeout,
            )
        };
        let output = self
            .setup
            .runner
            .run(request, cancel)
            .await
            .map_err(|error| sentence(&error.to_string()))?;
        if output.exit_code != 0 {
            return Err(format!(
                "It exited with code {} when asked for its version.",
                output.exit_code
            ));
        }
        read_version(definition.id, &output.stdout, &output.stderr)
            .ok_or_else(|| "It did not answer with a version.".to_string())
    }
}

#[derive(Debug, Default)]
struct Finding {
    location: Option<(PathBuf, ToolSource)>,
    version: Option<String>,
    problem: Option<String>,
}

impl Finding {
    fn at(location: (PathBuf, ToolSource)) -> Self {
        Self {
            location: Some(location),
            ..Self::default()
        }
    }

    fn with_problem(self, problem: String) -> Self {
        Self {
            problem: Some(problem),
            ..self
        }
    }
}

fn judge_version(definition: &ToolDefinition, finding: Finding, version: String) -> ToolStatus {
    let too_old = definition
        .minimum
        .filter(|minimum| !is_at_least(&version, minimum));
    let (state, problem) = match too_old {
        Some(minimum) => (
            ToolState::TooOld,
            Some(format!(
                "Version {version} is older than the minimum {minimum}."
            )),
        ),
        None => (ToolState::Ok, None),
    };
    status(
        definition,
        state,
        Finding {
            version: Some(version),
            problem,
            ..finding
        },
    )
}

fn status(definition: &ToolDefinition, state: ToolState, finding: Finding) -> ToolStatus {
    let (path, source) = match finding.location {
        Some((path, source)) => (Some(path.to_string_lossy().into_owned()), Some(source)),
        None => (None, None),
    };
    ToolStatus {
        tool: definition.id,
        is_required: definition.is_required,
        state,
        path,
        source,
        version: finding.version,
        minimum_version: definition.minimum.map(str::to_string),
        problem: finding.problem,
    }
}

fn report_of(tools: Vec<ToolStatus>) -> ToolsReport {
    let is_ok = |tool: ToolId| {
        tools
            .iter()
            .any(|status| status.tool == tool && status.state == ToolState::Ok)
    };
    ToolsReport {
        checked_at: humantime::format_rfc3339_seconds(SystemTime::now()).to_string(),
        can_use_git: is_ok(ToolId::Git),
        can_analyse: TOOLS_NEEDED_FOR_ANALYSIS.into_iter().all(is_ok),
        tools,
    }
}

fn status_of(report: &ToolsReport, tool: ToolId) -> CoreResult<ToolStatus> {
    report
        .tools
        .iter()
        .find(|status| status.tool == tool)
        .cloned()
        .ok_or_else(|| CoreError::Internal(format!("the tools report has no entry for {tool}")))
}

fn resolved_from(status: ToolStatus) -> CoreResult<ResolvedTool> {
    let tool = status.tool;
    match (status.state, status.path, status.version) {
        (ToolState::Ok, Some(path), Some(version)) => Ok(ResolvedTool {
            tool,
            path: PathBuf::from(path),
            version,
        }),
        (ToolState::Missing, _, _) => Err(CoreError::ToolNotFound { tool }),
        _ => Err(CoreError::ToolFailed {
            tool,
            message: status.problem.unwrap_or_default(),
        }),
    }
}

/// ccsh starts java through `JAVA_HOME` or `PATH`; a java found anywhere else would be invisible to it.
fn java_home_for(tool: ToolId, report: &ToolsReport) -> EnvVars {
    let Ok(java) = status_of(report, ToolId::Java) else {
        return Vec::new();
    };
    let is_outside_path = matches!(
        java.source,
        Some(ToolSource::Custom | ToolSource::WellKnownFolder)
    );
    let java_home = java
        .path
        .filter(|_| tool == ToolId::Ccsh && java.state == ToolState::Ok && is_outside_path)
        .and_then(|path| Path::new(&path).parent()?.parent().map(Path::to_path_buf));
    java_home
        .map(|home| vec![(OsString::from(JAVA_HOME_VARIABLE), home.into_os_string())])
        .unwrap_or_default()
}

fn sentence(text: &str) -> String {
    let mut characters = text.chars();
    let first = characters
        .next()
        .map(|first| first.to_uppercase().collect::<String>())
        .unwrap_or_default();
    format!("{first}{}.", characters.as_str())
}
