# 01 — Rust core and desktop shell

- **Status:** draft
- **Depends on:** nothing (read `00-overview-and-decisions.md` first; this plan implements D1–D4, D9, D9a and the path part of D5)
- **Unlocks:** 03, 04, 05, 06. Plan 02 (themes) only uses the window-background hook, optionally.
- **Estimated size:** M0 = S, M1 = L, M2 = L, M3 = M, M4 = M

## 1. Goal

A headless Rust core (`core/`) that later plans fill with domain logic, an Electron shell that starts it and relays between it and the renderer, and a renderer port (`DesktopBridge`) typed by a contract generated from Rust. User-visible result of this plan alone: a "Desktop tools" section in the settings dialog (which tools were found, which version, pick another executable, show the data folder), one app instance at a time, and `npm run build` working on Windows without POSIX tools. `codecharta-core doctor` prints the same report on a terminal.

## 2. Current state (verified in the source tree)

Shell and build
- `visualization/electron/main.js` (55 lines, CommonJS) is the only file in `visualization/electron/`: one `BrowserWindow` (`width: 1400, height: 900`, icon `codeCharta/assets/icon.ico` on `win32` else `icon.png`), `setWindowOpenHandler` forwarding **any** URL to `shell.openExternal` and denying, `loadFile(path.join(__dirname, "index.html"))`, module-level `app.enableSandbox()`, macOS `activate`/`window-all-closed` handling. No `webPreferences`, preload, `ipcMain`, `will-navigate` guard, single-instance lock or `dialog`.
- `visualization/package.json`: `"main": "main.js"`; `electron` pinned `44.9.1` in `dependencies`; `build` = `npm run patch && ng build && cp electron/* package.json dist/bundler/browser`; `start` = `node script/ensureElectron.js && electron dist/bundler/browser`; `package` = `node script/ensureElectron.js && node script/appMain.js`; `package:local` = `npm run package -- --local`; `dev` = `npm run patch && ng serve`; `e2e:ci` = `npx playwright test --workers=1`. `files` publishes `dist/bundler/browser`, so `main.js` and `package.json` already ship in the web/npm artifacts.
- `visualization/.npmrc` sets `ignore-scripts=true` (hence `script/ensureElectron.js`).
- `visualization/script/appMain.js` packages every target in `script/appConfig.json` `distributions` (`win32`, `darwin`, `linux` × `x64`, `arm64`) from **one host** (`--local` = host platform/arch only). `script/appBuild.js` calls `@electron/packager` with `asar: true`, `icon: "public/codeCharta/assets/icon"`, `dir: dist/bundler/browser`, `out: dist/applications`. `script/appZip.js` zips each application folder plus `web.zip` of `dist/bundler/browser` with `bestzip`.
- `.github/workflows/test_packaging.yml` (job `package_visualization`, `ubuntu-latest`): `npm ci`, `npm run build`, `npm run package` (fails on a skipped icon); never launches the app. `release-visualization.yml` builds and packages on `ubuntu-latest` and uploads `visualization/dist/packages/*.zip`. `test_visualization.yml` has `build_visualization_test`, `build_visualization_e2e`, `publish_sonar_visualization`.
- Root `commitlint.config.js` `scope-enum`: `analysis, visualization, docker, gh-pages, docs, readme, stg, config`. Root `mise.toml` pins `java = "zulu-25"`, `node = "24"`; no Rust. Root `.gitignore` has no Rust entries.
- Licenses: `check-licenses.yml` builds a CycloneDX SBOM per component and checks it against `license_policy.json` with `MaibornWolff/purl-patrol` (`BREAK_ENABLED: false`), only on `MaibornWolff/codecharta`.
- `cargo 1.98.1` is installed on the owner's machine.

Renderer
- `app/main.ts` bootstraps with `provideZonelessChangeDetection()`; `app/index.html` carries the CSP meta tag and `<base href="./">`; routing is hash based.
- Nothing in `visualization/app` knows about Electron. `features/localSource/services/handLinkToTheSystem.ts` opens `vscode://file/...` by clicking a synthetic `<a>` (main-frame navigation). `externalLinks.component.html` uses `<a target="_blank">`.
- `InjectionToken` ports exist (`features/screenshot/screenshotCapture.ts`, `SCREENSHOT_CAPTURE`); `app/codeCharta/util/` holds root services.
- `features/globalSettings/components/globalConfigurationDialog/globalConfigurationDialog.component.html` is a native `<dialog class="modal">` with a `flex flex-col gap-6` list; it already imports `canOpenFoldersHere` from `../../../localSource/facade`.

Angular tooling
- Jest (`conf/jestUnit.config.json`): roots `app`, 80% global gate on all four measures, jsdom. `tsconfig.json` has no `include`, so `npx tsc --noEmit -p tsconfig.json` checks every `.ts` under `visualization/`.
- dependency-cruiser rules are anchored on `^app/codeCharta/`; `util/` may import only `util/` and `model/`. `knip.jsonc`: `project: ["app/**/*.ts"]`, unused exports fail, a spec counts as a consumer.
- `playwright.config.ts`: `testDir: "./app"`, `testMatch: "**/*.e2e.ts"`, static server on 9009. Helpers in `app/playwright.helper.ts`.
- Root `biome.json` formats everything and lints `.ts` (not `**/*.js`); `noConsole` allows `warn`/`error` only.
- ccsh on Windows is a batch file (`analysis/node-wrapper/binScripts/{global,local}/ccsh.cmd` → `…\public\bin\ccsh.bat %*`). `ccsh --version` prints `version "<x.y.z>"` on stdout.

UNVERIFIED (resolved by the M0 spikes)
- Electron 44: a sandboxed preload may only `require("electron")` and must be one CommonJS file; `IpcMainInvokeEvent.senderFrame` may be `null`; `will-navigate` fires for the synthetic `vscode://` anchor; `process.resourcesPath` points at the folder holding `extraResource` files on all three OSes.
- Rust `std::process::Command` on Windows (since 1.77.2) escapes arguments for `.bat`/`.cmd` targets itself and fails with `ErrorKind::InvalidInput` for arguments it cannot pass safely; exact refused characters.
- Git for Windows and its OpenSSH accept an `.exe` as `GIT_ASKPASS` / `SSH_ASKPASS` (called with the prompt as the only argument); `SSH_ASKPASS_REQUIRE=force` needs OpenSSH ≥ 8.4.
- `ts-rs` exports the needed shapes (tagged enums, `Option` → `T | null`, `u64` handling).
- `directories::BaseDirs::config_dir()` + `codecharta-visualization` equals Electron's default `userData` on all three OSes.
- `gh --version` / `glab --version` output formats.
- Every crate name below and its version: confirm with `cargo add` / `cargo tree`; versions are deliberately not given.

## 3. Design

### 3.1 Layout

```
core/
  Cargo.toml                       # [workspace] members = crates/*, resolver 2, shared [workspace.dependencies] and [workspace.lints]
  rust-toolchain.toml              # pinned stable channel, components rustfmt + clippy (>= 1.77.2 for the batch-file fix)
  deny.toml                        # licence/advisory policy (task 1.9)
  crates/
    codecharta-core-api/
      src/lib.rs                   # PROTOCOL_VERSION, re-exports
      src/protocol.rs              # JSON-RPC envelopes
      src/error.rs                 # ErrorCode, ErrorPayload
      src/registry.rs              # Audience, MethodSpec, EventSpec, METHODS, EVENTS
      src/methods/{core,tools,paths,shell}.rs   # params/result types per domain
      src/events.rs                # notification payloads
      src/bin/export-contract.rs   # writes the TS contract + the shell allow-list
    codecharta-core/
      src/lib.rs                   # Core, CoreConfig
      src/error.rs                 # CoreError
      src/config/{paths,settings}.rs
      src/process/{runner,launch,tree,env}.rs
      src/tools/{definitions,finder,version,doctor}.rs
      src/bin/cc-fake-tool.rs      # test helper executable (never packaged)
      tests/support/mod.rs         # TempDir data dirs, TempRepo, fake tool paths
      tests/{runner,tools,settings}.rs
    codecharta-cored/              # [[bin]] name = "codecharta-core"
      src/main.rs                  # clap entry, askpass dispatch rule
      src/cli/{mod,doctor}.rs
      src/serve/{mod,framing,dispatch,session}.rs
      tests/protocol.rs            # drives `codecharta-core serve` over stdio
visualization/
  electron/                        # flat: the build copies an explicit file list into dist/bundler/browser
    main.js                        # composition: app lifecycle, window, ipcMain wiring (no logic beyond wiring)
    preload.js                     # contextBridge.exposeInMainWorld("codeChartaDesktop", …)
    coreClient.js                  # spawn, line framing, pending map, notifications, restart with backoff
    shellPolicy.js                 # pure: trusted sender/URL, navigation verdict, core path, backoff, allow-list check
    coreMethods.generated.json     # generated: { protocolVersion, rendererMethods[], rendererEvents[] }
    *.test.js                      # node --test (not copied)
    smoke.e2e.ts                   # Playwright _electron (not copied)
  app/codeCharta/model/coreApi/    # generated TS contract (committed)
  app/codeCharta/util/desktop/     # DesktopBridge port, token, environment service, fake
  app/codeCharta/features/desktopTools/
  script/copyElectron.js
  playwright.desktop.config.ts
.github/workflows/test_core.yml
```

