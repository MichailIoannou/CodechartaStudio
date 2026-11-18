---
name: 03-M0 spikes for projects and the managed store
state: progress
version: 1
---

## Goal

Answer the unknowns plan 03 rests on before the store core is written, and reconcile the plan's
"Required from plan 01" list against plan 01 as implemented (overview section 10). No production code.

## Tasks

Copied from `03-projects-and-managed-store.md`, Milestones, M0, plus the section 10 reconciliation.

### 0. Reconcile "Required from plan 01" with plan 01 as implemented (M1, M2; M3 once merged)
### 1. 64 MiB `Uint8Array` from `ipcMain.handle` (needs the 01-M3 shell)
### 2. `setFiles({ value: [] })` with the router outlet swapped, then load again (renderer)
### 3. Scratch Rust test: `trash` crate on a directory in the data folder; `rename` over an open file;
the exclusive-lock crate across two processes; the seven git commands of section 2 against a normal
clone, a shallow clone, a subfolder and a non-repo; `ts-rs` for `#[ts(type = "Uint8Array")]` and
validated newtypes. Plan says Windows; Linux results first, Windows open for the owner.
### 4. `webUtils.getPathForFile(file)` in the sandboxed preload on drag and drop (needs the 01-M3 shell)

## Steps

- [x] 0. Reconciliation written
- [ ] 1. IPC 64 MiB transfer
- [ ] 2. Unload all files and load again
- [x] 3. Scratch Rust items (Linux)
- [ ] 3. Scratch Rust items (Windows) — needs owner hardware
- [ ] 4. Drag and drop path

## Notes

Part A (items 0 and 3, Linux) was done on 2026-11-18 on branch `feature/studio-03-m0a`, based on
`feature/studio-integration` (plan 01 M1 and M2 as built; M3 shell not merged). No production code was
changed. Items 1, 2 and 4 and the Windows half of item 3 stay open. Environment: Arch Linux x86_64,
rustc/cargo 1.95.0, git 2.56.0, node 26.13.0; scratch crate outside the repository.

## Item 0 — reconciliation of "Required from plan 01" with `core/` as built

Read: `codecharta-core/src/{lib,error}.rs`, `config/{paths,settings}.rs`, `process/{env,runner,launch}.rs`,
`tools/doctor.rs`, `codecharta-core-api/src/{error,registry}.rs`, `methods/*.rs`,
`codecharta-cored/src/serve/{dispatch,tools_routes}.rs`, `tests/support/*`, `visualization/electron/`.

