use codecharta_core_api::methods::git::{
    GitLastCommit, GitLocalBranch, GitRemoteBranch, GitTag, GitUpstream,
};

use crate::error::CoreResult;
use crate::git::error::parse_failed;
use crate::git::locator::{PathStyle, normalise_repository_id};

pub const REFS_ARGS: [&str; 5] = [
    "for-each-ref",
    "--format=%(refname)%00%(objectname)%00%(objecttype)%00%(*objectname)%00%(*objecttype)%00%(HEAD)%00%(symref)%00%(upstream)%00%(upstream:track,nobracket)%00%(worktreepath)%00%(creatordate:unix)%00%(contents:subject)",
    "refs/heads",
    "refs/remotes",
    "refs/tags",
];

const WHAT: &str = "the refs";
const FIELD_SEPARATOR: char = '\0';
const REFS_PREFIX: &str = "refs/";
const LOCAL_PREFIX: &str = "refs/heads/";
const REMOTE_PREFIX: &str = "refs/remotes/";
const TAG_PREFIX: &str = "refs/tags/";
const CURRENT_MARK: &str = "*";
const COMMIT_TYPE: &str = "commit";
const TAG_TYPE: &str = "tag";
const GONE_TRACK: &str = "gone";
const AHEAD_TRACK: &str = "ahead ";
const BEHIND_TRACK: &str = "behind ";
const TRACK_SEPARATOR: &str = ", ";

/// One line of `for-each-ref` with the twelve fields of `REFS_ARGS`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RefRecord {
    pub ref_name: String,
    pub object: String,
    pub object_type: String,
    pub peeled_object: String,
    pub peeled_type: String,
    pub is_head: bool,
    pub symref: String,
    pub upstream: String,
    pub track: String,
    pub worktree_path: String,
    pub created_at: i64,
    pub subject: String,
}

pub fn parse_refs(stdout: &str) -> CoreResult<Vec<RefRecord>> {
    stdout.lines().map(parse_record).collect()
}

fn parse_record(line: &str) -> CoreResult<RefRecord> {
    let fields: Vec<&str> = line.split(FIELD_SEPARATOR).collect();
    let [
        ref_name,
        object,
        object_type,
        peeled_object,
        peeled_type,
        head,
        symref,
        upstream,
        track,
        worktree_path,
        created_at,
        subject,
    ] = fields[..]
    else {
        return Err(parse_failed(WHAT));
    };
    if !ref_name.starts_with(REFS_PREFIX) {
        return Err(parse_failed(WHAT));
    }
    Ok(RefRecord {
        ref_name: ref_name.to_string(),
        object: object.to_string(),
        object_type: object_type.to_string(),
        peeled_object: peeled_object.to_string(),
        peeled_type: peeled_type.to_string(),
        is_head: head == CURRENT_MARK,
        symref: symref.to_string(),
        upstream: upstream.to_string(),
        track: track.to_string(),
        worktree_path: worktree_path.to_string(),
        created_at: created_at.parse().map_err(|_| parse_failed(WHAT))?,
        subject: subject.to_string(),
    })
}

/// What sorting the refs needs to know about the repository.
pub struct RefContext<'context> {
    pub remote_names: &'context [String],
    pub root_path: &'context str,
    pub style: PathStyle,
}

#[derive(Debug, Default, PartialEq, Eq)]
pub struct SortedRefs {
    pub local_branches: Vec<GitLocalBranch>,
    pub remote_branches: Vec<GitRemoteBranch>,
    pub tags: Vec<GitTag>,
}

/// Symbolic refs (`origin/HEAD`) and tags that do not lead to a commit are left out.
pub fn sort_refs(records: &[RefRecord], context: &RefContext) -> SortedRefs {
    let mut sorted = SortedRefs::default();
    for record in records.iter().filter(|record| record.symref.is_empty()) {
        if let Some(name) = record.ref_name.strip_prefix(LOCAL_PREFIX) {
            sorted
                .local_branches
                .push(local_branch(record, name, context));
        } else if let Some(rest) = record.ref_name.strip_prefix(REMOTE_PREFIX) {
            sorted
                .remote_branches
                .push(remote_branch(record, rest, context.remote_names));
        } else if let Some(name) = record.ref_name.strip_prefix(TAG_PREFIX) {
            sorted.tags.extend(tag(record, name));
        }
    }
    sorted
}

