use serde::Serialize;
use tokio::io::{AsyncWrite, AsyncWriteExt};
use tokio::sync::mpsc;
use tokio::task::JoinHandle;

#[derive(Clone)]
pub struct OutputLines {
    sender: mpsc::UnboundedSender<String>,
}

impl OutputLines {
    pub fn send<Message: Serialize>(&self, message: &Message) {
        match serde_json::to_string(message) {
            Ok(line) => self.send_line(line),
            Err(error) => tracing::error!("could not serialise an outgoing message: {error}"),
        }
    }

    fn send_line(&self, line: String) {
        if self.sender.send(line).is_err() {
            tracing::warn!("dropped an outgoing message because the output is closed");
        }
    }
}

/// One task owns the output, so lines written by concurrent requests never interleave.
pub fn spawn_writer<Output>(output: Output) -> (OutputLines, JoinHandle<()>)
where
    Output: AsyncWrite + Unpin + Send + 'static,
{
    let (sender, receiver) = mpsc::unbounded_channel();
    let writer = tokio::spawn(write_lines(output, receiver));
    (OutputLines { sender }, writer)
}

async fn write_lines<Output: AsyncWrite + Unpin>(
    mut output: Output,
    mut receiver: mpsc::UnboundedReceiver<String>,
) {
    while let Some(line) = receiver.recv().await {
        if let Err(error) = write_line(&mut output, &line).await {
            tracing::error!("could not write to the output: {error}");
            return;
        }
    }
}

async fn write_line<Output: AsyncWrite + Unpin>(
    output: &mut Output,
    line: &str,
) -> std::io::Result<()> {
    output.write_all(line.as_bytes()).await?;
    output.write_all(b"\n").await?;
    output.flush().await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn should_write_one_json_object_per_line() {
        // Arrange
        let (client, mut server) = tokio::io::duplex(1024);
        let (lines, writer) = spawn_writer(client);

        // Act
        lines.send(&serde_json::json!({ "first": 1 }));
        lines.send(&serde_json::json!({ "second": 2 }));
        drop(lines);
        writer.await.unwrap();
        let mut written = String::new();
        tokio::io::AsyncReadExt::read_to_string(&mut server, &mut written)
            .await
            .unwrap();

        // Assert
        assert_eq!(written, "{\"first\":1}\n{\"second\":2}\n");
    }
}
