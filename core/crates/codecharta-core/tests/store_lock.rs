mod support;

use std::io::{BufRead, BufReader};
use std::path::Path;
use std::process::{Child, Command, Stdio};

use codecharta_core::CoreError;
use codecharta_core::store::Store;

const LOCK_HELD: &str = "locked";

struct LockHolder {
    child: Child,
}

impl LockHolder {
    fn start(root: &Path) -> Self {
        let mut child = Command::new(support::fake_tool())
            .arg("hold-store-lock")
            .arg(root)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .spawn()
            .expect("the fake tool starts");
        let stdout = child.stdout.take().expect("stdout is piped");
        let mut line = String::new();
        BufReader::new(stdout)
            .read_line(&mut line)
            .expect("the holder reports");
        assert_eq!(line.trim(), LOCK_HELD);
        Self { child }
    }

    fn exit(mut self) {
        self.child.stdin.take();
        let status = self.child.wait().expect("the holder exits");
        assert!(status.success());
    }
}

impl Drop for LockHolder {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

#[test]
fn should_fail_with_store_locked_while_another_process_holds_the_lock() {
    // Arrange
    let folder = tempfile::tempdir().unwrap();
    let _holder = LockHolder::start(folder.path());

    // Act
    let result = Store::open(folder.path());

    // Assert
    assert!(
        matches!(result, Err(CoreError::StoreLocked { .. })),
        "{result:?}"
    );
    assert!(!folder.path().join("store.json").exists());
}

#[test]
fn should_acquire_the_lock_once_the_holder_exited() {
    // Arrange
    let folder = tempfile::tempdir().unwrap();
    LockHolder::start(folder.path()).exit();

    // Act
    let store = Store::open(folder.path()).unwrap();

    // Assert
    assert!(store.is_writable());
    assert!(folder.path().join("store.json").exists());
}

#[test]
fn should_not_lock_for_a_read_only_open() {
    // Arrange
    let folder = tempfile::tempdir().unwrap();
    let _holder = LockHolder::start(folder.path());

    // Act
    let store = Store::open_read_only(folder.path()).unwrap();

    // Assert
    assert!(!store.is_writable());
    assert!(!folder.path().join("store.json").exists());
}