Crate rules: `codecharta-core-api` depends only on serde/ts-rs (no tokio, no I/O). `codecharta-core` depends on `codecharta-core-api` for the wire types it returns and knows nothing about JSON-RPC framing or stdio. `codecharta-cored` is framing, dispatch and CLI only — no domain logic. Workspace lints: `unsafe_code = "deny"` except the one module that calls OS process APIs (`process/tree.rs`, `#[allow(unsafe_code)]` with a comment), `clippy::unwrap_used = "deny"` outside tests.

Candidate crates (all UNVERIFIED, confirm name, licence and current version with `cargo add`): `serde` (derive), `serde_json`, `thiserror`, `tokio` (rt-multi-thread, macros, io-util, io-std, process, time, sync), `tokio-util` (`CancellationToken`), `clap` (derive), `tracing`, `tracing-subscriber`, `directories`, `ts-rs`; Windows job objects through `windows-sys` (or `win32job`); unix process groups through `libc` (or `nix`); dev: `tempfile`. Later plans add e.g. `trash` (03), `sha2` (05).

Serde conventions for every wire type: `#[serde(rename_all = "camelCase")]`, `#[serde(deny_unknown_fields)]` on params; enums `#[serde(rename_all = "camelCase")]` or internally tagged `#[serde(tag = "kind")]`; `Option<T>` always serialised (`null`), never skipped; paths as `String` (a non-UTF-8 path is an `Io` error); integers that may exceed 2^53 do not exist on the wire — durations and byte counts are `u64` annotated `#[ts(type = "number")]`.

### 3.2 Error model

```rust
// codecharta-core-api/src/error.rs
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ErrorCode {
    BadRequest, NotFound, NotAllowed, Conflict, ToolNotFound, ToolFailed, Timeout, Cancelled,
    OutputTooLarge, Io, ProtocolMismatch, CoreUnavailable /* produced by the shell only */, Internal,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct ErrorPayload { pub code: ErrorCode, pub message: String, pub details: BTreeMap<String, serde_json::Value> }

// codecharta-core/src/error.rs
#[derive(Debug, thiserror::Error)]
pub enum CoreError {
    #[error("{0}")] BadRequest(String),
    #[error("{0}")] NotFound(String),
    #[error("{0}")] NotAllowed(String),
    #[error("{0}")] Conflict(String),
    #[error("{tool} was not found")] ToolNotFound { tool: ToolId },
    #[error("{tool} failed: {message}")] ToolFailed { tool: ToolId, message: String },
    #[error("timed out after {after_ms} ms")] Timeout { after_ms: u64 },
    #[error("cancelled")] Cancelled,
    #[error("output exceeded {limit_bytes} bytes")] OutputTooLarge { limit_bytes: u64 },
    #[error("{context}: {source}")] Io { context: String, #[source] source: std::io::Error },
    #[error("internal error: {0}")] Internal(String),
}
impl CoreError { pub fn code(&self) -> ErrorCode; pub fn to_payload(&self) -> ErrorPayload; }
pub type CoreResult<T> = Result<T, CoreError>;
```

Codes are stable: renaming or removing one is a protocol version bump. Messages are one user-readable sentence; `Internal` and `Io` details go to the log, not to the payload. Every later plan adds variants here and to `ErrorCode` together.

### 3.3 Protocol (`codecharta-core serve`)

- **Framing:** one JSON object per line (UTF-8, `\n`), stdin → requests and notifications from the client, stdout → responses and notifications from the core. Nothing else is ever written to stdout (logging goes to stderr via `tracing`; `RUST_LOG`-style filter from `--log-level`). Max line length 64 MiB; a longer line → `-32600` and the line is discarded.
- **Envelopes** (`codecharta-core-api/src/protocol.rs`): `Request { jsonrpc: "2.0", id: RequestId, method: String, params: serde_json::Value }`, `Response { jsonrpc, id, result } | { jsonrpc, id, error: { code: i32, message, data: ErrorPayload } }`, `Notification { jsonrpc, method, params }`; `RequestId` = string or integer. Standard codes for framing faults (`-32700` parse, `-32600` invalid request, `-32601` unknown method, `-32602` invalid params → `data.code = BAD_REQUEST`); every domain error is `-32000` with `data` = `ErrorPayload`.
- **Handshake:** the first request must be `core.hello`; any other method before it → `BAD_REQUEST`. A client `protocolVersion` different from `PROTOCOL_VERSION` → `PROTOCOL_MISMATCH` (the shell then shows "core unavailable"). Bump `PROTOCOL_VERSION` only for incompatible changes.
- **Concurrency:** each request runs as its own tokio task with a `CancellationToken`; one writer task owns stdout (mpsc), so lines never interleave. Responses may arrive out of order.
- **Cancellation:** notification `core.cancel { id }` cancels that request's token; the request then answers `CANCELLED` (or its result if it already finished). Unknown ids are ignored.
- **Progress:** generic notification `core.progress { requestId, message, done, total }` for requests that report steps; domain events (`analysis.progress`, `repository.changed`, …) are added by later plans.
- **Shutdown:** stdin EOF (or `core.shutdown` request) → cancel all tokens, kill all child process trees, flush stdout, exit 0 within 5 s. A panic in a request task → `INTERNAL` response and a log line; the loop keeps running.

```rust
// codecharta-core-api/src/registry.rs
pub enum Audience { Renderer, Shell }           // Shell = only the Electron main process may call / receive it
pub struct MethodSpec { pub name: &'static str, pub params: &'static str, pub result: &'static str, pub audience: Audience }
pub struct EventSpec { pub name: &'static str, pub payload: &'static str, pub audience: Audience }
pub const METHODS: &[MethodSpec];
pub const EVENTS: &[EventSpec];
pub trait Method { const NAME: &'static str; type Params: DeserializeOwned + Serialize + TS; type Result: DeserializeOwned + Serialize + TS; }

// codecharta-cored/src/serve/dispatch.rs
pub struct RequestContext { pub id: RequestId, pub cancel: CancellationToken, pub notifier: Notifier }
pub struct Notifier { /* clone of the writer channel */ }
impl Notifier { pub fn progress(&self, request: &RequestId, message: &str, done: Option<u32>, total: Option<u32>); pub fn emit<E: Serialize>(&self, method: &'static str, payload: &E); }
pub async fn dispatch(core: &Core, context: RequestContext, method: &str, params: serde_json::Value) -> Result<serde_json::Value, ErrorPayload>;
```

`dispatch` is one `match` on method name delegating to `Core`; a unit test asserts that the names it handles equal `METHODS` exactly, so a method cannot exist in the contract without a handler or vice versa.

**Rule for every later plan:** a new method or event is added to `codecharta-core-api` first (types + `Method` impl + `METHODS`/`EVENTS` entry), then the contract is regenerated, then the library function and the `dispatch` arm are written, then the renderer uses it through `DesktopBridge.request`. Method names are `<domain>.<verb>` (`projects.list`, `git.log`, `analysis.enqueue`); event names `<domain>.<pastOrNoun>`.

### 3.4 Methods and events of this plan

