mod support;

use codecharta_core::git::{GitFolder, GitProcess, GitService};
use codecharta_core::snapshots::nearest::{
    ResolutionCache, ResolutionFolder, ResolutionRequest, resolve_snapshot,
};
use codecharta_core_api::ids::{FolderId, ProjectId, SnapshotId};
use codecharta_core_api::methods::analysis::{AnalysisTarget, TargetKind};
use codecharta_core_api::methods::snapshots::{
    LatestReason, NoSnapshotReason, SnapshotRef, SnapshotRelation, SnapshotResolution,
    SnapshotSource, SnapshotSummary,
};
use codecharta_core_api::values::{CommitSha, FullCommit};
use tokio_util::sync::CancellationToken;

use support::{RecordingGit, TempRepo};

const CURRENT_PROFILE: &str = "c0ffee00";
const OTHER_PROFILE: &str = "0dd0dd00";
const MISSING_SHA: &str = "0123456789abcdef0123456789abcdef01234567";
const COUNT_ARG: &str = "--count";
const STREAM_ARG: &str = "--parents";
const EARLIER: &str = "2026-11-18T10:00:00Z";
const LATER: &str = "2026-11-18T11:00:00Z";
const LATEST: &str = "2026-11-18T12:00:00Z";

/// Snapshot summaries as the repository lists them; ids only have to be valid and distinct.
struct Snapshots {
    next_number: u32,
}

impl Snapshots {
    fn new() -> Self {
        Self { next_number: 0 }
    }

    fn next(&mut self) -> u32 {
        self.next_number += 1;
        self.next_number
    }

    fn analysed(&mut self, repo: &TempRepo, commit: &str, profile: &str) -> SnapshotSummary {
        self.analysed_at(repo, commit, profile, LATER)
    }

    fn analysed_at(
        &mut self,
        repo: &TempRepo,
        commit: &str,
        profile: &str,
        finished_at: &str,
    ) -> SnapshotSummary {
        SnapshotSummary {
            profile_hash: Some(profile.to_string()),
            target: Some(TargetKind::Commit),
            finished_at: Some(finished_at.to_string()),
            ..bound(
                &format!("{commit}-{profile}"),
                commit,
                &commit_date(repo, commit),
            )
        }
    }

    fn working_tree(
        &mut self,
        repo: &TempRepo,
        commit: Option<&str>,
        finished_at: &str,
    ) -> SnapshotSummary {
        let id = format!("worktree-20261118T{:09}Z-{CURRENT_PROFILE}", self.next());
        let base = match commit {
            Some(commit) => bound(&id, commit, &commit_date(repo, commit)),
            None => summary(&id),
        };
        SnapshotSummary {
            source: SnapshotSource::Analysed,
            dirty: true,
            profile_hash: Some(CURRENT_PROFILE.to_string()),
            target: Some(TargetKind::WorkingTree),
            finished_at: Some(finished_at.to_string()),
            ..base
        }
    }

    fn imported(
        &mut self,
        repo: &TempRepo,
        commit: Option<&str>,
        created_at: &str,
    ) -> SnapshotSummary {
        let id = format!("imported-{:016x}", self.next());
        let base = match commit {
            Some(commit) => bound(&id, commit, &commit_date(repo, commit)),
            None => summary(&id),
        };
        SnapshotSummary {
            source: SnapshotSource::Imported,
            created_at: created_at.to_string(),
            original_file_name: Some("map.cc.json".to_string()),
            ..base
        }
    }
}

fn summary(id: &str) -> SnapshotSummary {
    SnapshotSummary {
        snapshot_ref: SnapshotRef {
            project_id: ProjectId::try_from("p-1").expect("a project id"),
            folder_id: FolderId::try_from("f-1").expect("a folder id"),
            snapshot_id: SnapshotId::try_from(id).expect("a snapshot id"),
        },
        source: SnapshotSource::Analysed,
        created_at: EARLIER.to_string(),
        commit: None,
        short_commit: None,
        subject: None,
        commit_date: None,
        dirty: false,
        original_file_name: None,
        file_modified_at: None,
        map_bytes: 1,
        checksum: None,
        profile_hash: None,
        target: None,
        finished_at: None,
        duration_ms: None,
        not_in_map: Vec::new(),
    }
}

fn bound(id: &str, commit: &str, date: &str) -> SnapshotSummary {
    SnapshotSummary {
        commit: Some(FullCommit::try_from(commit).expect("a full commit")),
        short_commit: Some(commit[..7].to_string()),
        commit_date: Some(date.to_string()),
        ..summary(id)
    }
}

