use std::process::Command;

const CORE_EXECUTABLE: &str = env!("CARGO_BIN_EXE_codecharta-core");

#[test]
fn should_report_version() {
    // Arrange
    let mut command = Command::new(CORE_EXECUTABLE);
    command.arg("--version");

    // Act
    let output = command.output().unwrap();

    // Assert
    assert!(output.status.success());
    let stdout = String::from_utf8(output.stdout).unwrap();
    assert_eq!(
        stdout.trim(),
        format!("codecharta-core {}", env!("CARGO_PKG_VERSION"))
    );
}