fn local_branch(record: &RefRecord, name: &str, context: &RefContext) -> GitLocalBranch {
    GitLocalBranch {
        ref_name: record.ref_name.clone(),
        name: name.to_string(),
        commit: record.object.clone(),
        is_current: record.is_head,
        upstream: upstream_of(record),
        checked_out_in_other_worktree: other_worktree(record, context),
        last_commit: last_commit(record),
    }
}

fn other_worktree(record: &RefRecord, context: &RefContext) -> Option<String> {
    let path = record.worktree_path.as_str();
    let is_elsewhere = normalise_repository_id(path, context.style)
        != normalise_repository_id(context.root_path, context.style);
    (!path.is_empty() && is_elsewhere).then(|| path.to_string())
}

fn upstream_of(record: &RefRecord) -> Option<GitUpstream> {
    if record.upstream.is_empty() {
        return None;
    }
    let ahead_behind = parse_track(&record.track);
    Some(GitUpstream {
        ref_name: record.upstream.clone(),
        name: short_ref_name(&record.upstream).to_string(),
        ahead: ahead_behind.map(|(ahead, _)| ahead),
        behind: ahead_behind.map(|(_, behind)| behind),
        is_gone: ahead_behind.is_none(),
    })
}

/// `ahead 2, behind 1`, `ahead 2`, `behind 1`, empty (in step) or `gone` (`None`).
pub fn parse_track(track: &str) -> Option<(u32, u32)> {
    if track == GONE_TRACK {
        return None;
    }
    let count_after = |prefix: &str| {
        track
            .split(TRACK_SEPARATOR)
            .find_map(|part| part.strip_prefix(prefix)?.parse().ok())
            .unwrap_or_default()
    };
    Some((count_after(AHEAD_TRACK), count_after(BEHIND_TRACK)))
}

fn short_ref_name(ref_name: &str) -> &str {
    ref_name
        .strip_prefix(REMOTE_PREFIX)
        .or_else(|| ref_name.strip_prefix(LOCAL_PREFIX))
        .unwrap_or(ref_name)
}

fn remote_branch(record: &RefRecord, rest: &str, remote_names: &[String]) -> GitRemoteBranch {
    let (remote, branch_name) = split_remote(rest, remote_names);
    GitRemoteBranch {
        ref_name: record.ref_name.clone(),
        remote: remote.to_string(),
        name: rest.to_string(),
        branch_name: branch_name.to_string(),
        commit: record.object.clone(),
        last_commit: last_commit(record),
    }
}

/// The longest configured remote name that prefixes the rest; without one, the first path segment.
pub fn split_remote<'rest>(rest: &'rest str, remote_names: &[String]) -> (&'rest str, &'rest str) {
    remote_names
        .iter()
        .filter(|remote| {
            rest.strip_prefix(remote.as_str())
                .is_some_and(|after| after.starts_with('/'))
        })
        .max_by_key(|remote| remote.len())
        .map(|remote| (&rest[..remote.len()], &rest[remote.len() + 1..]))
        .or_else(|| rest.split_once('/'))
        .unwrap_or((rest, ""))
}

fn tag(record: &RefRecord, name: &str) -> Option<GitTag> {
    let is_annotated = record.object_type == TAG_TYPE;
    let (commit, commit_type) = if is_annotated {
        (&record.peeled_object, &record.peeled_type)
    } else {
        (&record.object, &record.object_type)
    };
    (commit_type == COMMIT_TYPE).then(|| GitTag {
        ref_name: record.ref_name.clone(),
        name: name.to_string(),
        commit: commit.clone(),
        is_annotated,
        created_at: record.created_at,
    })
}