/// The committer date as the snapshot records write it; `None` when the repository lacks the commit.
fn commit_date(repo: &TempRepo, commit: &str) -> String {
    repo.try_git(&["show", "-s", "--format=%cI", commit])
        .map(|date| date.trim().to_string())
        .unwrap_or_default()
}

fn sha(text: &str) -> CommitSha {
    CommitSha::try_from(text.trim()).expect("a full sha")
}

fn commit_target(commit: &str) -> AnalysisTarget {
    AnalysisTarget::Commit { sha: sha(commit) }
}

fn revision(repo: &TempRepo, name: &str) -> String {
    repo.git(&["rev-parse", name]).trim().to_string()
}

async fn resolve_with(
    process: &dyn GitProcess,
    repo: &TempRepo,
    request: &ResolutionRequest<'_>,
    cache: &ResolutionCache,
) -> SnapshotResolution {
    let service = GitService::new(process, repo.data_dir());
    resolve_snapshot(&service, cache, request, &CancellationToken::new())
        .await
        .expect("the resolution succeeds")
}

async fn resolve(
    repo: &TempRepo,
    target: &AnalysisTarget,
    snapshots: &[SnapshotSummary],
) -> SnapshotResolution {
    let folder = GitFolder::at(repo.path());
    let request = ResolutionRequest {
        folder: ResolutionFolder::Git(&folder),
        target,
        snapshots,
        current_profile_hash: Some(CURRENT_PROFILE),
    };
    resolve_with(&repo.runner(), repo, &request, &ResolutionCache::default()).await
}

fn exact(snapshot: &SnapshotSummary, is_current_profile: bool) -> SnapshotResolution {
    SnapshotResolution::Exact {
        snapshot: snapshot.clone(),
        is_current_profile,
    }
}

fn nearest(
    snapshot: &SnapshotSummary,
    relation: SnapshotRelation,
    behind: u32,
    ahead: u32,
) -> SnapshotResolution {
    SnapshotResolution::Nearest {
        snapshot: snapshot.clone(),
        is_current_profile: snapshot.profile_hash.as_deref() == Some(CURRENT_PROFILE),
        relation,
        behind,
        ahead,
    }
}

fn none(reason: NoSnapshotReason) -> SnapshotResolution {
    SnapshotResolution::None { reason }
}

/// Root, then `side` with one commit and `main` with one commit; answers (root, main, side).
fn sibling_branches() -> (TempRepo, String, String, String) {
    let repo = TempRepo::new();
    let root = repo.commit("Root", &[("a.txt", "a")]);
    repo.branch("side");
    let main = repo.commit("Main", &[("main.txt", "main")]);
    repo.checkout("side");
    let side = repo.commit("Side", &[("side.txt", "side")]);
    repo.checkout("main");
    (repo, root, main, side)
}

#[tokio::test]
async fn should_return_exact() {
    // Arrange
    let repo = TempRepo::new();
    let head = repo.linear_history(3);
    let mut snapshots = Snapshots::new();
    let analysed = snapshots.analysed(&repo, &head, CURRENT_PROFILE);

    // Act
    let resolution = resolve(
        &repo,
        &commit_target(&head),
        std::slice::from_ref(&analysed),
    )
    .await;

    // Assert
    assert_eq!(resolution, exact(&analysed, true));
}

#[tokio::test]
async fn should_return_the_first_analysed_ancestor_on_linear_history_with_the_right_count_and_without_a_count_call()
 {
    // Arrange
    let repo = TempRepo::new();
    let head = repo.linear_history(20);
    let mut snapshots = Snapshots::new();
    let closer = snapshots.analysed(&repo, &revision(&repo, "HEAD~7"), CURRENT_PROFILE);
    let farther = snapshots.analysed(&repo, &revision(&repo, "HEAD~12"), CURRENT_PROFILE);
    let runner = RecordingGit::new(repo.runner());
    let folder = GitFolder::at(repo.path());
    let target = commit_target(&head);
    let listed = [farther, closer.clone()];
    let request = ResolutionRequest {
        folder: ResolutionFolder::Git(&folder),
        target: &target,
        snapshots: &listed,
        current_profile_hash: Some(CURRENT_PROFILE),
    };

    // Act
    let resolution = resolve_with(&runner, &repo, &request, &ResolutionCache::default()).await;

    // Assert
    assert_eq!(
        resolution,
        nearest(&closer, SnapshotRelation::Ancestor, 7, 0)
    );
    assert!(runner.runs_of(COUNT_ARG).is_empty());
}

