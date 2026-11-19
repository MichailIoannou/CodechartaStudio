use std::collections::HashMap;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::ops::ControlFlow;
use std::path::PathBuf;
use std::sync::{Mutex, PoisonError};
use std::time::UNIX_EPOCH;

use codecharta_core_api::error::ErrorCode;
use codecharta_core_api::methods::analysis::{AnalysisTarget, TargetKind};
use codecharta_core_api::methods::git::GitCommitDistance;
use codecharta_core_api::methods::snapshots::{
    LatestReason, NoSnapshotReason, SnapshotRelation, SnapshotResolution, SnapshotSource,
    SnapshotSummary,
};
use codecharta_core_api::values::{CommitSha, Revision};
use tokio_util::sync::CancellationToken;

use crate::error::{CoreError, CoreResult};
use crate::git::cache::LruCache;
use crate::git::query::{RevListRequest, WalkedCommit};
use crate::git::{GitFolder, GitService};

/// The walk for an analysed ancestor stops at this many candidates.
pub const MAX_CANDIDATES: usize = 10;
/// ... or this many commits after the first candidate.
pub const WALK_LIMIT_AFTER_FIRST_HIT: u64 = 20_000;
/// Without an analysed ancestor, the snapshots of this many newest commits are measured.
pub const MAX_FALLBACK_CANDIDATES: usize = 50;
const CACHED_RESOLUTIONS: usize = 64;
const HEAD: &str = "HEAD";
const DATE_TIME_LENGTH: usize = "2026-01-01T00:00:00".len();
const UTC_SUFFIX: &str = "Z";
const OFFSET_SEPARATOR: char = ':';
const SECONDS_PER_HOUR: i64 = 3600;
const SECONDS_PER_MINUTE: i64 = 60;

/// Where the snapshots come from: a folder without git, a repository, or a repository that is gone.
#[derive(Debug, Clone, Copy)]
pub enum ResolutionFolder<'folder> {
    Plain,
    Git(&'folder GitFolder),
    MissingGit,
}

/// What to resolve: `snapshots` are every snapshot of the folder, as the repository lists them.
#[derive(Debug, Clone, Copy)]
pub struct ResolutionRequest<'request> {
    pub folder: ResolutionFolder<'request>,
    pub target: &'request AnalysisTarget,
    pub snapshots: &'request [SnapshotSummary],
    pub current_profile_hash: Option<&'request str>,
}

/// Resolutions by repository, commit and snapshot set; the history behind a commit never changes, so
/// only a different set of snapshots makes an entry stale.
#[derive(Debug)]
pub struct ResolutionCache {
    resolutions: Mutex<LruCache<ResolutionKey, SnapshotResolution>>,
}

impl Default for ResolutionCache {
    fn default() -> Self {
        Self {
            resolutions: Mutex::new(LruCache::new(CACHED_RESOLUTIONS)),
        }
    }
}

impl ResolutionCache {
    fn get(&self, key: &ResolutionKey) -> Option<SnapshotResolution> {
        self.resolutions
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .get(key)
            .cloned()
    }

    fn insert(&self, key: ResolutionKey, resolution: SnapshotResolution) {
        self.resolutions
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .insert(key, resolution);
    }
}

#[derive(Debug, PartialEq)]
struct ResolutionKey {
    folder: PathBuf,
    target: TargetKind,
    commit: CommitSha,
    snapshot_set: u64,
    current_profile_hash: Option<String>,
}

impl ResolutionKey {
    fn new(folder: &GitFolder, request: &ResolutionRequest<'_>, commit: &CommitSha) -> Self {
        Self {
            folder: folder.path.clone(),
            target: request.target.kind(),
            commit: commit.clone(),
            snapshot_set: fingerprint(request.snapshots),
            current_profile_hash: request.current_profile_hash.map(str::to_string),
        }
    }
}

/// Changes whenever a snapshot is added, removed, rebound or replaced.
fn fingerprint(snapshots: &[SnapshotSummary]) -> u64 {
    let mut hasher = DefaultHasher::new();
    for snapshot in snapshots {
        snapshot.snapshot_ref.snapshot_id.as_str().hash(&mut hasher);
        snapshot
            .commit
            .as_ref()
            .map(|commit| commit.as_str())
            .hash(&mut hasher);
        snapshot.profile_hash.hash(&mut hasher);
        snapshot.created_at.hash(&mut hasher);
        snapshot.finished_at.hash(&mut hasher);
        snapshot.commit_date.hash(&mut hasher);
    }
    hasher.finish()
}

