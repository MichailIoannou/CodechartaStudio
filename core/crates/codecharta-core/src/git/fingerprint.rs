use codecharta_core_api::methods::git::GitHead;
use sha2::{Digest, Sha256};

use super::parse::refs::RefRecord;

/// SHA-256 over the sorted `refname object` lines and the head, so any moved ref or head changes it.
pub fn fingerprint_of(records: &[RefRecord], head: &GitHead) -> String {
    let mut lines: Vec<String> = records
        .iter()
        .filter(|record| record.symref.is_empty())
        .map(|record| format!("{} {}", record.ref_name, record.object))
        .collect();
    lines.sort();
    lines.push(head_line(head));
    let mut hasher = Sha256::new();
    for line in &lines {
        hasher.update(line.as_bytes());
        hasher.update(b"\n");
    }
    format!("{:x}", hasher.finalize())
}

fn head_line(head: &GitHead) -> String {
    match head {
        GitHead::Branch { name, commit } => {
            format!("branch:{name}:{}", commit.as_deref().unwrap_or_default())
        }
        GitHead::Detached { commit } => format!("detached:{commit}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::git::parse::refs::parse_refs;

    fn records() -> Vec<RefRecord> {
        parse_refs(include_str!("parse/testdata/for_each_ref.txt")).unwrap()
    }

    fn main_head() -> GitHead {
        GitHead::Branch {
            name: "main".to_string(),
            commit: Some("f14f93805ed394325d8809b584a3ae780c62a753".to_string()),
        }
    }

    #[test]
    fn should_not_depend_on_the_order_of_the_refs() {
        // Arrange
        let mut reversed = records();
        reversed.reverse();

        // Act
        let fingerprint = fingerprint_of(&reversed, &main_head());

        // Assert
        assert_eq!(fingerprint, fingerprint_of(&records(), &main_head()));
        assert_eq!(fingerprint.len(), 64);
    }

    #[test]
    fn should_change_when_the_head_moves() {
        // Arrange
        let detached = GitHead::Detached {
            commit: "f14f93805ed394325d8809b584a3ae780c62a753".to_string(),
        };

        // Act
        let fingerprint = fingerprint_of(&records(), &detached);

        // Assert
        assert_ne!(fingerprint, fingerprint_of(&records(), &main_head()));
    }
}
