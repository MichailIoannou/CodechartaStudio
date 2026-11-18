#![allow(
    dead_code,
    unused_imports,
    reason = "each integration test binary compiles this module and uses a different part of it"
)]

pub mod git_fixture;
pub mod recycler;
pub mod store_workspace;

pub use git_fixture::TempRepo;
pub use recycler::RecordingRecycler;
pub use store_workspace::{StoreWorkspace, folder_ref};

use std::ffi::OsString;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

const FAKE_TOOL: &str = env!("CARGO_BIN_EXE_cc-fake-tool");

pub fn fake_tool() -> PathBuf {
    PathBuf::from(FAKE_TOOL)
}

/// Copies the fake tool into `folder` as `name` (plus `.exe` on Windows) and returns its path.
pub fn install_fake_tool(folder: &Path, name: &str) -> PathBuf {
    fs::create_dir_all(folder).expect("the tool folder can be created");
    let installed = folder.join(format!("{name}{}", std::env::consts::EXE_SUFFIX));
    fs::copy(fake_tool(), &installed).expect("the fake tool can be copied");
    wait_until_executable(&installed);
    installed
}

const EXECUTABLE_BUSY_RETRIES: u32 = 200;
const EXECUTABLE_BUSY_PAUSE: Duration = Duration::from_millis(10);

/// A child that another test thread forks while the copy is being written inherits the copy's write
/// handle until it execs, and executing the copy fails with "text file busy" meanwhile. Once one run
/// succeeds nobody holds that handle any more, so later runs cannot hit it.
fn wait_until_executable(installed: &Path) {
    for _ in 0..EXECUTABLE_BUSY_RETRIES {
        match std::process::Command::new(installed)
            .arg("--version")
            .output()
        {
            Ok(_) => return,
            Err(error) if error.kind() == std::io::ErrorKind::ExecutableFileBusy => {
                std::thread::sleep(EXECUTABLE_BUSY_PAUSE);
            }
            Err(error) => panic!("the fake tool does not start: {error}"),
        }
    }
    panic!("the fake tool stayed busy: {}", installed.display());
}

/// Installs the fake under the file name the core looks for and returns the executable whose version
/// answer `answer_version_with` sets. On Windows ccsh is a batch file, so `ccsh.cmd` calls the fake.
pub fn install_fake_command(folder: &Path, name: &str) -> PathBuf {
    if cfg!(windows) && name == "ccsh" {
        let executable = install_fake_tool(folder, "ccsh-fake");
        let wrapper = "@echo off\r\n\"%~dp0ccsh-fake.exe\" %*\r\n";
        fs::write(folder.join("ccsh.cmd"), wrapper).expect("the wrapper can be written");
        return executable;
    }
    install_fake_tool(folder, name)
}

/// What an installed fake tool prints when it is asked for its version.
pub fn answer_version_with(installed: &Path, stdout: &str, stderr: &str) {
    let stem = installed
        .file_stem()
        .expect("the tool has a file name")
        .to_string_lossy();
    fs::write(installed.with_file_name(format!("{stem}.stdout")), stdout).expect("sidecar written");
    fs::write(installed.with_file_name(format!("{stem}.stderr")), stderr).expect("sidecar written");
}

/// The git on the test machine's `PATH`, found without starting a process.
pub fn system_git() -> PathBuf {
    let path = std::env::var_os("PATH").unwrap_or_default();
    let file_name = format!("git{}", std::env::consts::EXE_SUFFIX);
    std::env::split_paths(&path)
        .map(|folder| folder.join(&file_name))
        .find(|candidate| candidate.is_file())
        .expect("git is installed on the test machine")
}

pub fn args(values: &[&str]) -> Vec<OsString> {
    values.iter().map(OsString::from).collect()
}

const GONE_TIMEOUT: Duration = Duration::from_secs(5);
const GONE_POLL_INTERVAL: Duration = Duration::from_millis(50);
const PID_FILE_TIMEOUT: Duration = Duration::from_secs(10);

/// A killed process reparented to init stays visible until init reaps it, hence the polling.
pub fn is_gone_soon(pid: u32) -> bool {
    let deadline = Instant::now() + GONE_TIMEOUT;
    while Instant::now() < deadline {
        if !is_alive(pid) {
            return true;
        }
        std::thread::sleep(GONE_POLL_INTERVAL);
    }
    false
}

pub fn read_pid_file(file: &Path) -> u32 {
    let deadline = Instant::now() + PID_FILE_TIMEOUT;
    while Instant::now() < deadline {
        if let Some(pid) = fs::read_to_string(file)
            .ok()
            .and_then(|text| text.trim().parse().ok())
        {
            return pid;
        }
        std::thread::sleep(GONE_POLL_INTERVAL);
    }
    panic!("no pid was written to {}", file.display());
}

#[cfg(unix)]
fn is_alive(pid: u32) -> bool {
    let pid = nix::unistd::Pid::from_raw(i32::try_from(pid).expect("a pid fits an i32"));
    nix::sys::signal::kill(pid, None).is_ok()
}

#[cfg(windows)]
fn is_alive(pid: u32) -> bool {
    let output = std::process::Command::new("tasklist")
        .args(["/FI", &format!("PID eq {pid}"), "/NH", "/FO", "CSV"])
        .output()
        .expect("tasklist runs");
    String::from_utf8_lossy(&output.stdout).contains(&format!("\"{pid}\""))
}