/// Which snapshot to show for a commit or the working tree (plan 05, "Resolving what to show"). Never
/// starts an analysis. Without usable git the newest snapshot is shown, with the reason.
pub async fn resolve_snapshot(
    git: &GitService<'_>,
    cache: &ResolutionCache,
    request: &ResolutionRequest<'_>,
    cancel: &CancellationToken,
) -> CoreResult<SnapshotResolution> {
    let folder = match request.folder {
        ResolutionFolder::Plain => return Ok(latest(request, LatestReason::PlainFolder)),
        ResolutionFolder::MissingGit => {
            return Ok(latest(request, LatestReason::RepositoryUnavailable));
        }
        ResolutionFolder::Git(folder) => folder,
    };
    let lookup = Lookup {
        git,
        folder,
        cancel,
    };
    match resolve_in_repository(&lookup, cache, request).await {
        Err(error) => fallback_for(error, request),
        resolved => resolved,
    }
}

fn fallback_for(
    error: CoreError,
    request: &ResolutionRequest<'_>,
) -> CoreResult<SnapshotResolution> {
    match error.code() {
        ErrorCode::ToolNotFound | ErrorCode::GitTooOld => {
            Ok(latest(request, LatestReason::GitUnavailable))
        }
        ErrorCode::NotARepository | ErrorCode::FolderUnavailable => {
            Ok(latest(request, LatestReason::RepositoryUnavailable))
        }
        _ => Err(error),
    }
}

/// The newest analysed snapshot, else the newest import; an import without a commit only in a folder
/// without git.
fn latest(request: &ResolutionRequest<'_>, reason: LatestReason) -> SnapshotResolution {
    let may_show_unbound = matches!(request.folder, ResolutionFolder::Plain);
    let shown = || {
        request
            .snapshots
            .iter()
            .filter(move |snapshot| may_show_unbound || snapshot.commit.is_some())
    };
    let analysed = shown()
        .filter(|snapshot| snapshot.source == SnapshotSource::Analysed)
        .max_by_key(|snapshot| (finished_or_created(snapshot), id_of(snapshot)));
    let chosen = analysed
        .or_else(|| shown().max_by_key(|snapshot| (snapshot.created_at.as_str(), id_of(snapshot))));
    match chosen {
        Some(snapshot) => SnapshotResolution::Latest {
            snapshot: snapshot.clone(),
            reason,
        },
        None => none(NoSnapshotReason::NoSnapshots),
    }
}

fn none(reason: NoSnapshotReason) -> SnapshotResolution {
    SnapshotResolution::None { reason }
}

fn finished_or_created(snapshot: &SnapshotSummary) -> &str {
    snapshot
        .finished_at
        .as_deref()
        .unwrap_or(&snapshot.created_at)
}

fn id_of(snapshot: &SnapshotSummary) -> &str {
    snapshot.snapshot_ref.snapshot_id.as_str()
}

struct Lookup<'call> {
    git: &'call GitService<'call>,
    folder: &'call GitFolder,
    cancel: &'call CancellationToken,
}

async fn resolve_in_repository(
    lookup: &Lookup<'_>,
    cache: &ResolutionCache,
    request: &ResolutionRequest<'_>,
) -> CoreResult<SnapshotResolution> {
    let commit = match request.target {
        AnalysisTarget::Commit { sha } => sha.clone(),
        AnalysisTarget::WorkingTree => match head_commit(lookup).await? {
            Some(head) => head,
            None => return Ok(none(NoSnapshotReason::NoCommits)),
        },
    };
    let key = ResolutionKey::new(lookup.folder, request, &commit);
    if let Some(cached) = cache.get(&key) {
        return Ok(cached);
    }
    let index = SnapshotIndex::new(request.snapshots, request.current_profile_hash);
    let resolved = resolve_for_commit(lookup, &index, request.target, &commit).await?;
    if resolved != none(NoSnapshotReason::UnknownCommit) {
        cache.insert(key, resolved.clone());
    }
    Ok(resolved)
}