| method | audience | params | result | behaviour |
|---|---|---|---|---|
| `core.hello` | shell | `HelloParams { clientName, protocolVersion: u32 }` | `HelloResult { coreVersion, protocolVersion, platform: "win32" \| "darwin" \| "linux", dataDir }` | handshake |
| `core.ping` | renderer | `{}` | `PingResult { coreVersion }` | liveness |
| `core.shutdown` | shell | `{}` | `null` | same as EOF |
| `tools.doctor` | renderer | `DoctorParams { refresh: bool }` | `ToolsReport` | cached unless `refresh`; emits `core.progress` per tool |
| `tools.setPath` | shell | `SetToolPathParams { tool: ToolId, path }` | `ToolsReport` | only after the shell's native file picker; refuses (`TOOL_FAILED`, settings untouched) a file that does not answer like the tool |
| `tools.clearPath` | renderer | `{ tool: ToolId }` | `ToolsReport` | back to discovery |
| `paths.get` | renderer | `{}` | `PathsInfo { dataDir, storeRoot, isDefaultStoreRoot, logsDir }` | |
| `paths.setStoreRoot` | shell | `{ path }` | `PathsInfo` | only after the shell's folder picker; existing content is not moved (plan 03 copies) |
| `paths.resetStoreRoot` | renderer | `{}` | `PathsInfo` | |
| `shell.resolvePath` | shell | `{ target: ShellPathTarget }` | `{ path }` | maps an id to an absolute path for reveal / map read |

Notification: `core.progress` (renderer). `core.cancel` is a client→core notification (shell).

```rust
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ShellPathTarget {
    DataFolder, LogsFolder, StoreRoot,
    SnapshotMap { project_id: String, folder_id: String, snapshot_id: String },   // answers NOT_FOUND until plan 03
}
pub enum ToolId { Git, Ccsh, Java, Gh, Glab }                   // camelCase on the wire
pub enum ToolState { Ok, Missing, TooOld, Failed }
pub enum ToolSource { Custom, Path, WellKnownFolder }
pub struct ToolStatus { pub tool: ToolId, pub is_required: bool, pub state: ToolState, pub path: Option<String>,
    pub source: Option<ToolSource>, pub version: Option<String>, pub minimum_version: Option<String>, pub problem: Option<String> }
pub struct ToolsReport { pub checked_at: String /* RFC 3339 */, pub tools: Vec<ToolStatus>, pub can_use_git: bool, pub can_analyse: bool }
```

Later plans add `ShellPathTarget` variants (e.g. `ProjectFolder` in 03). The shell never receives a path from the renderer for reveal or read; it receives a target and asks the core.

### 3.5 Contract generation

- `cargo run -p codecharta-core-api --bin export-contract -- --ts <dir> --shell <file>` writes:
  - `visualization/app/codeCharta/model/coreApi/*.ts`: one file per type (ts-rs output), plus `coreApi.ts` with `CORE_PROTOCOL_VERSION`, `CORE_ERROR_CODES`, `CoreMethods` (`{ "tools.doctor": { params: DoctorParams; result: ToolsReport }, … }`), `CoreEvents`, `RendererMethod` / `RendererEvent` unions and `RENDERER_METHODS` / `RENDERER_EVENTS` const arrays (from `METHODS`/`EVENTS` filtered by `Audience::Renderer`).
  - `visualization/electron/coreMethods.generated.json`: `{ "protocolVersion": 1, "rendererMethods": […], "rendererEvents": […] }` — the shell's allow-list.
- Wrapped as `npm run contract` in `visualization/package.json` (`cd ../core && cargo run …` then `biome format --write` on the outputs), so generated files are Biome-clean and the drift check compares formatted output.
- Drift check (CI job `contract_drift` in `test_core.yml`): run `npm run contract`, then `git diff --exit-code -- visualization/app/codeCharta/model/coreApi visualization/electron/coreMethods.generated.json`.
- The generated folder imports nothing outside itself. knip: add `app/codeCharta/model/coreApi/**` to `ignore` (unused generated types are expected); if Biome lint flags generated code, exclude the folder from lint only (not format).
- Fallback if ts-rs cannot express a shape (M0 spike S6): `#[ts(type = "…")]` overrides; if it fails broadly, `specta` with the same output layout.

### 3.6 Process runner (`codecharta-core/src/process/`)

The only place in the workspace that may start a child process.

```rust
pub struct RunRequest {
    pub program: PathBuf,                    // absolute; anything else -> BadRequest
    pub args: Vec<OsString>,                 // never a command line; NUL -> BadRequest
    pub cwd: Option<PathBuf>,                // absolute, must exist
    pub env: Vec<(OsString, OsString)>,      // merged over the hardened base environment
    pub timeout: Duration,                   // mandatory, > 0
    pub max_output_bytes: u64,               // per stream; default 16 MiB, ceiling 256 MiB
    pub askpass: Option<AskpassSetup>,       // absent = nothing can prompt
    pub output: OutputMode,
}
pub enum OutputMode { Collect, Stream(tokio::sync::mpsc::Sender<OutputChunk>) }
pub enum OutputChunk { Stdout(String), Stderr(String) }   // UTF-8, lossy only at invalid bytes, never split inside a char
pub struct AskpassSetup { pub helper: PathBuf /* std::env::current_exe() */, pub endpoint: String }
pub struct RunOutput { pub exit_code: i32, pub stdout: String, pub stderr: String, pub duration: Duration }
pub struct ProcessRunner { /* base env, extra search folders, live children */ }
impl ProcessRunner {
    pub fn new(base_env: Vec<(OsString, OsString)>, extra_search_folders: Vec<PathBuf>) -> Self;
    pub async fn run(&self, request: RunRequest, cancel: &CancellationToken) -> CoreResult<RunOutput>;
    pub async fn kill_all(&self);
}
// env.rs
pub fn hardened_env(parent: impl Iterator<Item = (OsString, OsString)>, extra_search_folders: &[PathBuf]) -> Vec<(OsString, OsString)>;
pub fn askpass_env(setup: &AskpassSetup) -> [(OsString, OsString); 4];
// launch.rs
pub fn is_batch_file(program: &Path) -> bool;
pub fn check_batch_args(args: &[OsString]) -> CoreResult<()>;
// tree.rs
pub struct ProcessTree { /* Windows: job object handle; unix: process group id */ }
impl ProcessTree { pub fn attach(child: &tokio::process::Child) -> CoreResult<Self>; pub fn kill(&self) -> CoreResult<()>; }
```

- Spawn: `stdin` null (nothing can wait for input; ccsh cannot fall into its interactive dialog), stdout/stderr piped, `kill_on_drop(true)`; Windows `CREATE_NO_WINDOW`; unix `process_group(0)`.
- Non-zero exit is a normal result. Errors: `NotFound` from spawn → `ToolNotFound`; other spawn errors → `ToolFailed`; timeout → kill tree → `Timeout`; cancel → kill tree → `Cancelled` (already cancelled → no spawn); cap exceeded → kill tree → `OutputTooLarge`.
- **Process tree:** Windows — every child is assigned to a job object with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`, so `cmd → bat → java` dies together and dies with the core even on a hard kill; `kill` = `TerminateJobObject`. Unix — own process group; `kill` = `SIGTERM` to the group, `SIGKILL` after 3 s. UNVERIFIED: race between spawn and job assignment (a grandchild started before assignment escapes); spike S4 decides whether to spawn suspended.
- **Batch files on Windows:** `ccsh` is `ccsh.cmd`. Launch it directly with `Command::new(<abs path to .cmd>).args(args)` — Rust's std performs the `cmd.exe` escaping and returns `InvalidInput` for arguments it cannot pass safely (CVE-2024-24576 fix). Before spawning, `check_batch_args` refuses (`BadRequest`, naming the argument index) any argument with `"`, `%`, `!`, CR, LF or NUL, so users get a clear message instead of an OS error; a remaining `InvalidInput` from spawn also maps to `BadRequest`. Never `cmd /c` with a built string and never `raw_arg`. Callers keep batch arguments simple (absolute paths, fixed flags); a repository path containing `%` cannot be analysed by ccsh on Windows and is reported as such.
- **Base environment:** parent's minus `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE`, `ELECTRON_RUN_AS_NODE`, `NODE_OPTIONS`; plus `GIT_TERMINAL_PROMPT=0`, `GCM_INTERACTIVE=never`, `GIT_OPTIONAL_LOCKS=0`, `GIT_PAGER=cat`, `PAGER=cat`, `NO_COLOR=1`, `TERM=dumb`, `GH_PROMPT_DISABLED=1`, `GH_NO_UPDATE_NOTIFIER=1`; `PATH` extended by the well-known tool folders (3.7). No locale is forced; plan 04 uses locale-independent git formats.
- **Askpass:** adds `GIT_ASKPASS=<helper>`, `SSH_ASKPASS=<helper>`, `SSH_ASKPASS_REQUIRE=force`, `CODECHARTA_ASKPASS_ENDPOINT=<endpoint>` after the base environment; `GIT_TERMINAL_PROMPT=0` and closed stdin stay. The helper is the core binary itself: `main.rs` dispatches to askpass when `CODECHARTA_ASKPASS_ENDPOINT` is set and `argv[1]` is not a known subcommand (git and ssh call the helper with the prompt as the only argument); `codecharta-core askpass <prompt>` is the explicit form. Plan 01 reserves the rule and the option; plan 04 implements the helper, the endpoint and the prompt.
- Logging: program file name, exit code, duration. Never args, env or askpass values (URLs may carry credentials).

