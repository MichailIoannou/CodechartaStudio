mod support;

use codecharta_core::CoreResult;
use codecharta_core::git::log::{LogRequest, PAGE_SIZE};
use codecharta_core::git::{GitFolder, GitService};
use codecharta_core_api::error::ErrorCode;
use codecharta_core_api::methods::git::{GitLogFilter, GitLogPage, GitLogScope};
use codecharta_core_api::values::{FullRefName, LogCursor, LogFilterText, RepoRelativePath};
use tokio_util::sync::CancellationToken;

use support::{RecordingGit, TempRepo};

const OTHER_AUTHOR: &str = "--author=Bob Builder <bob@example.test>";

fn scope(scope: GitLogScope) -> LogRequest {
    LogRequest {
        scope,
        filter: None,
        cursor: None,
    }
}

fn filtered(filter: GitLogFilter) -> LogRequest {
    LogRequest {
        filter: Some(filter),
        ..scope(GitLogScope::All)
    }
}

fn no_filter() -> GitLogFilter {
    GitLogFilter {
        text: None,
        author: None,
        path: None,
    }
}

fn next(page: &GitLogPage) -> LogRequest {
    let cursor = page.next_cursor.clone().expect("another page follows");
    LogRequest {
        cursor: Some(LogCursor::try_from(cursor).expect("a valid cursor")),
        ..scope(GitLogScope::All)
    }
}

async fn log(
    service: &GitService<'_>,
    repo: &TempRepo,
    request: &LogRequest,
) -> CoreResult<GitLogPage> {
    service
        .log(
            &GitFolder::at(repo.path()),
            request,
            &CancellationToken::new(),
        )
        .await
}

fn subjects(page: &GitLogPage) -> Vec<&str> {
    page.commits
        .iter()
        .map(|commit| commit.subject.as_str())
        .collect()
}

fn commit_by_bob(repo: &TempRepo, message: &str) {
    repo.write_file("bob.txt", message);
    repo.git(&["add", "bob.txt"]);
    repo.git(&["commit", "--quiet", OTHER_AUTHOR, "--message", message]);
}

#[tokio::test]
async fn should_list_children_before_parents() {
    // Arrange
    let repo = TempRepo::new();
    repo.commit("Root", &[("a.txt", "a")]);
    repo.branch("side");
    repo.checkout("side");
    repo.commit("Side", &[("s.txt", "s")]);
    repo.checkout("main");
    repo.commit("Main", &[("m.txt", "m")]);
    repo.merge(&["side"], "Merge side");
    let runner = repo.runner();
    let service = GitService::new(&runner, repo.data_dir());

    // Act
    let page = log(&service, &repo, &scope(GitLogScope::All))
        .await
        .unwrap();

    // Assert
    assert_eq!(page.commits.len(), 4);
    for (index, commit) in page.commits.iter().enumerate() {
        let later = &page.commits[index + 1..];
        let earlier = &page.commits[..index];
        assert!(
            commit
                .parents
                .iter()
                .all(|parent| later.iter().any(|other| &other.sha == parent))
        );
        assert!(
            earlier
                .iter()
                .all(|other| !commit.parents.contains(&other.sha))
        );
    }
    assert_eq!(page.commits[0].subject, "Merge side");
    assert!(page.is_graph_available);
}

#[tokio::test]
async fn should_return_500_and_a_cursor_for_501_commits_then_the_rest() {
    // Arrange
    let repo = TempRepo::new();
    repo.linear_history(501);
    let runner = repo.runner();
    let service = GitService::new(&runner, repo.data_dir());

    // Act
    let first = log(&service, &repo, &scope(GitLogScope::Head))
        .await
        .unwrap();
    let second = log(&service, &repo, &next(&first)).await.unwrap();

    // Assert
    assert_eq!(first.commits.len(), PAGE_SIZE);
    assert_eq!(first.commits[0].subject, "Commit 500");
    assert_eq!(second.commits.len(), 1);
    assert_eq!(second.commits[0].subject, "Commit 0");
    assert_eq!(second.next_cursor, None);
}

#[tokio::test]
async fn should_return_the_same_second_page_after_a_branch_moved() {
    // Arrange
    let repo = TempRepo::new();
    repo.linear_history(600);
    let runner = repo.runner();
    let service = GitService::new(&runner, repo.data_dir());
    let first = log(&service, &repo, &scope(GitLogScope::All))
        .await
        .unwrap();
    let before = log(&service, &repo, &next(&first)).await.unwrap();

    // Act
    repo.commit("Moved on", &[("moved.txt", "moved")]);
    let after = log(&service, &repo, &next(&first)).await.unwrap();

    // Assert
    assert_eq!(after, before);
    assert_eq!(after.commits.len(), 100);
}

#[tokio::test]
async fn should_return_an_empty_page_without_commits() {
    // Arrange
    let repo = TempRepo::new();
    let runner = RecordingGit::new(repo.runner());
    let service = GitService::new(&runner, repo.data_dir());

    // Act
    let all = log(&service, &repo, &scope(GitLogScope::All))
        .await
        .unwrap();
    let head = log(&service, &repo, &scope(GitLogScope::Head))
        .await
        .unwrap();

    // Assert
    assert!(all.commits.is_empty() && head.commits.is_empty());
    assert_eq!(all.next_cursor, None);
    assert!(runner.runs_of("log").is_empty());
}