/// `None` for a repository without commits.
async fn head_commit(lookup: &Lookup<'_>) -> CoreResult<Option<CommitSha>> {
    let head = Revision::try_from(HEAD).map_err(|error| CoreError::Internal(error.to_string()))?;
    match lookup
        .git
        .resolve_commit(lookup.folder, &head, lookup.cancel)
        .await
    {
        Ok(summary) => Ok(CommitSha::try_from(summary.sha).ok()),
        Err(error) if error.code() == ErrorCode::UnknownRevision => Ok(None),
        Err(error) => Err(error),
    }
}

async fn resolve_for_commit(
    lookup: &Lookup<'_>,
    index: &SnapshotIndex<'_>,
    target: &AnalysisTarget,
    commit: &CommitSha,
) -> CoreResult<SnapshotResolution> {
    let checkout = matches!(target, AnalysisTarget::WorkingTree)
        .then(|| index.working_tree_at(commit))
        .flatten();
    if let Some(snapshot) = checkout.or_else(|| index.at(commit)) {
        return Ok(index.exact(snapshot));
    }
    if index.is_empty() {
        return Ok(none(NoSnapshotReason::NoSnapshots));
    }
    match nearest_ancestor(lookup, index, commit).await {
        Ok(Some(ancestor)) => Ok(ancestor),
        Ok(None) => nearest_relative(lookup, index, commit).await,
        Err(error) if error.code() == ErrorCode::UnknownRevision => {
            Ok(none(NoSnapshotReason::UnknownCommit))
        }
        Err(error) => Err(error),
    }
}

/// The snapshots bound to a commit, the best one per commit; working-tree snapshots apart.
struct SnapshotIndex<'snapshots> {
    by_commit: HashMap<&'snapshots str, &'snapshots SnapshotSummary>,
    working_trees: HashMap<&'snapshots str, &'snapshots SnapshotSummary>,
    current_profile_hash: Option<&'snapshots str>,
}

impl<'snapshots> SnapshotIndex<'snapshots> {
    fn new(
        snapshots: &'snapshots [SnapshotSummary],
        current_profile_hash: Option<&'snapshots str>,
    ) -> Self {
        let mut index = Self {
            by_commit: HashMap::new(),
            working_trees: HashMap::new(),
            current_profile_hash,
        };
        for snapshot in snapshots {
            index.add(snapshot);
        }
        index
    }

    fn add(&mut self, snapshot: &'snapshots SnapshotSummary) {
        let Some(commit) = &snapshot.commit else {
            return;
        };
        if snapshot.target == Some(TargetKind::WorkingTree) {
            keep_better(
                &mut self.working_trees,
                commit.as_str(),
                snapshot,
                finished_or_created,
            );
            return;
        }
        let current_profile_hash = self.current_profile_hash;
        keep_better(&mut self.by_commit, commit.as_str(), snapshot, |snapshot| {
            preference(snapshot, current_profile_hash)
        });
    }

    fn is_empty(&self) -> bool {
        self.by_commit.is_empty()
    }

    fn at(&self, commit: &CommitSha) -> Option<&'snapshots SnapshotSummary> {
        self.by_commit.get(commit.as_str()).copied()
    }

    fn working_tree_at(&self, commit: &CommitSha) -> Option<&'snapshots SnapshotSummary> {
        self.working_trees.get(commit.as_str()).copied()
    }

    fn is_current_profile(&self, snapshot: &SnapshotSummary) -> bool {
        is_current_profile(snapshot, self.current_profile_hash)
    }

    fn exact(&self, snapshot: &SnapshotSummary) -> SnapshotResolution {
        SnapshotResolution::Exact {
            snapshot: snapshot.clone(),
            is_current_profile: self.is_current_profile(snapshot),
        }
    }

    fn nearest(&self, distance: &Distance<'_>) -> SnapshotResolution {
        SnapshotResolution::Nearest {
            snapshot: distance.snapshot.clone(),
            is_current_profile: self.is_current_profile(distance.snapshot),
            relation: distance.relation,
            behind: saturated(distance.behind),
            ahead: saturated(distance.ahead),
        }
    }

    /// The commits whose snapshot has the newest commit dates, newest first.
    fn newest_commits(&self, count: usize) -> Vec<CommitSha> {
        let mut commits: Vec<(&str, &SnapshotSummary)> = self
            .by_commit
            .iter()
            .map(|(sha, snapshot)| (*sha, *snapshot))
            .collect();
        commits.sort_by_key(|(sha, snapshot)| {
            let seconds = snapshot.commit_date.as_deref().and_then(commit_seconds);
            (std::cmp::Reverse(seconds), *sha)
        });
        commits
            .into_iter()
            .filter_map(|(sha, _)| CommitSha::try_from(sha).ok())
            .take(count)
            .collect()
    }
}

