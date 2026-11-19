use std::path::Path;

use codecharta_core::analysis::queue::AnalysisQueue;
use codecharta_core::git::GitService;
use codecharta_core::projects::ProjectRepository;
use codecharta_core::snapshots::retention::Retention;
use codecharta_core::snapshots::{
    FolderResolver, ImportRequest, MapFacts, OpenFileRequest, SnapshotMove, SnapshotRepository,
};
use codecharta_core::{Core, CoreResult, path_to_wire};
use codecharta_core_api::methods::projects::FolderRef;
use codecharta_core_api::methods::snapshots::{
    ImportSnapshotParams, MapLocation, OpenFileParams, OpenedFile, ResolveForCommitParams,
    SnapshotList, SnapshotLog, SnapshotRef, SnapshotResolution, SnapshotSummary, SnapshotsDelete,
    SnapshotsImport, SnapshotsInspectImportFile, SnapshotsList, SnapshotsMapLocation,
    SnapshotsMove, SnapshotsOpenFile, SnapshotsPlanPrune, SnapshotsPrune, SnapshotsReadLog,
    SnapshotsRecordMapFacts, SnapshotsResolveForCommit, SnapshotsUsage,
};
use codecharta_core_api::registry::Method;
use serde_json::Value;
use tokio_util::sync::CancellationToken;

use super::dispatch::{
    DispatchResult, HandlerFuture, RequestContext, domain_error, read_params, write_result,
};

fn answer<M: Method>(result: CoreResult<M::Result>) -> DispatchResult {
    write_result::<M>(result.map_err(domain_error)?)
}

pub fn resolve_for_commit(
    core: &Core,
    context: RequestContext,
    params: Value,
) -> HandlerFuture<'_> {
    Box::pin(async move {
        let params = read_params::<SnapshotsResolveForCommit>(params)?;
        answer::<SnapshotsResolveForCommit>(resolve(core, &params, &context.cancel).await)
    })
}

async fn resolve(
    core: &Core,
    params: &ResolveForCommitParams,
    cancel: &CancellationToken,
) -> CoreResult<SnapshotResolution> {
    let resolver = FolderResolver {
        projects: &core.projects()?,
        snapshots: &core.snapshots()?,
        git: &core.git()?,
        cache: core.resolution_cache(),
    };
    resolver
        .resolve(&params.folder(), &params.target, cancel)
        .await
}

pub fn list(core: &Core, _context: RequestContext, params: Value) -> HandlerFuture<'_> {
    Box::pin(async move {
        let folder = read_params::<SnapshotsList>(params)?;
        let snapshots = core
            .snapshots()
            .and_then(|snapshots| snapshots.list(&folder));
        answer::<SnapshotsList>(snapshots.map(|snapshots| SnapshotList { snapshots }))
    })
}

pub fn map_location(core: &Core, _context: RequestContext, params: Value) -> HandlerFuture<'_> {
    Box::pin(async move {
        let snapshot = read_params::<SnapshotsMapLocation>(params)?;
        let path = core
            .snapshots()
            .and_then(|snapshots| snapshots.map_location(&snapshot))
            .and_then(|path| path_to_wire(&path));
        answer::<SnapshotsMapLocation>(path.map(|path| MapLocation { path }))
    })
}

pub fn read_log(core: &Core, _context: RequestContext, params: Value) -> HandlerFuture<'_> {
    Box::pin(async move {
        let snapshot = read_params::<SnapshotsReadLog>(params)?;
        let log = core
            .snapshots()
            .and_then(|snapshots| snapshots.read_log(&snapshot));
        answer::<SnapshotsReadLog>(log.map(|log| SnapshotLog { log }))
    })
}

pub fn record_map_facts(core: &Core, _context: RequestContext, params: Value) -> HandlerFuture<'_> {
    Box::pin(async move {
        let params = read_params::<SnapshotsRecordMapFacts>(params)?;
        let snapshot = SnapshotRef {
            project_id: params.project_id,
            folder_id: params.folder_id,
            snapshot_id: params.snapshot_id,
        };
        let facts = MapFacts {
            checksum: params.checksum,
            root_name: params.root_name,
        };
        let recorded = async { core.snapshots()?.record_map_facts(&snapshot, facts).await };
        answer::<SnapshotsRecordMapFacts>(recorded.await)
    })
}

pub fn inspect_import_file(
    core: &Core,
    _context: RequestContext,
    params: Value,
) -> HandlerFuture<'_> {
    Box::pin(async move {
        let params = read_params::<SnapshotsInspectImportFile>(params)?;
        let picked = async {
            let snapshots = core.snapshots()?;
            snapshots
                .inspect_import_file(core.pick_tokens(), Path::new(&params.path))
                .await
        };
        answer::<SnapshotsInspectImportFile>(picked.await)
    })
}

