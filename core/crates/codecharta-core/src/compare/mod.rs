pub mod preflight;
pub mod project_folder;
pub mod resolve;
pub mod sides;

#[cfg(test)]
mod fixtures;

pub use preflight::{SizeLimits, preflight};
pub use project_folder::{compared_folder, resolve_in_project};
pub use resolve::CommitComparison;
pub use sides::{SideLookup, side_status};