| Plan 03 asks for | State | Name as built / who adds it |
| --- | --- | --- |
| Workspace and three crates `codecharta-core`, `-core-api`, `-cored` | present | as named. Binary is `codecharta-core`; `codecharta-cored` is a library (`cli`, `serve`) plus a thin `main.rs`. |
| JSON-RPC dispatcher, method table, notification channel | present, different shape | Methods: `Method` trait + `METHODS` in `codecharta-core-api/src/registry.rs`; routes: `ROUTES` in `codecharta-cored/src/serve/dispatch.rs` (`Route { name, handler }`); a test fails until both lists agree. Events: `Event` trait + `EVENTS`; emit with `context.notifier.emit(E::NAME, &payload)`; `Notifier::progress` for `core.progress`. Adding a method = api type + `impl Method` + `METHODS` entry, `npm run contract`, core function, `Route`. |
| `ErrorCode` / `CoreError` with `BAD_REQUEST`, `NOT_FOUND`, `IO_ERROR`, `TOOL_NOT_FOUND`, `INTERNAL` | present under another name | Enum `ErrorCode` in `codecharta-core-api/src/error.rs` (not `CoreError`), wire form SCREAMING_SNAKE. **`IO_ERROR` is `IO`**. Thirteen codes: `BAD_REQUEST NOT_FOUND NOT_ALLOWED CONFLICT TOOL_NOT_FOUND TOOL_FAILED TIMEOUT CANCELLED OUTPUT_TOO_LARGE IO PROTOCOL_MISMATCH CORE_UNAVAILABLE INTERNAL`. `CoreError` (thiserror, `codecharta-core/src/error.rs`) has one variant per code (not `PROTOCOL_MISMATCH` / `CORE_UNAVAILABLE`), and `CoreError::Io { context, source }`. **Appending store codes needs three edits**: a new `ErrorCode` variant *and* the hard-coded `ErrorCode::ALL: [ErrorCode; 13]` array, a `CoreError` variant, and the arms of `code()` / `to_payload()`. `CONFLICT` already exists and may serve `STORE_LOCKED`; decide in M1. 03-M1. |
| Tool runner running `git` with argv, stdin closed, timeout, hardened env, `TOOL_NOT_FOUND` | present | `Tools::run(ToolId::Git, args: Vec<OsString>, ToolRunOptions, &CancellationToken) -> CoreResult<RunOutput>` (`tools/doctor.rs`) over `ProcessRunner::run(RunRequest, &CancellationToken)`. stdin is `Stdio::null()`, env is `env_clear()` + `hardened_env` (`GIT_TERMINAL_PROMPT=0`, `GCM_INTERACTIVE=never`, `GIT_OPTIONAL_LOCKS=0`, `GIT_PAGER=cat`, `PAGER=cat`; `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE` removed). `RunOutput { exit_code, stdout: String, stderr: String, duration }`; **a non-zero exit is `Ok`**, the caller reads `exit_code` (spawn `NotFound` -> `TOOL_NOT_FOUND`, a signal -> exit code -1). Output is decoded UTF-8 (lossy; NUL bytes survive, so the `%x00` separators of the `show` command are kept). Default cap 16 MiB. |
| `trait GitRunner { fn run(&self, cwd, args) -> Result<GitOutput, CoreError> }` | **missing as a trait; real type differs** | There is no git-specific runner or trait. The real call is **async** (`Tools::run`, needs a `CancellationToken`, takes `Vec<OsString>` and `ToolRunOptions { cwd, env, timeout, .. }`) and the first call triggers the tools doctor (`Tools::report`) which checks all five tools. 03-M1/M2 must add its own small `GitRunner` trait with an **async** `run(&self, cwd: &Path, args: &[&str]) -> CoreResult<GitOutput>` (or `async fn` in a trait, edition 2024) and implement it for `Tools` (production) and for a canned-answer fake (unit tests). Cost: ~30 lines in `codecharta-core/src/git/runner.rs`, owned by 03-M2 (first user is the folder inspector). Plan 03's "15 s timeout" goes in `ToolRunOptions::new(Duration)`. |
| Settings file with `store_root: Option<PathBuf>` | present, type differs | `CoreSettings { schema_version, store_root: Option<String>, tool_paths }` in `<dataDir>/core-settings.json` (`config/settings.rs`; `SettingsStore::{load, get, update}`). A `String`, not `PathBuf`; paths pass `path_to_wire`. |
| `AppPaths::default_store_root()` | present under another name | `Paths::store_root()` (setting, else `<dataDir>/store`; `default_store_root` is private) in `config/paths.rs`. **`directories` was not used**: it pulls `option-ext` (MPL-2.0), refused by `core/deny.toml` (confirmed below). Data dir = `--data-dir` > `CODECHARTA_DATA_DIR` > `<appData>/codecharta-visualization`. 03-M1 must not name `directories`. |
| `--store-root` flag / `CODECHARTA_STORE_ROOT` | **missing** | Only `--data-dir` / `CODECHARTA_DATA_DIR` exist, and the default store is `<dataDir>/store`, so CLI and tests can already isolate the store with a temp data dir. Recommend: do not add a second variable; change plan 03 to say `--data-dir` (and `paths.setStoreRoot` for the override). If the owner wants the flag, 03-M1 adds it to `CoreConfig::resolve`. |
| `paths.get`, `paths.resetStoreRoot` | present | Renderer methods. Also `paths.setStoreRoot` (shell-only). `Paths::set_store_root` requires an absolute, existing folder and **does not move or copy content** (comment says copying is plan 03). |
| `store.changeRoot` implemented beside them | missing, and overlaps | Plan 03 adds `store.changeRoot` + shell `store.chooseRoot`; plan 01 already has shell-only `paths.setStoreRoot` and shell `chooseStoreRoot`. Resolve in 03-M6: either `Paths::set_store_root` calls `change_store_root` (one method, `paths.setStoreRoot` stays) or the store plan deprecates it. Needs `Paths` to reach the store, which does not exist yet. |
| Method gate: shell-only methods refused from the renderer | present as data, enforcement is the shell's | `Audience::{Renderer, Shell}` per method; the generated `visualization/electron/coreMethods.generated.json` lists `rendererMethods` (now `core.ping paths.get paths.resetStoreRoot tools.doctor tools.clearPath`). **The core itself does not check the audience**; the relay in 01-M3 must. Check after 01-M3. New names for plan 03 to add as `Audience::Shell`: `projects.inspectFolder`, `projects.folderPath`, `projects.sourceFileLocation`, `snapshots.inspectImportFile`, `snapshots.mapLocation`. |
| Shell-composed methods in `codecharta-core-api/src/shell.rs`, "never served by the core" | **missing; different shape** | There is no such category. `methods/shell.rs` holds only `ShellPathTarget` and `shell.resolvePath`. Every entry of `METHODS` needs a `ROUTES` entry (`should_handle_exactly_the_registered_methods`), so a method that exists only in the shell cannot be registered there. Plan 01 (3.6, `DesktopBridge`) models the shell actions as preload functions (`pickFolder`, `pickFile`, `readSnapshotMap`, `reveal`, `chooseToolExecutable`, `chooseStoreRoot`), not as contract methods. See "after 01-M3" below. 03-M2 decides; no core change needed. |
| `ShellPathTarget` | present, to extend | `DataFolder | LogsFolder | StoreRoot | SnapshotMap { project_id, folder_id, snapshot_id }` (camelCase tag `kind`). `SnapshotMap` currently answers `NOT_FOUND`: **03-M3 fills it in `Paths::resolve`** (needs the store). Plan 03's `projects.folderPath` / `sourceFileLocation` could become further targets (`ProjectFolder { project_id, folder_id }`, `SourceFile { .. }`) instead of new methods; recommended, because `shell.resolvePath` already is the one shell-only path door. |
| `RequestContext` (cancel token, notifier) | present, in `codecharta-cored` | `RequestContext { id, cancel, notifier }` is in `serve/dispatch.rs`, not in `codecharta-core`. Library functions get only the `CancellationToken`. Plan 03 section 1.8 ("library first") is therefore fine, but any progress reporting from the library (import, store copy) needs a callback or channel argument; there is none to reuse. |
| `Core` facade | present | `Core::open(CoreConfig)` (creates nothing on disk), `paths()`, `tools()`, `shutdown()`. **No store yet**: 03-M1 adds `Store`, its `Core` field and the `.lock` acquisition. `serve` calls `Core::shutdown` at the end; the lock must be released there (drop the guard). |
| Test support: workspace, `tempfile`, binary start via `CARGO_BIN_EXE_codecharta-core` | present | `codecharta-cored/tests/{cli,protocol}.rs` use `env!("CARGO_BIN_EXE_codecharta-core")` and a temp data dir. `tempfile` 3.27.0 is a normal dependency of `codecharta-core` (needed for atomic writes) and a dev-dependency of `codecharta-cored`. |
| Git fixture, **created by plan 03 (M2.2)** at `tests/support/fixture_repo.rs` | already exists under the overview-section-10 name | `codecharta-core/tests/support/git_fixture.rs`, re-exported as `TempRepo` from `tests/support/mod.rs`: temp `HOME`/`XDG_CONFIG_HOME`, `GIT_CONFIG_NOSYSTEM=1`, fixed author/committer, `commit_file(name, content, message)`, `git(&[..])`, `env()`. 03-M2.2 only **extends** it: shallow clone, clone with a credential URL, subfolder, no-commit repo (the Linux spike shell script below lists the shapes). No `-c init.defaultBranch` need: it passes `--initial-branch main`. Also `fake_tool()`, `install_fake_tool`, `system_git()`, `args()`. |
| Crate candidates `serde`, `serde_json`, `thiserror`, `ts-rs`, `tempfile` | present | `ts-rs` 12.0.1 (`serde-json-impl`, `no-serde-warnings`), `tempfile` 3.27.0. Not yet in the workspace: `sha2`, `flate2`, `trash`, `fs4`/lock, `dunce`, `time`/`humantime`, `rand`/`getrandom`, `directories`. `humantime` 2.4.0 is already used for RFC 3339 UTC (`format_rfc3339_seconds`), which may replace `time` for `createdAt` stamps. |