#[tokio::test]
async fn should_pick_the_smaller_count_when_two_analysed_ancestors_sit_on_both_sides_of_a_merge() {
    // Arrange
    let repo = TempRepo::new();
    repo.commit("Root", &[("a.txt", "a")]);
    repo.branch("side");
    repo.commit("Main 1", &[("main.txt", "1")]);
    let main_tip = repo.commit("Main 2", &[("main.txt", "2")]);
    repo.checkout("side");
    let side_start = repo.commit("Side 1", &[("side.txt", "1")]);
    for number in 2..=5 {
        repo.commit(
            &format!("Side {number}"),
            &[("side.txt", &number.to_string())],
        );
    }
    repo.checkout("main");
    let merge = repo.merge(&["side"], "Merge side");
    let mut snapshots = Snapshots::new();
    let met_first_but_farther = snapshots.analysed(&repo, &side_start, CURRENT_PROFILE);
    let closer = snapshots.analysed(&repo, &main_tip, CURRENT_PROFILE);

    // Act
    let resolution = resolve(
        &repo,
        &commit_target(&merge),
        &[met_first_but_farther, closer.clone()],
    )
    .await;

    // Assert
    assert_eq!(
        resolution,
        nearest(&closer, SnapshotRelation::Ancestor, 6, 0)
    );
}

#[tokio::test]
async fn should_return_descendant_when_only_a_later_commit_is_analysed() {
    // Arrange
    let repo = TempRepo::new();
    let head = repo.linear_history(10);
    let mut snapshots = Snapshots::new();
    let later = snapshots.analysed(&repo, &head, CURRENT_PROFILE);

    // Act
    let resolution = resolve(
        &repo,
        &commit_target(&revision(&repo, "HEAD~3")),
        std::slice::from_ref(&later),
    )
    .await;

    // Assert
    assert_eq!(
        resolution,
        nearest(&later, SnapshotRelation::Descendant, 0, 3)
    );
}

#[tokio::test]
async fn should_return_diverged_with_behind_and_ahead_for_a_sibling_branch() {
    // Arrange
    let (repo, _root, main, _side) = sibling_branches();
    repo.checkout("side");
    let side_tip = repo.commit("Side 2", &[("side.txt", "2")]);
    repo.checkout("main");
    let mut snapshots = Snapshots::new();
    let sibling = snapshots.analysed(&repo, &side_tip, CURRENT_PROFILE);

    // Act
    let resolution = resolve(&repo, &commit_target(&main), std::slice::from_ref(&sibling)).await;

    // Assert
    assert_eq!(
        resolution,
        nearest(&sibling, SnapshotRelation::Diverged, 1, 2)
    );
}

#[tokio::test]
async fn should_prefer_a_descendant_over_a_closer_diverged_snapshot() {
    // Arrange
    let (repo, _root, main, side) = sibling_branches();
    for number in 2..=6 {
        repo.commit(
            &format!("Main {number}"),
            &[("main.txt", &number.to_string())],
        );
    }
    let main_tip = revision(&repo, "HEAD");
    let mut snapshots = Snapshots::new();
    let closer_sibling = snapshots.analysed(&repo, &side, CURRENT_PROFILE);
    let descendant = snapshots.analysed(&repo, &main_tip, CURRENT_PROFILE);

    // Act
    let resolution = resolve(
        &repo,
        &commit_target(&main),
        &[closer_sibling, descendant.clone()],
    )
    .await;

    // Assert
    assert_eq!(
        resolution,
        nearest(&descendant, SnapshotRelation::Descendant, 0, 5)
    );
}

#[tokio::test]
async fn should_skip_snapshots_of_unrelated_or_missing_commits() {
    // Arrange
    let (repo, _root, main, side) = sibling_branches();
    repo.git(&["checkout", "--quiet", "--orphan", "unrelated"]);
    let unrelated = repo.commit("Unrelated", &[("other.txt", "other")]);
    repo.checkout("main");
    let mut snapshots = Snapshots::new();
    let of_unrelated = snapshots.analysed(&repo, &unrelated, CURRENT_PROFILE);
    let of_missing = snapshots.analysed(&repo, MISSING_SHA, CURRENT_PROFILE);
    let sibling = snapshots.analysed(&repo, &side, CURRENT_PROFILE);
    let skipped_only = [of_unrelated.clone(), of_missing.clone()];

    // Act
    let with_sibling = resolve(
        &repo,
        &commit_target(&main),
        &[of_unrelated, of_missing, sibling.clone()],
    )
    .await;
    let without_sibling = resolve(&repo, &commit_target(&main), &skipped_only).await;

    // Assert
    assert_eq!(
        with_sibling,
        nearest(&sibling, SnapshotRelation::Diverged, 1, 1)
    );
    assert_eq!(without_sibling, none(NoSnapshotReason::Unrelated));
}

