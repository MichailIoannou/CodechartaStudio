use std::sync::Arc;
use std::time::Duration;

use codecharta_core_api::secret::Secret;
use serde::{Deserialize, Serialize};
use tokio::io::{AsyncBufReadExt, AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt, BufReader};
use tokio::task::JoinHandle;

use super::broker::{AskpassTarget, PromptBroker, PromptReply};
use crate::error::{CoreError, CoreResult};
use crate::git::askpass::AskpassHelpers;

/// A helper sends one line: a token of 64 digits and a prompt of at most 4096 characters, JSON-escaped.
pub const MAX_REQUEST_BYTES: u64 = 64 * 1024;
/// A connection that has not sent its request by then is closed.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(10);
const ACCEPT_RETRY_PAUSE: Duration = Duration::from_millis(100);
const LINE_END: u8 = b'\n';

/// The one line a helper sends.
#[derive(Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AskpassRequest {
    pub token: Secret,
    pub prompt: String,
}

/// The one line the broker answers; a cancelled prompt is `{"cancel":true}`.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AskpassReply {
    Answer(Secret),
    Cancel(bool),
}

/// Listens for askpass helpers while it lives: a unix socket inside a folder only the current user may
/// enter, or a named pipe that refuses remote clients. Dropping it stops listening and removes the socket.
pub struct AskpassServer {
    broker: Arc<PromptBroker>,
    endpoint: String,
    accepting: JoinHandle<()>,
    _listener_files: platform::ListenerFiles,
}

impl AskpassServer {
    /// Must run inside the tokio runtime.
    pub fn start(broker: Arc<PromptBroker>, helpers: AskpassHelpers) -> CoreResult<Self> {
        let (listener, endpoint, listener_files) =
            platform::bind().map_err(|source| CoreError::Io {
                context: "Could not open the credential prompt endpoint".to_string(),
                source,
            })?;
        broker.attach(AskpassTarget {
            endpoint: endpoint.clone(),
            helpers,
        });
        let accepting = tokio::spawn(accept_helpers(listener, Arc::clone(&broker)));
        Ok(Self {
            broker,
            endpoint,
            accepting,
            _listener_files: listener_files,
        })
    }

    pub fn endpoint(&self) -> &str {
        &self.endpoint
    }
}

impl Drop for AskpassServer {
    fn drop(&mut self) {
        self.broker.detach();
        self.accepting.abort();
    }
}

async fn accept_helpers(mut listener: platform::Listener, broker: Arc<PromptBroker>) {
    loop {
        match listener.accept().await {
            Ok(connection) => {
                tokio::spawn(serve_helper(connection, Arc::clone(&broker)));
            }
            Err(error) => {
                tracing::warn!("could not accept an askpass helper: {error}");
                tokio::time::sleep(ACCEPT_RETRY_PAUSE).await;
            }
        }
    }
}

/// A connection without a valid request, or with a token of no open session, is closed unanswered.
async fn serve_helper<Connection>(connection: Connection, broker: Arc<PromptBroker>)
where
    Connection: AsyncRead + AsyncWrite + Unpin + Send,
{
    let (reader, mut writer) = tokio::io::split(connection);
    let Ok(Some(request)) = tokio::time::timeout(REQUEST_TIMEOUT, read_request(reader)).await
    else {
        return;
    };
    let Some(waiting) = broker.ask(request.token.expose(), &request.prompt) else {
        return;
    };
    let reply = match waiting.await {
        Ok(PromptReply::Answer(answer)) => AskpassReply::Answer(answer),
        Ok(PromptReply::Cancel) | Err(_) => AskpassReply::Cancel(true),
    };
    if let Err(error) = write_reply(&mut writer, &reply).await {
        tracing::debug!("the askpass helper went away before its reply: {error}");
    }
}

async fn read_request(reader: impl AsyncRead + Unpin) -> Option<AskpassRequest> {
    let mut line = Vec::new();
    BufReader::new(reader.take(MAX_REQUEST_BYTES))
        .read_until(LINE_END, &mut line)
        .await
        .ok()?;
    serde_json::from_slice(&line).ok()
}

async fn write_reply(
    writer: &mut (impl AsyncWrite + Unpin),
    reply: &AskpassReply,
) -> std::io::Result<()> {
    let mut line = serde_json::to_vec(reply).map_err(std::io::Error::other)?;
    line.push(LINE_END);
    writer.write_all(&line).await?;
    writer.shutdown().await
}

#[cfg(unix)]
mod platform {
    use std::os::unix::fs::{DirBuilderExt, PermissionsExt};
    use std::path::{Path, PathBuf};

    use tokio::net::{UnixListener, UnixStream};

    use crate::ids::new_endpoint_suffix;

    /// `sun_path` holds 104 bytes on macOS and 108 on Linux.
    const MAX_SOCKET_PATH_BYTES: usize = 100;
    const SHORT_TEMP_FOLDER: &str = "/tmp";
    const FOLDER_PREFIX: &str = "cc-askpass-";
    const SOCKET_NAME: &str = "s";
    const OWNER_ONLY_FOLDER: u32 = 0o700;
    const OWNER_ONLY_SOCKET: u32 = 0o600;

