pub mod detect;
pub mod remote_url;
pub mod slug;
pub mod status;

pub use detect::{Detection, detect, status_of};
pub use remote_url::{RemoteRef, parse_remote_url};
pub use slug::{RepoSlug, validate_repo_slug};
pub use status::hosting_status;
