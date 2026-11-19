//! Stand-in for `ccsh analyse` in the core's tests; never packaged. It plays the scenario in the JSON file
//! named by `FAKE_CCSH_SCENARIO`: stdout lines, stderr chunks with a pause after each, optionally a map
//! named exactly like ccsh names it, optionally hanging until killed, then the scripted exit code.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::Duration;

use flate2::Compression;
use flate2::write::GzEncoder;
use serde::Deserialize;

const SCENARIO_VARIABLE: &str = "FAKE_CCSH_SCENARIO";
const VERSION_FLAG: &str = "--version";
const VERSION_ANSWER: &str =
    "CodeCharta ccsh\nversion \"2.4.0\"\nCopyright(c) 2024, MaibornWolff GmbH";
const OUTPUT_OPTION: &str = "-o";
const COMMIT_OPTION: &str = "--commit=";
const SHORT_HASH_LENGTH: usize = 7;
const STRIPPED_SUFFIXES: [&str; 3] = [".gz", ".json", ".cc"];
const MAP_SUFFIX: &str = ".cc.json.gz";
const SEPARATOR_WIDTH: usize = 72;
const SEPARATOR_CHARACTER: &str = "─";
const HANG_STEP: Duration = Duration::from_secs(600);
const SETUP_FAILURE_EXIT_CODE: i32 = 101;
const TINY_MAP: &str = r#"{"meta":{"projectName":"","apiVersion":"2.1","checksum":"d41d8cd98f00b204e9800998ecf8427e"},"files":[{"id":"0","name":"root","type":"Folder","children":[]}],"lenses":{"metrics":{"attributes":{},"attributeDescriptors":{},"attributeTypes":{}},"dependency":{"edges":[],"attributeTypes":{},"attributeDescriptors":{}},"domain":{}}}"#;

#[derive(Debug, Default, Deserialize)]
#[serde(default, deny_unknown_fields)]
struct Scenario {
    stdout: Vec<String>,
    stderr_chunks: Vec<String>,
    delay_ms: u64,
    exit_code: i32,
    write_map: bool,
    hang: bool,
    pid_file: Option<PathBuf>,
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args == [VERSION_FLAG] {
        println!("{VERSION_ANSWER}");
        return;
    }
    let exit_code = play(&args).unwrap_or_else(|message| {
        eprintln!("fake-ccsh: {message}");
        SETUP_FAILURE_EXIT_CODE
    });
    std::process::exit(exit_code);
}

fn play(args: &[String]) -> Result<i32, String> {
    let scenario = read_scenario()?;
    if let Some(pid_file) = &scenario.pid_file {
        fs::write(pid_file, std::process::id().to_string()).map_err(|error| error.to_string())?;
    }
    write_stdout(&scenario.stdout);
    write_stderr(
        &scenario.stderr_chunks,
        Duration::from_millis(scenario.delay_ms),
    );
    if scenario.write_map {
        let map = map_path(args)?;
        write_map(&map)?;
        print_summary(&map);
    }
    if scenario.hang {
        hang_until_killed();
    }
    Ok(scenario.exit_code)
}

fn hang_until_killed() -> ! {
    loop {
        std::thread::sleep(HANG_STEP);
    }
}

fn read_scenario() -> Result<Scenario, String> {
    let file = std::env::var_os(SCENARIO_VARIABLE)
        .ok_or_else(|| format!("{SCENARIO_VARIABLE} is not set"))?;
    let text = fs::read_to_string(&file).map_err(|error| error.to_string())?;
    serde_json::from_str(&text).map_err(|error| error.to_string())
}

fn write_stdout(lines: &[String]) {
    let mut stdout = std::io::stdout().lock();
    for line in lines {
        let _ = writeln!(stdout, "{line}");
    }
    let _ = stdout.flush();
}

fn write_stderr(chunks: &[String], pause: Duration) {
    let mut stderr = std::io::stderr().lock();
    for chunk in chunks {
        let _ = write!(stderr, "{chunk}");
        let _ = stderr.flush();
        std::thread::sleep(pause);
    }
}

/// ccsh prefixes the file name (not the folder) with the short hash and replaces any map extension.
fn map_path(args: &[String]) -> Result<PathBuf, String> {
    let output = args
        .iter()
        .position(|argument| argument == OUTPUT_OPTION)
        .and_then(|index| args.get(index + 1))
        .map(PathBuf::from)
        .ok_or("no -o option")?;
    let prefix = args
        .iter()
        .find_map(|argument| argument.strip_prefix(COMMIT_OPTION))
        .map(|sha| {
            format!(
                "{}.",
                sha.chars().take(SHORT_HASH_LENGTH).collect::<String>()
            )
        })
        .unwrap_or_default();
    let mut stem = output
        .file_name()
        .ok_or("the -o value has no file name")?
        .to_string_lossy()
        .into_owned();
    for suffix in STRIPPED_SUFFIXES {
        if let Some(stripped) = stem.strip_suffix(suffix) {
            stem = stripped.to_string();
        }
    }
    Ok(output.with_file_name(format!("{prefix}{stem}{MAP_SUFFIX}")))
}

fn write_map(map: &Path) -> Result<(), String> {
    if let Some(folder) = map.parent() {
        fs::create_dir_all(folder).map_err(|error| error.to_string())?;
    }
    let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
    encoder
        .write_all(TINY_MAP.as_bytes())
        .map_err(|error| error.to_string())?;
    let compressed = encoder.finish().map_err(|error| error.to_string())?;
    fs::write(map, compressed).map_err(|error| error.to_string())
}

fn print_summary(map: &Path) {
    println!();
    println!("{}", SEPARATOR_CHARACTER.repeat(SEPARATOR_WIDTH));
    println!("Analysis done: 1 files with rawtextparser");
    println!();
    println!("Map: {}", map.display());
}