/// The current profile first (an import has none), then analysed over imported, then the newest.
fn preference<'snapshot>(
    snapshot: &'snapshot SnapshotSummary,
    current_profile_hash: Option<&str>,
) -> (bool, bool, &'snapshot str) {
    (
        is_current_profile(snapshot, current_profile_hash),
        snapshot.source == SnapshotSource::Analysed,
        finished_or_created(snapshot),
    )
}

fn is_current_profile(snapshot: &SnapshotSummary, current_profile_hash: Option<&str>) -> bool {
    current_profile_hash.is_some() && snapshot.profile_hash.as_deref() == current_profile_hash
}

fn keep_better<'snapshots, Rank: Ord>(
    best: &mut HashMap<&'snapshots str, &'snapshots SnapshotSummary>,
    commit: &'snapshots str,
    snapshot: &'snapshots SnapshotSummary,
    rank: impl Fn(&'snapshots SnapshotSummary) -> Rank,
) {
    let is_better = best
        .get(commit)
        .is_none_or(|kept| (rank(snapshot), id_of(snapshot)) > (rank(kept), id_of(kept)));
    if is_better {
        best.insert(commit, snapshot);
    }
}

fn saturated(count: u64) -> u32 {
    u32::try_from(count).unwrap_or(u32::MAX)
}

struct Distance<'snapshots> {
    snapshot: &'snapshots SnapshotSummary,
    relation: SnapshotRelation,
    behind: u64,
    ahead: u64,
}

/// Like `git describe`: walk the history of `commit` newest first and count to the analysed commits met.
async fn nearest_ancestor(
    lookup: &Lookup<'_>,
    index: &SnapshotIndex<'_>,
    commit: &CommitSha,
) -> CoreResult<Option<SnapshotResolution>> {
    let mut walk = AncestorWalk::new(|sha: &str| index.by_commit.contains_key(sha));
    let request = RevListRequest {
        include: vec![commit.clone()],
        exclude: Vec::new(),
        first_parent: false,
        max_count: None,
    };
    lookup
        .git
        .rev_list_with_parents(lookup.folder, &request, lookup.cancel, &mut |batch| {
            walk.take(batch)
        })
        .await?;
    let Some((hit, count)) = closest_by_count(lookup, &walk, commit).await? else {
        return Ok(None);
    };
    let distance = Distance {
        snapshot: index.at(&hit.sha).ok_or_else(missing_candidate)?,
        relation: SnapshotRelation::Ancestor,
        behind: count,
        ahead: 0,
    };
    Ok(Some(index.nearest(&distance)))
}

fn missing_candidate() -> CoreError {
    CoreError::Internal("A walked candidate has no snapshot.".to_string())
}

