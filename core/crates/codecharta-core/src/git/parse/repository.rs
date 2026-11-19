use crate::error::CoreResult;
use crate::git::error::parse_failed;

/// The rev-parse options of the locator, in the order git prints their values, one per line.
pub const REV_PARSE_ARGS: [&str; 8] = [
    "rev-parse",
    "--path-format=absolute",
    "--is-bare-repository",
    "--is-shallow-repository",
    "--git-dir",
    "--git-common-dir",
    "--show-prefix",
    "--show-toplevel",
];
const PREFIX_SEPARATOR: char = '/';

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RevParseFacts {
    pub is_bare: bool,
    pub is_shallow: bool,
    pub git_dir: String,
    pub common_dir: String,
    /// Relative to the top level, without the trailing `/`; empty at the root.
    pub prefix: String,
    pub top_level: String,
}

pub fn parse_rev_parse(stdout: &str) -> CoreResult<RevParseFacts> {
    let lines: Vec<&str> = stdout.lines().collect();
    let [is_bare, is_shallow, git_dir, common_dir, prefix, top_level] = lines[..] else {
        return Err(parse_failed("the repository facts"));
    };
    Ok(RevParseFacts {
        is_bare: parse_flag(is_bare)?,
        is_shallow: parse_flag(is_shallow)?,
        git_dir: git_dir.to_string(),
        common_dir: common_dir.to_string(),
        prefix: prefix.trim_end_matches(PREFIX_SEPARATOR).to_string(),
        top_level: top_level.to_string(),
    })
}

/// `rev-parse` fails in a bare repository after it printed `true` for `--is-bare-repository`.
pub fn reports_bare(stdout: &str) -> bool {
    stdout.lines().next() == Some("true")
}

fn parse_flag(value: &str) -> CoreResult<bool> {
    match value {
        "true" => Ok(true),
        "false" => Ok(false),
        _ => Err(parse_failed("the repository facts")),
    }
}

#[cfg(test)]
mod tests {
    use codecharta_core_api::error::ErrorCode;

    use super::*;

    #[test]
    fn should_parse_root_prefix_shallow_and_worktree() {
        // Arrange
        let root = include_str!("testdata/rev_parse_root.txt");
        let linked = include_str!("testdata/rev_parse_shallow_linked_subfolder.txt");

        // Act
        let root = parse_rev_parse(root).unwrap();
        let linked = parse_rev_parse(linked).unwrap();

        // Assert
        assert_eq!(
            root,
            RevParseFacts {
                is_bare: false,
                is_shallow: false,
                git_dir: "/fixture/refs/.git".to_string(),
                common_dir: "/fixture/refs/.git".to_string(),
                prefix: String::new(),
                top_level: "/fixture/refs".to_string(),
            }
        );
        assert_eq!(
            linked,
            RevParseFacts {
                is_bare: false,
                is_shallow: true,
                git_dir: "/fixture/shallow/.git/worktrees/shallow-linked".to_string(),
                common_dir: "/fixture/shallow/.git".to_string(),
                prefix: "src".to_string(),
                top_level: "/fixture/shallow-linked".to_string(),
            }
        );
    }

    #[test]
    fn should_recognise_a_bare_repository_from_the_partial_answer() {
        // Arrange
        let bare = include_str!("testdata/rev_parse_bare.txt");

        // Act
        let parsed = parse_rev_parse(bare);

        // Assert
        assert!(reports_bare(bare));
        assert_eq!(parsed.unwrap_err().code(), ErrorCode::ParseFailed);
    }
}
