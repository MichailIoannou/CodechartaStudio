use std::process::ExitCode;

use codecharta_core::{CoreError, CoreResult};
use codecharta_core_api::error::ErrorPayload;
use serde::Serialize;

const FAILED: u8 = 1;

/// Exits 0 when the command did its work, 1 when the core refused it (the error code and message go to
/// stderr); clap exits 2 for usage errors.
pub fn exit_code_of(printed: CoreResult<()>) -> ExitCode {
    match printed {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            let payload = error.to_payload();
            eprintln!("{}: {}", code_name(&payload), payload.message);
            ExitCode::from(FAILED)
        }
    }
}

/// The code as it is written on the wire, so scripts can match it.
fn code_name(payload: &ErrorPayload) -> String {
    serde_json::to_value(payload.code)
        .ok()
        .and_then(|code| code.as_str().map(str::to_string))
        .unwrap_or_default()
}

pub fn print_json<T: Serialize + ?Sized>(value: &T) -> CoreResult<()> {
    let text = serde_json::to_string_pretty(value)
        .map_err(|error| CoreError::Internal(format!("could not print JSON: {error}")))?;
    println!("{text}");
    Ok(())
}

/// A value as it is written on the wire, so scripts can match it.
pub fn wire_name<T: Serialize>(value: &T) -> String {
    serde_json::to_value(value)
        .ok()
        .and_then(|name| name.as_str().map(str::to_string))
        .unwrap_or_default()
}