/// The smallest count wins, ties go to the candidate met first.
async fn closest_by_count<'walk, Candidate>(
    lookup: &Lookup<'_>,
    walk: &'walk AncestorWalk<Candidate>,
    commit: &CommitSha,
) -> CoreResult<Option<(&'walk WalkHit, u64)>> {
    if walk.is_linear_hit {
        return Ok(walk.candidates.first().map(|hit| (hit, hit.position)));
    }
    let mut best: Option<(&WalkHit, u64)> = None;
    for hit in &walk.candidates {
        let count = lookup
            .git
            .rev_list_count(lookup.folder, &hit.sha, commit, lookup.cancel)
            .await?;
        if best.is_none_or(|(_, best_count)| count < best_count) {
            best = Some((hit, count));
        }
    }
    Ok(best)
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct WalkHit {
    sha: CommitSha,
    position: u64,
}

/// Collects the analysed commits a walk meets. The first one met before any merge commit is the
/// answer, at a distance equal to its position, so the walk stops there.
struct AncestorWalk<Candidate> {
    is_candidate: Candidate,
    candidates: Vec<WalkHit>,
    position: u64,
    has_seen_merge: bool,
    is_linear_hit: bool,
}

impl<Candidate: Fn(&str) -> bool> AncestorWalk<Candidate> {
    fn new(is_candidate: Candidate) -> Self {
        Self {
            is_candidate,
            candidates: Vec::new(),
            position: 0,
            has_seen_merge: false,
            is_linear_hit: false,
        }
    }

    fn take(&mut self, batch: &[WalkedCommit]) -> ControlFlow<()> {
        for commit in batch {
            self.visit(commit)?;
        }
        ControlFlow::Continue(())
    }

    fn visit(&mut self, commit: &WalkedCommit) -> ControlFlow<()> {
        if (self.is_candidate)(commit.sha.as_str()) {
            self.candidates.push(WalkHit {
                sha: commit.sha.clone(),
                position: self.position,
            });
            self.is_linear_hit = self.candidates.len() == 1 && !self.has_seen_merge;
            if self.is_linear_hit || self.candidates.len() >= MAX_CANDIDATES {
                return ControlFlow::Break(());
            }
        }
        self.has_seen_merge |= commit.is_merge;
        self.position += 1;
        if self.is_past_walk_limit() {
            return ControlFlow::Break(());
        }
        ControlFlow::Continue(())
    }

    fn is_past_walk_limit(&self) -> bool {
        self.candidates
            .first()
            .is_some_and(|first| self.position - first.position > WALK_LIMIT_AFTER_FIRST_HIT)
    }
}

/// No analysed ancestor: a snapshot that contains `commit` (descendant) wins, the closest first;
/// otherwise the closest one on another line of history; unrelated histories never count.
async fn nearest_relative(
    lookup: &Lookup<'_>,
    index: &SnapshotIndex<'_>,
    commit: &CommitSha,
) -> CoreResult<SnapshotResolution> {
    let candidates = index.newest_commits(MAX_FALLBACK_CANDIDATES);
    let distances = lookup
        .git
        .measure_distances(lookup.folder, commit, &candidates, lookup.cancel)
        .await?;
    let descendant = distances
        .iter()
        .filter(|distance| distance.only_in_target == 0)
        .min_by_key(|distance| distance.only_in_candidate);
    if let Some(distance) = descendant {
        return distance_to(index, distance, SnapshotRelation::Descendant)
            .map(|distance| index.nearest(&distance));
    }
    let mut diverged: Vec<&GitCommitDistance> = distances.iter().collect();
    diverged.sort_by_key(|distance| {
        let total = u64::from(distance.only_in_candidate) + u64::from(distance.only_in_target);
        (total, distance.only_in_target)
    });
    for distance in diverged {
        if shares_history(lookup, commit, &distance.sha).await? {
            return distance_to(index, distance, SnapshotRelation::Diverged)
                .map(|distance| index.nearest(&distance));
        }
    }
    Ok(none(NoSnapshotReason::Unrelated))
}

async fn shares_history(lookup: &Lookup<'_>, commit: &CommitSha, other: &str) -> CoreResult<bool> {
    let other =
        CommitSha::try_from(other).map_err(|error| CoreError::Internal(error.to_string()))?;
    let base = lookup
        .git
        .merge_base(lookup.folder, commit, &other, lookup.cancel)
        .await?;
    Ok(base.is_some())
}

/// `onlyInTarget` are the asked commit's commits the snapshot lacks (behind), `onlyInCandidate` the
/// snapshot's commits beyond it (ahead).
fn distance_to<'snapshots>(
    index: &SnapshotIndex<'snapshots>,
    distance: &GitCommitDistance,
    relation: SnapshotRelation,
) -> CoreResult<Distance<'snapshots>> {
    let snapshot = index
        .by_commit
        .get(distance.sha.as_str())
        .copied()
        .ok_or_else(missing_candidate)?;
    Ok(Distance {
        snapshot,
        relation,
        behind: u64::from(distance.only_in_target),
        ahead: u64::from(distance.only_in_candidate),
    })
}

