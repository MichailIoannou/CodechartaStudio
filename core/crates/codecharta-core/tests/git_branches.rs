mod support;

use std::fs;

use codecharta_core::git::branch::{BranchCreateRequest, BranchRenameRequest, SetUpstreamRequest};
use codecharta_core_api::error::ErrorCode;
use codecharta_core_api::methods::git::{
    ChangedPart, GitBranchDeleteTarget, GitHead, GitOperationResult, GitSwitchTarget,
};
use codecharta_core_api::values::{BranchName, CommitSha, FullRefName};
use tokio_util::sync::CancellationToken;

use support::TempRepo;
use support::git_operations::{OperationsHarness, code_of, context, detail_of, project_folder};

const END_OF_OPTIONS: &str = "--end-of-options";

fn ref_name(text: &str) -> FullRefName {
    FullRefName::try_from(text).expect("a full ref name")
}

fn branch_name(text: &str) -> BranchName {
    BranchName::try_from(text).expect("a branch name")
}

fn sha(text: &str) -> CommitSha {
    CommitSha::try_from(text).expect("a full sha")
}

fn local(name: &str) -> GitSwitchTarget {
    GitSwitchTarget::Local {
        ref_name: ref_name(&format!("refs/heads/{name}")),
    }
}

fn delete_local(name: &str, force: bool) -> GitBranchDeleteTarget {
    GitBranchDeleteTarget::Local {
        ref_name: ref_name(&format!("refs/heads/{name}")),
        force,
    }
}

fn current_branch(result: &GitOperationResult) -> String {
    match &result.status.head {
        GitHead::Branch { name, .. } => name.clone(),
        GitHead::Detached { commit } => panic!("detached at {commit}"),
    }
}

fn local_names(result: &GitOperationResult) -> Vec<String> {
    result
        .refs
        .local_branches
        .iter()
        .map(|branch| branch.name.clone())
        .collect()
}

/// `main` with `a.txt` and `b.txt`; `other` changes `a.txt` only.
fn repo_with_other_branch() -> TempRepo {
    let repo = TempRepo::new();
    repo.commit("Root", &[("a.txt", "a"), ("b.txt", "b")]);
    repo.branch("other");
    repo.checkout("other");
    repo.commit_file("a.txt", "a on other", "Other");
    repo.checkout("main");
    repo
}

#[tokio::test]
async fn should_switch_to_an_existing_branch() {
    // Arrange
    let repo = repo_with_other_branch();
    let (runner, harness) = (repo.runner(), OperationsHarness::default());
    let service = harness.service(&runner, repo.data_dir());
    let cancel = CancellationToken::new();

    // Act
    let result = service
        .switch(
            &project_folder(repo.path()),
            &local("other"),
            &context(&cancel),
        )
        .await
        .unwrap();

    // Assert
    assert_eq!(current_branch(&result), "other");
    assert_eq!(
        fs::read_to_string(repo.path().join("a.txt")).unwrap(),
        "a on other"
    );
}

#[tokio::test]
async fn should_carry_an_unrelated_local_change_over() {
    // Arrange
    let repo = repo_with_other_branch();
    repo.write_file("b.txt", "b changed here");
    let (runner, harness) = (repo.runner(), OperationsHarness::default());
    let service = harness.service(&runner, repo.data_dir());
    let cancel = CancellationToken::new();

    // Act
    let result = service
        .switch(
            &project_folder(repo.path()),
            &local("other"),
            &context(&cancel),
        )
        .await
        .unwrap();

    // Assert
    assert_eq!(current_branch(&result), "other");
    assert_eq!(result.status.counts.unstaged, 1);
    assert_eq!(
        fs::read_to_string(repo.path().join("b.txt")).unwrap(),
        "b changed here"
    );
}

#[tokio::test]
async fn should_leave_the_tree_untouched_with_gits_file_list_when_refused() {
    // Arrange
    let repo = repo_with_other_branch();
    repo.write_file("a.txt", "a changed here");
    let (runner, harness) = (repo.runner(), OperationsHarness::default());
    let service = harness.service(&runner, repo.data_dir());
    let cancel = CancellationToken::new();
    let folder = project_folder(repo.path());

    // Act
    let first = service
        .switch(&folder, &local("other"), &context(&cancel))
        .await;
    let second = service
        .switch(&folder, &local("other"), &context(&cancel))
        .await;

    // Assert
    assert_eq!(code_of(first), ErrorCode::LocalChangesWouldBeOverwritten);
    assert!(detail_of(second).contains("a.txt"));
    assert_eq!(repo.git(&["symbolic-ref", "--short", "HEAD"]), "main");
    assert_eq!(
        fs::read_to_string(repo.path().join("a.txt")).unwrap(),
        "a changed here"
    );
}

