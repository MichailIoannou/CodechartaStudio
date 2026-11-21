use tokio::process::Child;

use crate::error::{CoreError, CoreResult};

/// A child and everything it starts. On unix the child leads its own process group; on Windows it is
/// assigned to a job object that kills all its processes when the job is terminated or its last handle
/// closes, so `cmd → bat → java` dies together, even when the core itself is killed.
#[derive(Debug)]
pub struct ProcessTree {
    #[cfg(unix)]
    group: nix::unistd::Pid,
    #[cfg(windows)]
    job: windows_job::JobHandle,
}

impl ProcessTree {
    #[cfg(unix)]
    pub fn attach(child: &Child) -> CoreResult<Self> {
        let pid = child.id().ok_or_else(already_reaped)?;
        let group = i32::try_from(pid).map_err(|_| already_reaped())?;
        Ok(Self {
            group: nix::unistd::Pid::from_raw(group),
        })
    }

    #[cfg(windows)]
    pub fn attach(child: &Child) -> CoreResult<Self> {
        let process = child.raw_handle().ok_or_else(already_reaped)?;
        let job = windows_job::JobHandle::containing(process).map_err(|source| CoreError::Io {
            context: "Could not put a child process into a job object".to_string(),
            source,
        })?;
        Ok(Self { job })
    }

    /// Asks the processes to stop; on Windows there is no polite form, so this already kills them.
    #[cfg(unix)]
    pub fn terminate(&self) -> CoreResult<()> {
        self.signal(nix::sys::signal::Signal::SIGTERM)
    }

    #[cfg(unix)]
    pub fn kill(&self) -> CoreResult<()> {
        self.signal(nix::sys::signal::Signal::SIGKILL)
    }

    #[cfg(unix)]
    fn signal(&self, signal: nix::sys::signal::Signal) -> CoreResult<()> {
        match nix::sys::signal::killpg(self.group, signal) {
            Ok(()) | Err(nix::errno::Errno::ESRCH) => Ok(()),
            Err(errno) => Err(CoreError::Io {
                context: "Could not stop a child process".to_string(),
                source: std::io::Error::from(errno),
            }),
        }
    }

    #[cfg(windows)]
    pub fn terminate(&self) -> CoreResult<()> {
        self.kill()
    }

    #[cfg(windows)]
    pub fn kill(&self) -> CoreResult<()> {
        self.job.terminate().map_err(|source| CoreError::Io {
            context: "Could not stop a child process".to_string(),
            source,
        })
    }
}

fn already_reaped() -> CoreError {
    CoreError::Internal("the child process ended before it could be tracked".to_string())
}

/// The only unsafe code of the workspace: the Win32 job object calls have no safe wrapper in std.
#[cfg(windows)]
#[allow(unsafe_code)]
mod windows_job {
    use std::ffi::c_void;
    use std::os::windows::io::RawHandle;

    use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
        JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JobObjectExtendedLimitInformation,
        SetInformationJobObject, TerminateJobObject,
    };

    const KILLED_EXIT_CODE: u32 = 1;

    #[derive(Debug)]
    pub struct JobHandle(HANDLE);

    // SAFETY: a job object handle is a kernel handle that may be used from any thread.
    unsafe impl Send for JobHandle {}
    // SAFETY: the job object calls used here are thread-safe.
    unsafe impl Sync for JobHandle {}

    impl JobHandle {
        pub fn containing(process: RawHandle) -> std::io::Result<Self> {
            // SAFETY: both arguments may be null (default security, unnamed job).
            let job = Self(unsafe { CreateJobObjectW(std::ptr::null(), std::ptr::null()) });
            if job.0.is_null() {
                return Err(std::io::Error::last_os_error());
            }
            job.kill_on_close()?;
            // SAFETY: `process` is the live handle of a child this process spawned.
            check(unsafe { AssignProcessToJobObject(job.0, process as HANDLE) })?;
            Ok(job)
        }

        fn kill_on_close(&self) -> std::io::Result<()> {
            // SAFETY: an all-zero JOBOBJECT_EXTENDED_LIMIT_INFORMATION is a valid "no limits" value.
            let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = unsafe { std::mem::zeroed() };
            limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            let size = u32::try_from(std::mem::size_of_val(&limits)).unwrap_or(u32::MAX);
            let pointer = std::ptr::from_ref(&limits).cast::<c_void>();
            // SAFETY: the pointer and size describe `limits`, which outlives the call.
            check(unsafe {
                SetInformationJobObject(self.0, JobObjectExtendedLimitInformation, pointer, size)
            })
        }

        pub fn terminate(&self) -> std::io::Result<()> {
            // SAFETY: `self.0` is an open job handle owned by this value.
            check(unsafe { TerminateJobObject(self.0, KILLED_EXIT_CODE) })
        }
    }

    impl Drop for JobHandle {
        fn drop(&mut self) {
            // SAFETY: `self.0` is an open job handle owned by this value and closed exactly once.
            unsafe { CloseHandle(self.0) };
        }
    }

    fn check(succeeded: i32) -> std::io::Result<()> {
        if succeeded == 0 {
            Err(std::io::Error::last_os_error())
        } else {
            Ok(())
        }
    }
}