Renderer and shell parts of the list (`DESKTOP_BRIDGE` token, `DesktopEnvironment`, `valueOrThrow`,
`createFakeDesktopBridge`, `standInForTheDesktopBridge`, preload, `coreClient.js`) do not exist in this
branch (`visualization/app/codeCharta/util/desktop/` is absent; `visualization/electron/` holds `main.js`
and the generated allow-list only). **To check after 01-M3 / 01-M4:**
- Bridge call shape: plan 01 and overview section 10 say `bridge.request(method, params, { operationId })`
  and `bridge.subscribe`; plan 03 examples use `bridge.projects.list()`. Plan 01 wins (section 10);
  plan 03 must be corrected in the commit that first uses the bridge.
- Plan 01 `pickFolder({ title })` resolves to **a path string** in the renderer. Plan 03 decision 1 ("paths
  never come from the renderer", pick tokens, `projects.pickFolder` composed in the shell,
  `inspectFolder` shell-only) contradicts that, and so does overview D2/section 7. One of the two must
  change before 03-M2.
- Plan 01 `readSnapshotMap(target)` reads a whole file into one `Uint8Array`; plan 03 decision 7
  (`snapshots.readMapChunk`, 16 MiB chunks, spike item 1) wants chunking. Decided by item 1.
- Whether the relay forwards `shell.resolvePath` only inside the shell and refuses every `Audience::Shell`
  name from the renderer (the allow-list says so; the relay code is not merged).
- Whether the shell's single-instance lock, `vscode:` external protocol and `app.relaunch()` exist.

### Result of item 0

Missing from plan 01 as built and who adds it: `GitRunner` trait (03-M2, async, over `Tools::run`);
`--store-root` / `CODECHARTA_STORE_ROOT` (not needed, change plan 03 to `--data-dir`, or 03-M1); store
error codes need `ErrorCode::ALL` and `CoreError` edits (03-M1); shell-composed methods in `core-api`
(do not exist; resolve with plan 01 after 01-M3); `Store`/`.lock`/`Recycler`/`ProjectLocks` (03-M1, as
planned, nothing to reconcile). Present under another name: `IO_ERROR` is `IO`; `AppPaths::default_store_root`
is `Paths::store_root`; `store_root` is `Option<String>`. Plan 03 text that must be edited in the 03-M1
commit: "Required from plan 01" (the names above), section 2 `.lock`/`--store-root` wording, the
`directories` crate candidate (rejected by licence), section 3 module `recycle.rs` is fine.

## Item 3 — scratch Rust test (Linux)

Scratch crate in `$TMPDIR` outside the repository (source in the appendix so the owner can run it on
Windows). Dependencies as `cargo add` resolved them on Rust 1.95: `trash 5.4.0`, `fs4 1.1.0`,
`ts-rs 12.0.1` (features `serde-json-impl`, `no-serde-warnings` as in `core/Cargo.toml`), `serde 1.0.229`,
`serde_json 1.0.154`. `cargo check --target x86_64-pc-windows-gnu` passes (type-checks the Windows paths
of `trash` and the `cfg(windows)` share-mode code; nothing ran).

### 3.1 Licences (against `core/deny.toml`, built from `license_policy.json`)

`cargo metadata` over the scratch crate (51 packages, all targets) evaluated against the `allow` list of
`core/deny.toml`; `cargo-deny` itself is not installed here (same substitute as plan 01 M1 task 1.8).

| Crate | Version | Licence | Verdict |
| --- | --- | --- | --- |
| trash (+ jiff, objc2, windows, urlencoding, ...) | 5.4.0 | MIT | pass; every transitive package passes |
| fs4 (+ rustix) | 1.1.0 | MIT OR Apache-2.0 | pass |
| ts-rs, ts-rs-macros | 12.0.1 | MIT | pass |
| dunce | 1.0.5 | CC0-1.0 OR MIT-0 OR Apache-2.0 | pass via Apache-2.0 |
| sha2, flate2, getrandom, rand, time, tempfile | 0.11.1, 1.1.11, 0.4.3, 0.10.4, 0.3.55, 3.27.0 | MIT OR Apache-2.0 | pass |
| **directories** | 6.0.0 | MIT OR Apache-2.0, but pulls **option-ext 0.2.0 = MPL-2.0** | **fail** (the refusal that bit plan 01) |
| unicode-ident | 1.0.27 | (MIT OR Apache-2.0) AND Unicode-3.0 | covered by the existing single-crate exception |