### 3.7 Tools and doctor (`codecharta-core/src/tools/`)

```rust
pub struct ToolDefinition { pub id: ToolId, pub is_required: bool, pub windows_names: &'static [&'static str],
    pub unix_names: &'static [&'static str], pub version_args: &'static [&'static str],
    pub minimum: Option<&'static str>, pub version_timeout: Duration }
pub const TOOLS: [ToolDefinition; 5];
pub fn read_version(tool: ToolId, stdout: &str, stderr: &str) -> Option<String>;
pub fn is_at_least(version: &str, minimum: &str) -> bool;            // numeric per dotted segment
pub fn search_folders(env: &dyn Fn(&str) -> Option<OsString>, home: &Path) -> Vec<PathBuf>;
pub fn find_executable(names: &[&str], folders: &[PathBuf], is_file: &dyn Fn(&Path) -> bool) -> Option<PathBuf>;
pub struct ResolvedTool { pub tool: ToolId, pub path: PathBuf, pub version: String }
pub struct Tools { /* settings handle, runner, cached report */ }
impl Tools {
    pub async fn doctor(&self, refresh: bool, cancel: &CancellationToken, on_checked: &(dyn Fn(u32, u32) + Sync)) -> CoreResult<ToolsReport>;
    pub async fn resolve(&self, tool: ToolId) -> CoreResult<ResolvedTool>;
    pub async fn run(&self, tool: ToolId, args: Vec<OsString>, options: ToolRunOptions, cancel: &CancellationToken) -> CoreResult<RunOutput>;
    pub async fn set_path(&self, tool: ToolId, path: PathBuf) -> CoreResult<ToolsReport>;
    pub async fn clear_path(&self, tool: ToolId) -> CoreResult<ToolsReport>;
}
pub struct ToolRunOptions { pub cwd: Option<PathBuf>, pub env: Vec<(OsString, OsString)>, pub timeout: Duration,
    pub max_output_bytes: Option<u64>, pub askpass: Option<AskpassSetup>, pub output: OutputMode }
```

| tool | Windows names | unix | version args | version read from | minimum | required |
|---|---|---|---|---|---|---|
| git | `git.exe` | `git` | `--version` | stdout `git version (\d+\.\d+\.\d+)` | 2.31 | yes |
| ccsh | `ccsh.cmd`, `ccsh.bat` | `ccsh` | `--version` | stdout `version "(\d+\.\d+\.\d+)"` | 2.2.1 | yes |
| java | `java.exe` | `java` | `-version` | stderr `version "(\d+(?:\.\d+){0,2})` | 22 | yes |
| gh | `gh.exe` | `gh` | `--version` | `gh version (\d+\.\d+\.\d+)` (UNVERIFIED) | — | no |
| glab | `glab.exe` | `glab` | `--version` | first `\d+\.\d+\.\d+` (UNVERIFIED) | — | no |

- Version timeout 30 s for ccsh and java (JVM start), 10 s otherwise. The five checks run concurrently.
- Search order: custom path from settings → (java) `%JAVA_HOME%\bin` / `$JAVA_HOME/bin` → absolute `PATH` entries (quotes stripped, relative entries skipped) → well-known folders: Windows `%ProgramFiles%\Git\cmd`, `%LocalAppData%\Programs\Git\cmd`, `%AppData%\npm`; macOS/Linux `/opt/homebrew/bin`, `/usr/local/bin`, `~/.local/bin` (a GUI-launched macOS app has a minimal `PATH`). No `where`/`which` child process.
- `run(Ccsh, …)` sets `JAVA_HOME` to the resolved java's home when java was found outside `PATH`.
- States: not found → `Missing`; version failed/unparseable → `Failed`; below minimum → `TooOld`; else `Ok`. `can_use_git` = git ok; `can_analyse` = git, ccsh, java ok.
- Every later plan runs external tools only through `Tools::run`.

### 3.8 Data dir and settings (`codecharta-core/src/config/`)

```rust
pub struct CoreConfig { pub data_dir: PathBuf }
impl CoreConfig { pub fn resolve(cli_data_dir: Option<PathBuf>, env: &dyn Fn(&str) -> Option<OsString>) -> CoreResult<Self>; }
pub struct CoreSettings { pub schema_version: u32, pub store_root: Option<String>, pub tool_paths: BTreeMap<ToolId, String> }
pub struct SettingsStore { /* file, cached value, write lock */ }
impl SettingsStore {
    pub fn load(file: PathBuf) -> CoreResult<Self>;
    pub fn get(&self) -> CoreSettings;
    pub async fn update(&self, change: impl FnOnce(&mut CoreSettings) + Send) -> CoreResult<CoreSettings>;
}
pub struct Paths { /* config + settings */ }
impl Paths { pub fn info(&self) -> PathsInfo; pub fn store_root(&self) -> PathBuf; pub fn logs_dir(&self) -> PathBuf; }
pub struct Core { /* config, settings, paths, runner, tools */ }
impl Core { pub fn open(config: CoreConfig) -> CoreResult<Self>; pub fn tools(&self) -> &Tools; pub fn paths(&self) -> &Paths; pub async fn shutdown(&self); }
```

- Data dir: `--data-dir` → `CODECHARTA_DATA_DIR` → `directories::BaseDirs::config_dir()/codecharta-visualization`. The Electron shell always passes `--data-dir <app.getPath("userData")>`, so the store default stays `<userData>/store` (D5) and the core never needs to know about Electron.
- `<dataDir>/core-settings.json` is owned by the core. Missing → defaults; unparseable → copied to `core-settings.corrupt-<epochMs>.json`, defaults used; newer `schemaVersion` → copied once to `core-settings.v<N>.backup.json`, defaults used; unknown fields dropped; writes serialised and atomic (temp file in the same folder + rename).
- Default store root `<dataDir>/store`; this plan creates nothing inside it (`store.json` and the layout are plan 03).
- Logs dir `<dataDir>/logs`; the core itself writes only to stderr.

### 3.9 CLI (`codecharta-cored`)

