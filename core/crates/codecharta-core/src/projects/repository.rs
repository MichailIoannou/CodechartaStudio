use std::fs;
use std::io;
use std::path::Path;

use codecharta_core_api::ids::ProjectId;
use codecharta_core_api::methods::projects::{
    AnalysisProfile, FolderGitFacts, FolderKind, Project, ProjectSummary, ProjectView,
    UpdateProjectParams,
};
use codecharta_core_api::values::{Description, ProjectName};
use serde_json::Value;

use crate::error::{CoreError, CoreResult};
use crate::folders::inspector::inspect_folder;
use crate::git::GitRunner;
use crate::ids::{new_folder_id, new_project_id};
use crate::path_to_wire;
use crate::projects::derived::{to_project, to_summary};
use crate::projects::folders::{FolderToAdd, attach_folder};
use crate::projects::record::{FolderRecord, PROJECT_SCHEMA_VERSION, ProjectRecord};
use crate::recycle::{Recycler, delete_permanently};
use crate::store::Store;
use crate::store::atomic::{read_json_if_exists, write_json_atomic};
use crate::timestamps;

const SCHEMA_VERSION_FIELD: &str = "schemaVersion";
const NAME_FIELD: &str = "name";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NewProject {
    pub name: ProjectName,
    pub description: Option<Description>,
    pub folders: Vec<FolderToAdd>,
}

/// Projects in the managed store. Every write holds the project's lock, so two requests never
/// interleave on one `project.json`.
pub struct ProjectRepository<'deps> {
    pub(crate) store: &'deps Store,
    pub(crate) git: &'deps dyn GitRunner,
    pub(crate) recycler: &'deps dyn Recycler,
}

impl<'deps> ProjectRepository<'deps> {
    pub fn new(
        store: &'deps Store,
        git: &'deps dyn GitRunner,
        recycler: &'deps dyn Recycler,
    ) -> Self {
        Self {
            store,
            git,
            recycler,
        }
    }

    /// A project that cannot be read is listed with its problem instead of failing the list.
    pub fn list(&self) -> CoreResult<Vec<ProjectSummary>> {
        let mut summaries: Vec<ProjectSummary> = self
            .project_ids()?
            .iter()
            .map(|id| self.summary(id))
            .collect();
        summaries.sort_by_key(|summary| (summary.name.to_lowercase(), summary.id.clone()));
        Ok(summaries)
    }

    /// Refreshes the git facts of every folder that is there; a failed refresh keeps the cached ones.
    pub async fn get(&self, id: &ProjectId) -> CoreResult<Project> {
        let _guard = self.store.project_locks().lock(id).await;
        let mut record = self.read_record(id)?;
        if self.refresh_git_facts(&mut record).await && self.store.is_writable() {
            self.write_record(&record)?;
        }
        Ok(self.to_project(record))
    }

    pub async fn create(&self, new: NewProject) -> CoreResult<Project> {
        self.store.ensure_writable()?;
        let id = new_project_id()?;
        let _guard = self.store.project_locks().lock(&id).await;
        let mut record = empty_record(id, new.name, new.description);
        for folder in new.folders {
            let folder = self.new_folder_record(folder).await?;
            attach_folder(&mut record, folder)?;
        }
        self.write_record(&record)?;
        Ok(self.to_project(record))
    }

    pub async fn update(&self, changes: UpdateProjectParams) -> CoreResult<Project> {
        self.modify(&changes.project_id, |record| {
            if let Some(name) = changes.name {
                record.name = name;
            }
            if let Some(description) = changes.description {
                record.description = non_empty(Some(description));
            }
            if let Some(profile) = changes.analysis_profile {
                record.analysis_profile = profile;
            }
            Ok(())
        })
        .await
    }

    /// Sends the project's store directory to the recycle bin, or deletes it when `permanently`.
    pub async fn delete(&self, id: &ProjectId, permanently: bool) -> CoreResult<()> {
        self.store.ensure_writable()?;
        let _guard = self.store.project_locks().lock(id).await;
        let directory = self.store.paths().project_dir(id)?;
        if !directory.is_dir() {
            return Err(no_such_project(id));
        }
        if permanently {
            delete_permanently(&directory)?;
        } else {
            self.recycler.recycle(&directory)?;
        }
        self.forget_if_active(id)
    }

    pub(crate) async fn modify(
        &self,
        id: &ProjectId,
        change: impl FnOnce(&mut ProjectRecord) -> CoreResult<()>,
    ) -> CoreResult<Project> {
        self.store.ensure_writable()?;
        let _guard = self.store.project_locks().lock(id).await;
        let mut record = self.read_record(id)?;
        change(&mut record)?;
        record.updated_at = timestamps::now();
        self.write_record(&record)?;
        Ok(self.to_project(record))
    }

    pub(crate) async fn new_folder_record(&self, folder: FolderToAdd) -> CoreResult<FolderRecord> {
        let inspection = inspect_folder(self.git, &folder.path).await;
        Ok(FolderRecord {
            id: new_folder_id()?,
            path: absolute_path_text(&folder.path)?,
            label: folder.label,
            role: folder.role,
            kind: inspection.kind,
            git: inspection.git,
            added_at: timestamps::now(),
        })
    }

