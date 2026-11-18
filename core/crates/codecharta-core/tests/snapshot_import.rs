mod support;

use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use codecharta_core::CoreError;
use codecharta_core::projects::tokens::PickTokens;
use codecharta_core::snapshots::ImportRequest;
use codecharta_core_api::methods::projects::FolderRef;
use codecharta_core_api::methods::snapshots::SnapshotSource;
use codecharta_core_api::values::FullCommit;
use flate2::Compression;
use flate2::read::GzDecoder;
use flate2::write::GzEncoder;
use serde_json::Value;
use support::{StoreWorkspace, folder_ref};

const MAP: &str = r#"{"projectName":"demo","apiVersion":"1.5","nodes":[]}"#;
const UNKNOWN_COMMIT: &str = "0000000000000000000000000000000000000000";

fn gzip(content: &str) -> Vec<u8> {
    let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
    encoder
        .write_all(content.as_bytes())
        .expect("the content is compressed");
    encoder.finish().expect("the gzip stream ends")
}

fn gunzip(bytes: &[u8]) -> String {
    let mut content = String::new();
    GzDecoder::new(bytes)
        .read_to_string(&mut content)
        .expect("the stored map is gzip");
    content
}

fn write_file(folder: &Path, name: &str, content: &[u8]) -> PathBuf {
    let file = folder.join(name);
    fs::write(&file, content).expect("the file is written");
    file
}

fn request(target: &FolderRef, file: &Path, bind_to_commit: Option<FullCommit>) -> ImportRequest {
    ImportRequest {
        target: target.clone(),
        file: file.to_path_buf(),
        bind_to_commit,
    }
}

fn stored_snapshot_dir(workspace: &StoreWorkspace, folder: &FolderRef, id: &str) -> PathBuf {
    workspace.snapshots_dir(folder).join(id)
}

#[tokio::test]
async fn should_gzip_a_plain_json_file_on_import() {
    // Arrange
    let workspace = StoreWorkspace::new();
    let project = workspace.project_of(&[workspace.repo.path()]).await;
    let folder = folder_ref(&project, 0);
    let maps = tempfile::tempdir().unwrap();
    let file = write_file(maps.path(), "sample.cc.json", MAP.as_bytes());

    // Act
    let outcome = workspace
        .snapshots()
        .import_file(request(&folder, &file, None))
        .await
        .unwrap();

    // Assert
    let id = outcome.snapshot.snapshot_ref.snapshot_id.to_string();
    assert!(
        id.starts_with("imported-") && id.len() == "imported-".len() + 16,
        "{id}"
    );
    let stored =
        fs::read(stored_snapshot_dir(&workspace, &folder, &id).join("map.cc.json.gz")).unwrap();
    assert_eq!(gunzip(&stored), MAP);
    assert_eq!(outcome.snapshot.map_bytes, stored.len() as u64);
    assert!(!outcome.was_already_imported);
}

#[tokio::test]
async fn should_copy_a_gzip_file_unchanged() {
    // Arrange
    let workspace = StoreWorkspace::new();
    let project = workspace.project_of(&[workspace.repo.path()]).await;
    let folder = folder_ref(&project, 0);
    let maps = tempfile::tempdir().unwrap();
    let zipped = gzip(MAP);
    let file = write_file(maps.path(), "sample.cc.json.gz", &zipped);

    // Act
    let outcome = workspace
        .snapshots()
        .import_file(request(&folder, &file, None))
        .await
        .unwrap();

    // Assert
    let id = outcome.snapshot.snapshot_ref.snapshot_id.to_string();
    let stored =
        fs::read(stored_snapshot_dir(&workspace, &folder, &id).join("map.cc.json.gz")).unwrap();
    assert_eq!(stored, zipped);
}

