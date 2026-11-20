use std::collections::HashMap;
use std::future::Future;
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};

use tokio_util::sync::CancellationToken;

use crate::error::{CoreError, CoreResult};

/// One turn after another; tokio's mutex hands the lock over in the order it was asked for.
type Turns = Arc<tokio::sync::Mutex<()>>;

/// Mutating git operations of one repository run one after another, in the order they were queued;
/// operations of different repositories run side by side. Plans 05 and 06 run every mutating git command
/// through it too.
#[derive(Debug, Default)]
pub struct OperationQueue {
    lanes: Mutex<HashMap<String, Turns>>,
}

impl OperationQueue {
    /// A task whose request is cancelled while it waits is dropped without ever running.
    pub async fn run_exclusive<T>(
        &self,
        repository_id: &str,
        cancel: &CancellationToken,
        task: impl Future<Output = CoreResult<T>>,
    ) -> CoreResult<T> {
        let lane = Lane::join(self, repository_id);
        let _turn = tokio::select! {
            biased;
            () = cancel.cancelled() => return Err(CoreError::Cancelled),
            turn = lane.turns.lock() => turn,
        };
        task.await
    }

    /// Repositories with an operation running or waiting.
    pub fn busy_repositories(&self) -> usize {
        self.lock_lanes().len()
    }

    fn lock_lanes(&self) -> MutexGuard<'_, HashMap<String, Turns>> {
        self.lanes.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

/// A place in the queue of one repository; the repository's entry goes when its last place does.
struct Lane<'queue> {
    queue: &'queue OperationQueue,
    repository_id: String,
    turns: Turns,
}

impl<'queue> Lane<'queue> {
    fn join(queue: &'queue OperationQueue, repository_id: &str) -> Self {
        let turns = Arc::clone(
            queue
                .lock_lanes()
                .entry(repository_id.to_string())
                .or_default(),
        );
        Self {
            queue,
            repository_id: repository_id.to_string(),
            turns,
        }
    }
}

const HELD_BY_MAP_AND_THIS_LANE: usize = 2;

impl Drop for Lane<'_> {
    fn drop(&mut self) {
        let mut lanes = self.queue.lock_lanes();
        if Arc::strong_count(&self.turns) == HELD_BY_MAP_AND_THIS_LANE {
            lanes.remove(&self.repository_id);
        }
    }
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use tokio::sync::oneshot;

    use super::*;

    const DEADLOCK_GUARD: Duration = Duration::from_secs(5);
    const WHILE_WAITING: Duration = Duration::from_millis(50);

    type Steps = Mutex<Vec<&'static str>>;

    fn record(steps: &Steps, step: &'static str) {
        steps.lock().unwrap().push(step);
    }

    #[tokio::test]
    async fn should_run_two_operations_of_one_repository_in_order() {
        // Arrange
        let queue = OperationQueue::default();
        let cancel = CancellationToken::new();
        let steps = Steps::default();
        let (release, released) = oneshot::channel::<()>();
        let first = queue.run_exclusive("repo", &cancel, async {
            record(&steps, "first starts");
            released.await.ok();
            record(&steps, "first ends");
            Ok(())
        });
        let second = queue.run_exclusive("repo", &cancel, async {
            record(&steps, "second runs");
            Ok(())
        });
        let releaser = async {
            tokio::time::sleep(WHILE_WAITING).await;
            record(&steps, "released");
            release.send(()).ok();
        };

        // Act
        let (first, second, ()) = tokio::join!(first, second, releaser);

        // Assert
        assert!(first.is_ok() && second.is_ok());
        assert_eq!(
            *steps.lock().unwrap(),
            ["first starts", "released", "first ends", "second runs"]
        );
    }

    #[tokio::test]
    async fn should_run_operations_of_two_repositories_in_parallel() {
        // Arrange
        let queue = OperationQueue::default();
        let cancel = CancellationToken::new();
        let (signal, signalled) = oneshot::channel::<()>();
        let waiting = queue.run_exclusive("first repo", &cancel, async {
            signalled.await.map_err(|_| CoreError::Cancelled)
        });
        let signalling = queue.run_exclusive("second repo", &cancel, async {
            signal.send(()).ok();
            Ok(())
        });

        // Act
        let both =
            tokio::time::timeout(DEADLOCK_GUARD, async { tokio::join!(waiting, signalling) }).await;

        // Assert
        let (waited, signalled) = both.expect("the second repository did not wait for the first");
        assert!(waited.is_ok() && signalled.is_ok());
    }

    #[tokio::test]
    async fn should_start_the_next_operation_after_a_failure() {
        // Arrange
        let queue = OperationQueue::default();
        let cancel = CancellationToken::new();

        // Act
        let failed = queue
            .run_exclusive("repo", &cancel, async {
                Err::<(), _>(CoreError::Conflict("busy".to_string()))
            })
            .await;
        let next = queue
            .run_exclusive("repo", &cancel, async { Ok("ran") })
            .await;

        // Assert
        assert!(matches!(failed, Err(CoreError::Conflict(_))));
        assert_eq!(next.unwrap(), "ran");
    }

    #[tokio::test]
    async fn should_never_run_a_cancelled_queued_task() {
        // Arrange
        let queue = OperationQueue::default();
        let running = CancellationToken::new();
        let waiting = CancellationToken::new();
        let steps = Steps::default();
        let (release, released) = oneshot::channel::<()>();
        let first = queue.run_exclusive("repo", &running, async {
            released.await.ok();
            Ok(())
        });
        let cancelled = queue.run_exclusive("repo", &waiting, async {
            record(&steps, "cancelled task ran");
            Ok(())
        });
        let canceller = async {
            tokio::time::sleep(WHILE_WAITING).await;
            waiting.cancel();
            tokio::time::sleep(WHILE_WAITING).await;
            release.send(()).ok();
        };

        // Act
        let (first, cancelled, ()) = tokio::join!(first, cancelled, canceller);

        // Assert
        assert!(first.is_ok());
        assert!(matches!(cancelled, Err(CoreError::Cancelled)));
        assert!(steps.lock().unwrap().is_empty());
        assert_eq!(queue.busy_repositories(), 0);
    }

    #[tokio::test]
    async fn should_forget_a_repository_once_its_operations_ended() {
        // Arrange
        let queue = OperationQueue::default();
        let cancel = CancellationToken::new();
        let busy_while_running = Mutex::new(0);

        // Act
        queue
            .run_exclusive("repo", &cancel, async {
                *busy_while_running.lock().unwrap() = queue.busy_repositories();
                Ok(())
            })
            .await
            .unwrap();

        // Assert
        assert_eq!(*busy_while_running.lock().unwrap(), 1);
        assert_eq!(queue.busy_repositories(), 0);
    }
}