#[tokio::test]
async fn should_return_none_without_snapshots() {
    // Arrange
    let repo = TempRepo::new();
    let head = repo.linear_history(2);

    // Act
    let for_commit = resolve(&repo, &commit_target(&head), &[]).await;
    let for_working_tree = resolve(&repo, &AnalysisTarget::WorkingTree, &[]).await;

    // Assert
    assert_eq!(for_commit, none(NoSnapshotReason::NoSnapshots));
    assert_eq!(for_working_tree, none(NoSnapshotReason::NoSnapshots));
}

#[tokio::test]
async fn should_return_none_for_a_commit_the_repository_does_not_have() {
    // Arrange
    let repo = TempRepo::new();
    let head = repo.linear_history(2);
    let mut snapshots = Snapshots::new();
    let analysed = snapshots.analysed(&repo, &head, CURRENT_PROFILE);

    // Act
    let resolution = resolve(&repo, &commit_target(MISSING_SHA), &[analysed]).await;

    // Assert
    assert_eq!(resolution, none(NoSnapshotReason::UnknownCommit));
}

#[tokio::test]
async fn should_resolve_the_working_tree_to_its_own_snapshot_else_through_head() {
    // Arrange
    let repo = TempRepo::new();
    let head = repo.linear_history(5);
    let parent = revision(&repo, "HEAD~1");
    let mut snapshots = Snapshots::new();
    let of_parent = snapshots.analysed(&repo, &parent, CURRENT_PROFILE);
    let older_checkout = snapshots.working_tree(&repo, Some(&head), EARLIER);
    let newer_checkout = snapshots.working_tree(&repo, Some(&head), LATER);
    let checkout_of_parent = snapshots.working_tree(&repo, Some(&parent), LATEST);

    // Act
    let own = resolve(
        &repo,
        &AnalysisTarget::WorkingTree,
        &[
            of_parent.clone(),
            older_checkout,
            newer_checkout.clone(),
            checkout_of_parent.clone(),
        ],
    )
    .await;
    let through_head = resolve(
        &repo,
        &AnalysisTarget::WorkingTree,
        &[of_parent.clone(), checkout_of_parent],
    )
    .await;

    // Assert
    assert_eq!(own, exact(&newer_checkout, true));
    assert_eq!(
        through_head,
        nearest(&of_parent, SnapshotRelation::Ancestor, 1, 0)
    );
}

#[tokio::test]
async fn should_return_latest_for_a_plain_folder() {
    // Arrange
    let repo = TempRepo::new();
    let mut snapshots = Snapshots::new();
    let older = snapshots.working_tree(&repo, None, EARLIER);
    let newer = snapshots.working_tree(&repo, None, LATER);
    let import = snapshots.imported(&repo, None, LATEST);
    let listed = [older, newer.clone(), import];
    let request = ResolutionRequest {
        folder: ResolutionFolder::Plain,
        target: &AnalysisTarget::WorkingTree,
        snapshots: &listed,
        current_profile_hash: Some(CURRENT_PROFILE),
    };

    // Act
    let resolution =
        resolve_with(&repo.runner(), &repo, &request, &ResolutionCache::default()).await;

    // Assert
    assert_eq!(
        resolution,
        SnapshotResolution::Latest {
            snapshot: newer,
            reason: LatestReason::PlainFolder,
        }
    );
}

#[tokio::test]
async fn should_return_latest_for_a_plain_folder_with_only_imports() {
    // Arrange
    let repo = TempRepo::new();
    let mut snapshots = Snapshots::new();
    let older = snapshots.imported(&repo, None, EARLIER);
    let newer = snapshots.imported(&repo, None, LATER);
    let listed = [newer.clone(), older];
    let request = ResolutionRequest {
        folder: ResolutionFolder::Plain,
        target: &AnalysisTarget::WorkingTree,
        snapshots: &listed,
        current_profile_hash: Some(CURRENT_PROFILE),
    };

    // Act
    let resolution =
        resolve_with(&repo.runner(), &repo, &request, &ResolutionCache::default()).await;

    // Assert
    assert_eq!(
        resolution,
        SnapshotResolution::Latest {
            snapshot: newer,
            reason: LatestReason::PlainFolder,
        }
    );
}