#[tokio::test]
async fn should_refuse_to_switch_during_a_merge() {
    // Arrange
    let repo = repo_with_other_branch();
    repo.commit_file("a.txt", "a on main", "Main");
    assert!(repo.try_git(&["merge", "--quiet", "other"]).is_none());
    let (runner, harness) = (repo.runner(), OperationsHarness::default());
    let service = harness.service(&runner, repo.data_dir());
    let cancel = CancellationToken::new();

    // Act
    let result = service
        .switch(
            &project_folder(repo.path()),
            &local("other"),
            &context(&cancel),
        )
        .await;

    // Assert
    assert_eq!(code_of(result), ErrorCode::OperationInProgress);
    assert_eq!(repo.git(&["symbolic-ref", "--short", "HEAD"]), "main");
}

#[tokio::test]
async fn should_refuse_a_branch_checked_out_in_another_worktree() {
    // Arrange
    let repo = repo_with_other_branch();
    let worktree = tempfile::tempdir().unwrap();
    let worktree_path = worktree.path().join("wt").to_string_lossy().into_owned();
    repo.git(&["worktree", "add", "--quiet", &worktree_path, "other"]);
    let (runner, harness) = (repo.runner(), OperationsHarness::default());
    let service = harness.service(&runner, repo.data_dir());
    let cancel = CancellationToken::new();
    let folder = project_folder(repo.path());

    // Act
    let switched = service
        .switch(&folder, &local("other"), &context(&cancel))
        .await;
    let deleted = service
        .branch_delete(&folder, &delete_local("other", true), &context(&cancel))
        .await;

    // Assert
    assert_eq!(code_of(switched), ErrorCode::BranchCheckedOutElsewhere);
    assert_eq!(code_of(deleted), ErrorCode::BranchCheckedOutElsewhere);
}

#[tokio::test]
async fn should_create_a_tracking_branch_from_a_remote_branch_and_refuse_an_existing_local_name() {
    // Arrange
    let repo = repo_with_other_branch().with_bare_origin();
    repo.git(&["push", "--quiet", "origin", "other:feature"]);
    let (runner, harness) = (repo.runner(), OperationsHarness::default());
    let service = harness.service(&runner, repo.data_dir());
    let cancel = CancellationToken::new();
    let folder = project_folder(repo.path());
    let track = |local_name: &str| GitSwitchTarget::TrackRemote {
        remote_ref_name: ref_name("refs/remotes/origin/feature"),
        local_name: branch_name(local_name),
    };

    // Act
    let tracked = service
        .switch(&folder, &track("feature"), &context(&cancel))
        .await
        .unwrap();
    let existing = service
        .switch(&folder, &track("other"), &context(&cancel))
        .await;

    // Assert
    assert_eq!(current_branch(&tracked), "feature");
    let upstream = tracked.status.upstream.expect("an upstream");
    assert_eq!(upstream.ref_name, "refs/remotes/origin/feature");
    assert_eq!(code_of(existing), ErrorCode::BranchExists);
}

#[tokio::test]
async fn should_create_a_branch_at_a_commit_without_touching_the_tree() {
    // Arrange
    let repo = TempRepo::new();
    let root = repo.commit_file("a.txt", "first", "Root");
    repo.commit_file("a.txt", "second", "Second");
    repo.write_file("a.txt", "local");
    let (runner, harness) = (repo.runner(), OperationsHarness::default());
    let service = harness.service(&runner, repo.data_dir());
    let cancel = CancellationToken::new();
    let request = BranchCreateRequest {
        name: branch_name("old-state"),
        start_point: sha(&root),
        checkout: false,
    };

    // Act
    let result = service
        .branch_create(&project_folder(repo.path()), &request, &context(&cancel))
        .await
        .unwrap();

    // Assert
    assert_eq!(current_branch(&result), "main");
    assert_eq!(repo.git(&["rev-parse", "refs/heads/old-state"]), root);
    assert_eq!(
        fs::read_to_string(repo.path().join("a.txt")).unwrap(),
        "local"
    );
    assert!(
        repo.try_git(&["config", "branch.old-state.merge"])
            .is_none()
    );
}

