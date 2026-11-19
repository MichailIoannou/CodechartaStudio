use codecharta_core_api::methods::analysis::{AnalysisErrorCode, JobError};
use codecharta_core_api::methods::projects::{AnalyserName, AnalysisProfile};
use serde::Serialize;
use sha2::{Digest, Sha256};

const PROFILE_HASH_LENGTH: usize = 8;
const CSV_SEPARATOR: char = ',';
const NUL: char = '\0';

/// A profile whose lists are sorted, free of duplicates and safe to hand to ccsh.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ValidProfile {
    exclude: Vec<String>,
    without: Vec<AnalyserName>,
    parallel: bool,
}

impl ValidProfile {
    pub fn exclude(&self) -> &[String] {
        &self.exclude
    }

    pub fn without(&self) -> &[AnalyserName] {
        &self.without
    }

    pub fn is_parallel(&self) -> bool {
        self.parallel
    }
}

/// ccsh splits `--exclude` on commas, so a pattern with one would silently become two.
pub fn validate_profile(profile: &AnalysisProfile) -> Result<ValidProfile, JobError> {
    let mut exclude = Vec::with_capacity(profile.exclude.len());
    for pattern in &profile.exclude {
        exclude.push(checked_pattern(pattern.as_str())?);
    }
    exclude.sort();
    exclude.dedup();
    let mut without = profile.without.clone();
    without.sort();
    without.dedup();
    Ok(ValidProfile {
        exclude,
        without,
        parallel: profile.parallel,
    })
}

fn checked_pattern(pattern: &str) -> Result<String, JobError> {
    if pattern.contains(CSV_SEPARATOR) || pattern.contains(NUL) {
        return Err(JobError::new(
            AnalysisErrorCode::InvalidProfile,
            format!("The exclude pattern {pattern:?} contains a comma or a NUL character."),
        )
        .with_hint("Split the pattern into one pattern per entry."));
    }
    Ok(pattern.to_string())
}

/// The keys mirror the snapshot record's profile; `parallel` only changes how fast ccsh runs, not the map.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HashInput<'profile> {
    exclude: &'profile [String],
    extra_args: [&'profile str; 0],
    without: &'profile [AnalyserName],
}

pub fn profile_hash(profile: &ValidProfile) -> String {
    let input = HashInput {
        exclude: &profile.exclude,
        extra_args: [],
        without: &profile.without,
    };
    let json = serde_json::to_vec(&input).unwrap_or_default();
    let digest = Sha256::digest(&json);
    let hex: String = digest.iter().map(|byte| format!("{byte:02x}")).collect();
    hex[..PROFILE_HASH_LENGTH].to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use codecharta_core_api::values::ExcludePattern;
    use serde_json::json;

    fn profile(exclude: &[&str], without: &[AnalyserName]) -> AnalysisProfile {
        AnalysisProfile {
            exclude: exclude
                .iter()
                .map(|pattern| ExcludePattern::try_from(*pattern).unwrap())
                .collect(),
            without: without.to_vec(),
            parallel: true,
        }
    }

    fn hash_of(profile: &AnalysisProfile) -> String {
        profile_hash(&validate_profile(profile).unwrap())
    }

    #[test]
    fn should_give_the_same_hash_for_differently_ordered_lists() {
        // Arrange
        let first = profile(
            &["build", "dist"],
            &[AnalyserName::Svn, AnalyserName::Dependencyparser],
        );
        let second = profile(
            &["dist", "build"],
            &[AnalyserName::Dependencyparser, AnalyserName::Svn],
        );

        // Act
        let hashes = (hash_of(&first), hash_of(&second));

        // Assert
        assert_eq!(hashes.0, hashes.1);
        assert_eq!(hashes.0.len(), PROFILE_HASH_LENGTH);
        assert!(hashes.0.bytes().all(|byte| byte.is_ascii_hexdigit()));
    }

    #[test]
    fn should_give_different_hashes_when_a_list_differs() {
        // Arrange
        let base = profile(&["build"], &[AnalyserName::Svn]);
        let other_exclude = profile(&["dist"], &[AnalyserName::Svn]);
        let other_without = profile(&["build"], &[AnalyserName::Git]);

        // Act
        let hashes = [
            hash_of(&base),
            hash_of(&other_exclude),
            hash_of(&other_without),
        ];

        // Assert
        assert_ne!(hashes[0], hashes[1]);
        assert_ne!(hashes[0], hashes[2]);
        assert_ne!(hashes[1], hashes[2]);
    }

    #[test]
    fn should_hash_the_record_keys_and_ignore_parallel() {
        // Arrange
        let parallel = profile(&[], &[]);
        let sequential = AnalysisProfile {
            parallel: false,
            ..parallel.clone()
        };
        let expected_input = json!({ "exclude": [], "extraArgs": [], "without": [] });
        let expected_digest = Sha256::digest(serde_json::to_vec(&expected_input).unwrap());
        let expected: String = expected_digest
            .iter()
            .take(PROFILE_HASH_LENGTH / 2)
            .map(|byte| format!("{byte:02x}"))
            .collect();

        // Act
        let hashes = (hash_of(&parallel), hash_of(&sequential));

        // Assert
        assert_eq!(hashes.0, expected);
        assert_eq!(hashes.1, expected);
    }

    #[test]
    fn should_sort_and_dedupe_both_lists() {
        // Arrange
        let input = profile(
            &["src/gen", "build", "src/gen"],
            &[AnalyserName::Svn, AnalyserName::Git, AnalyserName::Svn],
        );

        // Act
        let valid = validate_profile(&input).unwrap();

        // Assert
        assert_eq!(valid.exclude(), ["build", "src/gen"]);
        assert_eq!(valid.without(), [AnalyserName::Git, AnalyserName::Svn]);
        assert!(valid.is_parallel());
    }

    #[test]
    fn should_reject_an_unknown_without_entry() {
        // Arrange
        let unknown = json!({ "exclude": [], "without": ["gitlogparser"], "parallel": true });

        // Act
        let parsed = serde_json::from_value::<AnalysisProfile>(unknown);

        // Assert
        assert!(parsed.is_err());
    }

    #[test]
    fn should_reject_an_exclude_pattern_with_a_comma_or_a_nul() {
        // Arrange
        let profiles = [profile(&["a,b"], &[]), profile(&["a\0b"], &[])];

        // Act
        let errors: Vec<JobError> = profiles
            .iter()
            .map(|profile| validate_profile(profile).unwrap_err())
            .collect();

        // Assert
        assert!(
            errors
                .iter()
                .all(|error| error.code == AnalysisErrorCode::InvalidProfile),
            "{errors:?}"
        );
    }
}