/// Seconds since the epoch of an ISO 8601 date with offset, the form commit dates take in the records.
fn commit_seconds(date: &str) -> Option<i64> {
    let (date_time, offset) = date.split_at_checked(DATE_TIME_LENGTH)?;
    let utc = humantime::parse_rfc3339(&format!("{date_time}{UTC_SUFFIX}")).ok()?;
    let seconds = i64::try_from(utc.duration_since(UNIX_EPOCH).ok()?.as_secs()).ok()?;
    Some(seconds - offset_seconds(offset)?)
}

/// `Z`, `+hh:mm` or `-hh:mm`.
fn offset_seconds(offset: &str) -> Option<i64> {
    if offset == UTC_SUFFIX {
        return Some(0);
    }
    let (sign, hours_and_minutes) = offset.split_at_checked(1)?;
    let (hours, minutes) = hours_and_minutes.split_once(OFFSET_SEPARATOR)?;
    let magnitude = hours.parse::<i64>().ok()? * SECONDS_PER_HOUR
        + minutes.parse::<i64>().ok()? * SECONDS_PER_MINUTE;
    match sign {
        "+" => Some(magnitude),
        "-" => Some(-magnitude),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sha_number(number: usize) -> CommitSha {
        CommitSha::try_from(format!("{number:040x}")).expect("a full sha")
    }

    fn merge(number: usize) -> WalkedCommit {
        WalkedCommit {
            sha: sha_number(number),
            is_merge: true,
        }
    }

    #[test]
    fn should_stop_the_stream_after_ten_candidates() {
        // Arrange
        let walked: Vec<WalkedCommit> = (0..MAX_CANDIDATES * 2).map(merge).collect();
        let mut walk = AncestorWalk::new(|sha: &str| sha != sha_number(0).as_str());

        // Act
        let flow = walk.take(&walked);

        // Assert
        assert_eq!(flow, ControlFlow::Break(()));
        assert_eq!(walk.candidates.len(), MAX_CANDIDATES);
        assert!(!walk.is_linear_hit);
        assert_eq!(
            walk.candidates.last().map(|hit| hit.position),
            Some(MAX_CANDIDATES as u64)
        );
    }

    #[test]
    fn should_stop_at_the_first_candidate_when_no_merge_came_before_it() {
        // Arrange
        let walked = [
            WalkedCommit {
                sha: sha_number(1),
                is_merge: false,
            },
            WalkedCommit {
                sha: sha_number(2),
                is_merge: false,
            },
        ];
        let mut walk = AncestorWalk::new(|sha: &str| sha == sha_number(2).as_str());

        // Act
        let flow = walk.take(&walked);

        // Assert
        assert_eq!(flow, ControlFlow::Break(()));
        assert!(walk.is_linear_hit);
        assert_eq!(walk.candidates.first().map(|hit| hit.position), Some(1));
    }

    #[test]
    fn should_stop_the_walk_far_enough_after_the_first_candidate() {
        // Arrange
        let mut walk = AncestorWalk::new(|sha: &str| sha == sha_number(1).as_str());
        let walked: Vec<WalkedCommit> = (0..=WALK_LIMIT_AFTER_FIRST_HIT as usize + 2)
            .map(merge)
            .collect();

        // Act
        let flow = walk.take(&walked);

        // Assert
        assert_eq!(flow, ControlFlow::Break(()));
        assert_eq!(walk.position, WALK_LIMIT_AFTER_FIRST_HIT + 2);
    }

    #[test]
    fn should_order_commit_dates_across_offsets() {
        // Arrange
        let in_berlin = "2026-11-18T12:00:00+01:00";
        let in_utc = "2026-11-18T11:30:00Z";
        let in_new_york = "2026-11-18T06:45:00-05:00";

        // Act
        let seconds = [in_berlin, in_utc, in_new_york].map(commit_seconds);

        // Assert
        assert!(seconds.iter().all(Option::is_some));
        assert!(seconds[0] < seconds[1]);
        assert!(seconds[1] < seconds[2]);
        assert_eq!(commit_seconds("not a date"), None);
    }
}