#[tokio::test]
async fn should_create_and_check_out_a_branch_and_refuse_an_unknown_start_point() {
    // Arrange
    let repo = TempRepo::new();
    let root = repo.commit_file("a.txt", "first", "Root");
    let (runner, harness) = (repo.runner(), OperationsHarness::default());
    let service = harness.service(&runner, repo.data_dir());
    let cancel = CancellationToken::new();
    let folder = project_folder(repo.path());
    let request = |name: &str, start_point: &str| BranchCreateRequest {
        name: branch_name(name),
        start_point: sha(start_point),
        checkout: true,
    };

    // Act
    let created = service
        .branch_create(&folder, &request("work", &root), &context(&cancel))
        .await
        .unwrap();
    let unknown = service
        .branch_create(
            &folder,
            &request("ghost", "0123456789abcdef0123456789abcdef01234567"),
            &context(&cancel),
        )
        .await;

    // Assert
    assert_eq!(current_branch(&created), "work");
    assert_eq!(code_of(unknown), ErrorCode::UnknownRevision);
}

#[tokio::test]
async fn should_keep_the_upstream_when_renaming() {
    // Arrange
    let repo = repo_with_other_branch().with_bare_origin();
    repo.git(&["push", "--quiet", "--set-upstream", "origin", "other"]);
    let (runner, harness) = (repo.runner(), OperationsHarness::default());
    let service = harness.service(&runner, repo.data_dir());
    let cancel = CancellationToken::new();
    let folder = project_folder(repo.path());
    let rename = |old_name: &str, new_name: &str| BranchRenameRequest {
        ref_name: ref_name(&format!("refs/heads/{old_name}")),
        new_name: branch_name(new_name),
    };

    // Act
    let renamed = service
        .branch_rename(&folder, &rename("other", "renamed"), &context(&cancel))
        .await
        .unwrap();
    let taken = service
        .branch_rename(&folder, &rename("renamed", "main"), &context(&cancel))
        .await;

    // Assert
    let branch = renamed
        .refs
        .local_branches
        .iter()
        .find(|branch| branch.name == "renamed")
        .expect("the renamed branch");
    let upstream = branch.upstream.as_ref().expect("the upstream stayed");
    assert_eq!(upstream.ref_name, "refs/remotes/origin/other");
    assert!(!local_names(&renamed).contains(&"other".to_string()));
    assert_eq!(code_of(taken), ErrorCode::BranchExists);
}

#[tokio::test]
async fn should_delete_a_merged_branch() {
    // Arrange
    let repo = TempRepo::new();
    repo.commit_file("a.txt", "a", "Root");
    repo.branch("merged");
    let (runner, harness) = (repo.runner(), OperationsHarness::default());
    let service = harness.service(&runner, repo.data_dir());
    let cancel = CancellationToken::new();

    // Act
    let result = service
        .branch_delete(
            &project_folder(repo.path()),
            &delete_local("merged", false),
            &context(&cancel),
        )
        .await
        .unwrap();

    // Assert
    assert_eq!(local_names(&result), vec!["main".to_string()]);
}

#[tokio::test]
async fn should_refuse_an_unmerged_branch_and_delete_it_only_with_force() {
    // Arrange
    let repo = repo_with_other_branch();
    let (runner, harness) = (repo.runner(), OperationsHarness::default());
    let service = harness.service(&runner, repo.data_dir());
    let cancel = CancellationToken::new();
    let folder = project_folder(repo.path());

    // Act
    let refused = service
        .branch_delete(&folder, &delete_local("other", false), &context(&cancel))
        .await;
    let still_there = repo.try_git(&["rev-parse", "--verify", "--quiet", "refs/heads/other"]);
    let forced = service
        .branch_delete(&folder, &delete_local("other", true), &context(&cancel))
        .await
        .unwrap();

    // Assert
    assert_eq!(code_of(refused), ErrorCode::BranchNotFullyMerged);
    assert!(still_there.is_some());
    assert_eq!(local_names(&forced), vec!["main".to_string()]);
}

