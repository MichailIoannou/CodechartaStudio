use std::ffi::OsString;
use std::path::Path;

use codecharta_core_api::methods::analysis::{AnalysisErrorCode, JobError};
use codecharta_core_api::methods::projects::AnalyserName;
use codecharta_core_api::values::CommitSha;

use super::profile::ValidProfile;

const ANALYSE_COMMAND: &str = "analyse";
const OUTPUT_OPTION: &str = "-o";
const PARALLEL_OPTION: &str = "-p";
const WITHOUT_OPTION: &str = "--without=";
const EXCLUDE_OPTION: &str = "--exclude=";
const COMMIT_OPTION: &str = "--commit=";
const CSV_SEPARATOR: &str = ",";
/// Any of these anywhere in the arguments makes ccsh wait for a menu answer that never comes.
const INTERACTIVE_FLAGS: [&str; 2] = ["-i", "--interactive"];

pub struct AnalyseArgvInput<'input> {
    pub folder_path: &'input Path,
    /// Without extension: ccsh appends `.cc.json.gz` and, for a commit, prefixes the short hash.
    pub output_base: &'input Path,
    pub profile: &'input ValidProfile,
    /// A full sha the caller confirmed with git: ccsh silently analyses HEAD for a ref it cannot read.
    pub commit: Option<&'input CommitSha>,
}

pub fn build_analyse_argv(input: &AnalyseArgvInput<'_>) -> Result<Vec<OsString>, JobError> {
    require_absolute(input.folder_path, "folder")?;
    require_absolute(input.output_base, "output")?;
    let mut argv: Vec<OsString> = vec![
        ANALYSE_COMMAND.into(),
        input.folder_path.into(),
        OUTPUT_OPTION.into(),
        input.output_base.into(),
    ];
    argv.extend(profile_options(input.profile));
    if let Some(commit) = input.commit {
        argv.push(format!("{COMMIT_OPTION}{commit}").into());
    }
    refuse_interactive(&argv)?;
    Ok(argv)
}

fn profile_options(profile: &ValidProfile) -> Vec<OsString> {
    let mut options = Vec::new();
    if profile.is_parallel() {
        options.push(PARALLEL_OPTION.into());
    }
    if !profile.without().is_empty() {
        options.push(format!("{WITHOUT_OPTION}{}", without_csv(profile.without())).into());
    }
    options.extend(
        profile
            .exclude()
            .iter()
            .map(|pattern| OsString::from(format!("{EXCLUDE_OPTION}{pattern}"))),
    );
    options
}

fn without_csv(without: &[AnalyserName]) -> String {
    without
        .iter()
        .map(|analyser| analyser_name(*analyser))
        .collect::<Vec<_>>()
        .join(CSV_SEPARATOR)
}

fn analyser_name(analyser: AnalyserName) -> &'static str {
    match analyser {
        AnalyserName::Rawtextparser => "rawtextparser",
        AnalyserName::Unifiedparser => "unifiedparser",
        AnalyserName::Dependencyparser => "dependencyparser",
        AnalyserName::Domainlanguageparser => "domainlanguageparser",
        AnalyserName::Git => "git",
        AnalyserName::Svn => "svn",
    }
}

fn require_absolute(path: &Path, what: &str) -> Result<(), JobError> {
    if path.is_absolute() {
        return Ok(());
    }
    Err(invalid_arguments(format!(
        "The {what} path {} is not absolute.",
        path.display()
    )))
}

fn refuse_interactive(argv: &[OsString]) -> Result<(), JobError> {
    let is_interactive = argv
        .iter()
        .any(|argument| INTERACTIVE_FLAGS.iter().any(|flag| argument == flag));
    if is_interactive {
        return Err(invalid_arguments(
            "The arguments would start ccsh's interactive mode.".to_string(),
        ));
    }
    Ok(())
}