pub fn open_file(core: &Core, _context: RequestContext, params: Value) -> HandlerFuture<'_> {
    Box::pin(async move {
        let params = read_params::<SnapshotsOpenFile>(params)?;
        answer::<SnapshotsOpenFile>(open_picked_file(core, params).await)
    })
}

async fn open_picked_file(core: &Core, params: OpenFileParams) -> CoreResult<OpenedFile> {
    let snapshots = core.snapshots()?;
    let taken = core.pick_tokens().take_file(&params.import_token)?;
    let request = OpenFileRequest {
        file: taken.first_path()?,
        target: params.target,
        bind_to_commit: params.bind_to_commit,
    };
    let opened = snapshots.open_file(request).await;
    core.pick_tokens().settle(taken, opened)
}

pub fn import(core: &Core, _context: RequestContext, params: Value) -> HandlerFuture<'_> {
    Box::pin(async move {
        let params = read_params::<SnapshotsImport>(params)?;
        answer::<SnapshotsImport>(import_picked_file(core, params).await)
    })
}

async fn import_picked_file(
    core: &Core,
    params: ImportSnapshotParams,
) -> CoreResult<SnapshotSummary> {
    let snapshots = core.snapshots()?;
    let taken = core.pick_tokens().take_file(&params.import_token)?;
    let request = ImportRequest {
        target: FolderRef {
            project_id: params.project_id,
            folder_id: params.folder_id,
        },
        file: taken.first_path()?,
        bind_to_commit: params.bind_to_commit,
    };
    let imported = snapshots
        .import_file(request)
        .await
        .map(|outcome| outcome.snapshot);
    core.pick_tokens().settle(taken, imported)
}

pub fn move_snapshot(core: &Core, _context: RequestContext, params: Value) -> HandlerFuture<'_> {
    Box::pin(async move {
        let params = read_params::<SnapshotsMove>(params)?;
        let snapshot = SnapshotRef {
            project_id: params.project_id,
            folder_id: params.folder_id,
            snapshot_id: params.snapshot_id,
        };
        let movement = SnapshotMove {
            to_folder: params.to_folder_id,
            bind_to_commit: params.bind_to_commit,
        };
        let moved = async { core.snapshots()?.move_snapshot(&snapshot, movement).await };
        answer::<SnapshotsMove>(moved.await)
    })
}

pub fn delete(core: &Core, _context: RequestContext, params: Value) -> HandlerFuture<'_> {
    Box::pin(async move {
        let params = read_params::<SnapshotsDelete>(params)?;
        let snapshot = SnapshotRef {
            project_id: params.project_id,
            folder_id: params.folder_id,
            snapshot_id: params.snapshot_id,
        };
        let deleted = async {
            let parts = RetentionParts::of(core)?;
            parts
                .retention()
                .delete(&snapshot, params.permanently)
                .await
        };
        answer::<SnapshotsDelete>(deleted.await)
    })
}

pub fn usage(core: &Core, _context: RequestContext, params: Value) -> HandlerFuture<'_> {
    Box::pin(async move {
        let params = read_params::<SnapshotsUsage>(params)?;
        let measured =
            RetentionParts::of(core).and_then(|parts| parts.retention().usage(&params.project_id));
        answer::<SnapshotsUsage>(measured)
    })
}

pub fn plan_prune(core: &Core, context: RequestContext, params: Value) -> HandlerFuture<'_> {
    Box::pin(async move {
        let params = read_params::<SnapshotsPlanPrune>(params)?;
        let planned = async {
            let parts = RetentionParts::of(core)?;
            parts
                .retention()
                .plan_prune(&params.folder(), &params.policy, &context.cancel)
                .await
        };
        answer::<SnapshotsPlanPrune>(planned.await)
    })
}

pub fn prune(core: &Core, _context: RequestContext, params: Value) -> HandlerFuture<'_> {
    Box::pin(async move {
        let params = read_params::<SnapshotsPrune>(params)?;
        let pruned = async {
            let parts = RetentionParts::of(core)?;
            parts
                .retention()
                .prune(&params.folder(), &params.snapshot_ids, params.permanently)
                .await
        };
        answer::<SnapshotsPrune>(pruned.await)
    })
}

/// What a `Retention` of the serving core borrows.
struct RetentionParts<'core> {
    projects: ProjectRepository<'core>,
    snapshots: SnapshotRepository<'core>,
    git: GitService<'core>,
    queue: &'core AnalysisQueue,
}

impl<'core> RetentionParts<'core> {
    fn of(core: &'core Core) -> CoreResult<Self> {
        Ok(Self {
            projects: core.projects()?,
            snapshots: core.snapshots()?,
            git: core.git()?,
            queue: core.analysis_queue(),
        })
    }

    fn retention(&self) -> Retention<'_, 'core> {
        Retention {
            projects: &self.projects,
            snapshots: &self.snapshots,
            git: &self.git,
            queue: self.queue,
        }
    }
}
