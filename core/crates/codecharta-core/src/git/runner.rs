use std::ffi::OsString;
use std::future::Future;
use std::path::Path;
use std::pin::Pin;
use std::time::Duration;

use codecharta_core_api::methods::tools::ToolId;
use tokio_util::sync::CancellationToken;

use crate::error::CoreResult;
use crate::tools::{ToolRunOptions, Tools};

pub const GIT_TIMEOUT: Duration = Duration::from_secs(15);

/// A finished git command; a non-zero exit is an answer, not an error.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GitOutput {
    pub exit_code: i32,
    pub stdout: String,
}

impl GitOutput {
    pub fn succeeded(&self) -> bool {
        self.exit_code == 0
    }
}

pub type GitFuture<'call> = Pin<Box<dyn Future<Output = CoreResult<GitOutput>> + Send + 'call>>;

/// Runs the system git in a folder. Every argument a caller derives from input is validated first, so
/// none can start with `-`.
pub trait GitRunner: Send + Sync {
    fn run<'call>(&'call self, cwd: &'call Path, args: &'call [&'call str]) -> GitFuture<'call>;
}

impl GitRunner for Tools {
    fn run<'call>(&'call self, cwd: &'call Path, args: &'call [&'call str]) -> GitFuture<'call> {
        Box::pin(async move {
            let options = ToolRunOptions {
                cwd: Some(cwd.to_path_buf()),
                ..ToolRunOptions::new(GIT_TIMEOUT)
            };
            let args = args.iter().map(OsString::from).collect();
            let output =
                Tools::run(self, ToolId::Git, args, options, &CancellationToken::new()).await?;
            Ok(GitOutput {
                exit_code: output.exit_code,
                stdout: output.stdout,
            })
        })
    }
}
