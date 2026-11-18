pub mod dispatch;
pub mod framing;
pub mod output;
mod projects_routes;
pub mod session;
mod store_routes;
mod test_methods;
mod tools_routes;

use std::sync::Arc;

use codecharta_core::Core;
use tokio::io::{AsyncBufRead, AsyncWrite};

use framing::{LineReader, MAX_LINE_BYTES};
use output::spawn_writer;
use session::{Flow, SHUTDOWN_GRACE, Session};

pub async fn serve<Input, Output>(core: Arc<Core>, input: Input, output: Output)
where
    Input: AsyncBufRead + Unpin,
    Output: AsyncWrite + Unpin + Send + 'static,
{
    let (lines, writer) = spawn_writer(output);
    let mut session = Session::new(Arc::clone(&core), lines);
    let mut reader = LineReader::new(input, MAX_LINE_BYTES);
    loop {
        let frame = match reader.next_frame().await {
            Ok(Some(frame)) => frame,
            Ok(None) => break,
            Err(error) => {
                tracing::error!("could not read the input: {error}");
                break;
            }
        };
        if session.handle_frame(frame).await == Flow::Stop {
            break;
        }
    }
    session.finish().await;
    core.shutdown().await;
    match tokio::time::timeout(SHUTDOWN_GRACE, writer).await {
        Ok(Ok(())) => {}
        Ok(Err(error)) => tracing::error!("the output writer failed: {error}"),
        Err(_) => tracing::warn!("gave up writing the remaining output at shutdown"),
    }
}