So with `trash`, a lock (std or `fs4`), `dunce`, `sha2`, `flate2` and `getrandom`, `deny.toml` needs no change.
`trash` adds ~35 packages (windows crate family, objc2, jiff) to `core/Cargo.lock` and to Windows/macOS
build time; its default features on Linux are the freedesktop trash.

### 3.2 `trash` crate on a directory in the data folder — Linux works

`XDG_DATA_HOME` pointed at a temp folder; data folder `<tmp>/work/data/store/projects/p-0123456789abcdef/...`.

```
trash .../store/projects/p-0123456789abcdef -> Ok(())
exists after: false
trash missing -> Err("Error during a `trash` operation: FileSystem { path: ..., source: Os { code: 2, kind: NotFound, ... } }")
trash same-name round 0 -> Ok(())      # the same name twice
trash same-name round 1 -> Ok(())
list: Ok(["same-name", "same-name", "p-0123456789abcdef"])
```
`Trash/files/{p-0123456789abcdef,same-name,same-name.2}` and matching `Trash/info/*.trashinfo` were created
(freedesktop layout). A second run with the data folder on another filesystem than `XDG_DATA_HOME`
(`/` ext4 vs `/tmp` tmpfs) also returned `Ok(())`, the directory moved into the home trash.

Findings: a whole directory tree moves in one call; trashing a path that does not exist is an error
(`NOT_FOUND` semantics, so `SystemRecycler` should check existence first or map it); name clashes are
resolved by the crate. **Plan 03 design 1.5 / section 3 `recycle.rs` holds.** Not tested: a headless box
with no `XDG_DATA_HOME` and no home (CI containers), a network drive, Windows recycle bin, macOS.
`Recycler` stays a trait, as the plan says, so `cargo test` never touches the real trash.

### 3.3 `std::fs::rename` over an existing file that another process holds open — Linux: always succeeds

A child process opens `project.json` (content `OLD`), the parent writes `project.json.tmp` and renames it over:

```
holder opened, saw "OLD"
rename over open file: Ok(())
content now: "NEW"
holder re-read through old handle: "OLD"
```
Same result with `hold-open-strict` (on Linux the share-mode branch is a no-op). That is POSIX: the
name is replaced, the holder keeps the old inode. **Linux cannot reproduce the Windows failure plan 03
fears** (risk table: "`fs::rename` over an existing file fails intermittently on Windows"); the retry loop
of `write_json_atomic` stays and is untested for the failing case. Note for Windows: Rust's `File::open`
opens with all three share modes (read, write, delete), so a plain holder will *not* make the rename fail;
the strict holder (`share_mode(1)` = FILE_SHARE_READ only) does, and is what the procedure below uses.

### 3.4 Exclusive lock across two processes — std `File::try_lock` is sufficient

Two lock modes, both `try_lock` on `.lock` opened `create + write`: `lock-std` (`std::fs::File::try_lock`,
stable since Rust 1.89, so fine on the pinned 1.95) and `lock-fs4` (`fs4::FileExt::try_lock`).
fs4 1.x has dropped its own `try_lock_exclusive` in favour of the std-shaped `try_lock` /
`TryLockError::{WouldBlock, Error}`; it is now a polyfill for older compilers (its README: compiles on
1.75). The plan names `fs4` as a candidate; **std makes it unnecessary** (one dependency less).

```
holder std, contender std, contender fs4:     LOCKED / BUSY / BUSY
holder exits, new std process:                LOCKED
holder fs4 SIGKILLed, new std process:        LOCKED      (the OS released it; no stale lock)
holder fs4, contender std:                    LOCKED / BUSY   (the two implementations interoperate)
```
`BUSY` is `TryLockError::WouldBlock`, which maps to `STORE_LOCKED` (or `CONFLICT`). **Plan 03 section 2
"Concurrency" holds, using `std::fs::File::try_lock` instead of `fs4`**; keep the `File` alive in `Store`
for the process lifetime. Windows: std uses `LockFileEx` with exclusive and fail-immediately flags; the
procedure below verifies it, and that a read-only CLI process can still open and read `.lock` and
`store.json` while the lock is held (LockFileEx locks are mandatory: **do not lock a file that other
processes must read, so lock `.lock`, never `store.json`**).

### 3.5 The git commands of plan 03 section 2 — Linux, git 2.56.0, hermetic

Script in the appendix: temp `HOME`, `GIT_CONFIG_NOSYSTEM=1`, `GIT_CONFIG_GLOBAL=/dev/null`, the hardened
variables of `process/env.rs`, local repositories only (a merged history with **two root commits**).
Folders: normal clone, shallow clone (`--depth 1` over `file://`), a subfolder of the clone, a clone with
credentials in the remote URL and a second SSH remote, a clone with `origin/HEAD` removed, a repository
without commits, a non-repository, and a linked worktree. Exit code and first output lines:

