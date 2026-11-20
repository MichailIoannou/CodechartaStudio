use std::path::Path;

use codecharta_core::projects::active::pick_folder;
use codecharta_core::projects::{FolderChanges, FolderToAdd, NewProject, Relink};
use codecharta_core::{Core, CoreResult, path_to_wire};
use codecharta_core_api::methods::projects::{
    ActiveProject, AddFolderParams, CreateProjectParams, FolderPath, FolderRef, Project,
    ProjectList, ProjectsAddFolder, ProjectsCreate, ProjectsDelete, ProjectsFolderPath,
    ProjectsGet, ProjectsGetActive, ProjectsInspectFolder, ProjectsList, ProjectsRefreshFolder,
    ProjectsRelinkFolder, ProjectsRemoveFolder, ProjectsResolveCommit, ProjectsSetActive,
    ProjectsSetView, ProjectsSourceFileLocation, ProjectsUpdate, ProjectsUpdateFolder,
    RelinkFolderParams, ResolveCommitResult, SourceFileLookup,
};
use codecharta_core_api::registry::Method;
use codecharta_core_api::values::PickToken;
use serde_json::Value;

use super::dispatch::{
    DispatchResult, HandlerFuture, RequestContext, domain_error, read_params, write_result,
};

fn answer<M: Method>(result: CoreResult<M::Result>) -> DispatchResult {
    write_result::<M>(result.map_err(domain_error)?)
}

pub fn list(core: &Core, _context: RequestContext, params: Value) -> HandlerFuture<'_> {
    Box::pin(async move {
        read_params::<ProjectsList>(params)?;
        let projects = core.projects().and_then(|projects| projects.list());
        answer::<ProjectsList>(projects.map(|projects| ProjectList { projects }))
    })
}

pub fn get(core: &Core, _context: RequestContext, params: Value) -> HandlerFuture<'_> {
    Box::pin(async move {
        let params = read_params::<ProjectsGet>(params)?;
        answer::<ProjectsGet>(async { core.projects()?.get(&params.project_id).await }.await)
    })
}

pub fn inspect_folder(core: &Core, _context: RequestContext, params: Value) -> HandlerFuture<'_> {
    Box::pin(async move {
        let params = read_params::<ProjectsInspectFolder>(params)?;
        let picked = pick_folder(core.tools(), core.pick_tokens(), Path::new(&params.path)).await;
        answer::<ProjectsInspectFolder>(picked)
    })
}

pub fn create(core: &Core, _context: RequestContext, params: Value) -> HandlerFuture<'_> {
    Box::pin(async move {
        let params = read_params::<ProjectsCreate>(params)?;
        answer::<ProjectsCreate>(create_project(core, params).await)
    })
}

async fn create_project(core: &Core, params: CreateProjectParams) -> CoreResult<Project> {
    let projects = core.projects()?;
    let tokens: Vec<PickToken> = params
        .folders
        .iter()
        .map(|folder| folder.pick_token.clone())
        .collect();
    let taken = core.pick_tokens().take_folders(&tokens)?;
    let folders = taken
        .paths()
        .into_iter()
        .zip(params.folders)
        .map(|(path, folder)| FolderToAdd {
            path: path.to_path_buf(),
            label: folder.label,
            role: folder.role,
        })
        .collect();
    let new = NewProject {
        name: params.name,
        description: params.description,
        folders,
    };
    let created = projects.create(new).await;
    core.pick_tokens().settle(taken, created)
}

pub fn update(core: &Core, _context: RequestContext, params: Value) -> HandlerFuture<'_> {
    Box::pin(async move {
        let params = read_params::<ProjectsUpdate>(params)?;
        answer::<ProjectsUpdate>(async { core.projects()?.update(params).await }.await)
    })
}

pub fn delete(core: &Core, _context: RequestContext, params: Value) -> HandlerFuture<'_> {
    Box::pin(async move {
        let params = read_params::<ProjectsDelete>(params)?;
        let deleted = async {
            let projects = core.projects()?;
            projects
                .delete(&params.project_id, params.permanently)
                .await
        };
        answer::<ProjectsDelete>(deleted.await)
    })
}

pub fn add_folder(core: &Core, _context: RequestContext, params: Value) -> HandlerFuture<'_> {
    Box::pin(async move {
        let params = read_params::<ProjectsAddFolder>(params)?;
        answer::<ProjectsAddFolder>(add_picked_folder(core, params).await)
    })
}

async fn add_picked_folder(core: &Core, params: AddFolderParams) -> CoreResult<Project> {
    let projects = core.projects()?;
    let taken = core.pick_tokens().take_folder(&params.folder.pick_token)?;
    let folder = FolderToAdd {
        path: taken.first_path()?,
        label: params.folder.label,
        role: params.folder.role,
    };
    let added = projects.add_folder(&params.project_id, folder).await;
    core.pick_tokens().settle(taken, added)
}

