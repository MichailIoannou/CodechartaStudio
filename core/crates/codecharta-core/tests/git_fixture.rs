mod support;

use support::TempRepo;

fn build_history() -> Vec<String> {
    let repo = TempRepo::new();
    let first = repo.commit("Add a", &[("a.txt", "a")]);
    repo.branch("feature");
    repo.checkout("feature");
    let feature = repo.commit("Add b", &[("b.txt", "b")]);
    repo.checkout("main");
    let merge = repo.merge(&["feature"], "Merge feature");
    let long = repo.linear_history(3);
    vec![first, feature, merge, long]
}

#[test]
fn should_create_identical_shas_on_every_run() {
    // Arrange
    let first_run = build_history();

    // Act
    let second_run = build_history();

    // Assert
    assert_eq!(first_run, second_run);
}

#[test]
fn should_not_read_the_user_git_configuration() {
    // Arrange
    let repo = TempRepo::new();

    // Act
    let origins = repo.git(&["config", "--list", "--show-origin", "--show-scope"]);

    // Assert
    let foreign: Vec<&str> = origins
        .lines()
        .filter(|line| !line.starts_with("local\t") && !line.starts_with("command\t"))
        .collect();
    assert!(foreign.is_empty(), "{foreign:?}");
}

#[test]
fn should_fail_commit_without_identity_when_use_config_only_is_set() {
    // Arrange
    let repo = TempRepo::new();
    repo.write_file("a.txt", "a");
    repo.git(&["add", "--", "a.txt"]);

    // Act
    let output = repo.git_without_identity(&[
        "-c",
        "user.useConfigOnly=true",
        "commit",
        "--quiet",
        "--message",
        "Add a",
    ]);

    // Assert
    assert!(!output.status.success());
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(
        stderr.contains("Author identity unknown") || stderr.contains("tell me who you are"),
        "{stderr}"
    );
    assert!(
        repo.try_git(&["rev-parse", "--verify", "--quiet", "HEAD"])
            .is_none()
    );
}
