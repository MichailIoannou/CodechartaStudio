use codecharta_core_api::methods::compare::{Preflight, SideStatus, SizeVerdict};
use codecharta_core_api::methods::snapshots::SnapshotSummary;

const BYTES_PER_MEGABYTE: u64 = 1_000_000;
/// Provisional until 06-M0 task 4 calibrates both limits against the heap of a loaded pair.
pub const COMBINED_BYTES_WARNING: u64 = 15 * BYTES_PER_MEGABYTE;
pub const COMBINED_BYTES_LIMIT: u64 = 60 * BYTES_PER_MEGABYTE;

/// Above `warning_bytes` of combined compressed maps the user is warned, above `limit_bytes` the pair is
/// not loaded.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SizeLimits {
    pub warning_bytes: u64,
    pub limit_bytes: u64,
}

impl Default for SizeLimits {
    fn default() -> Self {
        Self {
            warning_bytes: COMBINED_BYTES_WARNING,
            limit_bytes: COMBINED_BYTES_LIMIT,
        }
    }
}

pub fn preflight(base: &SideStatus, head: &SideStatus, limits: &SizeLimits) -> Preflight {
    let shown = (base.shown_snapshot(), head.shown_snapshot());
    let combined_bytes = [shown.0, shown.1]
        .into_iter()
        .flatten()
        .map(|snapshot| snapshot.map_bytes)
        .fold(0, u64::saturating_add);
    Preflight {
        identical_checksums: have_identical_checksums(shown),
        profiles_differ: have_different_profiles(shown),
        combined_bytes,
        size_verdict: size_verdict(combined_bytes, limits),
    }
}

type ShownPair<'snapshot> = (
    Option<&'snapshot SnapshotSummary>,
    Option<&'snapshot SnapshotSummary>,
);

fn have_identical_checksums(shown: ShownPair<'_>) -> bool {
    match shown {
        (Some(base), Some(head)) => base.checksum.is_some() && base.checksum == head.checksum,
        _ => false,
    }
}

/// An import has no profile, so it differs from every analysed snapshot.
fn have_different_profiles(shown: ShownPair<'_>) -> bool {
    match shown {
        (Some(base), Some(head)) => base.profile_hash != head.profile_hash,
        _ => false,
    }
}

fn size_verdict(combined_bytes: u64, limits: &SizeLimits) -> SizeVerdict {
    if combined_bytes > limits.limit_bytes {
        SizeVerdict::Block
    } else if combined_bytes > limits.warning_bytes {
        SizeVerdict::Warn
    } else {
        SizeVerdict::Ok
    }
}

#[cfg(test)]
mod tests {
    use codecharta_core_api::methods::compare::NearestSnapshot;
    use codecharta_core_api::methods::snapshots::SnapshotRelation;

    use super::*;
    use crate::compare::fixtures::analysed;

    const LIMITS: SizeLimits = SizeLimits {
        warning_bytes: 100,
        limit_bytes: 1_000,
    };

    fn exact(snapshot: SnapshotSummary) -> SideStatus {
        SideStatus::Exact { snapshot }
    }

    fn nearest(snapshot: SnapshotSummary) -> SideStatus {
        SideStatus::Missing {
            nearest: Some(NearestSnapshot {
                snapshot,
                relation: SnapshotRelation::Ancestor,
                stale_by: 1,
                behind: 1,
                ahead: 0,
            }),
        }
    }

    #[test]
    fn should_report_identical_when_checksums_are_equal() {
        // Arrange
        let base = exact(analysed("same", 10));
        let head = nearest(analysed("same", 10));
        let other_head = exact(analysed("other", 10));

        // Act
        let identical = preflight(&base, &head, &LIMITS);
        let different = preflight(&base, &other_head, &LIMITS);

        // Assert
        assert!(identical.identical_checksums);
        assert!(!different.identical_checksums);
    }

    #[test]
    fn should_not_report_identical_while_a_checksum_or_a_side_is_missing() {
        // Arrange
        let unknown = SnapshotSummary {
            checksum: None,
            ..analysed("x", 10)
        };
        let missing = SideStatus::Missing { nearest: None };

        // Act
        let without_checksums = preflight(&exact(unknown.clone()), &exact(unknown), &LIMITS);
        let without_head = preflight(&exact(analysed("x", 10)), &missing, &LIMITS);

        // Assert
        assert!(!without_checksums.identical_checksums);
        assert!(!without_head.identical_checksums);
        assert_eq!(without_head.combined_bytes, 10);
    }

    #[test]
    fn should_block_when_combined_size_exceeds_the_limit() {
        // Arrange
        let sizes = [(50, 50), (50, 51), (500, 500), (500, 501)];

        // Act
        let verdicts: Vec<SizeVerdict> = sizes
            .into_iter()
            .map(|(base, head)| {
                let base = exact(analysed("a", base));
                let head = exact(analysed("b", head));
                preflight(&base, &head, &LIMITS).size_verdict
            })
            .collect();

        // Assert
        assert_eq!(
            verdicts,
            vec![
                SizeVerdict::Ok,
                SizeVerdict::Warn,
                SizeVerdict::Warn,
                SizeVerdict::Block
            ]
        );
    }

    #[test]
    fn should_flag_differing_profiles() {
        // Arrange
        let base = exact(analysed("a", 1));
        let other_profile = exact(SnapshotSummary {
            profile_hash: Some("0dd0dd00".to_string()),
            ..analysed("b", 1)
        });
        let imported = exact(SnapshotSummary {
            profile_hash: None,
            ..analysed("c", 1)
        });

        // Act
        let same = preflight(&base, &exact(analysed("b", 1)), &LIMITS);
        let other = preflight(&base, &other_profile, &LIMITS);
        let with_import = preflight(&base, &imported, &LIMITS);

        // Assert
        assert!(!same.profiles_differ);
        assert!(other.profiles_differ);
        assert!(with_import.profiles_differ);
    }

    #[test]
    fn should_default_to_the_provisional_limits() {
        // Arrange
        let limits = SizeLimits::default();

        // Act
        let in_megabytes = (
            limits.warning_bytes / BYTES_PER_MEGABYTE,
            limits.limit_bytes / BYTES_PER_MEGABYTE,
        );

        // Assert
        assert_eq!(in_megabytes, (15, 60));
    }
}