| Command | clone | shallow | subfolder | credentials | no `origin/HEAD` | no commits | non-repo |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `rev-parse --show-toplevel` | 0, repo root | 0, root | 0, **repo root** (not the folder) | 0 | 0 | 0 | **128** |
| `rev-parse --is-shallow-repository` | 0 `false` | 0 `true` | 0 `false` | 0 | 0 | 0 `false` | 128 |
| `config --get-regexp ^remote\..*\.url$` | 0, one line | 0, `file://...` | 0 | 0, **`https://ada:s3cret-token@github.com/...` verbatim**, plus the ssh remote | 0 | **1**, no output | **1**, no output |
| `symbolic-ref --quiet --short refs/remotes/origin/HEAD` | 0 `origin/main` | 0 `origin/main` | 0 | 0 | **1**, no output | 1 | 128 |
| fallback `rev-parse --abbrev-ref HEAD` | `main` | `main` | `main` | `main` | `main` | **128, prints `HEAD`** and a fatal | 128 |
| `rev-list --max-parents=0 HEAD` | 0, **two** SHAs | 0, **one SHA = the graft point (tip), not a root** | two | two | two | **128** | 128 |
| `rev-parse --verify --quiet <7hex>^{commit}` | 0, full SHA | **1** (commit absent) | 0 | 0 | 0 | 1 | **128** |
| same with an unknown hex | 1, no output | 1 | 1 | 1 | 1 | 1 | 128 |
| `show -s --format=%H%x00%h%x00%s%x00%an%x00%aI%x00%cI%x00%P <sha>` | 0, NUL separated, ends with newline | **128 `bad object`** | 0 | 0 | 0 | 128 | 128 |

Further observations: `--show-toplevel` through a symlinked folder prints the **resolved** path, so the
`is_repository_root` comparison must canonicalise the folder first (confirmed: top level `.../real` for
cwd `.../link`); a linked worktree reports its own folder as top level and has a `.git` *file*, ccsh's
`<folder>/.git exists` test still holds; outside a repository `config --get-regexp` still exits 1 quietly
(it reads only the global and system config, empty in the hermetic run), so `kind` must come from `--show-toplevel` alone, as the plan says; a
non-repository answers 128 with a fatal message on stderr whose wording depends on where the folder is
("or any parent up to mount point /", "Stopping at filesystem boundary"), so never parse stderr; the exit
code decides.
The NUL separated `show` output passes through `ProcessRunner` unchanged (`Utf8Decoder` keeps U+0000).

Verdict for plan 03 section 2: **the seven commands behave as the plan assumes**, with these refinements for 03-M2:
1. Shallow: `rev-list --max-parents=0` returns the *graft point*; the plan already suppresses
   `sharesHistoryWith` via `is_shallow`, but `rootCommits` should also be stored as empty (or flagged) for a
   shallow repository so a graft SHA is never shown or matched as a root.
2. Credentials appear verbatim in `config --get-regexp`; stripping before caching is required, and the
   stripping test needs this exact shape (`https://user:token@host/...`; `git@host:owner/repo` has no
   password and must stay intact).
3. `rev-parse --abbrev-ref HEAD` fails with exit 128 in a repository without commits and still prints
   `HEAD`; the plan's "output `HEAD` means none" works, but the exit code is 128, not 0, so treat "no
   output or `HEAD`" as none whatever the exit code. A repository without commits also fails
   `rev-list --max-parents=0` (128): `rootCommits = []`, not an error.
4. Two roots are normal (merged histories); `root_commits` must be a set.
5. For plan 05 (not 03): `rev-parse --verify` exits 1 for a commit a shallow clone lacks and `show` exits 128,
   so "unknown commit" has two exit codes.

### 3.6 `ts-rs` 12.0.1 for `#[ts(type = "Uint8Array")]` and validated newtypes — works

`Config::new().with_out_dir(..).with_large_int("number")` and `Chunk::export_all(&config)`, as the real
`export-contract` does. Source type and generated output:

```rust
#[derive(Serialize, Deserialize, TS)] #[serde(try_from = "String", into = "String")] #[ts(as = "String")]
pub struct ProjectId(String);                 // validated in TryFrom<String>
#[derive(..)] #[serde(transparent)] #[ts(type = "string")] pub struct FolderId(String);
#[derive(..)] pub struct PlainId(String);     // no attribute at all
pub struct Chunk { project_id: ProjectId, folder_id: FolderId, plain: PlainId,
    #[ts(type = "Uint8Array")] bytes: Vec<u8>, total: u64, #[ts(type = "Uint8Array | null")] maybe: Option<Vec<u8>> }
```
```ts
export type ProjectId = string;   export type FolderId = string;   export type PlainId = string;
import type { FolderId } from "./FolderId"; import type { PlainId } from "./PlainId"; import type { ProjectId } from "./ProjectId";
export type Chunk = { projectId: ProjectId, folderId: FolderId, plain: PlainId, bytes: Uint8Array, total: number, maybe: Uint8Array | null, };
```
Deserialisation through the validating `TryFrom<String>` rejects `"../escape"`, `""` and `"Bad_ID"` inside a
nested struct (`invalid id "Bad_ID"`, line 1, column 21), and the wire JSON of `bytes` is an array of numbers
(`[1,2,3]`), which confirms plan 03 decision 7: bytes must never ride JSON-RPC, only appear in the
`Uint8Array` types of the shell API. `with_large_int("number")` renders `u64` as `number`.
**Plan 03 design 1.2 (validated newtypes) holds:** a newtype needs no ts attribute (a single-field tuple
struct is already its inner type), and `try_from`/`into` for validation needs `no-serde-warnings` (already set;
without it ts-rs prints "failed to parse serde attribute" for `try_from`, `into` and `transparent`).
Each newtype gets its own `.ts` file (`ProjectId.ts`), so use a type alias in `coreApi.ts` or accept
the imports. Fallback to `specta` is not needed. A `Uint8Array` override only matters for shell-side types
(plan 01 decided that `readSnapshotMap` returns `Uint8Array`, which today has no core type behind it).

### Design changes 03-M1 and later must take into account

