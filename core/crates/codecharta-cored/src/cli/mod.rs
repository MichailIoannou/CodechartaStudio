use std::path::PathBuf;
use std::process::ExitCode;
use std::sync::Arc;
use std::time::Duration;

use clap::{Parser, Subcommand};
use codecharta_core::{Core, CoreConfig};
use tracing_subscriber::filter::LevelFilter;

use crate::serve::serve;

/// The stdin reader blocks a runtime thread until the client closes the pipe; after a `core.shutdown`
/// request that may never happen, so the runtime does not wait for it.
const ABANDON_BLOCKED_READS_AFTER: Duration = Duration::from_millis(100);

#[derive(Debug, Parser)]
#[command(
    name = "codecharta-core",
    version,
    about = "Headless core of the CodeCharta desktop app"
)]
pub struct Cli {
    /// Folder for the core's settings and the default store (the shell passes Electron's userData);
    /// defaults to CODECHARTA_DATA_DIR, else codecharta-visualization in the user's configuration folder
    #[arg(long, global = true)]
    pub data_dir: Option<PathBuf>,

    /// Log level for stderr: off, error, warn, info, debug or trace
    #[arg(long, global = true, default_value = "info")]
    pub log_level: LevelFilter,

    #[command(subcommand)]
    pub command: Command,
}

#[derive(Debug, Subcommand)]
pub enum Command {
    /// Answer JSON-RPC 2.0 requests on stdin and stdout, one JSON object per line
    Serve,
}

pub fn run(cli: Cli) -> ExitCode {
    init_logging(cli.log_level);
    match cli.command {
        Command::Serve => run_serve(cli.data_dir),
    }
}

fn init_logging(level: LevelFilter) {
    tracing_subscriber::fmt()
        .with_writer(std::io::stderr)
        .with_ansi(false)
        .with_max_level(level)
        .init();
}

fn run_serve(data_dir: Option<PathBuf>) -> ExitCode {
    let Some(core) = open_core(data_dir) else {
        return ExitCode::FAILURE;
    };
    let Some(runtime) = start_runtime() else {
        return ExitCode::FAILURE;
    };
    let input = tokio::io::BufReader::new(tokio::io::stdin());
    runtime.block_on(serve(Arc::new(core), input, tokio::io::stdout()));
    runtime.shutdown_timeout(ABANDON_BLOCKED_READS_AFTER);
    ExitCode::SUCCESS
}

fn open_core(data_dir: Option<PathBuf>) -> Option<Core> {
    CoreConfig::resolve(data_dir, &|name| std::env::var_os(name))
        .and_then(Core::open)
        .inspect_err(|error| tracing::error!("could not open the core: {error}"))
        .ok()
}

fn start_runtime() -> Option<tokio::runtime::Runtime> {
    tokio::runtime::Runtime::new()
        .inspect_err(|error| tracing::error!("could not start the async runtime: {error}"))
        .ok()
}
