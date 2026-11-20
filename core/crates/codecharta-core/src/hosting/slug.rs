use crate::error::{CoreError, CoreResult};

const OPTION_PREFIX: char = '-';
const SLUG_PUNCTUATION: [char; 4] = ['.', '_', '/', ':'];

/// `[HOST/]OWNER/REPO` as `gh -R` and `glab -R` take it: it cannot be read as a flag and holds nothing
/// but letters, digits and `._/:-`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RepoSlug(String);

impl RepoSlug {
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

pub fn validate_repo_slug(raw: &str) -> CoreResult<RepoSlug> {
    let is_valid = !raw.is_empty()
        && !raw.starts_with(OPTION_PREFIX)
        && raw.chars().all(|character| {
            character.is_ascii_alphanumeric()
                || character == OPTION_PREFIX
                || SLUG_PUNCTUATION.contains(&character)
        });
    if is_valid {
        Ok(RepoSlug(raw.to_string()))
    } else {
        Err(CoreError::BadRequest(
            "A repository is named by letters, digits and ._/:- and does not start with -."
                .to_string(),
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_reject_a_slug_that_looks_like_a_flag() {
        // Arrange
        let slugs = [
            "owner/repo",
            "git.example.org/group/sub-group/app_1",
            "--repo=evil/x",
            "-R",
            "owner/repo name",
            "owner/repo;rm",
            "",
        ];

        // Act
        let accepted: Vec<bool> = slugs
            .iter()
            .map(|slug| validate_repo_slug(slug).is_ok())
            .collect();

        // Assert
        assert_eq!(accepted, [true, true, false, false, false, false, false]);
    }
}