fn invalid_arguments(message: String) -> JobError {
    JobError::new(AnalysisErrorCode::InvalidArguments, message)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::analysis::profile::validate_profile;
    use codecharta_core_api::methods::projects::AnalysisProfile;
    use codecharta_core_api::values::ExcludePattern;
    use std::path::PathBuf;

    const SHA: &str = "0123456789abcdef0123456789abcdef01234567";

    fn absolute(path: &str) -> PathBuf {
        std::env::temp_dir().join(path)
    }

    fn valid_profile(exclude: &[&str], without: &[AnalyserName], parallel: bool) -> ValidProfile {
        validate_profile(&AnalysisProfile {
            exclude: exclude
                .iter()
                .map(|pattern| ExcludePattern::try_from(*pattern).unwrap())
                .collect(),
            without: without.to_vec(),
            parallel,
        })
        .unwrap()
    }

    fn texts(argv: &[OsString]) -> Vec<String> {
        argv.iter()
            .map(|argument| argument.to_string_lossy().into_owned())
            .collect()
    }

    #[test]
    fn should_build_the_working_tree_argv_in_the_documented_order() {
        // Arrange
        let (folder, output) = (absolute("repo"), absolute("job/map"));
        let profile = valid_profile(
            &["dist", "build"],
            &[AnalyserName::Svn, AnalyserName::Dependencyparser],
            true,
        );
        let input = AnalyseArgvInput {
            folder_path: &folder,
            output_base: &output,
            profile: &profile,
            commit: None,
        };

        // Act
        let argv = build_analyse_argv(&input).unwrap();

        // Assert
        assert_eq!(
            texts(&argv),
            [
                "analyse".to_string(),
                folder.display().to_string(),
                "-o".to_string(),
                output.display().to_string(),
                "-p".to_string(),
                "--without=dependencyparser,svn".to_string(),
                "--exclude=build".to_string(),
                "--exclude=dist".to_string(),
            ]
        );
    }

    #[test]
    fn should_append_the_commit_last_for_a_commit_target() {
        // Arrange
        let (folder, output) = (absolute("repo"), absolute("job/map"));
        let profile = valid_profile(&["build"], &[], true);
        let commit = CommitSha::try_from(SHA).unwrap();
        let input = AnalyseArgvInput {
            folder_path: &folder,
            output_base: &output,
            profile: &profile,
            commit: Some(&commit),
        };

        // Act
        let argv = build_analyse_argv(&input).unwrap();

        // Assert
        assert_eq!(
            texts(&argv).last().map(String::as_str),
            Some(format!("--commit={SHA}").as_str())
        );
    }

    #[test]
    fn should_leave_out_parallel_and_empty_lists() {
        // Arrange
        let (folder, output) = (absolute("repo"), absolute("job/map"));
        let profile = valid_profile(&[], &[], false);
        let input = AnalyseArgvInput {
            folder_path: &folder,
            output_base: &output,
            profile: &profile,
            commit: None,
        };

        // Act
        let argv = build_analyse_argv(&input).unwrap();

        // Assert
        assert_eq!(argv.len(), 4);
    }

    #[test]
    fn should_reject_a_relative_path() {
        // Arrange
        let profile = valid_profile(&[], &[], true);
        let (absolute_folder, absolute_output) = (absolute("repo"), absolute("job/map"));
        let relative_folder = AnalyseArgvInput {
            folder_path: Path::new("repo"),
            output_base: &absolute_output,
            profile: &profile,
            commit: None,
        };
        let relative_output = AnalyseArgvInput {
            folder_path: &absolute_folder,
            output_base: Path::new("map"),
            profile: &profile,
            commit: None,
        };

        // Act
        let errors = [
            build_analyse_argv(&relative_folder).unwrap_err(),
            build_analyse_argv(&relative_output).unwrap_err(),
        ];

        // Assert
        assert!(
            errors
                .iter()
                .all(|error| error.code == AnalysisErrorCode::InvalidArguments)
        );
    }

    #[test]
    fn should_never_emit_interactive_quiet_or_not_compressed() {
        // Arrange
        let (folder, output) = (absolute("repo"), absolute("job/map"));
        let profile = valid_profile(&["-i", "-q", "-nc", "--interactive"], &[], true);
        let commit = CommitSha::try_from(SHA).unwrap();
        let input = AnalyseArgvInput {
            folder_path: &folder,
            output_base: &output,
            profile: &profile,
            commit: Some(&commit),
        };

        // Act
        let argv = texts(&build_analyse_argv(&input).unwrap());

        // Assert
        let forbidden = ["-i", "--interactive", "-q", "--quiet", "-nc"];
        assert!(
            !argv
                .iter()
                .any(|argument| forbidden.contains(&argument.as_str())),
            "{argv:?}"
        );
        assert!(argv.contains(&"--exclude=-i".to_string()));
    }

    #[test]
    fn should_refuse_an_interactive_flag_as_a_whole_argument() {
        // Arrange
        let argv: Vec<OsString> = ["analyse", "/repo", "-i"].map(OsString::from).to_vec();

        // Act
        let error = refuse_interactive(&argv).unwrap_err();

        // Assert
        assert_eq!(error.code, AnalysisErrorCode::InvalidArguments);
    }
}