    pub(crate) fn read_record(&self, id: &ProjectId) -> CoreResult<ProjectRecord> {
        let file = self.store.paths().project_file(id)?;
        let content: Value = read_json_if_exists(&file)?.ok_or_else(|| no_such_project(id))?;
        ensure_known_schema(id, &content)?;
        serde_json::from_value(content).map_err(|error| CoreError::Io {
            context: format!("{} is not a readable project", file.display()),
            source: io::Error::new(io::ErrorKind::InvalidData, error),
        })
    }

    fn write_record(&self, record: &ProjectRecord) -> CoreResult<()> {
        let directory = self.store.paths().project_dir(&record.id)?;
        fs::create_dir_all(&directory).map_err(|source| CoreError::Io {
            context: format!("Could not create {}", directory.display()),
            source,
        })?;
        write_json_atomic(&self.store.paths().project_file(&record.id)?, record)
    }

    pub(crate) fn to_project(&self, record: ProjectRecord) -> Project {
        to_project(self.store.paths(), record)
    }

    async fn refresh_git_facts(&self, record: &mut ProjectRecord) -> bool {
        let mut changed = false;
        for folder in &mut record.folders {
            if Path::new(&folder.path).is_dir() {
                changed |= refresh_folder_facts(self.git, folder).await;
            }
        }
        changed
    }

    fn project_ids(&self) -> CoreResult<Vec<ProjectId>> {
        let projects_dir = self.store.paths().projects_dir();
        let entries = match fs::read_dir(&projects_dir) {
            Ok(entries) => entries,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
            Err(source) => {
                return Err(CoreError::Io {
                    context: format!("Could not list {}", projects_dir.display()),
                    source,
                });
            }
        };
        Ok(entries
            .filter_map(Result::ok)
            .filter(|entry| entry.path().is_dir())
            .filter_map(|entry| {
                ProjectId::try_from(entry.file_name().to_string_lossy().into_owned()).ok()
            })
            .collect())
    }

    fn summary(&self, id: &ProjectId) -> ProjectSummary {
        match self.read_record(id) {
            Ok(record) => to_summary(self.store.paths(), &record),
            Err(problem) => self.problem_summary(id, &problem),
        }
    }

    fn problem_summary(&self, id: &ProjectId, problem: &CoreError) -> ProjectSummary {
        let stored_name = self
            .store
            .paths()
            .project_file(id)
            .ok()
            .and_then(|file| read_json_if_exists::<Value>(&file).ok().flatten())
            .and_then(|content| content.get(NAME_FIELD)?.as_str().map(str::to_string));
        ProjectSummary {
            id: id.clone(),
            name: stored_name.unwrap_or_else(|| id.to_string()),
            folder_count: 0,
            missing_folder_count: 0,
            snapshot_count: 0,
            problem: Some(problem.to_payload().message),
        }
    }

    fn forget_if_active(&self, id: &ProjectId) -> CoreResult<()> {
        let session = self.store.session();
        if session.active_project()?.as_ref() == Some(id) {
            session.set_active_project(None)?;
        }
        Ok(())
    }
}

/// Replaces the cached facts only when git answered and something other than the time changed.
pub(crate) async fn refresh_folder_facts(git: &dyn GitRunner, folder: &mut FolderRecord) -> bool {
    let inspection = inspect_folder(git, Path::new(&folder.path)).await;
    let Some(facts) = inspection.git else {
        return false;
    };
    let unchanged = folder.kind == FolderKind::Git
        && folder
            .git
            .as_ref()
            .is_some_and(|cached| same_facts(cached, &facts));
    if unchanged {
        return false;
    }
    folder.kind = FolderKind::Git;
    folder.git = Some(facts);
    true
}

fn same_facts(cached: &FolderGitFacts, fresh: &FolderGitFacts) -> bool {
    FolderGitFacts {
        detected_at: fresh.detected_at.clone(),
        ..cached.clone()
    } == *fresh
}

fn empty_record(
    id: ProjectId,
    name: ProjectName,
    description: Option<Description>,
) -> ProjectRecord {
    let now = timestamps::now();
    ProjectRecord {
        schema_version: PROJECT_SCHEMA_VERSION,
        id,
        name,
        description: non_empty(description),
        created_at: now.clone(),
        updated_at: now,
        folders: Vec::new(),
        analysis_profile: AnalysisProfile::default(),
        view: ProjectView::default(),
    }
}

fn non_empty(description: Option<Description>) -> Option<Description> {
    description.filter(|description| !description.as_str().trim().is_empty())
}

fn ensure_known_schema(id: &ProjectId, content: &Value) -> CoreResult<()> {
    let version = content.get(SCHEMA_VERSION_FIELD).and_then(Value::as_u64);
    if version.is_some_and(|version| version > u64::from(PROJECT_SCHEMA_VERSION)) {
        return Err(CoreError::Conflict(format!(
            "The project {id} was saved by a newer CodeCharta; this version reads up to schema {PROJECT_SCHEMA_VERSION}."
        )));
    }
    Ok(())
}

fn no_such_project(id: &ProjectId) -> CoreError {
    CoreError::NotFound(format!("There is no project {id}."))
}

pub(crate) fn absolute_path_text(path: &Path) -> CoreResult<String> {
    let absolute = std::path::absolute(path).map_err(|source| CoreError::Io {
        context: format!("Could not resolve {}", path.display()),
        source,
    })?;
    path_to_wire(&absolute)
}