1. Use `std::fs::File::try_lock` for `.lock`; drop the `fs4` candidate. Lock only `.lock`.
2. Write the async `GitRunner` trait over `Tools::run` (plan 01 has none) and extend `TempRepo` rather than create a fixture.
3. Store errors: add `ErrorCode` variants *and* the hard-coded `ErrorCode::ALL` count and `CoreError` variants and arms.
4. Remove `directories` (MPL-2.0 via `option-ext`); use `Paths::store_root()` and `--data-dir` instead of `AppPaths::default_store_root()` / `--store-root`.
5. Fill `ShellPathTarget::SnapshotMap` in `Paths::resolve` (03-M3) and prefer new `ShellPathTarget` variants over new shell-only methods for folder and source paths.
6. `rootCommits` of a shallow repository are graft points: do not store them as roots. Strip URL credentials. Treat `HEAD`/empty as no branch whatever the exit code.
7. Reconcile plan 03 decisions 1 and 7 with plan 01 `pickFolder` (returns a path) and `readSnapshotMap` (whole file) once 01-M3 lands; shell-composed methods in `core-api/src/shell.rs` do not exist.
8. `paths.setStoreRoot` already exists and moves nothing; decide whether `store.changeRoot` replaces or wraps it.

## Item 3 — Windows (open, for the owner)

Needs a Windows machine with Rust (rustup, stable >= 1.89), Git for Windows (git >= 2.31) and Git Bash.
Run from a normal PowerShell; the data folder must be under `%APPDATA%` as the plan says. Appendix A is
`src/main.rs`, Appendix B `Cargo.toml`, Appendix C the git script.

1. `cargo new spike`, replace `Cargo.toml` and `src/main.rs` with Appendix A/B, `cargo build`.
2. **trash:** `.\target\debug\spike.exe trash "$env:APPDATA\codecharta-spike-data"`. Expect `Ok(())`,
   `exists after: false`, the folder and the two same-name folders in the Recycle Bin (Explorer), and an
   `Err` for the missing path. Repeat with the data folder on a network share or a USB stick
   (`trash "\\server\share\x"`, `trash "E:\x"`) and record the error text: plan 03 wants it to fail
   cleanly so the UI can offer "Delete permanently". If the final `list:` line prints an
   error, record it, but the verdict is the result of `delete`.
3. **rename over an open file:** `spike.exe rename $env:TEMP\ccrn` (plain holder, expect `Ok(())` because
   Rust opens with FILE_SHARE_DELETE) and `spike.exe rename-strict $env:TEMP\ccrn2` (holder without
   FILE_SHARE_DELETE; expect an `Err` with `PermissionDenied` / os error 5 or 32). Then the real case:
   put a `project.json` into `%APPDATA%\ccrn3`, open it in Explorer's preview pane (select it with the
   preview pane on) and with Windows Search indexing on, run a loop of 200 write-temp-then-rename cycles
   (adapt `rename_test`) and count failures; record how many 20 ms doubling retries (5 tries) were
   needed. Decide whether five tries are enough or the loop needs a larger budget.
4. **lock:** in one PowerShell `spike.exe lock-std $env:TEMP\cc.lock`, within 6 s in a second one the same,
   then `lock-fs4`. Expect `LOCKED` then `BUSY` (a `TryLockError::WouldBlock`). While the first holds,
   run `type $env:TEMP\cc.lock` and open it in Notepad: record that reading a locked file is refused (the
   spike's `.lock` is empty; also write a few bytes into it first, because a byte-range lock covers the
   file content). Kill the holder from Task
   Manager and rerun: expect `LOCKED` at once.
5. **git:** from Git Bash, `bash gitspike.sh` (Appendix C; uses `mktemp`). Compare each line with the Linux
   table in 3.5. The plan already confirmed on git 2.56 for Windows: `--show-toplevel` prints `C:/...`,
   exit 128 outside a repository, `config` prints credentials verbatim, `show` separates by NUL. New to
   record: `--show-toplevel` for a folder given with backslashes and in a different drive-letter case;
   the shallow graft behaviour; a UNC path folder (git may refuse with "dubious ownership": record
   whether `safe.directory` errors give exit 128 with a recognisable message, since the folder inspector
   must show it).
6. **ts-rs:** `spike.exe ts $env:TEMP\ts`; expect byte-identical files to Linux (check for CRLF; Biome
   formats the real contract anyway).
7. Paste the outputs into this file under "Windows results" and tick the Windows step.

## Appendix A — `src/main.rs` of the scratch crate