#[tokio::test]
async fn should_refuse_to_delete_the_current_branch() {
    // Arrange
    let repo = repo_with_other_branch();
    let (runner, harness) = (repo.runner(), OperationsHarness::default());
    let service = harness.service(&runner, repo.data_dir());
    let cancel = CancellationToken::new();

    // Act
    let result = service
        .branch_delete(
            &project_folder(repo.path()),
            &delete_local("main", true),
            &context(&cancel),
        )
        .await;

    // Assert
    assert_eq!(code_of(result), ErrorCode::NotAllowed);
    assert_eq!(repo.git(&["symbolic-ref", "--short", "HEAD"]), "main");
}

#[tokio::test]
async fn should_delete_a_branch_on_the_remote() {
    // Arrange
    let repo = repo_with_other_branch().with_bare_origin();
    repo.git(&["push", "--quiet", "origin", "other"]);
    let (runner, harness) = (repo.runner(), OperationsHarness::default());
    let service = harness.service(&runner, repo.data_dir());
    let cancel = CancellationToken::new();
    let target = GitBranchDeleteTarget::Remote {
        remote_ref_name: ref_name("refs/remotes/origin/other"),
    };

    // Act
    let result = service
        .branch_delete(&project_folder(repo.path()), &target, &context(&cancel))
        .await
        .unwrap();

    // Assert
    let on_origin = repo.git(&["ls-remote", "--heads", "origin"]);
    assert!(!on_origin.contains("refs/heads/other"));
    assert!(on_origin.contains("refs/heads/main"));
    assert!(
        result
            .refs
            .remote_branches
            .iter()
            .all(|branch| branch.ref_name != "refs/remotes/origin/other")
    );
    assert!(local_names(&result).contains(&"other".to_string()));
}

#[tokio::test]
async fn should_set_and_unset_the_upstream() {
    // Arrange
    let repo = repo_with_other_branch().with_bare_origin();
    repo.git(&["push", "--quiet", "origin", "other"]);
    let (runner, harness) = (repo.runner(), OperationsHarness::default());
    let service = harness.service(&runner, repo.data_dir());
    let cancel = CancellationToken::new();
    let folder = project_folder(repo.path());
    let request = |upstream: Option<&str>| SetUpstreamRequest {
        ref_name: ref_name("refs/heads/other"),
        upstream: upstream.map(ref_name),
    };
    let upstream_of = |result: &GitOperationResult| {
        let branch = result
            .refs
            .local_branches
            .iter()
            .find(|branch| branch.name == "other");
        branch.and_then(|branch| branch.upstream.clone())
    };

    // Act
    let set = service
        .set_upstream(
            &folder,
            &request(Some("refs/remotes/origin/other")),
            &context(&cancel),
        )
        .await
        .unwrap();
    let unset = service
        .set_upstream(&folder, &request(None), &context(&cancel))
        .await
        .unwrap();

    // Assert
    let upstream = upstream_of(&set).expect("an upstream");
    assert_eq!(upstream.ref_name, "refs/remotes/origin/other");
    assert_eq!(upstream_of(&unset), None);
}

#[tokio::test]
async fn should_reject_invalid_names_and_ask_git_about_the_others() {
    // Arrange
    let repo = TempRepo::new();
    let root = repo.commit_file("a.txt", "a", "Root");
    let runner = support::RecordingGit::new(repo.runner());
    let harness = OperationsHarness::default();
    let service = harness.service(&runner, repo.data_dir());
    let cancel = CancellationToken::new();
    let invalid = ["-x", "a..b", "a@{1}", "HEAD", "@", "bell\u{7}", "new\nline"];
    let request = BranchCreateRequest {
        name: branch_name("x@"),
        start_point: sha(&root),
        checkout: false,
    };

    // Act
    let rejected: Vec<bool> = invalid
        .iter()
        .map(|name| BranchName::try_from(*name).is_err())
        .collect();
    let created = service
        .branch_create(&project_folder(repo.path()), &request, &context(&cancel))
        .await;

    // Assert
    assert_eq!(rejected, vec![true; invalid.len()]);
    assert!(local_names(&created.unwrap()).contains(&"x@".to_string()));
    let checks = runner.runs_of("check-ref-format");
    assert_eq!(checks.len(), 1);
    assert!(checks[0].args.iter().any(|arg| arg == "refs/heads/x@"));
}

