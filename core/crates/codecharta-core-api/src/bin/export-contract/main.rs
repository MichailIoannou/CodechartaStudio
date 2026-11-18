mod render;

use std::fs;
use std::path::{Path, PathBuf};
use std::process::ExitCode;

use ts_rs::Config;

const USAGE: &str = "usage: export-contract --ts <folder for the TypeScript contract> --shell <allow-list json file>";
const CORE_API_MODULE: &str = "coreApi.ts";
const JSON_NUMBER: &str = "number";
const USAGE_ERROR: u8 = 2;

struct Targets {
    typescript_dir: PathBuf,
    shell_allow_list: PathBuf,
}

fn main() -> ExitCode {
    let Some(targets) = read_targets(std::env::args().skip(1)) else {
        eprintln!("{USAGE}");
        return ExitCode::from(USAGE_ERROR);
    };
    match write_contract(&targets) {
        Ok(()) => ExitCode::SUCCESS,
        Err(message) => {
            eprintln!("export-contract: {message}");
            ExitCode::FAILURE
        }
    }
}

fn read_targets(mut args: impl Iterator<Item = String>) -> Option<Targets> {
    let (mut typescript_dir, mut shell_allow_list) = (None, None);
    while let Some(flag) = args.next() {
        let value = args.next().map(PathBuf::from)?;
        match flag.as_str() {
            "--ts" => typescript_dir = Some(value),
            "--shell" => shell_allow_list = Some(value),
            _ => return None,
        }
    }
    Some(Targets {
        typescript_dir: typescript_dir?,
        shell_allow_list: shell_allow_list?,
    })
}

/// The folder is regenerated from scratch so that a type removed from the api crate disappears too.
fn write_contract(targets: &Targets) -> Result<(), String> {
    let config = Config::new()
        .with_out_dir(&targets.typescript_dir)
        .with_large_int(JSON_NUMBER);
    recreate_dir(&targets.typescript_dir)?;
    render::export_types(&config)
        .map_err(|error| format!("could not export the types: {error}"))?;
    write_file(
        &targets.typescript_dir.join(CORE_API_MODULE),
        &render::core_api_module(&config),
    )?;
    write_file(&targets.shell_allow_list, &render::shell_allow_list())
}

fn recreate_dir(dir: &Path) -> Result<(), String> {
    if dir.exists() {
        fs::remove_dir_all(dir)
            .map_err(|error| format!("could not clear {}: {error}", dir.display()))?;
    }
    fs::create_dir_all(dir).map_err(|error| format!("could not create {}: {error}", dir.display()))
}

fn write_file(file: &Path, content: &str) -> Result<(), String> {
    fs::write(file, content).map_err(|error| format!("could not write {}: {error}", file.display()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn arguments(values: &[&str]) -> impl Iterator<Item = String> {
        values
            .iter()
            .map(|value| value.to_string())
            .collect::<Vec<_>>()
            .into_iter()
    }

    #[test]
    fn should_read_both_targets() {
        // Arrange
        let args = arguments(&["--shell", "allow.json", "--ts", "out"]);

        // Act
        let targets = read_targets(args).unwrap();

        // Assert
        assert_eq!(targets.typescript_dir, PathBuf::from("out"));
        assert_eq!(targets.shell_allow_list, PathBuf::from("allow.json"));
    }

    #[test]
    fn should_refuse_missing_or_unknown_arguments() {
        // Arrange
        let incomplete = arguments(&["--ts", "out"]);
        let unknown = arguments(&["--ts", "out", "--shell", "allow.json", "--extra", "x"]);

        // Act
        let results = [
            read_targets(incomplete).is_none(),
            read_targets(unknown).is_none(),
        ];

        // Assert
        assert_eq!(results, [true, true]);
    }
}