#[tokio::test]
async fn should_record_the_file_date_as_a_hint_and_no_analysis_time() {
    // Arrange
    let workspace = StoreWorkspace::new();
    let project = workspace.project_of(&[workspace.repo.path()]).await;
    let folder = folder_ref(&project, 0);
    let maps = tempfile::tempdir().unwrap();
    let file = write_file(maps.path(), "sample.cc.json", MAP.as_bytes());
    let modified = fs::metadata(&file).unwrap().modified().unwrap();

    // Act
    let outcome = workspace
        .snapshots()
        .import_file(request(&folder, &file, None))
        .await
        .unwrap();

    // Assert
    let summary = &outcome.snapshot;
    let id = summary.snapshot_ref.snapshot_id.to_string();
    let record: Value = serde_json::from_slice(
        &fs::read(stored_snapshot_dir(&workspace, &folder, &id).join("snapshot.json")).unwrap(),
    )
    .unwrap();
    let expected_date = humantime::format_rfc3339_seconds(modified).to_string();
    assert_eq!(summary.source, SnapshotSource::Imported);
    assert_eq!(
        summary.file_modified_at.as_deref(),
        Some(expected_date.as_str())
    );
    assert_eq!(
        summary.original_file_name.as_deref(),
        Some("sample.cc.json")
    );
    assert_eq!(record["source"], "imported");
    assert!(record["analysis"].is_null());
    assert!(record["git"].is_null());
    assert_eq!(record["imported"]["fileModifiedAt"], expected_date.as_str());
    assert_eq!(record["imported"]["at"], record["createdAt"]);
    assert_eq!(
        record["imported"]["contentSha256"].as_str().unwrap().len(),
        64
    );
    assert!(record["map"]["checksum"].is_null());
}

#[tokio::test]
async fn should_return_the_existing_snapshot_when_the_same_content_is_imported_twice_into_a_project()
 {
    // Arrange
    let workspace = StoreWorkspace::new();
    let other_folder = tempfile::tempdir().unwrap();
    let project = workspace
        .project_of(&[workspace.repo.path(), other_folder.path()])
        .await;
    let maps = tempfile::tempdir().unwrap();
    let plain = write_file(maps.path(), "sample.cc.json", MAP.as_bytes());
    let zipped = write_file(maps.path(), "copy.cc.json.gz", &gzip(MAP));
    let first = workspace
        .snapshots()
        .import_file(request(&folder_ref(&project, 0), &plain, None))
        .await
        .unwrap();

    // Act
    let second = workspace
        .snapshots()
        .import_file(request(&folder_ref(&project, 1), &zipped, None))
        .await
        .unwrap();

    // Assert
    assert!(second.was_already_imported);
    assert_eq!(second.snapshot, first.snapshot);
    assert!(!workspace.snapshots_dir(&folder_ref(&project, 1)).exists());
}

#[tokio::test]
async fn should_record_git_facts_when_bound_to_an_existing_commit() {
    // Arrange
    let workspace = StoreWorkspace::new();
    workspace
        .repo
        .add_remote("origin", "https://token@example.invalid/owner/repo.git");
    let parent = workspace.repo.git(&["rev-parse", "HEAD"]);
    let commit = workspace.repo.commit_file("b.txt", "b", "Add b");
    let project = workspace.project_of(&[workspace.repo.path()]).await;
    let folder = folder_ref(&project, 0);
    let maps = tempfile::tempdir().unwrap();
    let file = write_file(maps.path(), "sample.cc.json", MAP.as_bytes());
    let commit = FullCommit::try_from(commit).unwrap();

    // Act
    let outcome = workspace
        .snapshots()
        .import_file(request(&folder, &file, Some(commit.clone())))
        .await
        .unwrap();

    // Assert
    let id = outcome.snapshot.snapshot_ref.snapshot_id.to_string();
    assert!(id.starts_with(&format!("{commit}-imported-")), "{id}");
    let record: Value = serde_json::from_slice(
        &fs::read(stored_snapshot_dir(&workspace, &folder, &id).join("snapshot.json")).unwrap(),
    )
    .unwrap();
    let git = &record["git"];
    assert_eq!(git["commit"], commit.as_str());
    assert_eq!(git["subject"], "Add b");
    assert_eq!(git["authorName"], "Ada Tester");
    assert_eq!(git["parents"], serde_json::json!([parent]));
    assert!(
        git["commitDate"]
            .as_str()
            .unwrap()
            .starts_with("2026-01-02T03:04:05")
    );
    assert_eq!(git["dirty"], false);
    assert_eq!(git["branchesAtRun"], serde_json::json!([]));
    assert!(git["headAtRun"].is_null());
    assert_eq!(
        git["remotes"],
        serde_json::json!([{ "name": "origin", "url": "https://example.invalid/owner/repo.git" }])
    );
    assert_eq!(outcome.snapshot.commit.as_ref(), Some(&commit));
}

