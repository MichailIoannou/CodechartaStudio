mod support;

use std::path::Path;

use serde_json::{Value, json};
use support::analysis::TestRepository;
use support::{PROTOCOL_VERSION, ServingCore, error_data_code, hello_params};

const UNKNOWN_FOLDER: &str = "f-0000000000000000";

fn serve(repository: &TestRepository) -> ServingCore {
    let data_dir = tempfile::tempdir().expect("a data folder");
    let mut core = ServingCore::launch(data_dir, |command| repository.isolate(command));
    core.request(0, "core.hello", hello_params(PROTOCOL_VERSION));
    core
}

fn project_of(core: &mut ServingCore, path: &Path) -> Value {
    let picked = core.request(1, "projects.inspectFolder", json!({ "path": path }));
    let folders =
        json!([{ "pickToken": picked["result"]["pickToken"], "label": "app", "role": "primary" }]);
    let project = core.request(
        2,
        "projects.create",
        json!({ "name": "App", "folders": folders }),
    );
    json!({ "projectId": project["result"]["id"], "folderId": project["result"]["folders"][0]["id"] })
}

#[test]
fn should_detect_the_provider_over_json_rpc_and_honour_a_folder_override() {
    // Arrange
    let repository = TestRepository::with_commit();
    repository.git(&[
        "remote",
        "add",
        "origin",
        "https://user:s3cret@git.example.org/team/app.git",
    ]);
    let mut core = serve(&repository);
    let folder = project_of(&mut core, repository.path());
    let override_params = json!({
        "projectId": folder["projectId"],
        "folderId": folder["folderId"],
        "hosting": { "provider": "gitlab", "host": "git.example.org" }
    });

    // Act
    let unrecognised = core.request(3, "hosting.status", json!({ "folder": folder }));
    let updated = core.request(4, "projects.updateFolder", override_params);
    let overridden = core.request(5, "hosting.status", json!({ "folder": folder }));

    // Assert
    assert_eq!(
        unrecognised["result"],
        json!({
            "provider": null,
            "host": "git.example.org",
            "repository": "team/app",
            "remote": "origin",
            "detectedBy": null
        })
    );
    assert_eq!(
        updated["result"]["folders"][0]["hosting"],
        json!({ "provider": "gitlab", "host": "git.example.org" })
    );
    assert_eq!(overridden["result"]["provider"], "gitlab");
    assert_eq!(overridden["result"]["detectedBy"], "override");
    assert!(!unrecognised.to_string().contains("s3cret"));
}

#[test]
fn should_answer_an_unknown_folder_and_a_folder_without_remotes() {
    // Arrange
    let repository = TestRepository::with_commit();
    let mut core = serve(&repository);
    let folder = project_of(&mut core, repository.path());
    let unknown = json!({ "projectId": folder["projectId"], "folderId": UNKNOWN_FOLDER });

    // Act
    let without_remotes = core.request(3, "hosting.status", json!({ "folder": folder }));
    let missing = core.request(4, "hosting.status", json!({ "folder": unknown }));

    // Assert
    assert_eq!(without_remotes["result"]["host"], Value::Null);
    assert_eq!(without_remotes["result"]["provider"], Value::Null);
    assert_eq!(error_data_code(&missing), "NOT_FOUND");
}

/// `origin` is a bare repository with `main` at the first commit and `refs/pull/7/head` at a second one
/// that no local branch points at.
fn repository_with_a_pull_request(repository: &TestRepository) -> (tempfile::TempDir, String) {
    let origin = tempfile::tempdir().expect("an origin folder");
    let origin_path = origin.path().to_str().expect("a UTF-8 path").to_string();
    repository.git(&["init", "--quiet", "--bare", &origin_path]);
    repository.git(&["remote", "add", "origin", &origin_path]);
    repository.git(&["push", "--quiet", "origin", "HEAD:refs/heads/main"]);
    repository.git(&["fetch", "--quiet", "origin"]);
    let head = repository.add_commit("b.txt");
    repository.git(&["push", "--quiet", "origin", "HEAD:refs/pull/7/head"]);
    repository.git(&["reset", "--quiet", "--hard", "HEAD~1"]);
    (origin, head)
}

#[test]
fn should_fetch_a_pull_request_head_and_compare_it_from_its_merge_base() {
    // Arrange
    let repository = TestRepository::with_commit();
    let (_origin, head) = repository_with_a_pull_request(&repository);
    let mut core = serve(&repository);
    let folder = project_of(&mut core, repository.path());
    let fetch = json!({ "folder": folder, "remote": "origin", "provider": "github", "number": 7 });
    let unknown_number =
        json!({ "folder": folder, "remote": "origin", "provider": "github", "number": 99 });
    let intent = json!({
        "kind": "changeRequest", "folder": folder, "provider": "github", "number": 7,
        "remote": "origin", "baseRefName": "main",
        "baseCommit": null, "headCommit": null, "mergeCommit": null
    });

    // Act
    let refused = core.request(3, "hosting.fetchChangeRequestHead", unknown_number);
    let fetched = core.request(4, "hosting.fetchChangeRequestHead", fetch);
    let resolved = core.request(
        5,
        "compare.resolve",
        json!({ "intent": intent, "shownCommit": null }),
    );

    // Assert
    assert_eq!(error_data_code(&refused), "REF_NOT_ON_REMOTE");
    assert_eq!(
        fetched["result"],
        json!({ "gitRef": "refs/codecharta/pr/7", "commit": head })
    );
    let comparison = &resolved["result"];
    assert_eq!(comparison["status"], json!({ "kind": "ready" }));
    assert_eq!(comparison["baseMode"], "mergeBase");
    assert_eq!(comparison["base"]["requested"]["commit"], repository.head);
    assert_eq!(
        comparison["head"]["requested"]["label"],
        json!({ "kind": "pullRequest", "name": "#7" })
    );
    assert_eq!(comparison["baseTip"]["label"]["name"], "origin/main");
}
