use std::path::{Path, PathBuf};
use std::process::ExitCode;

use clap::{Subcommand, ValueEnum};
use codecharta_core::projects::folders::suggested_label;
use codecharta_core::projects::{FolderToAdd, NewProject, ProjectRepository};
use codecharta_core::recycle::SystemRecycler;
use codecharta_core::store::Store;
use codecharta_core::{Core, CoreResult};
use codecharta_core_api::ids::ProjectId;
use codecharta_core_api::methods::projects::{FolderRole, Project, ProjectSummary};
use codecharta_core_api::values::{Description, Label, ProjectName};

use super::arguments::parse_project_id;
use super::output::{exit_code_of, print_json};

const LABEL_SEPARATOR: char = '=';
const ROLE_SEPARATOR: char = ':';

#[derive(Debug, Subcommand)]
pub enum ProjectsCommand {
    /// List the projects of the store; reads only, so it works while the app runs
    List {
        /// Print the summaries as JSON
        #[arg(long)]
        json: bool,
    },
    /// Create a project from one or more folders; the first one is the primary folder
    Create {
        #[arg(long, value_parser = parse_project_name)]
        name: ProjectName,
        #[arg(long, value_parser = parse_description)]
        description: Option<Description>,
        /// A folder as <path>[=<label>[:primary|fork|helper]]; the label defaults to the folder name
        #[arg(long = "folder", required = true, value_parser = parse_folder_argument)]
        folders: Vec<FolderArgument>,
        /// Print the created project as JSON
        #[arg(long)]
        json: bool,
    },
    /// Add a folder to a project
    AddFolder {
        #[arg(long, value_parser = parse_project_id)]
        project: ProjectId,
        #[arg(long)]
        path: PathBuf,
        /// Defaults to the folder name
        #[arg(long, value_parser = parse_label)]
        label: Option<Label>,
        #[arg(long, value_enum, default_value = "helper")]
        role: RoleArgument,
        /// Print the changed project as JSON
        #[arg(long)]
        json: bool,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, ValueEnum)]
pub enum RoleArgument {
    Primary,
    Fork,
    Helper,
}

