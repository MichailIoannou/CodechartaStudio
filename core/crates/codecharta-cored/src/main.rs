use std::process::ExitCode;

use clap::Parser;
use codecharta_cored::cli::{Cli, run};

fn main() -> ExitCode {
    run(Cli::parse())
}