fn last_commit(record: &RefRecord) -> GitLastCommit {
    GitLastCommit {
        subject: record.subject.clone(),
        committed_at: record.created_at,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const MAIN_COMMIT: &str = "f14f93805ed394325d8809b584a3ae780c62a753";
    const REMOTE_COMMIT: &str = "ab5c057683ac44f9153f87c4e92f43ccac988b19";

    fn captured() -> SortedRefs {
        let records = parse_refs(include_str!("testdata/for_each_ref.txt")).unwrap();
        let remote_names = ["origin".to_string(), "team/fork".to_string()];
        sort_refs(
            &records,
            &RefContext {
                remote_names: &remote_names,
                root_path: "/fixture/refs",
                style: PathStyle::Unix,
            },
        )
    }

    fn names<'item>(items: impl Iterator<Item = &'item str>) -> Vec<&'item str> {
        items.collect()
    }

    #[test]
    fn should_split_local_remote_and_tags() {
        // Arrange
        let refs = captured();

        // Act
        let local = names(
            refs.local_branches
                .iter()
                .map(|branch| branch.name.as_str()),
        );
        let remote = names(
            refs.remote_branches
                .iter()
                .map(|branch| branch.name.as_str()),
        );
        let tags = names(refs.tags.iter().map(|tag| tag.name.as_str()));

        // Assert
        assert_eq!(local, ["feature", "main", "plain"]);
        assert_eq!(remote, ["origin/main", "team/fork/shared"]);
        assert_eq!(tags, ["light", "v2"]);
    }

    #[test]
    fn should_peel_annotated_tags() {
        // Arrange
        let refs = captured();

        // Act
        let tags = refs.tags;

        // Assert
        assert!(!tags[0].is_annotated);
        assert!(tags[1].is_annotated);
        assert_eq!(tags[1].commit, MAIN_COMMIT);
        assert_eq!(tags[1].created_at, 1_700_000_600);
    }

    #[test]
    fn should_skip_the_symbolic_remote_head() {
        // Arrange
        let refs = captured();

        // Act
        let has_head = refs
            .remote_branches
            .iter()
            .any(|branch| branch.ref_name.ends_with("/HEAD"));

        // Assert
        assert!(!has_head);
    }

    #[test]
    fn should_read_upstream_tracking_of_local_branches() {
        // Arrange
        let refs = captured();

        // Act
        let [feature, main, plain] = &refs.local_branches[..] else {
            panic!("three local branches were expected");
        };

        // Assert
        assert_eq!(
            main.upstream,
            Some(GitUpstream {
                ref_name: "refs/remotes/origin/main".to_string(),
                name: "origin/main".to_string(),
                ahead: Some(2),
                behind: Some(1),
                is_gone: false,
            })
        );
        assert!(feature.upstream.as_ref().unwrap().is_gone);
        assert_eq!(plain.upstream, None);
        assert!(main.is_current);
        assert_eq!(main.commit, MAIN_COMMIT);
        assert_eq!(main.last_commit.subject, "Local refs two");
        assert_eq!(feature.commit, REMOTE_COMMIT);
    }

    #[test]
    fn should_parse_ahead_behind_gone_and_empty_tracking() {
        // Arrange
        let tracks = ["ahead 2, behind 1", "ahead 3", "behind 4", "", "gone"];

        // Act
        let parsed: Vec<Option<(u32, u32)>> = tracks.into_iter().map(parse_track).collect();

        // Assert
        assert_eq!(
            parsed,
            [Some((2, 1)), Some((3, 0)), Some((0, 4)), Some((0, 0)), None]
        );
    }

    #[test]
    fn should_split_a_remote_name_with_a_slash() {
        // Arrange
        let refs = captured();

        // Act
        let fork = &refs.remote_branches[1];

        // Assert
        assert_eq!(fork.remote, "team/fork");
        assert_eq!(fork.branch_name, "shared");
        assert_eq!(
            split_remote(
                "team/fork/a/b",
                &["team".to_string(), "team/fork".to_string()]
            ),
            ("team/fork", "a/b")
        );
    }

    #[test]
    fn should_name_the_other_worktree_of_a_branch() {
        // Arrange
        let refs = captured();

        // Act
        let worktrees: Vec<Option<&str>> = refs
            .local_branches
            .iter()
            .map(|branch| branch.checked_out_in_other_worktree.as_deref())
            .collect();

        // Assert
        assert_eq!(worktrees, [None, None, Some("/fixture/linked")]);
    }

    #[test]
    fn should_fail_on_a_line_with_missing_fields() {
        // Arrange
        let line = "refs/heads/main\0abc\0commit\n";

        // Act
        let parsed = parse_refs(line);

        // Assert
        assert!(parsed.is_err());
    }
}