`codecharta-core [--data-dir <dir>] [--log-level <level>] <command>`; commands: `serve`, `doctor [--json] [--refresh]`, `askpass <prompt>` (plan 04), `contract` is **not** a runtime command (generation is the api crate's bin). `doctor` prints one line per tool (state, version, path, problem) and exits 0 when every required tool is ok, 1 otherwise; `--json` prints the `ToolsReport`. Later plans add `projects list`, `snapshots list`, `analyse` (D2) the same way: a subcommand calls the same `Core` method the RPC method calls.

### 3.10 Electron shell (`visualization/electron/`)

All files CommonJS, no dependencies beyond Electron and Node built-ins (the bundle folder has no `node_modules`).

**Preload** (`preload.js`, sandboxed, `require("electron")` only) exposes exactly:

```js
window.codeChartaDesktop = {
  protocolVersion,                                   // one ipcRenderer.sendSync at load; main answers from coreMethods.generated.json (a sandboxed preload cannot read files)
  request(method, params, options),                  // options: { operationId } | undefined → Promise<{ ok: true, value } | { ok: false, error: ErrorPayload }>
  cancel(operationId),                               // → Promise<void>
  subscribe(event, handler),                         // → unsubscribe(); handler exceptions swallowed
  pickFolder({ title }),                             // → Promise<string | null>   (path from the native picker, D3)
  pickFile({ title, filters }),                      // → Promise<string | null>
  chooseToolExecutable(tool),                        // picker + tools.setPath inside main → Promise<Result<ToolsReport | null>>
  chooseStoreRoot(),                                 // picker + paths.setStoreRoot inside main → Promise<Result<PathsInfo | null>>
  reveal(target),                                    // ShellPathTarget → shell.resolvePath → showItemInFolder / openPath
  readSnapshotMap(target),                           // { projectId, folderId, snapshotId } → Promise<Result<Uint8Array>>
  setWindowBackground(color),                        // "#rrggbb"
  restartCore(),                                     // leaves "unavailable": resets the backoff and spawns again
}
```

Electron IPC channels between preload and main are internal and fixed (`codecharta:request`, `codecharta:cancel`, `codecharta:event`, `codecharta:dialog`, `codecharta:shell`); the contract names are the JSON-RPC methods. Errors travel as data (contextBridge loses `Error` properties); a promise rejects only for a forbidden sender.

**Relay** (`main.js` + `shellPolicy.js`):
- Sender check on every `ipcMain.handle`: `event.senderFrame` not null, `event.sender.id` is the main window's, `senderFrame === sender.mainFrame`, and `senderFrame.url` is the bundled `index.html` (`file:`, path equal after normalisation, case-insensitive on Windows, query/hash ignored) or, unpackaged only, the dev-server origin. Otherwise log and reject `"Forbidden"`.
- `request`: method must be in `coreMethods.generated.json` `rendererMethods`, `operationId` a string ≤ 64 chars or absent, `params` passed through untouched (the core validates). The shell assigns its own wire ids; it keeps `operationId → wire id` per webContents for `cancel` and maps `core.progress.requestId` back to the `operationId` before forwarding.
- Notifications: forwarded only if listed in `rendererEvents`, as `{ event, payload }` on `codecharta:event`; no per-subscription state in main (the preload filters).
- Main-frame navigation (not same-document), `render-process-gone` and window close → `core.cancel` for every in-flight request of that webContents.
- `reveal` / `readSnapshotMap`: main calls `shell.resolvePath`; `readSnapshotMap` additionally refuses a resolved path outside `dataDir`/`storeRoot` or not ending in `.cc.json` / `.cc.json.gz`, then `fs.promises.readFile` → `Uint8Array` (the renderer inflates; nothing is parsed in main).
- `setWindowBackground`: validates `^#[0-9a-fA-F]{6}$`, calls `win.setBackgroundColor`, stores it in `<userData>/shell.json` (`{ windowBackgroundColor }`, the shell's only file), used as `backgroundColor` at the next start.

**Core lifecycle** (`coreClient.js`):

```js
class CoreClient extends EventEmitter {               // events: "notification" (method, params), "state" ({ state, message })
  constructor({ executable, args, spawn, logStream, now, setTimeout })
  start()                                             // spawn, then core.hello; state "starting" → "ready"
  request(method, params) /* → { id, promise } */ ; cancel(id) ; stop() /* close stdin, kill after 5 s */
}
```

- Executable (`shellPolicy.resolveCoreExecutable({ isPackaged, resourcesPath, appDir, env, platform })`): packaged → `path.join(process.resourcesPath, "codecharta-core[.exe]")`; unpackaged → `CODECHARTA_CORE_PATH` if set, else `<repo>/core/target/debug/codecharta-core[.exe]` resolved from `appDir` (`visualization/dist/bundler/browser`). Missing → state `unavailable` with the expected path in the message.
- Spawn `[serve, --data-dir, userData]`, `windowsHide: true`, stdio pipes; stderr appended to `<userData>/logs/core.log` (previous run kept as `core.log.1`).
- Unexpected exit → pending requests resolve `{ ok: false, error: { code: "CORE_UNAVAILABLE" } }`, state `restarting`, respawn with backoff 0.5/1/2/4/8 s; five failures within 60 s → state `unavailable`. State changes reach the renderer as the shell event `shell.coreState` (delivered like a core event); `restartCore()` retries. Protocol mismatch → `unavailable` immediately.
- `before-quit` → `stop()`.

**Window and app** (`main.js`):
- Order: `CODECHARTA_USER_DATA_DIR` (absolute) → `app.setPath("userData")` (smoke tests); `requestSingleInstanceLock()` or quit, `second-instance` restores and focuses; `app.enableSandbox()`; `whenReady` → start core → create window.
- `webPreferences: { preload, sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true }`; `backgroundColor` from `shell.json` or `#ffffff`.
- Navigation (`shellPolicy.judgeNavigation(url, trustedPage)` → `internal | external | blocked`; external protocols `https:`, `http:`, `mailto:`, `vscode:`): `will-navigate` allows internal, opens external with `shell.openExternal`, blocks the rest; `setWindowOpenHandler` always denies and opens only external; `will-attach-webview` prevented. Permission handlers untouched (`features/localSource` needs the File System Access prompts).
- Dev server: unpackaged only, `CODECHARTA_DEV_SERVER_URL` = `http://localhost:<port>` or `http://127.0.0.1:<port>` → `loadURL`; trusted page follows.

### 3.11 Build, packaging, dev loop

- `script/copyElectron.js` copies `electron/{main,preload,coreClient,shellPolicy}.js`, `electron/coreMethods.generated.json` and `package.json` into `dist/bundler/browser` with `fs.copyFileSync`; fails clearly if `index.html` is missing. `build` = `npm run patch && ng build && node script/copyElectron.js`.
- Packaging: `appBuild.js` adds `extraResource: [coreBinaryFor(platform, arch)]` where `coreBinaryFor` returns `../core/dist/<platform>-<arch>/codecharta-core[.exe]`, or with `--local` `../core/target/release/codecharta-core[.exe]`; a missing binary fails packaging naming the path. `appMain.js` keeps packaging every target from one host.
- CI: a `build_core` matrix job (in `test_packaging.yml` and `release-visualization.yml`) builds `cargo build --release --locked` per target on a native runner and uploads `codecharta-core-<platform>-<arch>`; `package_visualization` downloads all six into `core/dist/<platform>-<arch>/` before `npm run package`. Runner labels per target (incl. arm64 Linux/Windows and both macOS architectures) are UNVERIFIED; if a target has no native runner, cross-compile (`--target`) on a runner of the same OS, else drop that target from `appConfig.json` with the owner's OK. `test_packaging.yml` triggers also on `core/**`.
- Executable bit: the Linux/macOS binaries must stay executable through upload/download and `bestzip` (UNVERIFIED; `actions/upload-artifact` is known to drop modes — `chmod +x` after download, and a packaging check asserts the mode inside the zip).
- macOS: the app is unsigned today; whether Gatekeeper quarantine blocks a nested unsigned binary in a downloaded app is UNVERIFIED (spike S3); signing stays out of scope.
- Dev loop: `cd core && cargo build`, then `cd visualization && npm run build && npm start` (the shell finds `core/target/debug`). Renderer iteration: `npm run dev -- --open=false` in one terminal and `CODECHARTA_DEV_SERVER_URL=http://localhost:3000 npm start` in another (IndexedDB differs from the `file://` app).

### 3.12 Renderer seam (`visualization/app/codeCharta/util/desktop/`)

| file | exports |
|---|---|
| `desktopBridge.ts` | `interface DesktopBridge` (the preload API above, typed: `request<Method extends RendererMethod>(method: Method, params: CoreMethods[Method]["params"], options?: { operationId: string }): Promise<CoreResult<CoreMethods[Method]["result"]>>`, `subscribe<Event extends RendererEvent \| "shell.coreState">(…)`, …); `type CoreResult<Value> = { ok: true; value: Value } \| { ok: false; error: ErrorPayload }`; `CoreState` |
| `desktopBridge.token.ts` | `DESKTOP_BRIDGE = new InjectionToken<DesktopBridge \| null>("DESKTOP_BRIDGE", { providedIn: "root", factory: () => readDesktopBridge(window) })`; `readDesktopBridge(page)` returns `page.codeChartaDesktop` when its `protocolVersion === CORE_PROTOCOL_VERSION`, else `console.warn` + `null`; absent → `null`. The only reader of the global. |
| `desktopEnvironment.service.ts` | root `DesktopEnvironment { isDesktop: Signal<boolean>; coreState: Signal<CoreState>; requireBridge(): DesktopBridge }` (throws `DesktopBridgeError` `NOT_ALLOWED` on the web) |
| `desktopResult.ts` | `DesktopBridgeError extends Error { code: ErrorCode; details }`; `valueOrThrow(result)` |
| `desktopEvents.ts` | `observeDesktopEvent(bridge, event): Observable<payload>` (unsubscribes on teardown) |
| `desktopBridge.mocks.ts` | `createFakeDesktopBridge(seed?: FakeDesktopSeed): FakeDesktopBridge` — `seed.responses: Partial<Record<RendererMethod, unknown>>`, `seed.failures`, picker answers; `calls` log; `emit(event, payload)` |

- No change to `app.config.ts`. Tests override the token (`useValue: createFakeDesktopBridge()` or `null`). On the web `isDesktop()` is false and every desktop element sits behind `@if (isDesktop())` (D1).
- `createFakeDesktopBridge` is self-contained (no outside references in its body) because `app/playwright.helper.ts` injects it as text: `standInForTheDesktopBridge(page, seed)` → `page.addInitScript(\`window.codeChartaDesktop = (${createFakeDesktopBridge.toString()})(${JSON.stringify(seed)})\`)`. The fake's `protocolVersion` comes from the seed (default set by the helper from `CORE_PROTOCOL_VERSION`).
- Event callbacks set signals; subscribe from root services (views are kept alive).

**Desktop tools** (`features/desktopTools/`: `facade.ts`, `services/desktopTools.service.ts`, `components/desktopToolsPanel/…`, `e2e/desktopTools.e2e.ts|.po.ts`):
- Service signals `report`, `paths`, `isChecking`, `progress`, `failure`; `load()` (`tools.doctor { refresh: false }` + `paths.get`), `recheck()` (`refresh: true` with an `operationId`, showing `core.progress`), `chooseExecutable(tool)`, `useDefault(tool)` (`tools.clearPath`), `showDataFolder()` (`reveal({ kind: "storeRoot" })`). `ok: false` sets `failure`; `CANCELLED` is silent; `coreState !== "ready"` shows an alert with "Restart core".
- Placement: `globalConfigurationDialog.component.html`, after the `@if (canOpenLocalFolders)` block, before the reset buttons: `@if (isDesktop()) { <cc-desktop-tools-panel /> }`, imported through `../../../desktopTools/facade`.
- Content (daisyUI/Tailwind, Font Awesome, `data-testid`s): heading "Desktop tools" + "Check again"; one row per tool: name, badge (`badge-success` found; `badge-error` missing / too old / not working for required; `badge-ghost` not installed for optional), version, truncated path with full `title`, problem, "Choose…" and (custom source) "Use default"; "Data folder: <storeRoot>" + "Show in file manager". A failed choose keeps the old report.

## 4. Milestones

Every task: tests first (Rust `#[test]`/`#[tokio::test]` names `should_…`; TS/JS names start with "should", `// Arrange` `// Act` `// Assert`), then code, commit only when section 5 is green. Keep one progress file per milestone in `dev_docs/studio/agents/progress/01-m<N>-<name>.md` (template of `plans/template.md`, `state` kept current).

### M0 — Spikes (S, no production commits; results in `dev_docs/studio/agents/progress/01-m0-spikes.md`)

| # | Spike | Done when written down |
|---|---|---|
| S1 | Electron 44 on Windows + one other OS, throwaway branch: sandboxed preload restrictions; `senderFrame` null cases; `will-navigate` for the `vscode://` anchor; `contextBridge` copying a `Uint8Array` of 100 MB (time, memory). | each UNVERIFIED Electron item confirmed or design adapted |
| S2 | Spawn a hello-world Rust binary from `main.js` unpackaged and from `npm run package:local` with `extraResource`; confirm `process.resourcesPath` location on Windows/macOS/Linux and that the binary stays outside the asar and executable. | path rule in 3.10 confirmed |
| S3 | Packaging from Linux with the darwin binary: executable bit through artifact upload + `bestzip`; Gatekeeper behaviour on a downloaded app (if a Mac is available; else record as open risk). | findings + packaging check designed |
| S4 | Rust on Windows: `Command::new("<abs>\\ccsh.cmd").args(…)` with spaces, `&`, `^`, `(`, `)`, trailing backslash, `%`, `!`, `"` — which pass unchanged, which fail with `InvalidInput`; confirm the `check_batch_args` set. Job-object assignment race (spawn suspended or not). | 3.6 batch and tree rules confirmed |
| S5 | Askpass: a Rust `.exe` as `GIT_ASKPASS` and `SSH_ASKPASS` with Git for Windows (and its OpenSSH) and on Linux/macOS, with `GIT_TERMINAL_PROMPT=0`, `GCM_INTERACTIVE=never`, `SSH_ASKPASS_REQUIRE=force`; path with spaces; argv shape. Local repo + local dummy remote only, no network. | findings handed to plan 04 |
| S6 | `ts-rs`: tagged enums, `Option`, `BTreeMap`, `u64` override, a generated method map; Biome formatting of the output. | generator approach confirmed or `specta` chosen |

### M1 — Core skeleton, protocol, contract, CI (L)

| # | Task | Tests first | Commit |
|---|---|---|---|
| 1.1 | Add `core` to `commitlint.config.js` `scope-enum`. Root `.gitignore`: `/core/target/`, `/core/dist/`. `mise.toml`: `rust` pinned to the `rust-toolchain.toml` channel (UNVERIFIED mise tool name). | — | `build(config): add core commit scope and rust toolchain` |
| 1.2 | Workspace `core/Cargo.toml`, `rust-toolchain.toml`, three crates with empty libs/bin, workspace lints. `core/README.md`: build, test, gates, contract regeneration. | `should_report_version` (cored: `--version` prints the package version) | `build(core): add cargo workspace with core, api and daemon crates` |
| 1.3 | `codecharta-core-api`: `ErrorCode`, `ErrorPayload`, protocol envelopes, registry, `core.*` method types; `codecharta-core/src/error.rs`. | `should_serialize_error_code_in_screaming_snake_case`, `should_round_trip_a_request_with_string_and_number_ids`, `should_reject_unknown_params_fields`, `should_map_every_core_error_to_a_code` | `feat(core): add protocol envelopes and error codes` |
| 1.4 | `serve`: framing (line reader with cap), session (hello gate, writer task, cancellation map, EOF shutdown), dispatch for `core.hello`, `core.ping`, `core.shutdown`, `core.cancel`; tracing to stderr. | unit: `should_split_lines_across_reads`, `should_reject_an_oversized_line`, `should_handle_exactly_the_registered_methods`; `tests/protocol.rs` (spawns `CARGO_BIN_EXE_codecharta-core serve`): `should_answer_hello_with_versions`, `should_refuse_requests_before_hello`, `should_answer_protocol_mismatch`, `should_answer_unknown_method_with_32601`, `should_answer_parse_error_and_keep_serving`, `should_cancel_a_running_request` (test-only `core.sleep` behind `#[cfg(feature = "test-methods")]`), `should_exit_cleanly_on_stdin_eof`, `should_write_nothing_but_json_to_stdout` | `feat(core): serve json-rpc over stdio` |
| 1.5 | `export-contract` bin, `npm run contract`, first generated output (`model/coreApi/`, `electron/coreMethods.generated.json`); knip ignore for `model/coreApi/**`. | `should_list_only_renderer_methods_in_the_allow_list`, `should_emit_a_method_map_entry_per_registered_method` | `feat(core): generate the typescript contract` |
| 1.6 | `.github/workflows/test_core.yml` (paths `core/**`, `visualization/app/codeCharta/model/coreApi/**`, `visualization/electron/coreMethods.generated.json`): job `core_checks` matrix ubuntu/windows/macos: `cargo fmt --check` (ubuntu), `cargo clippy --all-targets --all-features -- -D warnings`, `cargo test --all-features`; job `contract_drift` (Rust + Node, `npm ci` in `visualization`, `npm run contract`, `git diff --exit-code`). Toolchain action pinned by SHA like the other workflows; cargo cache. Check whether `merge-gatekeeper.yml` / `quality_gate.yml` need the new jobs. | — | `ci(core): check format, lints, tests and contract drift` |
| 1.7 | Docs: root `CLAUDE.md` (core folder, its commands, scope `core`), `visualization/TARGET-ARCHITECTURE.md` "Desktop shell and core" paragraph, root `README.md` dev prerequisites (Rust). | — | `docs(core): describe the core and its place in the desktop app` |
| 1.8 | Licences: decide how core dependencies meet `license_policy.json`: `cargo-deny` (`deny.toml` allow-list derived from the policy's `allow` entries) as a `test_core.yml` job, and/or `cargo-cyclonedx` SBOM + `purl-patrol` in `check-licenses.yml` beside the other two components. Both tools UNVERIFIED; record the choice in the progress file. | — | `ci(core): check licences of core dependencies` |

### M2 — Process runner, tools, settings, doctor (L)

| # | Task | Tests first | Commit |
|---|---|---|---|
| 2.1 | `config/paths.rs`, `config/settings.rs`, `Core::open`; `paths.get`, `paths.setStoreRoot`, `paths.resetStoreRoot` (api types + dispatch). | `should_prefer_cli_data_dir_over_env`, `should_default_store_root_into_data_dir`, `should_return_defaults_without_a_file`, `should_keep_a_corrupt_file_as_a_copy`, `should_back_up_a_newer_schema_once`, `should_drop_unknown_fields`, `should_write_atomically`, `should_apply_concurrent_updates_in_order` (tempfile) | `feat(core): add data dir, settings file and paths methods` |
| 2.2 | `process/env.rs`, `process/launch.rs`. | `should_disable_git_prompts`, `should_drop_git_dir_and_node_options`, `should_append_search_folders_to_path`, `should_add_askpass_variables_last`, `should_keep_terminal_prompt_off_with_askpass`, `should_detect_cmd_and_bat_case_insensitively`, `should_refuse_percent_quote_bang_and_newlines_for_batch_files`, `should_name_the_refused_argument` | `feat(core): harden child environments and batch arguments` |
| 2.3 | `cc-fake-tool` bin (modes via first arg: `version <text>`, `echo-args`, `sleep <ms>`, `spawn-grandchild <pidfile>`, `flood <bytes>`, `exit <code>`, `utf8-split`); `tests/support/mod.rs` (`fake_tool()`, `TempRepo` running git with fixed `GIT_AUTHOR_*`/`GIT_COMMITTER_*` names, emails and dates, `HOME`/`XDG_CONFIG_HOME` pointed at the temp dir, `GIT_CONFIG_NOSYSTEM=1`). | — (helpers) | `test(core): add fake tool and temporary repository helpers` |
| 2.4 | `process/tree.rs`, `process/runner.rs`. | `tests/runner.rs`: `should_return_exit_code_and_output`, `should_report_non_zero_exit_without_error`, `should_fail_tool_not_found_for_a_missing_program`, `should_refuse_a_relative_program`, `should_time_out_and_kill`, `should_cancel_and_kill`, `should_not_spawn_when_already_cancelled`, `should_stop_at_the_output_cap`, `should_stream_chunks`, `should_not_split_multibyte_characters`, `should_kill_grandchildren_too`, `should_pass_arguments_with_spaces_and_metacharacters_unchanged`, `should_run_git_in_a_temp_repo`; `#[cfg(windows)]` `should_pass_arguments_unchanged_through_a_cmd_file` (temp `ccsh.cmd` calling `"%~dp0cc-fake-tool.exe" echo-args %*`, fake copied next to it), `should_kill_java_like_grandchild_of_a_cmd_file` | `feat(core): add guarded process runner with tree kill` |
| 2.5 | `tools/*`; `tools.doctor`, `tools.setPath`, `tools.clearPath`; `codecharta-core doctor [--json] [--refresh]`; `Core::shutdown` kills all children (wired to serve shutdown). | unit: `should_read_git_version_from_a_windows_build_string`, `should_read_java_major_from_an_openjdk_banner`, `should_read_ccsh_version`, `should_compare_2_10_above_2_9`, `should_prefer_the_first_path_folder`, `should_skip_relative_path_entries`, `should_strip_quotes_around_path_entries`, `should_try_each_windows_name`, `should_fall_back_to_well_known_folders`; `tests/tools.rs` (fake tool copied as `git`/`ccsh`/`java` into a temp folder used as the only search folder): `should_report_missing_tools`, `should_report_too_old_below_minimum`, `should_report_failed_on_unreadable_version`, `should_prefer_the_custom_path`, `should_refuse_a_custom_path_that_is_not_the_tool`, `should_set_java_home_for_ccsh_outside_path`, `should_reuse_the_cached_report`, `should_allow_analysis_only_with_git_ccsh_and_java`; protocol: `should_emit_progress_during_doctor`; CLI: `should_exit_1_when_a_required_tool_is_missing` | `feat(core): discover git, ccsh, java, gh and glab` |
| 2.6 | `shell.resolvePath` for `DataFolder`, `LogsFolder`, `StoreRoot`; `SnapshotMap` → `NOT_FOUND`. | `should_resolve_the_store_root`, `should_answer_not_found_for_snapshot_maps_without_a_store` | `feat(core): resolve shell path targets` |

### M3 — Electron shell (M)

JS units run with `node --test electron/` (new script `test:electron`; Node 24's built-in runner, no new dependency), added to `build_visualization_test` in `test_visualization.yml`.

| # | Task | Tests first | Acceptance | Commit |
|---|---|---|---|---|
| 3.1 | `script/copyElectron.js`; `build` uses it; README note on Unix tools removed. | — | `npm run build` works from PowerShell; `dist/bundler/browser/main.js` identical to the source | `build(visualization): copy electron files without POSIX cp` |
| 3.2 | Smoke harness first: `playwright.desktop.config.ts` (`testDir: "./electron"`, `testMatch: "**/*.e2e.ts"`, `workers: 1`, no `webServer`), `electron/smoke.e2e.ts` (`_electron.launch` against `dist/bundler/browser` with a temp `CODECHARTA_USER_DATA_DIR`), script `e2e:desktop` (`node script/ensureElectron.js && npx playwright test --config playwright.desktop.config.ts`); knip `entry` for the config and spec. CI job `build_visualization_desktop_smoke` (ubuntu: Rust toolchain, `cargo build` in `core/`, `npm ci`, `npm run build`, `sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0`, `xvfb-run --auto-servernum npm run e2e:desktop`, upload `test-results/` on failure). | "should open one window that boots the app"; "should keep Node out of the page" | green against today's `main.js` | `test(visualization): add electron smoke test` |
| 3.3 | `shellPolicy.js` (pure). | `shellPolicy.test.js`: "should trust the main frame of the bundled page", "should reject a sub frame", "should reject another web contents", "should reject a missing frame", "should ignore query and hash", "should compare Windows paths case-insensitively", "should trust only the dev server origin when unpackaged", "should send https and vscode links to the system", "should block file links to other pages", "should resolve the core next to the resources when packaged", "should resolve the debug core when unpackaged", "should back off and give up after five failures in a minute", "should allow only renderer methods" | `npm run test:electron` green | `feat(visualization): add pure policies of the desktop shell` |
| 3.4 | `coreClient.js` (spawn injected). | `coreClient.test.js` (fake child over streams): "should send hello before other requests", "should match responses by id out of order", "should emit notifications", "should resolve pending requests as core unavailable on exit", "should restart with backoff", "should report unavailable on protocol mismatch", "should close stdin and kill after the grace period on stop" | green | `feat(visualization): add json-rpc client for the core` |
| 3.5 | `preload.js`, relay and lifecycle in `main.js` (single instance, sandbox, `webPreferences`, navigation guard, core start/stop, log file, `shell.json`). CHANGELOG (Changed): `- **One desktop window**: starting the desktop app a second time brings the running window to the front instead of opening another one.` | smoke: "should answer core.ping through the bridge", "should expose nothing but the bridge", "should refuse a method outside the allow-list", "should refuse a second instance on the same data folder", "should show the core as unavailable when the binary is missing" (`CODECHARTA_CORE_PATH` to a missing file) | `npm run build && npm run e2e:desktop` green; web `npm run e2e:ci` green | `feat(visualization): connect the electron shell to the core` |
| 3.6 | Dialog and shell actions: `pickFolder`, `pickFile`, `chooseToolExecutable` (Windows filter `exe, cmd, bat`), `chooseStoreRoot`, `reveal`, `readSnapshotMap`, `setWindowBackground`. | `shellPolicy.test.js`: "should refuse a map outside the data folder", "should refuse a file that is not a map", "should reject a colour that is not six hex digits" | manual: a picked executable reaches `tools.setPath`; a cancelled picker answers `null` | `feat(visualization): add native pickers and reveal to the shell` |
| 3.7 | Packaging: `coreBinaryFor` in `appBuild.js` + `extraResource`; `build_core` matrix + download step in `test_packaging.yml` and `release-visualization.yml`; executable-mode check of the Linux/macOS zips; trigger on `core/**`. | — | `npm run package:local` after `cargo build --release` produces an app whose core answers; packaging workflow green | `build(visualization): ship the core binary with the desktop app` |

### M4 — Renderer seam and desktop tools (M)

| # | Task | Tests first | Acceptance | Commit |
|---|---|---|---|---|
| 4.1 | `util/desktop/*` (3.12). | `desktopBridge.token.spec.ts`: "should return null on the web", "should return the exposed bridge", "should ignore a bridge of another protocol version"; `desktopEnvironment.service.spec.ts`: "should report desktop when a bridge is provided", "should follow the core state", "should throw when the bridge is required on the web"; `desktopResult.spec.ts`; `desktopEvents.spec.ts`: "should unsubscribe on teardown"; `desktopBridge.mocks.spec.ts`: "should record each call", "should fail a seeded method", "should deliver emitted events", "should work when rebuilt from its own source text" | `npm test`, `npm run lint`, `tsc` green | `feat(visualization): add desktop bridge port and test fake` |
| 4.2 | `features/desktopTools`, mount in the global configuration dialog, `standInForTheDesktopBridge` in `app/playwright.helper.ts`. CHANGELOG (Added): `- **Desktop tools check**: the settings of the desktop app show whether git, ccsh, Java and the GitHub and GitLab command lines were found and in which version, and let you pick another executable.` | `desktopTools.service.spec.ts`: "should load the cached report once", "should show progress while checking again", "should keep the old report when choosing fails", "should stay silent when cancelled"; `desktopToolsPanel.component.spec.ts`: "should list every tool with its version", "should mark a missing required tool as an error", "should mark a missing optional tool as not installed", "should offer the default only for a custom path", "should reveal the data folder", "should offer a core restart when the core is unavailable"; `globalConfigurationDialog.component.spec.ts`: "should not show desktop tools on the web", "should show desktop tools in the desktop app"; `desktopTools.e2e.ts` (web build): "should hide the desktop tools without a bridge", "should list the tools of a stand-in bridge"; smoke: "should list five tools from the real core" (states not asserted) | all section 5 checks incl. `npm run build && npm run e2e:ci && npm run e2e:desktop` | `feat(visualization): show the desktop tools check in the settings` |

## 5. Repo rules that bite here

- **Core gates (from `core/`):** `cargo fmt --check`, `cargo clippy --all-targets --all-features -- -D warnings`, `cargo test --all-features`; after any api change `npm run contract` (from `visualization/`) and commit the output. Commit scope `core`.
- **Angular gates (from `visualization/`):** `npm test` (80% global Jest gate — it covers `app/` only), `npm run lint` (dependency-cruiser, knip, Biome), `npx tsc --noEmit -p tsconfig.json`, `npm run test:electron`; when shell, preload or UI flows changed `npm run build && npm run e2e:ci && npm run e2e:desktop`. Root `npm run format:check` (also formats `electron/*.js` and the generated contract). Commit scope `visualization`.
- **Tidy First:** structural commits (1.1–1.2, 3.1, 3.2) carry no behaviour change; behaviour commits are separate.
- **dependency-cruiser:** `util/desktop/` imports only `util/` and `model/`; `model/coreApi/` imports only itself; `features/desktopTools` is reached through its `facade.ts`, needs no `@ngrx/store`.
- **knip:** unused exports fail — add a renderer helper only with its first caller (a spec counts). `model/coreApi/**` is ignored; `script/*.js` and `electron/*.js` stay outside knip.
- **Biome:** `noConsole` (warn/error only), `useBlockStatements`, `noForEach`, 140 columns, no semicolons, double quotes; formats `electron/*.js` too.
- **Clean code (`CODE_QUALITY.md`)** applies to Rust as well: names longer than two characters, named constants for every timeout/cap/backoff, functions under 25 lines, ≤ 4 parameters (hence request/option structs), comments only for a non-obvious why (batch arguments, job objects, askpass dispatch, handshake).
- **No dependency with install scripts** on the npm side (`.npmrc`); this plan adds no npm package. Every new crate must pass the licence check from 1.8.
- **Changelog:** two entries (3.5 Changed, 4.2 Added).
- **Persistence:** nothing added to `CcState` or IndexedDB.
- **Docs that must stay true:** root `CLAUDE.md`, `core/README.md`, `visualization/README.md`, `visualization/TARGET-ARCHITECTURE.md`.

## 6. Manual verification (Windows, packaged app)

`cd core && cargo build --release`, then in `visualization/`: `npm run build && npm run package:local`, run `dist\applications\codecharta-visualization-win32-x64\codecharta-visualization.exe`.

1. The app opens; DevTools: `typeof require === "undefined"`; `await codeChartaDesktop.request("core.ping", {})` → `ok: true`; `await codeChartaDesktop.request("tools.setPath", {…})` → forbidden.
2. Second start focuses the first window; Task Manager shows one app and one `codecharta-core.exe`.
3. Settings → "Desktop tools": git, Java, ccsh (path ends in `ccsh.cmd`) with versions. `codecharta-core.exe doctor` in a terminal (from `resources\`) prints the same.
4. "Choose…" for git → `notepad.exe` → error line, old row stays; real `git.exe` → row updates; "Use default" reverts. `%APPDATA%\codecharta-visualization\core-settings.json` holds the path while set.
5. "Show in file manager" opens the store root (or its parent).
6. End `codecharta-core.exe` in Task Manager → the panel shows "restarting", then works again; kill it six times quickly → "unavailable" with "Restart core".
7. `location.href = "https://example.com"` in the console → browser opens, app stays. "Open in VS Code" of local source still works.
8. Close the app during `tools.doctor { refresh: true }` → no orphaned `java.exe` / `cmd.exe`.
9. `%APPDATA%\codecharta-visualization\logs\core.log` exists without errors from normal use.

## 7. Out of scope

- Projects and the store layout (03), git commands and the askpass helper/endpoint/prompt (04), `ccsh analyse` (05), `gh`/`glab` calls (06). This plan only locates tools and offers `Tools::run`.
- Theme switching (02); only `setWindowBackground` is provided.
- Application menu, window bounds, auto-update, installers, code signing, crash reporting; renaming the app.
- Permission handlers and the CSP.

## 8. Offers to later plans

- `Core`, `CoreError` + `ErrorCode`, `Tools::run`, `ProcessRunner` (`askpass` option, streaming, cancellation), `SettingsStore`, `Paths::store_root`, `RequestContext` with `CancellationToken` and `Notifier` (`core.progress`, `emit`).
- The registration rule in 3.3 and the CLI pattern in 3.9.
- `ShellPathTarget` (extend it), `reveal`, `readSnapshotMap`, `pickFolder`, `pickFile` in the shell; `DesktopBridge.request/subscribe`, `DesktopEnvironment`, `createFakeDesktopBridge`, `standInForTheDesktopBridge` in the renderer.
- Test helpers: `tests/support` (`TempRepo`, `fake_tool`), `tests/protocol.rs` pattern, the `cfg(windows)` batch-file test pattern, the Electron smoke harness.

## 9. Risks

| Risk | Resolution |
|---|---|
| Electron 44 / packaging facts assumed (section 2) | M0 spikes S1–S3 before M3 |
| Batch-file argument rules differ from expectations | S4; our own refusal set is stricter than std, so the worst case is a clear `BAD_REQUEST`; Windows CI runs the real `.cmd` test |
| Orphaned children when the core is hard-killed on unix (process groups do not die with the parent) | Shell stops the core gracefully (EOF, 5 s); on Linux optionally `PR_SET_PDEATHSIG` (UNVERIFIED); a stale `git worktree` is repaired by plan 05's `git worktree prune` |
| arm64 / macOS core builds lack native runners | 3.11 fallback: cross-compile per OS, else drop the target with the owner's OK |
| Large maps through `contextBridge` copy | S1 measures; maps travel gzipped as `Uint8Array` and are inflated in the renderer |
| ts-rs output shape or Biome conflicts | S6; overrides or `specta` |
| A git repository can run code through its config (`core.fsmonitor`, hooks, `core.sshCommand`) | Not solvable in the runner; plan 04 passes neutralising `-c` options and runs git only in project folders |
| Playwright `_electron` lags Electron 44 | Found in 3.2; fallback `--remote-debugging-port` + `chromium.connectOverCDP` |
| xvfb sandbox restrictions on `ubuntu-latest` | `sysctl` in 3.2; never `--no-sandbox` |

## 10. Decisions (settled by the owner)

1. One instance only; a second start focuses the running window.
2. Tool executables and the store root are chosen only through native pickers handled inside the shell (`tools.setPath`, `paths.setStoreRoot` are shell-only methods), so page content can never point the core at an arbitrary executable.
3. The tools check is a section of the existing Global Configuration dialog.
4. CI runs the core tests on Windows, macOS and Linux.
5. Minimum versions: git 2.31, ccsh 2.2.1, Java 22.
6. Credentials are prompted through askpass (the core binary) and never stored; this plan provides the runner option and the dispatch rule, plan 04 the rest.
7. Progress files go to `dev_docs/studio/agents/progress/`.
