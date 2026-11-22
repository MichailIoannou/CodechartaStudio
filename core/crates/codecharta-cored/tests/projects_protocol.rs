mod support;

use std::fs;
use std::path::Path;

use serde_json::{Value, json};
use support::{PROTOCOL_VERSION, ServingCore, error_data_code, hello_params};
use tempfile::TempDir;

const SOURCE_FILE_LIMIT_BYTES: u64 = 16 * 1024 * 1024;
const UNKNOWN_PROJECT: &str = "p-0000000000000000";

/// A serving core whose git reads no user or system configuration.
struct ProjectsCore {
    core: ServingCore,
    _home: TempDir,
    next_id: i64,
}

impl ProjectsCore {
    fn start() -> Self {
        let home = tempfile::tempdir().expect("a temporary home folder");
        let home_path = home.path().to_path_buf();
        let data_dir = tempfile::tempdir().expect("a temporary data folder");
        let mut core = ServingCore::launch(data_dir, move |command| {
            command
                .env("HOME", &home_path)
                .env("XDG_CONFIG_HOME", &home_path)
                .env("GIT_CONFIG_NOSYSTEM", "1");
        });
        core.request(0, "core.hello", hello_params(PROTOCOL_VERSION));
        Self {
            core,
            _home: home,
            next_id: 1,
        }
    }

    fn request(&mut self, method: &str, params: Value) -> Value {
        self.next_id += 1;
        self.core.request(self.next_id, method, params)
    }

    fn pick(&mut self, folder: &Path) -> String {
        let picked = self.request("projects.inspectFolder", json!({ "path": folder }));
        picked["result"]["pickToken"]
            .as_str()
            .expect("the pick answers a token")
            .to_string()
    }

    fn create_with(&mut self, token: &str) -> Value {
        let folders = json!([{ "pickToken": token, "label": "app", "role": "primary" }]);
        self.request(
            "projects.create",
            json!({ "name": "Demo", "folders": folders }),
        )
    }

    /// Creates a project of `folder` and returns the folder reference of its only folder.
    fn project_of(&mut self, folder: &Path) -> Value {
        let token = self.pick(folder);
        let project = self.create_with(&token)["result"].clone();
        json!({ "projectId": project["id"], "folderId": project["folders"][0]["id"] })
    }

    fn source_file(&mut self, folder_ref: &Value, relative_path: &str) -> Value {
        let mut params = folder_ref.clone();
        params["relativePath"] = json!(relative_path);
        self.request("projects.sourceFileLocation", params)
    }
}

#[test]
fn should_serve_the_copied_projects_after_the_store_folder_changed_and_back() {
    // Arrange
    let mut core = ProjectsCore::start();
    let first_folder = tempfile::tempdir().unwrap();
    let second_folder = tempfile::tempdir().unwrap();
    let chosen = tempfile::tempdir().unwrap();
    core.project_of(first_folder.path());

    // Act
    let changed = core.request("store.changeRoot", json!({ "path": chosen.path() }));
    let copied = core.request("projects.list", json!({}));
    let added = core.project_of(second_folder.path());
    let reset = core.request("paths.resetStoreRoot", json!({}));
    let back = core.request("projects.list", json!({}));

    // Assert
    assert_eq!(changed["result"]["adopted"], json!(false));
    assert_eq!(copied["result"]["projects"].as_array().unwrap().len(), 1);
    let added_id = added["projectId"].as_str().unwrap();
    assert!(
        chosen
            .path()
            .join("projects")
            .join(added_id)
            .join("project.json")
            .is_file()
    );
    assert_eq!(reset["result"]["isDefaultStoreRoot"], json!(true));
    assert_eq!(back["result"]["projects"].as_array().unwrap().len(), 1);
}

#[test]
fn should_create_list_and_activate_a_picked_project() {
    // Arrange
    let mut core = ProjectsCore::start();
    let folder = tempfile::tempdir().unwrap();
    let token = core.pick(folder.path());

    // Act
    let created = core.create_with(&token)["result"].clone();
    let listed = core.request("projects.list", json!({}));
    let activated = core.request("projects.setActive", json!({ "projectId": created["id"] }));
    let active = core.request("projects.getActive", json!({}));

    // Assert
    assert_eq!(created["folders"][0]["kind"], json!("plain"));
    assert_eq!(created["folders"][0]["status"], json!("ok"));
    assert_eq!(listed["result"]["projects"][0]["name"], json!("Demo"));
    assert_eq!(activated["result"], Value::Null);
    assert_eq!(active["result"]["activeProjectId"], created["id"]);
}

