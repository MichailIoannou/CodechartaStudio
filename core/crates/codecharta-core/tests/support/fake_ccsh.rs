use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

const FAKE_CCSH: &str = env!("CARGO_BIN_EXE_fake-ccsh");
pub const SCENARIO_VARIABLE: &str = "FAKE_CCSH_SCENARIO";
const SCENARIO_FILE: &str = "fake-ccsh-scenario.json";

pub fn fake_ccsh() -> PathBuf {
    PathBuf::from(FAKE_CCSH)
}

/// What one fake-ccsh run does, in this order: stdout lines, stderr chunks (pausing `delay_ms` after each),
/// waiting until `wait_for_file` exists, the map and its summary block, hanging, the exit code.
#[derive(Debug, Clone, Default, Serialize)]
pub struct FakeScenario {
    pub stdout: Vec<String>,
    pub stderr_chunks: Vec<String>,
    pub delay_ms: u64,
    pub exit_code: i32,
    pub write_map: bool,
    pub hang: bool,
    pub pid_file: Option<PathBuf>,
    pub wait_for_file: Option<PathBuf>,
}

impl FakeScenario {
    pub fn writing_map() -> Self {
        Self {
            write_map: true,
            ..Self::default()
        }
    }
}

/// Writes the scenario into `folder` and returns the file to name in `FAKE_CCSH_SCENARIO`.
pub fn write_scenario(folder: &Path, scenario: &FakeScenario) -> PathBuf {
    fs::create_dir_all(folder).expect("the scenario folder can be created");
    let file = folder.join(SCENARIO_FILE);
    let json = serde_json::to_string(scenario).expect("the scenario serialises");
    fs::write(&file, json).expect("the scenario can be written");
    file
}
