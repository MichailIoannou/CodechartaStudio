use std::process::ExitCode;

use codecharta_core::analysis::queue::AnalysisEvent;
use codecharta_core::{Core, CoreError, CoreResult};
use codecharta_core_api::ids::{FolderId, JobId, ProjectId, SnapshotId};
use codecharta_core_api::methods::analysis::{
    AnalysisJob, AnalysisTarget, EnqueueResult, JobError, JobProgress, JobState, PreflightProblem,
};
use codecharta_core_api::methods::projects::FolderRef;
use codecharta_core_api::values::CommitSha;
use serde::Serialize;
use tokio::sync::broadcast;

use super::output::{exit_code_of, print_json};

const FAILED: u8 = 1;
/// What a shell reports for a command stopped by Ctrl-C (128 + SIGINT).
const INTERRUPTED: u8 = 130;

pub struct AnalyseOptions {
    pub project: ProjectId,
    pub folder: FolderId,
    pub commit: Option<CommitSha>,
    pub force: bool,
    pub json: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AnalysedJson<'job> {
    snapshot_id: &'job SnapshotId,
    was_already_analysed: bool,
    job: Option<&'job AnalysisJob>,
}

/// How the command ended, before anything is printed.
enum Outcome {
    AlreadyAnalysed(SnapshotId),
    Finished(Box<AnalysisJob>),
    Rejected(Vec<PreflightProblem>),
}

/// Analyses in this process, without a serving core: cleans up after crashed runs, queues the job, runs
/// it and prints the snapshot id. Exits 0 when done, 1 when refused or failed, 130 when interrupted.
pub fn run_analyse(
    core: &Core,
    runtime: &tokio::runtime::Runtime,
    options: AnalyseOptions,
) -> ExitCode {
    core.open_store();
    let folder = FolderRef {
        project_id: options.project.clone(),
        folder_id: options.folder.clone(),
    };
    let target = match options.commit.clone() {
        Some(sha) => AnalysisTarget::Commit { sha },
        None => AnalysisTarget::WorkingTree,
    };
    match runtime.block_on(analyse(core, &folder, target, options.force)) {
        Ok(outcome) => report(&outcome, options.json),
        Err(error) => exit_code_of(Err(error)),
    }
}

async fn analyse(
    core: &Core,
    folder: &FolderRef,
    target: AnalysisTarget,
    force: bool,
) -> CoreResult<Outcome> {
    let analyses = core.analyses();
    if let Err(error) = analyses.recover().await {
        tracing::warn!("could not clean up after abandoned analyses: {error}");
    }
    let events = core.analysis_queue().subscribe();
    let job = match analyses.enqueue(folder, target, force).await? {
        EnqueueResult::Queued { job } | EnqueueResult::AlreadyQueued { job } => job,
        EnqueueResult::AlreadyAnalysed { snapshot_id } => {
            return Ok(Outcome::AlreadyAnalysed(snapshot_id));
        }
        EnqueueResult::Rejected { problems } => return Ok(Outcome::Rejected(problems)),
    };
    let watching = async {
        let finished = watch(core, events, &job.id).await;
        core.analysis_queue().shutdown();
        finished
    };
    let ((), finished) = tokio::join!(analyses.drive(), watching);
    finished.map(|job| Outcome::Finished(Box::new(job)))
}

/// Prints progress on stderr until the job ends; Ctrl-C cancels it, which still waits for the clean-up.
async fn watch(
    core: &Core,
    mut events: broadcast::Receiver<AnalysisEvent>,
    job_id: &JobId,
) -> CoreResult<AnalysisJob> {
    let mut interrupted = false;
    loop {
        tokio::select! {
            event = events.recv() => {
                if let Some(job) = finished_job(core, event, job_id) {
                    return Ok(job);
                }
            }
            signal = tokio::signal::ctrl_c(), if !interrupted => {
                interrupted = true;
                signal.map_err(|source| CoreError::Io {
                    context: "Could not listen for Ctrl-C".to_string(),
                    source,
                })?;
                eprintln!("Cancelling the analysis…");
                core.analysis_queue().cancel(job_id)?;
            }
        }
    }
}

fn finished_job(
    core: &Core,
    event: Result<AnalysisEvent, broadcast::error::RecvError>,
    job_id: &JobId,
) -> Option<AnalysisJob> {
    match event {
        Ok(AnalysisEvent::Progress {
            job_id: id,
            progress: JobProgress::Determinate { percent },
        }) if id == *job_id => {
            eprintln!("{percent}%");
            None
        }
        Ok(
            AnalysisEvent::Finished(job)
            | AnalysisEvent::Failed(job)
            | AnalysisEvent::Cancelled(job),
        ) if job.id == *job_id => Some(job),
        Ok(_) => None,
        Err(_) => core
            .analysis_queue()
            .list()
            .into_iter()
            .find(|job| job.id == *job_id && job.state.is_finished()),
    }
}

fn report(outcome: &Outcome, json: bool) -> ExitCode {
    match outcome {
        Outcome::AlreadyAnalysed(snapshot_id) => {
            eprintln!(
                "This commit was analysed before with the current profile; use --force to repeat."
            );
            print_snapshot(snapshot_id, None, json)
        }
        Outcome::Rejected(problems) => {
            problems.iter().for_each(print_problem);
            ExitCode::from(FAILED)
        }
        Outcome::Finished(job) => report_job(job, json),
    }
}

fn report_job(job: &AnalysisJob, json: bool) -> ExitCode {
    match (job.state, &job.snapshot_id, &job.error) {
        (JobState::Done, Some(snapshot_id), _) => print_snapshot(snapshot_id, Some(job), json),
        (JobState::Failed, _, Some(error)) => {
            print_job_error(error);
            ExitCode::from(FAILED)
        }
        _ => {
            eprintln!("The analysis was cancelled.");
            ExitCode::from(INTERRUPTED)
        }
    }
}

fn print_snapshot(snapshot_id: &SnapshotId, job: Option<&AnalysisJob>, json: bool) -> ExitCode {
    if !json {
        println!("{snapshot_id}");
        return ExitCode::SUCCESS;
    }
    exit_code_of(print_json(&AnalysedJson {
        snapshot_id,
        was_already_analysed: job.is_none(),
        job,
    }))
}

fn print_problem(problem: &PreflightProblem) {
    print_refusal(&problem.code, &problem.message, problem.hint.as_deref());
}

fn print_job_error(error: &JobError) {
    print_refusal(&error.code, &error.message, error.hint.as_deref());
}

/// `<CODE>: <message> <hint>` on stderr.
fn print_refusal<Code: Serialize>(code: &Code, message: &str, hint: Option<&str>) {
    let hint = hint.map(|hint| format!(" {hint}")).unwrap_or_default();
    eprintln!("{}: {message}{hint}", wire_name(code));
}

/// The code as it is written on the wire, so scripts can match it.
fn wire_name<Code: Serialize>(code: &Code) -> String {
    serde_json::to_value(code)
        .ok()
        .and_then(|value| value.as_str().map(str::to_string))
        .unwrap_or_default()
}