#[tokio::test]
async fn should_answer_not_a_commit_for_an_unknown_commit() {
    // Arrange
    let workspace = StoreWorkspace::new();
    let project = workspace.project_of(&[workspace.repo.path()]).await;
    let folder = folder_ref(&project, 0);
    let maps = tempfile::tempdir().unwrap();
    let file = write_file(maps.path(), "sample.cc.json", MAP.as_bytes());
    let unknown = FullCommit::try_from(UNKNOWN_COMMIT).unwrap();

    // Act
    let result = workspace
        .snapshots()
        .import_file(request(&folder, &file, Some(unknown)))
        .await;

    // Assert
    assert!(
        matches!(result, Err(CoreError::NotACommit { .. })),
        "{result:?}"
    );
    assert!(workspace.snapshots().list(&folder).unwrap().is_empty());
}

#[tokio::test]
async fn should_answer_folder_unavailable_when_binding_in_a_plain_folder() {
    // Arrange
    let workspace = StoreWorkspace::new();
    let plain = tempfile::tempdir().unwrap();
    let project = workspace.project_of(&[plain.path()]).await;
    let maps = tempfile::tempdir().unwrap();
    let file = write_file(maps.path(), "sample.cc.json", MAP.as_bytes());
    let commit = FullCommit::try_from(workspace.repo.git(&["rev-parse", "HEAD"])).unwrap();

    // Act
    let result = workspace
        .snapshots()
        .import_file(request(&folder_ref(&project, 0), &file, Some(commit)))
        .await;

    // Assert
    assert!(
        matches!(result, Err(CoreError::FolderUnavailable(_))),
        "{result:?}"
    );
}

#[tokio::test]
async fn should_inspect_a_file_in_a_repository_that_is_already_a_project_folder() {
    // Arrange
    let workspace = StoreWorkspace::new();
    let commit = workspace.repo.git(&["rev-parse", "HEAD"]);
    let file_name = format!("{}.repo.cc.json", &commit[..7]);
    let file = write_file(workspace.repo.path(), &file_name, MAP.as_bytes());
    let project = workspace.project_of(&[workspace.repo.path()]).await;
    let first = workspace
        .snapshots()
        .import_file(request(&folder_ref(&project, 0), &file, None))
        .await
        .unwrap();
    let tokens = PickTokens::default();

    // Act
    let picked = workspace
        .snapshots()
        .inspect_import_file(&tokens, &file)
        .await
        .unwrap();

    // Assert
    assert_eq!(picked.file_name, file_name);
    assert_eq!(picked.size_bytes, MAP.len() as u64);
    assert_eq!(picked.commit_hint.unwrap().hash.as_str(), &commit[..7]);
    assert_eq!(picked.hint_commit.unwrap().commit.as_str(), commit);
    let target = picked.existing_target.unwrap();
    assert_eq!(target.project_id, project.id);
    assert_eq!(target.folder_id, project.folders[0].id);
    assert_eq!(picked.duplicate_of, Some(first.snapshot.snapshot_ref));
    assert!(tokens.take_file(&picked.import_token).is_ok());
    assert!(
        tokens
            .take_folder(&picked.containing_folder.pick_token)
            .is_ok()
    );
}

#[tokio::test]
async fn should_refuse_a_relative_path_to_inspect() {
    // Arrange
    let workspace = StoreWorkspace::new();
    let tokens = PickTokens::default();

    // Act
    let result = workspace
        .snapshots()
        .inspect_import_file(&tokens, Path::new("sample.cc.json"))
        .await;

    // Assert
    assert!(
        matches!(result, Err(CoreError::BadRequest(_))),
        "{result:?}"
    );
}
