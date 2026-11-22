//! Stand-in for git, ccsh, java, gh and glab in the core's tests; never packaged. The first argument
//! picks the behaviour. Asked for its version (`--version`, `-version`), it prints the files
//! `<own name>.stdout` and `<own name>.stderr` next to itself, so a test can copy it as `git` or `java`
//! and decide what it answers. `hold-store-lock <root>` plays a second core process that holds the
//! store lock until its stdin closes.

use std::io::{Read, Write};
use std::path::PathBuf;
use std::process::{Command, ExitCode, Stdio};
use std::time::Duration;

const LONG_SLEEP: Duration = Duration::from_secs(600);
const SPLIT_WRITE_PAUSE: Duration = Duration::from_millis(10);
const MULTIBYTE_TEXT: &str = "aä€😀z";
const FLOOD_BYTE: u8 = b'x';
const FLOOD_BLOCK_BYTES: usize = 8 * 1024;
const STDOUT_SIDECAR: &str = "stdout";
const STDERR_SIDECAR: &str = "stderr";
const LOCK_HELD: &str = "locked";

type FakeResult = Result<ExitCode, String>;

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let (mode, rest) = args
        .split_first()
        .map_or(("", &[][..]), |(mode, rest)| (mode.as_str(), rest));
    run(mode, rest).unwrap_or_else(|message| {
        eprintln!("cc-fake-tool: {message}");
        ExitCode::FAILURE
    })
}

fn run(mode: &str, rest: &[String]) -> FakeResult {
    match mode {
        "--version" | "-version" => print_version_sidecars(),
        "version" => print_stdout(first(rest)?),
        "echo-args" => echo_args(rest),
        "sleep" => sleep_for(first(rest)?),
        "spawn-grandchild" => spawn_grandchild(first(rest)?),
        "flood" => flood(first(rest)?),
        "exit" => exit_with(first(rest)?),
        "utf8-split" => write_split_multibyte_text(),
        "print-env" => print_stdout(&std::env::var(first(rest)?).unwrap_or_default()),
        "hold-store-lock" => hold_store_lock(first(rest)?),
        unknown => Err(format!("unknown mode {unknown:?}")),
    }
}

fn first(rest: &[String]) -> Result<&str, String> {
    rest.first()
        .map(String::as_str)
        .ok_or_else(|| "the mode needs an argument".to_string())
}

fn print_version_sidecars() -> FakeResult {
    let own_path = std::env::current_exe().map_err(|error| error.to_string())?;
    print!("{}", read_sidecar(&own_path, STDOUT_SIDECAR));
    eprint!("{}", read_sidecar(&own_path, STDERR_SIDECAR));
    Ok(ExitCode::SUCCESS)
}

fn read_sidecar(own_path: &std::path::Path, stream: &str) -> String {
    let stem = own_path.file_stem().unwrap_or_default().to_string_lossy();
    std::fs::read_to_string(own_path.with_file_name(format!("{stem}.{stream}"))).unwrap_or_default()
}

fn print_stdout(text: &str) -> FakeResult {
    println!("{text}");
    Ok(ExitCode::SUCCESS)
}

fn echo_args(rest: &[String]) -> FakeResult {
    let json = serde_json::to_string(rest).map_err(|error| error.to_string())?;
    print_stdout(&json)
}

fn sleep_for(milliseconds: &str) -> FakeResult {
    std::thread::sleep(Duration::from_millis(parse_number(milliseconds)?));
    Ok(ExitCode::SUCCESS)
}

fn spawn_grandchild(pid_file: &str) -> FakeResult {
    let own_path = std::env::current_exe().map_err(|error| error.to_string())?;
    let grandchild = Command::new(own_path)
        .args(["sleep", &LONG_SLEEP.as_millis().to_string()])
        .stdin(Stdio::null())
        .spawn()
        .map_err(|error| error.to_string())?;
    std::fs::write(PathBuf::from(pid_file), grandchild.id().to_string())
        .map_err(|error| error.to_string())?;
    std::thread::sleep(LONG_SLEEP);
    Ok(ExitCode::SUCCESS)
}

fn flood(bytes: &str) -> FakeResult {
    let mut remaining = usize::try_from(parse_number(bytes)?).map_err(|error| error.to_string())?;
    let block = [FLOOD_BYTE; FLOOD_BLOCK_BYTES];
    let mut stdout = std::io::stdout().lock();
    while remaining > 0 {
        let length = remaining.min(FLOOD_BLOCK_BYTES);
        if stdout.write_all(&block[..length]).is_err() {
            break;
        }
        remaining -= length;
    }
    Ok(ExitCode::SUCCESS)
}

fn exit_with(code: &str) -> FakeResult {
    let code = u8::try_from(parse_number(code)?).map_err(|error| error.to_string())?;
    eprintln!("exiting with {code}");
    Ok(ExitCode::from(code))
}

fn write_split_multibyte_text() -> FakeResult {
    let mut stdout = std::io::stdout().lock();
    for byte in MULTIBYTE_TEXT.as_bytes() {
        stdout
            .write_all(&[*byte])
            .and_then(|()| stdout.flush())
            .map_err(|error| error.to_string())?;
        std::thread::sleep(SPLIT_WRITE_PAUSE);
    }
    Ok(ExitCode::SUCCESS)
}

fn hold_store_lock(root: &str) -> FakeResult {
    let _lock = codecharta_core::store::lock::StoreLock::acquire(std::path::Path::new(root))
        .map_err(|error| error.to_string())?;
    println!("{LOCK_HELD}");
    std::io::stdin()
        .read_to_end(&mut Vec::new())
        .map_err(|error| error.to_string())?;
    Ok(ExitCode::SUCCESS)
}

fn parse_number(text: &str) -> Result<u64, String> {
    text.parse()
        .map_err(|_| format!("{text:?} is not a number"))
}
