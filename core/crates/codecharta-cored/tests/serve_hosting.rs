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
