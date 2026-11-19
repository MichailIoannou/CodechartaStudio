mod support;

use std::io::Read;
use std::process::{Command, Output, Stdio};
use std::time::Duration;

use flate2::read::GzDecoder;
use support::fake_ccsh::{FakeScenario, SCENARIO_VARIABLE, fake_ccsh, write_scenario};

const SHA: &str = "0123456789abcdef0123456789abcdef01234567";
const STILL_RUNNING_AFTER: Duration = Duration::from_millis(300);

fn run_fake(scenario: &FakeScenario, args: &[&str]) -> (Output, tempfile::TempDir) {
    let folder = tempfile::tempdir().expect("a temp folder can be created");
    let scenario_file = write_scenario(folder.path(), scenario);
    let output = Command::new(fake_ccsh())
        .args(args)
        .env(SCENARIO_VARIABLE, scenario_file)
        .stdin(Stdio::null())
        .output()
        .expect("fake-ccsh starts");
    (output, folder)
}

#[test]
fn should_write_the_prefixed_file_for_a_commit_run() {
    // Arrange
    let jobs = tempfile::tempdir().unwrap();
    let output_base = jobs.path().join("job").join("map");
    let commit = format!("--commit={SHA}");
    let args = [
        "analyse",
        "/repo",
        "-o",
        output_base.to_str().unwrap(),
        "-p",
        commit.as_str(),
    ];

    // Act
    let (output, _scenario) = run_fake(&FakeScenario::writing_map(), &args);

    // Assert
    let expected = jobs.path().join("job").join("0123456.map.cc.json.gz");
    assert_eq!(output.status.code(), Some(0));
    let stdout = String::from_utf8(output.stdout).unwrap();
    assert!(
        stdout.ends_with(&format!("Map: {}\n", expected.display())),
        "{stdout}"
    );
    let mut map = String::new();
    GzDecoder::new(std::fs::File::open(&expected).unwrap())
        .read_to_string(&mut map)
        .unwrap();
    let parsed: serde_json::Value = serde_json::from_str(&map).unwrap();
    assert_eq!(parsed["meta"]["apiVersion"], "2.1");
    assert_eq!(parsed["files"][0]["name"], "root");
}

#[test]
fn should_name_a_working_tree_map_without_a_prefix() {
    // Arrange
    let jobs = tempfile::tempdir().unwrap();
    let output_base = jobs.path().join("map.cc.json");
    let args = ["analyse", "/repo", "-o", output_base.to_str().unwrap()];

    // Act
    let (output, _scenario) = run_fake(&FakeScenario::writing_map(), &args);

    // Assert
    assert_eq!(output.status.code(), Some(0));
    assert!(jobs.path().join("map.cc.json.gz").is_file());
}

#[test]
fn should_exit_with_the_scripted_code() {
    // Arrange
    let scenario = FakeScenario {
        stdout: vec!["--without does not know x.".to_string()],
        stderr_chunks: vec!["warning one\n".to_string()],
        exit_code: 3,
        ..FakeScenario::default()
    };

    // Act
    let (output, _scenario) = run_fake(&scenario, &["analyse", "/repo"]);

    // Assert
    assert_eq!(output.status.code(), Some(3));
    assert_eq!(output.stdout, b"--without does not know x.\n");
    assert_eq!(output.stderr, b"warning one\n");
}

#[test]
fn should_hang_until_killed_when_scripted() {
    // Arrange
    let folder = tempfile::tempdir().unwrap();
    let scenario = FakeScenario {
        hang: true,
        ..FakeScenario::default()
    };
    let scenario_file = write_scenario(folder.path(), &scenario);
    let mut child = Command::new(fake_ccsh())
        .args(["analyse", "/repo"])
        .env(SCENARIO_VARIABLE, scenario_file)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .spawn()
        .unwrap();

    // Act
    std::thread::sleep(STILL_RUNNING_AFTER);
    let while_running = child.try_wait().unwrap();
    child.kill().unwrap();
    let after_kill = child.wait().unwrap();

    // Assert
    assert!(while_running.is_none());
    assert!(!after_kill.success());
}