#[tokio::test]
async fn should_prefer_the_current_profile_for_equal_commits() {
    // Arrange
    let repo = TempRepo::new();
    let head = repo.linear_history(2);
    let mut snapshots = Snapshots::new();
    let current = snapshots.analysed_at(&repo, &head, CURRENT_PROFILE, EARLIER);
    let other_but_newer = snapshots.analysed_at(&repo, &head, OTHER_PROFILE, LATEST);

    // Act
    let resolution = resolve(
        &repo,
        &commit_target(&head),
        &[other_but_newer, current.clone()],
    )
    .await;

    // Assert
    assert_eq!(resolution, exact(&current, true));
}

#[tokio::test]
async fn should_treat_a_commit_bound_import_as_exact_and_as_nearest_ancestor_and_prefer_an_analysed_one_at_equal_profile()
 {
    // Arrange
    let repo = TempRepo::new();
    let head = repo.linear_history(5);
    let grandparent = revision(&repo, "HEAD~2");
    let mut snapshots = Snapshots::new();
    let import_at_head = snapshots.imported(&repo, Some(&head), LATEST);
    let import_at_grandparent = snapshots.imported(&repo, Some(&grandparent), LATEST);
    let analysed_other_profile = snapshots.analysed_at(&repo, &head, OTHER_PROFILE, EARLIER);

    // Act
    let as_exact = resolve(
        &repo,
        &commit_target(&head),
        std::slice::from_ref(&import_at_head),
    )
    .await;
    let as_ancestor = resolve(
        &repo,
        &commit_target(&head),
        std::slice::from_ref(&import_at_grandparent),
    )
    .await;
    let beside_analysed = resolve(
        &repo,
        &commit_target(&head),
        &[import_at_head.clone(), analysed_other_profile.clone()],
    )
    .await;

    // Assert
    assert_eq!(as_exact, exact(&import_at_head, false));
    assert_eq!(
        as_ancestor,
        nearest(&import_at_grandparent, SnapshotRelation::Ancestor, 2, 0)
    );
    assert_eq!(beside_analysed, exact(&analysed_other_profile, false));
}

#[tokio::test]
async fn should_never_return_an_unbound_import_for_a_commit_or_for_the_working_tree_of_a_git_folder()
 {
    // Arrange
    let repo = TempRepo::new();
    let head = repo.linear_history(2);
    let mut snapshots = Snapshots::new();
    let unbound = [snapshots.imported(&repo, None, LATEST)];

    // Act
    let for_commit = resolve(&repo, &commit_target(&head), &unbound).await;
    let for_working_tree = resolve(&repo, &AnalysisTarget::WorkingTree, &unbound).await;

    // Assert
    assert_eq!(for_commit, none(NoSnapshotReason::NoSnapshots));
    assert_eq!(for_working_tree, none(NoSnapshotReason::NoSnapshots));
}

#[tokio::test]
async fn should_serve_a_repeated_call_from_the_cache_and_miss_after_the_set_changed() {
    // Arrange
    let repo = TempRepo::new();
    let head = repo.linear_history(10);
    let mut snapshots = Snapshots::new();
    let before = [snapshots.analysed(&repo, &revision(&repo, "HEAD~4"), CURRENT_PROFILE)];
    let after = [
        before[0].clone(),
        snapshots.analysed(&repo, &revision(&repo, "HEAD~2"), CURRENT_PROFILE),
    ];
    let runner = RecordingGit::new(repo.runner());
    let folder = GitFolder::at(repo.path());
    let target = commit_target(&head);
    let cache = ResolutionCache::default();
    let request_for = |listed| ResolutionRequest {
        folder: ResolutionFolder::Git(&folder),
        target: &target,
        snapshots: listed,
        current_profile_hash: Some(CURRENT_PROFILE),
    };

    // Act
    let first = resolve_with(&runner, &repo, &request_for(&before), &cache).await;
    let repeated = resolve_with(&runner, &repo, &request_for(&before), &cache).await;
    let walks_before_the_change = runner.runs_of(STREAM_ARG).len();
    let changed = resolve_with(&runner, &repo, &request_for(&after), &cache).await;

    // Assert
    assert_eq!(first, repeated);
    assert_eq!(walks_before_the_change, 1);
    assert_eq!(runner.runs_of(STREAM_ARG).len(), 2);
    assert_eq!(
        changed,
        nearest(&after[1], SnapshotRelation::Ancestor, 2, 0)
    );
}
