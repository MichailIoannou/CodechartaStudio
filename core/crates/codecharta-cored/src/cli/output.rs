use std::process::ExitCode;

use codecharta_core::{CoreError, CoreResult};
use serde::Serialize;

const FAILED: u8 = 1;

/// Exits 0 when the command did its work, 1 when the core refused it; clap exits 2 for usage errors.
pub fn exit_code_of(printed: CoreResult<()>) -> ExitCode {
    match printed {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("{}", error.to_payload().message);
            ExitCode::from(FAILED)
        }
    }
}

pub fn print_json<T: Serialize + ?Sized>(value: &T) -> CoreResult<()> {
    let text = serde_json::to_string_pretty(value)
        .map_err(|error| CoreError::Internal(format!("could not print JSON: {error}")))?;
    println!("{text}");
    Ok(())
}
