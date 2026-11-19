use std::path::PathBuf;

use serde::{Serialize, de::DeserializeOwned};
use ts_rs::{Config, ExportError, TS};

use crate::events::CoreProgress;
use crate::methods::core::{CoreCancel, CoreHello, CorePing, CoreShutdown};
use crate::methods::git::{
    GitBranchCreateMethod, GitBranchDeleteMethod, GitBranchRenameMethod, GitBranchesMethod,
    GitChangedFilesMethod, GitCommitDetailsMethod, GitDiffFileMethod, GitDiscardMethod,
    GitFetchMethod, GitIsAncestorMethod, GitLogMethod, GitMeasureDistancesMethod,
    GitMergeBaseMethod, GitRefsAtMethod, GitRefsFingerprintMethod, GitRepositoryInfoMethod,
    GitResolveCommitMethod, GitRevListCountMethod, GitSetUpstreamMethod, GitStageMethod,
    GitStatusMethod, GitSwitchMethod, GitUnstageMethod, GitWorkingTreeMethod,
    RepositoryChangedEvent,
};
use crate::methods::paths::{PathsGet, PathsResetStoreRoot, PathsSetStoreRoot};
use crate::methods::projects::{
    ProjectsAddFolder, ProjectsCreate, ProjectsDelete, ProjectsFolderPath, ProjectsGet,
    ProjectsGetActive, ProjectsInspectFolder, ProjectsList, ProjectsRefreshFolder,
    ProjectsRelinkFolder, ProjectsRemoveFolder, ProjectsResolveCommit, ProjectsSetActive,
    ProjectsSetView, ProjectsSourceFileLocation, ProjectsUpdate, ProjectsUpdateFolder,
};
use crate::methods::prompt::{
    PromptAnswerMethod, PromptCancelMethod, PromptClosedEvent, PromptRequestedEvent,
};
use crate::methods::shell::ShellResolvePath;
use crate::methods::snapshots::{
    SnapshotsDelete, SnapshotsImport, SnapshotsInspectImportFile, SnapshotsList,
    SnapshotsMapLocation, SnapshotsMove, SnapshotsOpenFile, SnapshotsRecordMapFacts,
};
use crate::methods::store::StoreGetStatus;
use crate::methods::tools::{ToolsClearPath, ToolsDoctor, ToolsSetPath};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Audience {
    Renderer,
    /// Only the Electron main process may call or receive it; the renderer never sees it.
    Shell,
}

pub trait Method {
    const NAME: &'static str;
    const AUDIENCE: Audience;
    type Params: Serialize + DeserializeOwned + TS + 'static;
    type Result: Serialize + DeserializeOwned + TS + 'static;
}

/// Declares a method marker: `method!(Marker, "domain.verb", Renderer | Shell, Params, Result)`.
macro_rules! method {
    ($marker:ident, $name:literal, $audience:ident, $params:ty, $result:ty) => {
        pub struct $marker;

        impl $crate::registry::Method for $marker {
            const NAME: &'static str = $name;
            const AUDIENCE: $crate::registry::Audience = $crate::registry::Audience::$audience;
            type Params = $params;
            type Result = $result;
        }
    };
}

pub(crate) use method;

pub trait Event {
    const NAME: &'static str;
    const AUDIENCE: Audience;
    type Params: Serialize + DeserializeOwned + TS + 'static;
}

#[derive(Clone, Copy)]
pub struct TypeExport {
    pub name: fn(&Config) -> String,
    pub export_all: fn(&Config) -> Result<(), ExportError>,
    pub output_path: fn() -> Option<PathBuf>,
}

impl TypeExport {
    pub const fn of<T: TS + 'static>() -> Self {
        Self {
            name: <T as TS>::name,
            export_all: <T as TS>::export_all,
            output_path: <T as TS>::output_path,
        }
    }

    pub fn is_named(&self) -> bool {
        (self.output_path)().is_some()
    }
}

#[derive(Clone, Copy)]
pub struct MethodSpec {
    pub name: &'static str,
    pub audience: Audience,
    pub params: TypeExport,
    pub result: TypeExport,
}

impl MethodSpec {
    pub const fn of<M: Method>() -> Self {
        Self {
            name: M::NAME,
            audience: M::AUDIENCE,
            params: TypeExport::of::<M::Params>(),
            result: TypeExport::of::<M::Result>(),
        }
    }
}

#[derive(Clone, Copy)]
pub struct EventSpec {
    pub name: &'static str,
    pub audience: Audience,
    pub params: TypeExport,
}

impl EventSpec {
    pub const fn of<E: Event>() -> Self {
        Self {
            name: E::NAME,
            audience: E::AUDIENCE,
            params: TypeExport::of::<E::Params>(),
        }
    }
}