pub fn update_folder(core: &Core, _context: RequestContext, params: Value) -> HandlerFuture<'_> {
    Box::pin(async move {
        let params = read_params::<ProjectsUpdateFolder>(params)?;
        let target = FolderRef {
            project_id: params.project_id,
            folder_id: params.folder_id,
        };
        let changes = FolderChanges {
            label: params.label,
            role: params.role,
            hosting: params.hosting,
        };
        let updated = async { core.projects()?.update_folder(&target, changes).await };
        answer::<ProjectsUpdateFolder>(updated.await)
    })
}

pub fn remove_folder(core: &Core, _context: RequestContext, params: Value) -> HandlerFuture<'_> {
    Box::pin(async move {
        let params = read_params::<ProjectsRemoveFolder>(params)?;
        let target = FolderRef {
            project_id: params.project_id,
            folder_id: params.folder_id,
        };
        let removed = async {
            let projects = core.projects()?;
            projects.remove_folder(&target, params.permanently).await
        };
        answer::<ProjectsRemoveFolder>(removed.await)
    })
}

pub fn relink_folder(core: &Core, _context: RequestContext, params: Value) -> HandlerFuture<'_> {
    Box::pin(async move {
        let params = read_params::<ProjectsRelinkFolder>(params)?;
        answer::<ProjectsRelinkFolder>(relink_picked_folder(core, params).await)
    })
}

async fn relink_picked_folder(core: &Core, params: RelinkFolderParams) -> CoreResult<Project> {
    let projects = core.projects()?;
    let taken = core.pick_tokens().take_folder(&params.pick_token)?;
    let target = FolderRef {
        project_id: params.project_id,
        folder_id: params.folder_id,
    };
    let relink = Relink {
        path: taken.first_path()?,
        accept_different_history: params.accept_different_history.unwrap_or(false),
    };
    let relinked = projects.relink_folder(&target, relink).await;
    core.pick_tokens().settle(taken, relinked)
}

pub fn refresh_folder(core: &Core, _context: RequestContext, params: Value) -> HandlerFuture<'_> {
    Box::pin(async move {
        let target = read_params::<ProjectsRefreshFolder>(params)?;
        let refreshed = async { core.projects()?.refresh_folder(&target).await };
        answer::<ProjectsRefreshFolder>(refreshed.await)
    })
}

pub fn get_active(core: &Core, _context: RequestContext, params: Value) -> HandlerFuture<'_> {
    Box::pin(async move {
        read_params::<ProjectsGetActive>(params)?;
        let active = core
            .projects()
            .and_then(|projects| projects.active_project());
        answer::<ProjectsGetActive>(
            active.map(|active_project_id| ActiveProject { active_project_id }),
        )
    })
}

pub fn set_active(core: &Core, _context: RequestContext, params: Value) -> HandlerFuture<'_> {
    Box::pin(async move {
        let params = read_params::<ProjectsSetActive>(params)?;
        let set = core
            .projects()
            .and_then(|projects| projects.set_active_project(params.project_id.as_ref()));
        answer::<ProjectsSetActive>(set)
    })
}

pub fn set_view(core: &Core, _context: RequestContext, params: Value) -> HandlerFuture<'_> {
    Box::pin(async move {
        let params = read_params::<ProjectsSetView>(params)?;
        let set = async {
            let projects = core.projects()?;
            projects.set_view(&params.project_id, params.view).await
        };
        answer::<ProjectsSetView>(set.await)
    })
}

pub fn resolve_commit(core: &Core, _context: RequestContext, params: Value) -> HandlerFuture<'_> {
    Box::pin(async move {
        let params = read_params::<ProjectsResolveCommit>(params)?;
        let target = FolderRef {
            project_id: params.project_id,
            folder_id: params.folder_id,
        };
        let resolved = async { core.projects()?.resolve_commit(&target, &params.hash).await };
        answer::<ProjectsResolveCommit>(resolved.await.map(|commit| ResolveCommitResult { commit }))
    })
}

pub fn folder_path(core: &Core, _context: RequestContext, params: Value) -> HandlerFuture<'_> {
    Box::pin(async move {
        let target = read_params::<ProjectsFolderPath>(params)?;
        let path = core
            .projects()
            .and_then(|projects| projects.resolve_folder(&target))
            .and_then(|folder| path_to_wire(&folder.path));
        answer::<ProjectsFolderPath>(path.map(|path| FolderPath { path }))
    })
}

pub fn source_file_location(
    core: &Core,
    _context: RequestContext,
    params: Value,
) -> HandlerFuture<'_> {
    Box::pin(async move {
        let params = read_params::<ProjectsSourceFileLocation>(params)?;
        let target = FolderRef {
            project_id: params.project_id,
            folder_id: params.folder_id,
        };
        let location = core
            .projects()
            .and_then(|projects| projects.source_file_location(&target, &params.relative_path));
        answer::<ProjectsSourceFileLocation>(location.map(|location| SourceFileLookup { location }))
    })
}
