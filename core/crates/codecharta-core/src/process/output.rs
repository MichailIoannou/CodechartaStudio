use tokio::io::{AsyncRead, AsyncReadExt};
use tokio::process::Child;
use tokio::sync::mpsc;
use tokio::task::JoinHandle;
use tokio_util::sync::CancellationToken;

use super::utf8::Utf8Decoder;

const READ_CHUNK_BYTES: usize = 8 * 1024;

pub enum OutputMode {
    Collect,
    /// Chunks go to the receiver as they arrive; the `RunOutput` then holds no text.
    Stream(mpsc::Sender<OutputChunk>),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OutputChunk {
    Stdout(String),
    Stderr(String),
}

#[derive(Debug, Clone, Copy)]
enum StreamKind {
    Stdout,
    Stderr,
}

/// Reads both pipes of a child. Each stream may carry at most `limit_bytes`; past that, reading stops
/// and `overflow` fires so the runner can kill the process tree.
pub struct OutputReaders {
    pub stdout: JoinHandle<String>,
    pub stderr: JoinHandle<String>,
    pub overflow: CancellationToken,
}

impl OutputReaders {
    pub fn start(child: &mut Child, limit_bytes: u64, mode: &OutputMode) -> Self {
        let overflow = CancellationToken::new();
        let sink = |kind| StreamSink {
            kind,
            limit_bytes,
            overflow: overflow.clone(),
            sender: match mode {
                OutputMode::Collect => None,
                OutputMode::Stream(sender) => Some(sender.clone()),
            },
        };
        Self {
            stdout: spawn_reader(child.stdout.take(), sink(StreamKind::Stdout)),
            stderr: spawn_reader(child.stderr.take(), sink(StreamKind::Stderr)),
            overflow,
        }
    }
}

struct StreamSink {
    kind: StreamKind,
    limit_bytes: u64,
    overflow: CancellationToken,
    sender: Option<mpsc::Sender<OutputChunk>>,
}

impl StreamSink {
    async fn deliver(&self, text: String, collected: &mut String) {
        if text.is_empty() {
            return;
        }
        let Some(sender) = &self.sender else {
            collected.push_str(&text);
            return;
        };
        let chunk = match self.kind {
            StreamKind::Stdout => OutputChunk::Stdout(text),
            StreamKind::Stderr => OutputChunk::Stderr(text),
        };
        if sender.send(chunk).await.is_err() {
            tracing::debug!("the output receiver is gone; dropping the rest of the output");
        }
    }
}

fn spawn_reader<Pipe>(pipe: Option<Pipe>, sink: StreamSink) -> JoinHandle<String>
where
    Pipe: AsyncRead + Unpin + Send + 'static,
{
    tokio::spawn(async move {
        match pipe {
            Some(pipe) => read_all(pipe, sink).await,
            None => String::new(),
        }
    })
}

async fn read_all<Pipe: AsyncRead + Unpin>(mut pipe: Pipe, sink: StreamSink) -> String {
    let mut buffer = vec![0; READ_CHUNK_BYTES];
    let mut decoder = Utf8Decoder::default();
    let mut collected = String::new();
    let mut total_bytes: u64 = 0;
    loop {
        let read = match pipe.read(&mut buffer).await {
            Ok(0) | Err(_) => break,
            Ok(read) => read,
        };
        total_bytes += read as u64;
        if total_bytes > sink.limit_bytes {
            sink.overflow.cancel();
            return collected;
        }
        sink.deliver(decoder.decode(&buffer[..read]), &mut collected)
            .await;
    }
    sink.deliver(decoder.finish(), &mut collected).await;
    collected
}