pub const METHODS: &[MethodSpec] = &[
    MethodSpec::of::<CoreHello>(),
    MethodSpec::of::<CorePing>(),
    MethodSpec::of::<CoreShutdown>(),
    MethodSpec::of::<PathsGet>(),
    MethodSpec::of::<PathsSetStoreRoot>(),
    MethodSpec::of::<PathsResetStoreRoot>(),
    MethodSpec::of::<ToolsDoctor>(),
    MethodSpec::of::<ToolsSetPath>(),
    MethodSpec::of::<ToolsClearPath>(),
    MethodSpec::of::<ShellResolvePath>(),
    MethodSpec::of::<StoreGetStatus>(),
    MethodSpec::of::<ProjectsList>(),
    MethodSpec::of::<ProjectsGet>(),
    MethodSpec::of::<ProjectsInspectFolder>(),
    MethodSpec::of::<ProjectsCreate>(),
    MethodSpec::of::<ProjectsUpdate>(),
    MethodSpec::of::<ProjectsDelete>(),
    MethodSpec::of::<ProjectsAddFolder>(),
    MethodSpec::of::<ProjectsUpdateFolder>(),
    MethodSpec::of::<ProjectsRemoveFolder>(),
    MethodSpec::of::<ProjectsRelinkFolder>(),
    MethodSpec::of::<ProjectsRefreshFolder>(),
    MethodSpec::of::<ProjectsGetActive>(),
    MethodSpec::of::<ProjectsSetActive>(),
    MethodSpec::of::<ProjectsSetView>(),
    MethodSpec::of::<ProjectsResolveCommit>(),
    MethodSpec::of::<ProjectsFolderPath>(),
    MethodSpec::of::<ProjectsSourceFileLocation>(),
    MethodSpec::of::<SnapshotsList>(),
    MethodSpec::of::<SnapshotsMapLocation>(),
    MethodSpec::of::<SnapshotsRecordMapFacts>(),
    MethodSpec::of::<SnapshotsInspectImportFile>(),
    MethodSpec::of::<SnapshotsOpenFile>(),
    MethodSpec::of::<SnapshotsImport>(),
    MethodSpec::of::<SnapshotsMove>(),
    MethodSpec::of::<SnapshotsDelete>(),
    MethodSpec::of::<GitRepositoryInfoMethod>(),
    MethodSpec::of::<GitStatusMethod>(),
    MethodSpec::of::<GitBranchesMethod>(),
    MethodSpec::of::<GitRefsFingerprintMethod>(),
    MethodSpec::of::<GitLogMethod>(),
    MethodSpec::of::<GitCommitDetailsMethod>(),
    MethodSpec::of::<GitResolveCommitMethod>(),
    MethodSpec::of::<GitRevListCountMethod>(),
    MethodSpec::of::<GitMergeBaseMethod>(),
    MethodSpec::of::<GitIsAncestorMethod>(),
    MethodSpec::of::<GitMeasureDistancesMethod>(),
    MethodSpec::of::<GitRefsAtMethod>(),
    MethodSpec::of::<GitChangedFilesMethod>(),
    MethodSpec::of::<GitFetchMethod>(),
    MethodSpec::of::<GitSwitchMethod>(),
    MethodSpec::of::<GitBranchCreateMethod>(),
    MethodSpec::of::<GitBranchRenameMethod>(),
    MethodSpec::of::<GitBranchDeleteMethod>(),
    MethodSpec::of::<GitSetUpstreamMethod>(),
    MethodSpec::of::<GitWorkingTreeMethod>(),
    MethodSpec::of::<GitDiffFileMethod>(),
    MethodSpec::of::<GitStageMethod>(),
    MethodSpec::of::<GitUnstageMethod>(),
    MethodSpec::of::<GitDiscardMethod>(),
    MethodSpec::of::<PromptAnswerMethod>(),
    MethodSpec::of::<PromptCancelMethod>(),
];

pub const EVENTS: &[EventSpec] = &[
    EventSpec::of::<CoreProgress>(),
    EventSpec::of::<RepositoryChangedEvent>(),
    EventSpec::of::<PromptRequestedEvent>(),
    EventSpec::of::<PromptClosedEvent>(),
];

pub const CLIENT_NOTIFICATIONS: &[EventSpec] = &[EventSpec::of::<CoreCancel>()];

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use super::*;

    #[test]
    fn should_register_each_name_once() {
        // Arrange
        let names = METHODS
            .iter()
            .map(|spec| spec.name)
            .chain(EVENTS.iter().map(|spec| spec.name))
            .chain(CLIENT_NOTIFICATIONS.iter().map(|spec| spec.name));

        // Act
        let mut seen = HashSet::new();
        let duplicates: Vec<&str> = names.filter(|name| !seen.insert(*name)).collect();

        // Assert
        assert!(duplicates.is_empty(), "registered twice: {duplicates:?}");
    }

    #[test]
    fn should_name_methods_domain_dot_verb() {
        // Arrange
        let names: Vec<&str> = METHODS.iter().map(|spec| spec.name).collect();

        // Act
        let malformed: Vec<&&str> = names
            .iter()
            .filter(|name| {
                name.split('.').count() != 2 || name.starts_with('.') || name.ends_with('.')
            })
            .collect();

        // Assert
        assert!(malformed.is_empty(), "malformed: {malformed:?}");
    }
}