#[test]
fn should_answer_the_folder_path_to_the_shell() {
    // Arrange
    let mut core = ProjectsCore::start();
    let folder = tempfile::tempdir().unwrap();
    let folder_ref = core.project_of(folder.path());

    // Act
    let answer = core.request("projects.folderPath", folder_ref);

    // Assert
    assert_eq!(
        Path::new(answer["result"]["path"].as_str().unwrap())
            .canonicalize()
            .unwrap(),
        folder.path().canonicalize().unwrap()
    );
}

#[test]
fn should_answer_bad_request_for_an_unknown_request_key() {
    // Arrange
    let mut core = ProjectsCore::start();

    // Act
    let answer = core.request(
        "projects.get",
        json!({ "projectId": UNKNOWN_PROJECT, "path": "/etc" }),
    );

    // Assert
    assert_eq!(error_data_code(&answer), &json!("BAD_REQUEST"));
}

#[test]
fn should_answer_bad_request_for_an_id_containing_a_path_separator() {
    // Arrange
    let mut core = ProjectsCore::start();

    // Act
    let answer = core.request("projects.get", json!({ "projectId": "p-1/../../etc" }));

    // Assert
    assert_eq!(error_data_code(&answer), &json!("BAD_REQUEST"));
}

#[test]
fn should_answer_bad_request_for_a_commit_hash_that_is_not_lowercase_hex() {
    // Arrange
    let mut core = ProjectsCore::start();
    let folder = tempfile::tempdir().unwrap();
    let mut params = core.project_of(folder.path());
    params["hash"] = json!("--output=x");

    // Act
    let answer = core.request("projects.resolveCommit", params);

    // Assert
    assert_eq!(error_data_code(&answer), &json!("BAD_REQUEST"));
}

#[test]
fn should_answer_token_expired_for_a_reused_token() {
    // Arrange
    let mut core = ProjectsCore::start();
    let folder = tempfile::tempdir().unwrap();
    let token = core.pick(folder.path());
    let first = core.create_with(&token);

    // Act
    let second = core.create_with(&token);

    // Assert
    assert!(first.get("result").is_some(), "{first}");
    assert_eq!(error_data_code(&second), &json!("TOKEN_EXPIRED"));
}

#[test]
fn should_refuse_a_source_file_larger_than_the_limit() {
    // Arrange
    let mut core = ProjectsCore::start();
    let folder = tempfile::tempdir().unwrap();
    let large = fs::File::create(folder.path().join("large.txt")).unwrap();
    large.set_len(SOURCE_FILE_LIMIT_BYTES + 1).unwrap();
    fs::write(folder.path().join("small.txt"), "fits").unwrap();
    let folder_ref = core.project_of(folder.path());

    // Act
    let too_large = core.source_file(&folder_ref, "large.txt");
    let small = core.source_file(&folder_ref, "small.txt");

    // Assert
    assert_eq!(error_data_code(&too_large), &json!("TOO_LARGE"));
    assert_eq!(small["result"]["location"]["sizeBytes"], json!(4));
}

#[test]
fn should_return_null_for_a_missing_source_file() {
    // Arrange
    let mut core = ProjectsCore::start();
    let folder = tempfile::tempdir().unwrap();
    let folder_ref = core.project_of(folder.path());

    // Act
    let answer = core.source_file(&folder_ref, "src/missing.ts");

    // Assert
    assert_eq!(answer["result"], json!({ "location": null }));
}

#[cfg(unix)]
#[test]
fn should_refuse_a_source_path_that_leaves_the_folder_through_a_symlink() {
    // Arrange
    let mut core = ProjectsCore::start();
    let folder = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    fs::write(outside.path().join("secret.txt"), "secret").unwrap();
    std::os::unix::fs::symlink(outside.path(), folder.path().join("escape")).unwrap();
    let folder_ref = core.project_of(folder.path());

    // Act
    let answer = core.source_file(&folder_ref, "escape/secret.txt");

    // Assert
    assert_eq!(error_data_code(&answer), &json!("NOT_ALLOWED"));
}