    pub struct Listener(UnixListener);

    impl Listener {
        pub async fn accept(&mut self) -> std::io::Result<UnixStream> {
            self.0.accept().await.map(|(stream, _)| stream)
        }
    }

    /// The socket's folder is created `0700` before the socket exists, so no other user can reach the
    /// socket even for the moment before it is made `0600` too.
    pub struct ListenerFiles {
        folder: PathBuf,
    }

    impl Drop for ListenerFiles {
        fn drop(&mut self) {
            if let Err(error) = std::fs::remove_dir_all(&self.folder) {
                tracing::debug!("could not remove the askpass socket folder: {error}");
            }
        }
    }

    pub fn bind() -> std::io::Result<(Listener, String, ListenerFiles)> {
        let folder = socket_folder(&std::env::temp_dir())?;
        std::fs::DirBuilder::new()
            .mode(OWNER_ONLY_FOLDER)
            .create(&folder)?;
        let files = ListenerFiles { folder };
        let socket = files.folder.join(SOCKET_NAME);
        let listener = UnixListener::bind(&socket)?;
        std::fs::set_permissions(&socket, std::fs::Permissions::from_mode(OWNER_ONLY_SOCKET))?;
        let endpoint = socket
            .to_str()
            .ok_or_else(|| std::io::Error::other("the socket path is not UTF-8"))?
            .to_string();
        Ok((Listener(listener), endpoint, files))
    }

    fn socket_folder(temp: &Path) -> std::io::Result<PathBuf> {
        let name = format!(
            "{FOLDER_PREFIX}{}",
            new_endpoint_suffix().map_err(std::io::Error::other)?
        );
        let preferred = temp.join(&name);
        let socket_length = preferred.join(SOCKET_NAME).as_os_str().len();
        Ok(if socket_length <= MAX_SOCKET_PATH_BYTES {
            preferred
        } else {
            Path::new(SHORT_TEMP_FOLDER).join(name)
        })
    }
}

#[cfg(windows)]
mod platform {
    use tokio::net::windows::named_pipe::{NamedPipeServer, ServerOptions};

    use crate::ids::new_endpoint_suffix;

    const PIPE_PREFIX: &str = r"\\.\pipe\codecharta-askpass-";

    /// The next pipe instance waits for a client while the previous one serves its helper.
    pub struct Listener {
        name: String,
        next: NamedPipeServer,
    }

    impl Listener {
        pub async fn accept(&mut self) -> std::io::Result<NamedPipeServer> {
            self.next.connect().await?;
            let following = pipe_options().create(&self.name)?;
            Ok(std::mem::replace(&mut self.next, following))
        }
    }

    /// A named pipe leaves no file behind.
    pub struct ListenerFiles;

    /// `first_pipe_instance` fails when another process already created the name; remote clients are
    /// refused. The default security descriptor gives other local users read access only, so they cannot
    /// send a token.
    pub fn bind() -> std::io::Result<(Listener, String, ListenerFiles)> {
        let name = format!(
            "{PIPE_PREFIX}{}",
            new_endpoint_suffix().map_err(std::io::Error::other)?
        );
        let first = pipe_options().first_pipe_instance(true).create(&name)?;
        let listener = Listener {
            name: name.clone(),
            next: first,
        };
        Ok((listener, name, ListenerFiles))
    }

    fn pipe_options() -> ServerOptions {
        let mut options = ServerOptions::new();
        options.reject_remote_clients(true);
        options
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_write_replies_as_the_helper_reads_them() {
        // Arrange
        let replies = [
            AskpassReply::Answer(Secret::new("pa\"ss".to_string())),
            AskpassReply::Cancel(true),
        ];

        // Act
        let lines: Vec<String> = replies
            .iter()
            .map(|reply| serde_json::to_string(reply).unwrap())
            .collect();

        // Assert
        assert_eq!(lines, [r#"{"answer":"pa\"ss"}"#, r#"{"cancel":true}"#]);
    }

    #[test]
    fn should_print_a_request_without_its_token() {
        // Arrange
        let request: AskpassRequest =
            serde_json::from_str(r#"{"token":"0123abcd","prompt":"Password: "}"#).unwrap();

        // Act
        let printed = format!("{request:?}");

        // Assert
        assert!(!printed.contains("0123abcd"), "{printed}");
        assert!(printed.contains("Password: "));
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn should_make_the_socket_reachable_only_by_the_current_user() {
        // Arrange
        use std::os::unix::fs::PermissionsExt;
        let broker = Arc::new(PromptBroker::default());
        let helpers = AskpassHelpers {
            git: std::env::temp_dir().join("helper"),
            ssh: None,
        };

        // Act
        let server = AskpassServer::start(Arc::clone(&broker), helpers).unwrap();

        // Assert
        let socket = std::path::PathBuf::from(server.endpoint());
        let folder = socket.parent().unwrap();
        let mode =
            |path: &std::path::Path| std::fs::metadata(path).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode(folder), 0o700);
        assert_eq!(mode(&socket), 0o600);
        assert!(socket.as_os_str().len() <= 100);
        drop(server);
        assert!(!folder.exists());
    }
}