#[tokio::test]
async fn should_filter_by_text_ignoring_case_and_regex() {
    // Arrange
    let repo = TempRepo::new();
    repo.commit("Fix [parser] bug", &[("a.txt", "a")]);
    repo.commit("Fix parser docs", &[("b.txt", "b")]);
    let runner = repo.runner();
    let service = GitService::new(&runner, repo.data_dir());
    let filter = GitLogFilter {
        text: Some(LogFilterText::try_from("[PARSER]").unwrap()),
        ..no_filter()
    };

    // Act
    let page = log(&service, &repo, &filtered(filter)).await.unwrap();

    // Assert
    assert_eq!(subjects(&page), ["Fix [parser] bug"]);
    assert!(!page.is_graph_available);
}

#[tokio::test]
async fn should_filter_by_author() {
    // Arrange
    let repo = TempRepo::new();
    repo.commit("By Ada", &[("a.txt", "a")]);
    commit_by_bob(&repo, "By Bob");
    let runner = repo.runner();
    let service = GitService::new(&runner, repo.data_dir());
    let filter = GitLogFilter {
        author: Some(LogFilterText::try_from("bob builder").unwrap()),
        ..no_filter()
    };

    // Act
    let page = log(&service, &repo, &filtered(filter)).await.unwrap();

    // Assert
    assert_eq!(subjects(&page), ["By Bob"]);
    assert_eq!(page.commits[0].author_email, "bob@example.test");
}

#[tokio::test]
async fn should_filter_by_a_path_with_space_and_brackets_from_a_subfolder() {
    // Arrange
    let repo = TempRepo::new();
    repo.commit("Touch odd path", &[("docs/with space [1]/a.md", "a")]);
    repo.commit("Touch other", &[("docs/with space 1/a.md", "b")]);
    let runner = repo.runner();
    let service = GitService::new(&runner, repo.data_dir());
    let filter = GitLogFilter {
        path: Some(RepoRelativePath::try_from("docs/with space [1]").unwrap()),
        ..no_filter()
    };
    let subfolder = repo.subfolder("docs");

    // Act
    let page = service
        .log(
            &GitFolder::at(&subfolder),
            &filtered(filter),
            &CancellationToken::new(),
        )
        .await
        .unwrap();

    // Assert
    assert_eq!(subjects(&page), ["Touch odd path"]);
}

#[tokio::test]
async fn should_follow_a_single_branch_scope() {
    // Arrange
    let repo = TempRepo::new();
    repo.commit("Root", &[("a.txt", "a")]);
    repo.branch("side");
    repo.checkout("side");
    repo.commit("Side only", &[("s.txt", "s")]);
    repo.checkout("main");
    repo.commit("Main only", &[("m.txt", "m")]);
    let runner = repo.runner();
    let service = GitService::new(&runner, repo.data_dir());
    let side = FullRefName::try_from("refs/heads/side").unwrap();

    // Act
    let page = log(
        &service,
        &repo,
        &scope(GitLogScope::Refs {
            ref_names: vec![side],
        }),
    )
    .await
    .unwrap();

    // Assert
    assert_eq!(subjects(&page), ["Side only", "Root"]);
}

#[tokio::test]
async fn should_refuse_a_ref_the_repository_does_not_have() {
    // Arrange
    let repo = TempRepo::new();
    repo.commit("Root", &[("a.txt", "a")]);
    let runner = repo.runner();
    let service = GitService::new(&runner, repo.data_dir());
    let missing = FullRefName::try_from("refs/heads/missing").unwrap();

    // Act
    let error = log(
        &service,
        &repo,
        &scope(GitLogScope::Refs {
            ref_names: vec![missing],
        }),
    )
    .await
    .unwrap_err();

    // Assert
    assert_eq!(error.code(), ErrorCode::BadRequest);
}

#[tokio::test]
async fn should_fail_log_session_expired_for_an_unknown_cursor() {
    // Arrange
    let repo = TempRepo::new();
    repo.commit("Root", &[("a.txt", "a")]);
    let runner = repo.runner();
    let service = GitService::new(&runner, repo.data_dir());
    let request = LogRequest {
        cursor: Some(LogCursor::try_from("0123456789abcdef_500").unwrap()),
        ..scope(GitLogScope::All)
    };

    // Act
    let error = log(&service, &repo, &request).await.unwrap_err();

    // Assert
    assert_eq!(error.code(), ErrorCode::LogSessionExpired);
}

#[tokio::test]
async fn should_feed_the_tips_through_stdin() {
    // Arrange
    let repo = TempRepo::new();
    let root = repo.commit("Root", &[("a.txt", "a")]);
    repo.branch("side");
    repo.checkout("side");
    let side = repo.commit("Side", &[("s.txt", "s")]);
    let runner = RecordingGit::new(repo.runner());
    let service = GitService::new(&runner, repo.data_dir());
    let filter = GitLogFilter {
        path: Some(RepoRelativePath::try_from("s.txt").unwrap()),
        ..no_filter()
    };

    // Act
    log(&service, &repo, &filtered(filter)).await.unwrap();

    // Assert
    let logs = runner.runs_of("log");
    assert_eq!(logs.len(), 1);
    assert_eq!(
        logs[0].stdin.as_deref(),
        Some(format!("{root}\n{side}\n--\ns.txt\n").as_str())
    );
    assert!(logs[0].args.iter().any(|arg| arg == "--stdin"));
    assert!(
        !logs[0]
            .args
            .iter()
            .any(|arg| arg.to_string_lossy().contains(&side))
    );
}