#[tokio::test]
async fn should_announce_repository_changed_after_each_operation() {
    // Arrange
    let repo = repo_with_other_branch();
    let (runner, harness) = (repo.runner(), OperationsHarness::default());
    let service = harness.service(&runner, repo.data_dir());
    let mut changes = harness.subscribe();
    let cancel = CancellationToken::new();
    let folder = project_folder(repo.path());
    let rename = BranchRenameRequest {
        ref_name: ref_name("refs/heads/other"),
        new_name: branch_name("renamed"),
    };

    // Act
    let switched = service
        .switch(&folder, &local("other"), &context(&cancel))
        .await
        .unwrap();
    let refused = service
        .branch_delete(&folder, &delete_local("other", false), &context(&cancel))
        .await;
    service
        .switch(&folder, &local("main"), &context(&cancel))
        .await
        .unwrap();
    service
        .branch_rename(&folder, &rename, &context(&cancel))
        .await
        .unwrap();

    // Assert
    assert!(refused.is_err());
    let announced: Vec<_> = std::iter::from_fn(|| changes.try_recv().ok()).collect();
    assert_eq!(announced.len(), 4);
    assert_eq!(
        announced[0].fingerprint.as_deref(),
        Some(switched.refs.fingerprint.as_str())
    );
    assert!(
        announced
            .iter()
            .all(|changed| changed.parts == vec![ChangedPart::Status, ChangedPart::Refs])
    );
}

#[tokio::test]
async fn should_pass_end_of_options_before_every_ref() {
    // Arrange
    let repo = repo_with_other_branch().with_bare_origin();
    let root = repo.git(&["rev-parse", "HEAD"]);
    repo.git(&["push", "--quiet", "origin", "other"]);
    let runner = support::RecordingGit::new(repo.runner());
    let harness = OperationsHarness::default();
    let service = harness.service(&runner, repo.data_dir());
    let cancel = CancellationToken::new();
    let folder = project_folder(repo.path());
    let create = BranchCreateRequest {
        name: branch_name("fresh"),
        start_point: sha(&root),
        checkout: false,
    };
    let rename = BranchRenameRequest {
        ref_name: ref_name("refs/heads/fresh"),
        new_name: branch_name("renamed"),
    };
    let upstream = SetUpstreamRequest {
        ref_name: ref_name("refs/heads/renamed"),
        upstream: Some(ref_name("refs/remotes/origin/other")),
    };
    let remote = GitBranchDeleteTarget::Remote {
        remote_ref_name: ref_name("refs/remotes/origin/other"),
    };
    let names = [
        "other",
        "fresh",
        "renamed",
        "main",
        root.as_str(),
        "refs/heads/other",
    ];

    // Act
    service
        .branch_create(&folder, &create, &context(&cancel))
        .await
        .unwrap();
    service
        .branch_rename(&folder, &rename, &context(&cancel))
        .await
        .unwrap();
    service
        .set_upstream(&folder, &upstream, &context(&cancel))
        .await
        .unwrap();
    service
        .switch(&folder, &local("renamed"), &context(&cancel))
        .await
        .unwrap();
    service
        .branch_delete(&folder, &remote, &context(&cancel))
        .await
        .unwrap();
    service
        .switch(&folder, &local("main"), &context(&cancel))
        .await
        .unwrap();
    service
        .branch_delete(&folder, &delete_local("renamed", true), &context(&cancel))
        .await
        .unwrap();

    // Assert
    let mutations: Vec<Vec<String>> = ["switch", "branch", "push"]
        .iter()
        .flat_map(|subcommand| runner.runs_of(subcommand))
        .map(|invocation| {
            invocation
                .args
                .iter()
                .map(|arg| arg.to_string_lossy().into_owned())
                .collect()
        })
        .collect();
    assert_eq!(mutations.len(), 7);
    for args in &mutations {
        let end = args
            .iter()
            .position(|arg| arg == END_OF_OPTIONS)
            .unwrap_or_else(|| panic!("no {END_OF_OPTIONS} in {args:?}"));
        let named_before = args[..end].iter().any(|arg| names.contains(&arg.as_str()));
        assert!(!named_before, "a ref before {END_OF_OPTIONS} in {args:?}");
    }
}
