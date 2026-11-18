use std::io::{BufRead, BufReader, Read, Write};
use std::sync::mpsc;
use std::time::Duration;

use codecharta_core_api::secret::Secret;

use super::server::{AskpassReply, AskpassRequest, MAX_REQUEST_BYTES};

/// A person may take a while to find a passphrase; after this the helper gives up and git fails.
pub const ANSWER_TIMEOUT: Duration = Duration::from_secs(30 * 60);

#[derive(Debug, PartialEq, Eq)]
pub enum HelperOutcome {
    Answer(Secret),
    /// Cancelled, refused, unreachable or timed out: git sees a helper that failed.
    NoAnswer,
}

/// The askpass client: sends the prompt with the token to the serving core and waits for the reply. It
/// writes nothing to disk and logs nothing.
pub fn ask_broker(endpoint: &str, token: Secret, prompt: &str) -> HelperOutcome {
    ask_broker_within(
        endpoint,
        AskpassRequest {
            token,
            prompt: prompt.to_string(),
        },
        ANSWER_TIMEOUT,
    )
}

pub fn ask_broker_within(
    endpoint: &str,
    request: AskpassRequest,
    timeout: Duration,
) -> HelperOutcome {
    let Ok(connection) = platform::connect(endpoint) else {
        return HelperOutcome::NoAnswer;
    };
    let (sender, receiver) = mpsc::channel();
    std::thread::spawn(move || {
        let _gone = sender.send(exchange(connection, &request));
    });
    match receiver.recv_timeout(timeout) {
        Ok(Some(AskpassReply::Answer(answer))) => HelperOutcome::Answer(answer),
        _ => HelperOutcome::NoAnswer,
    }
}

fn exchange(
    mut connection: platform::Connection,
    request: &AskpassRequest,
) -> Option<AskpassReply> {
    let mut line = serde_json::to_vec(request).ok()?;
    line.push(b'\n');
    connection.write_all(&line).ok()?;
    connection.flush().ok()?;
    let mut reply = Vec::new();
    BufReader::new(connection.take(MAX_REQUEST_BYTES))
        .read_until(b'\n', &mut reply)
        .ok()?;
    serde_json::from_slice(&reply).ok()
}

#[cfg(unix)]
mod platform {
    pub type Connection = std::os::unix::net::UnixStream;

    pub fn connect(endpoint: &str) -> std::io::Result<Connection> {
        Connection::connect(endpoint)
    }
}

#[cfg(windows)]
mod platform {
    use std::time::Duration;

    pub type Connection = std::fs::File;

    /// `ERROR_PIPE_BUSY`: every instance is serving another helper; the server creates the next one.
    const PIPE_BUSY: i32 = 231;
    const BUSY_RETRIES: u32 = 100;
    const BUSY_PAUSE: Duration = Duration::from_millis(50);

    pub fn connect(endpoint: &str) -> std::io::Result<Connection> {
        let mut attempt = 0;
        loop {
            match std::fs::File::options()
                .read(true)
                .write(true)
                .open(endpoint)
            {
                Err(error) if error.raw_os_error() == Some(PIPE_BUSY) && attempt < BUSY_RETRIES => {
                    attempt += 1;
                    std::thread::sleep(BUSY_PAUSE);
                }
                result => return result,
            }
        }
    }
}