impl From<RoleArgument> for FolderRole {
    fn from(role: RoleArgument) -> Self {
        match role {
            RoleArgument::Primary => FolderRole::Primary,
            RoleArgument::Fork => FolderRole::Fork,
            RoleArgument::Helper => FolderRole::Helper,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FolderArgument {
    path: PathBuf,
    label: Option<Label>,
    role: FolderRole,
}

pub fn run_projects(
    core: &Core,
    runtime: &tokio::runtime::Runtime,
    command: ProjectsCommand,
) -> ExitCode {
    let printed = match command {
        ProjectsCommand::List { json } => {
            list(core).and_then(|summaries| print_list(&summaries, json))
        }
        ProjectsCommand::Create {
            name,
            description,
            folders,
            json,
        } => runtime
            .block_on(create(core, name, description, folders))
            .and_then(|project| print_project(&project, json, project.id.as_str())),
        ProjectsCommand::AddFolder {
            project,
            path,
            label,
            role,
            json,
        } => runtime
            .block_on(add_folder(
                core,
                &project,
                folder_to_add(&path, label, role.into()),
            ))
            .and_then(|project| print_project(&project, json, last_folder_id(&project))),
    };
    exit_code_of(printed)
}

fn list(core: &Core) -> CoreResult<Vec<ProjectSummary>> {
    let store = Store::open_read_only(&core.paths().store_root())?;
    ProjectRepository::new(&store, core.tools(), &SystemRecycler).list()
}

async fn create(
    core: &Core,
    name: ProjectName,
    description: Option<Description>,
    folders: Vec<FolderArgument>,
) -> CoreResult<Project> {
    let store = Store::open(&core.paths().store_root())?;
    let folders = folders
        .into_iter()
        .map(|folder| folder_to_add(&folder.path, folder.label, folder.role))
        .collect();
    let new = NewProject {
        name,
        description,
        folders,
    };
    ProjectRepository::new(&store, core.tools(), &SystemRecycler)
        .create(new)
        .await
}

async fn add_folder(core: &Core, project: &ProjectId, folder: FolderToAdd) -> CoreResult<Project> {
    let store = Store::open(&core.paths().store_root())?;
    ProjectRepository::new(&store, core.tools(), &SystemRecycler)
        .add_folder(project, folder)
        .await
}

fn folder_to_add(path: &Path, label: Option<Label>, role: FolderRole) -> FolderToAdd {
    FolderToAdd {
        label: label.unwrap_or_else(|| suggested_label(&absolute(path))),
        path: path.to_path_buf(),
        role,
    }
}

/// `.` has no file name to suggest a label from; its absolute form has.
fn absolute(path: &Path) -> PathBuf {
    std::path::absolute(path).unwrap_or_else(|_| path.to_path_buf())
}

fn last_folder_id(project: &Project) -> &str {
    project
        .folders
        .last()
        .map_or("", |folder| folder.id.as_str())
}

fn print_list(summaries: &[ProjectSummary], json: bool) -> CoreResult<()> {
    if json {
        return print_json(&summaries);
    }
    for summary in summaries {
        let problem = summary
            .problem
            .as_ref()
            .map_or(String::new(), |problem| format!("  ({problem})"));
        println!(
            "{}  {}  {} folders{problem}",
            summary.id, summary.name, summary.folder_count
        );
    }
    Ok(())
}

/// Without `--json` only the id a script needs next is printed.
fn print_project(project: &Project, json: bool, id: &str) -> CoreResult<()> {
    if json {
        return print_json(project);
    }
    println!("{id}");
    Ok(())
}

fn parse_project_name(value: &str) -> Result<ProjectName, String> {
    ProjectName::try_from(value).map_err(|error| error.to_string())
}

fn parse_description(value: &str) -> Result<Description, String> {
    Description::try_from(value).map_err(|error| error.to_string())
}

fn parse_label(value: &str) -> Result<Label, String> {
    Label::try_from(value).map_err(|error| error.to_string())
}

fn parse_role(value: &str) -> Result<FolderRole, String> {
    RoleArgument::from_str(value, false).map(FolderRole::from)
}

/// `<path>[=<label>[:<role>]]`: a label has no `:`, so the last `:` after `=` starts the role.
fn parse_folder_argument(value: &str) -> Result<FolderArgument, String> {
    let (path, rest) = match value.split_once(LABEL_SEPARATOR) {
        Some((path, rest)) => (path, Some(rest)),
        None => (value, None),
    };
    if path.is_empty() {
        return Err("the folder path is empty".to_string());
    }
    let (label, role) = match rest.map(|rest| rest.split_once(ROLE_SEPARATOR).unwrap_or((rest, "")))
    {
        Some((label, role)) => (Some(parse_label(label)?), role),
        None => (None, ""),
    };
    let role = if role.is_empty() {
        FolderRole::Helper
    } else {
        parse_role(role)?
    };
    Ok(FolderArgument {
        path: PathBuf::from(path),
        label,
        role,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_read_a_folder_argument_with_label_and_role() {
        // Arrange
        let values = ["/src/app=app:primary", "/src/docs=docs", "/src/tools"];

        // Act
        let parsed: Vec<FolderArgument> = values
            .into_iter()
            .map(|value| parse_folder_argument(value).unwrap())
            .collect();

        // Assert
        assert_eq!(parsed[0].label.as_ref().unwrap().as_str(), "app");
        assert_eq!(parsed[0].role, FolderRole::Primary);
        assert_eq!(parsed[1].role, FolderRole::Helper);
        assert_eq!(parsed[2].label, None);
        assert_eq!(parsed[2].path, PathBuf::from("/src/tools"));
    }

    #[test]
    fn should_refuse_a_folder_argument_with_an_unknown_role_or_bad_label() {
        // Arrange
        let values = ["/src/app=app:owner", "/src/app=a/b", "=app"];

        // Act
        let refused: Vec<bool> = values
            .into_iter()
            .map(|value| parse_folder_argument(value).is_err())
            .collect();

        // Assert
        assert_eq!(refused, vec![true, true, true]);
    }
}