```rust
use std::fs::{self, File};
use std::io::{BufRead, BufReader, Read, Seek, Write};
use std::path::Path;
use std::process::{Command, Stdio};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use ts_rs::{Config, TS};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(try_from = "String", into = "String")]
#[ts(as = "String")]
pub struct ProjectId(String);

impl TryFrom<String> for ProjectId {
    type Error = String;
    fn try_from(value: String) -> Result<Self, String> {
        let ok = !value.is_empty()
            && value.len() <= 96
            && value
                .bytes()
                .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-');
        if ok {
            Ok(Self(value))
        } else {
            Err(format!("invalid id {value:?}"))
        }
    }
}
impl From<ProjectId> for String {
    fn from(id: ProjectId) -> String {
        id.0
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(transparent)]
#[ts(type = "string")]
pub struct FolderId(String);

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct PlainId(String);

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct Chunk {
    pub project_id: ProjectId,
    pub folder_id: FolderId,
    pub plain: PlainId,
    #[ts(type = "Uint8Array")]
    pub bytes: Vec<u8>,
    pub total: u64,
    #[ts(type = "Uint8Array | null")]
    pub maybe: Option<Vec<u8>>,
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    match args.get(1).map(String::as_str) {
        Some("hold-open") => hold_open(&args[2], false),
        Some("hold-open-strict") => hold_open(&args[2], true),
        Some("lock-std") => lock(&args[2], false),
        Some("lock-fs4") => lock(&args[2], true),
        Some("trash") => trash_test(Path::new(&args[2])),
        Some("rename") => rename_test(Path::new(&args[2]), false),
        Some("rename-strict") => rename_test(Path::new(&args[2]), true),
        Some("ts") => ts_test(Path::new(&args[2])),
        Some("validate") => validate(),
        other => panic!("unknown mode {other:?}"),
    }
}

fn open_for_holder(path: &str, strict: bool) -> File {
    let mut options = fs::OpenOptions::new();
    options.read(true);
    #[cfg(windows)]
    if strict {
        // FILE_SHARE_READ only: no FILE_SHARE_DELETE, like an indexer or a preview handler.
        std::os::windows::fs::OpenOptionsExt::share_mode(&mut options, 1);
    }
    #[cfg(not(windows))]
    let _ = strict;
    options.open(path).unwrap()
}

fn hold_open(path: &str, strict: bool) {
    let mut file = open_for_holder(path, strict);
    let mut first = String::new();
    file.read_to_string(&mut first).unwrap();
    println!("holder opened, saw {first:?}");
    std::io::stdout().flush().unwrap();
    std::thread::sleep(Duration::from_secs(4));
    file.rewind().unwrap();
    let mut second = String::new();
    file.read_to_string(&mut second).unwrap();
    println!("holder re-read through old handle: {second:?}");
}

fn lock(path: &str, use_fs4: bool) {
    let file = fs::OpenOptions::new()
        .create(true)
        .truncate(false)
        .write(true)
        .open(path)
        .unwrap();
    let outcome: Result<bool, std::io::Error> = if use_fs4 {
        match fs4::FileExt::try_lock(&file) {
            Ok(()) => Ok(true),
            Err(fs4::TryLockError::WouldBlock) => Ok(false),
            Err(fs4::TryLockError::Error(e)) => Err(e),
        }
    } else {
        match file.try_lock() {
            Ok(()) => Ok(true),
            Err(std::fs::TryLockError::WouldBlock) => Ok(false),
            Err(std::fs::TryLockError::Error(e)) => Err(e),
        }
    };
    let text = match &outcome {
        Ok(true) => "LOCKED".to_string(),
        Ok(false) => "BUSY".to_string(),
        Err(e) => format!("ERR {e:?} kind={:?}", e.kind()),
    };
    println!("{text}");
    std::io::stdout().flush().unwrap();
    if matches!(outcome, Ok(true)) {
        std::thread::sleep(Duration::from_secs(6));
    }
}

fn trash_test(data: &Path) {
    let dir = data.join("store/projects/p-0123456789abcdef/snapshots/f-1/s-1");
    fs::create_dir_all(&dir).unwrap();
    fs::write(dir.join("snapshot.json"), "{}").unwrap();
    fs::write(dir.join("map.cc.json.gz"), vec![1u8; 4096]).unwrap();
    let target = data.join("store/projects/p-0123456789abcdef");
    println!("trash {} -> {:?}", target.display(), trash::delete(&target));
    println!("exists after: {}", target.exists());
    let missing = data.join("store/projects/p-missing");
    println!(
        "trash missing -> {:?}",
        trash::delete(&missing).map_err(|e| e.to_string())
    );
    for round in 0..2 {
        let again = data.join("store/same-name");
        fs::create_dir_all(&again).unwrap();
        fs::write(again.join("x"), round.to_string()).unwrap();
        println!(
            "trash same-name round {round} -> {:?}",
            trash::delete(&again)
        );
    }
    println!(
        "list: {:?}",
        trash::os_limited::list()
            .map(|v| v
                .iter()
                .map(|i| i.name.to_string_lossy().into_owned())
                .collect::<Vec<_>>())
            .map_err(|e| e.to_string())
    );
}

fn rename_test(dir: &Path, strict: bool) {
    fs::create_dir_all(dir).unwrap();
    let target = dir.join("project.json");
    fs::write(&target, "OLD").unwrap();
    let mut holder = Command::new(std::env::current_exe().unwrap())
        .args([
            if strict {
                "hold-open-strict"
            } else {
                "hold-open"
            },
            target.to_str().unwrap(),
        ])
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();
    let mut out = BufReader::new(holder.stdout.take().unwrap());
    let mut line = String::new();
    out.read_line(&mut line).unwrap();
    print!("{line}");
    let tmp = dir.join("project.json.tmp");
    fs::write(&tmp, "NEW").unwrap();
    println!("rename over open file: {:?}", fs::rename(&tmp, &target));
    println!("content now: {:?}", fs::read_to_string(&target).unwrap());
    let mut rest = String::new();
    out.read_to_string(&mut rest).unwrap();
    print!("{rest}");
    holder.wait().unwrap();
}

fn ts_test(out: &Path) {
    let config = Config::new().with_out_dir(out).with_large_int("number");
    Chunk::export_all(&config).unwrap();
    for name in ["ProjectId", "FolderId", "PlainId", "Chunk"] {
        let p = out.join(format!("{name}.ts"));
        println!(
            "--- {name}: {}",
            if p.exists() { "written" } else { "NOT WRITTEN" }
        );
        if let Ok(text) = fs::read_to_string(&p) {
            println!("{text}");
        }
    }
}

fn validate() {
    let good = serde_json::from_str::<ProjectId>("\"p-0123abcd\"");
    let bad = serde_json::from_str::<ProjectId>("\"../escape\"");
    let empty = serde_json::from_str::<ProjectId>("\"\"");
    let nested = serde_json::from_str::<Chunk>(
        "{\"projectId\":\"Bad_ID\",\"folderId\":\"f\",\"plain\":\"x\",\"bytes\":[1],\"total\":1,\"maybe\":null}",
    );
    println!(
        "good={good:?}\nbad={bad:?}\nempty={empty:?}\nnested={:?}",
        nested.map(|_| ())
    );
    let chunk = Chunk {
        project_id: serde_json::from_str("\"p-1\"").unwrap(),
        folder_id: serde_json::from_str("\"f-1\"").unwrap(),
        plain: serde_json::from_str("\"x\"").unwrap(),
        bytes: vec![1, 2, 3],
        total: 3,
        maybe: None,
    };
    println!("wire json: {}", serde_json::to_string(&chunk).unwrap());
}
```

