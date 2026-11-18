use std::ffi::OsString;
use std::process::ExitCode;

use clap::Parser;
use codecharta_cored::askpass::{askpass_prompt, run_askpass};
use codecharta_cored::cli::{Cli, run};

fn main() -> ExitCode {
    let arguments: Vec<OsString> = std::env::args_os().collect();
    let lookup = |name: &str| std::env::var_os(name);
    if let Some(prompt) = askpass_prompt(&arguments, &lookup) {
        return run_askpass(&prompt, &lookup);
    }
    run(Cli::parse_from(arguments))
}