## Appendix B — `Cargo.toml` of the scratch crate

```toml
[package]
name = "spike"
version = "0.1.0"
edition = "2024"

[dependencies]
fs4 = "1.1.0"
serde = { version = "1.0.229", features = ["derive"] }
serde_json = "1.0.154"
trash = "5.4.0"
ts-rs = { version = "12", features = ["serde-json-impl", "no-serde-warnings"] }
```

## Appendix C — `gitspike.sh` (Git Bash on Windows, bash on Linux)

```bash
#!/usr/bin/env bash
# Plan 03 section 2: the seven git commands against four kinds of folder. Local only, hermetic.
set -u
ROOT=$(mktemp -d "${TMPDIR:-/tmp}/gitspike.XXXXXX")
export HOME="$ROOT/home"; mkdir -p "$HOME"
export XDG_CONFIG_HOME="$HOME" GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null
export GIT_TERMINAL_PROMPT=0 GCM_INTERACTIVE=never GIT_OPTIONAL_LOCKS=0 GIT_PAGER=cat PAGER=cat
export GIT_AUTHOR_NAME=Ada GIT_AUTHOR_EMAIL=ada@example.invalid GIT_COMMITTER_NAME=Ada GIT_COMMITTER_EMAIL=ada@example.invalid
export GIT_AUTHOR_DATE=2026-01-02T03:04:05+00:00 GIT_COMMITTER_DATE=2026-01-02T03:04:05+00:00
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE

G="git -c init.defaultBranch=main"
# upstream with two root commits (a merged unrelated history) and some commits
$G init -q "$ROOT/upstream"
( cd "$ROOT/upstream"
  echo a > a; git add a; git commit -qm "first"
  echo b > b; git add b; git commit -qm "second, with | pipe"
  git checkout -q --orphan other; git rm -rfq .; echo c > c; git add c; git commit -qm "second root"
  git checkout -q main; git merge -q --allow-unrelated-histories other -m merge
  echo d > d; git add d; git commit -qm third )
FIRST=$(git -C "$ROOT/upstream" rev-list --max-parents=0 main | head -1)

git clone -q "$ROOT/upstream" "$ROOT/clone"
git clone -q --depth 1 "file://$ROOT/upstream" "$ROOT/shallow"
mkdir -p "$ROOT/clone/sub/deeper"
git clone -q "$ROOT/upstream" "$ROOT/credclone"
git -C "$ROOT/credclone" remote set-url origin "https://ada:s3cret-token@github.com/owner/repo.git"
git -C "$ROOT/credclone" remote add upstream "git@github.com:other/repo.git"
$G init -q "$ROOT/nocommits"
mkdir -p "$ROOT/plain"
mkdir -p "$ROOT/clone-nohead"; git clone -q "$ROOT/upstream" "$ROOT/nohead"; git -C "$ROOT/nohead" remote set-head origin -d >/dev/null 2>&1

run() { # label, dir, args...
  local label=$1 dir=$2; shift 2
  local out err code
  out=$(cd "$dir" && "$@" 2>"$ROOT/err"); code=$?
  err=$(head -c 200 "$ROOT/err")
  printf '  %-62s exit=%s\n' "git ${*:2}" "$code"
  [ -n "$out" ] && printf '%s\n' "$out" | head -6 | sed 's|^|      out: |; s|'"$ROOT"'|$ROOT|g'
  [ -n "$err" ] && printf '      err: %s\n' "$(echo "$err" | sed "s|$ROOT|\$ROOT|g")"
}

all7() { # folder
  local dir=$1
  run 1 "$dir" git rev-parse --show-toplevel
  run 2 "$dir" git rev-parse --is-shallow-repository
  run 3 "$dir" git config --get-regexp '^remote\..*\.url$'
  run 4 "$dir" git symbolic-ref --quiet --short refs/remotes/origin/HEAD
  run 4b "$dir" git rev-parse --abbrev-ref HEAD
  run 5 "$dir" git rev-list --max-parents=0 HEAD
  run 6 "$dir" git rev-parse --verify --quiet "${FIRST:0:7}^{commit}"
  run 6b "$dir" git rev-parse --verify --quiet "deadbeefdeadbeef^{commit}"
  run 7 "$dir" git show -s '--format=%H%x00%h%x00%s%x00%an%x00%aI%x00%cI%x00%P' "$FIRST"
}

echo "git: $(git --version)   ROOT=\$ROOT"
echo "FIRST (a root commit of upstream) = $FIRST"
for kind in clone shallow clone/sub/deeper credclone nohead nocommits plain; do
  echo "=== $kind"; all7 "$ROOT/$kind"
done
echo "=== show on shallow with a SHA that is not present (second root, not fetched)"
run x "$ROOT/shallow" git rev-parse --verify --quiet "$(git -C "$ROOT/upstream" rev-list --max-parents=0 other | head -1)^{commit}"
echo "=== plain dir not under any repo: GIT_CEILING_DIRECTORIES irrelevant here (tmp is not in a repo)"
echo "=== worktree (git worktree add) as folder"
git -C "$ROOT/clone" worktree add -q --detach "$ROOT/wt" HEAD
for k in wt; do echo "=== $k"; run 1 "$ROOT/$k" git rev-parse --show-toplevel; run 5 "$ROOT/$k" git rev-list --max-parents=0 HEAD; done
rm -rf "$ROOT"
```

