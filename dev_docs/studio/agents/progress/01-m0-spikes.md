---
name: 01-M0 spikes for the core and the desktop shell
state: complete
version: 1
---

## Goal

Settle the UNVERIFIED items plan 01 rests on (Electron sandbox and IPC, shipping a Rust binary, batch
arguments, askpass, contract generation) before any production code is written. No production commits.

## Tasks

Copied from `01-core-and-desktop-shell.md` section 4, M0. This machine is Linux only; anything that
needs Windows or macOS is recorded as open for the owner, not guessed.

### S1. Electron 44 sandbox and IPC
- Sandboxed preload restrictions; `senderFrame` null cases; `will-navigate` for the `vscode://` anchor;
  `contextBridge` copying a 100 MB `Uint8Array` (time, memory).

### S2. Shipping the core binary
- Spawn a hello-world Rust binary from `main.js` unpackaged and from `npm run package:local` with
  `extraResource`; confirm `process.resourcesPath`, that it stays outside the asar and is executable.

### S3. Packaging from Linux with the darwin binary
- Executable bit through artifact upload + `bestzip`; Gatekeeper behaviour (no Mac: open risk).

### S4. Rust on Windows and batch files
- `Command::new("<abs>\\ccsh.cmd")` with metacharacters; `check_batch_args` set; job-object race.

### S5. Askpass
- A Rust executable as `GIT_ASKPASS` / `SSH_ASKPASS` with the listed environment; path with spaces;
  argv shape; local repo and local dummy remote only.

### S6. Contract generation
- `ts-rs`: tagged enums, `Option`, `BTreeMap`, `u64` override, a generated method map; Biome
  formatting of the output. Otherwise choose `specta`.

## Steps

- [x] S1 (Linux)
- [ ] S1 (Windows) — needs owner hardware
- [x] S2 (Linux)
- [ ] S2 (Windows, macOS) — needs owner hardware
- [x] S3 (Linux part: modes through packager + bestzip, darwin layout)
- [ ] S3 (Gatekeeper on a downloaded app) — needs owner hardware (macOS)
- [ ] S4 — Windows only, needs owner hardware (test program below)
- [x] S5 (Linux)
- [ ] S5 (Windows, Git for Windows) — needs owner hardware (procedure below)
- [x] S6

## Notes

Environment (2026-11-18): Arch Linux x86_64, Wayland + XWayland (`DISPLAY=:1`, no `xvfb-run` needed),
rustc/cargo 1.95.0, node 26.13.0, npm 12.2.2, git 2.56.0, OpenSSH 10.6p1. Electron from
`visualization/package.json` = `44.9.1` (verified, pinned in `dependencies`). All throwaway code lived in
the session scratch directory outside the repository; the only repository files touched temporarily
(`visualization/script/appBuild.js`, `dist/`) were restored. Nothing but this file is committed.

Verified before use: `visualization/electron/main.js` is still the 55-line file plan 01 section 2
describes; `build`, `start`, `package`, `package:local` scripts as described; `script/appBuild.js`
(`asar: true`, `dir: dist/bundler/browser`), `script/appMain.js` (`--local` = host only), `script/appZip.js`
(`bestzip`) as described.

### Side finding: `script/ensureElectron.js` silently does nothing on npm 12

`npm ci` then `node script/ensureElectron.js` printed `rebuilt dependencies successfully`, but npm 12
also printed `npm warn rebuild 6 packages had install scripts blocked because they are not covered by
allowScripts` and `node_modules/electron/dist` / `path.txt` were never created; the first `electron`
start then tried to download on its own and hung. Workaround used: `node node_modules/electron/install.js`
(2m49s download). Not a plan-01 design issue, but `npm start` / `npm run package` on npm >= 12 need
`ensureElectron.js` to call `install.js` directly (or an `allowScripts` entry). Worth its own small fix
before M3, which relies on `npm start`.

### S1 — Electron 44.9.1 sandbox and IPC (confirmed on Linux; Windows open)

Command: a throwaway app (`main.js`, `preload.js`, `index.html` + `frame.html` iframe, CSP
`default-src 'self'; script-src 'self'`), `webPreferences: { preload, sandbox: true,
contextIsolation: true, nodeIntegration: false, webSecurity: true }`, `app.enableSandbox()`, loaded
with `loadFile`, run as `node_modules/electron/dist/electron <dir>`; results logged from main.

Sandboxed preload (excerpt of `preload-report`):
```
fs: "throws:module not found: fs"   path: "throws:module not found: path"
child_process: "throws:..."         ./other.js: "throws:module not found: ./other.js"
events/node:events: ok   timers: ok   url: ok
process keys: arch,argv,contextId,contextIsolated,crash,env,execPath,getBlinkMemoryInfo,getCPUUsage,
  getCreationTime,getHeapStatistics,getProcessMemoryInfo,getSystemMemoryInfo,getSystemVersion,hang,
  isMainFrame,pid,platform,sandboxed,type,uptime,version,versions
Buffer: function   __dirname: undefined   sandboxed: true   protocolVersionViaSendSync: 1
```
Finding: confirmed — the preload is one CommonJS file, may `require("electron")` (plus `events`,
`timers`, `url`), cannot read files, cannot `require` a sibling. `ipcRenderer.sendSync` works at load,
so the `protocolVersion` design in 3.10 holds. `__dirname` is undefined, so the preload must not build paths.

`senderFrame` (logged from `ipcMain.handle`):
```
ping main-frame          {"senderFrameNull":false,"isMainFrame":true,"url":"file:///…/index.html"}
ping-delayed before-reload  atStart {"senderFrameNull":false,…}  after 400 ms (renderer navigated)
                            {"senderFrameNull":true,"senderDestroyed":false,"senderIdIsWin":true}
ping-delayed before-close   atStart {"senderFrameNull":false,…}  after 400 ms (window closed)
                            {"senderFrameNull":true,"senderDestroyed":true}
ping from-iframe-via-parent {"senderFrameNull":false,"isMainFrame":true,"url":"file:///…/index.html"}
                            (iframe's own window.codeChartaDesktop: "undefined")
```
Findings:
- `senderFrame` is non-null at handler entry, and **becomes null when read after an `await` once the
  frame navigated or the window closed** (the `WebContents` itself survives a navigation). Design
  change for 3.10 (M3): the relay must read and check `event.senderFrame` synchronously at the start of
  the handler, before any `await`, and keep the captured values; a null at entry is rejected as already
  designed.
- The preload does not run in child frames, but a same-origin iframe (two `file://` pages of the bundle
  folder) **can call `window.parent.codeChartaDesktop.*`, and main sees it as the main frame with the
  main URL**. The sender check therefore cannot tell such a call apart. Today the app has no iframes
  (`grep -r iframe app` is empty) and the CSP has no `frame-src` (falls back to `default-src 'self'`), so
  only bundled pages could be framed. Recommendation for M3: add `frame-src 'none'` (or `'self'` if ever
  needed) to the CSP in `app/index.html`; no change to the relay.

Navigation:
```
synthetic <a href="vscode://file/tmp/some%20file.ts:12">.click()
  -> did-start-navigation, will-frame-navigate, will-navigate {"isMainFrame":true,"isSameDocument":false}
<a target="_blank" href="https://example.com/">.click() -> setWindowOpenHandler {"disposition":"foreground-tab"}
window.open("vscode://file/tmp/x")                     -> setWindowOpenHandler (no will-navigate)
location.href = "https://example.com/blocked-nav"      -> will-navigate (preventDefault keeps the page)
location.href = "index.html?phase=…" (internal)        -> will-navigate with the file: URL
```
Finding: confirmed — `will-navigate` fires for the `handLinkToTheSystem` anchor, so the 3.10 navigation
policy (`judgeNavigation` with `vscode:` as external, `will-navigate` + `setWindowOpenHandler`) works
unchanged. Internal reloads also pass through `will-navigate`, so `internal` must accept the trusted
page with any query/hash.

100 MB `Uint8Array` main → preload (`ipcRenderer.invoke` returning a `Buffer`) → main world (returned
through a `contextBridge` function):
```
preloadInvokeMs 151   bridgeReturnMs 81   mainWorldTotalMs 232   direct invoke through bridge 202 ms
main world: instanceof Uint8Array true, byteLength 104857600, data intact
renderer private memory: 22.9 MB before -> 125.9 MB after invoke -> 228.7 MB after the bridge
renderer working set (app.getAppMetrics) 120 MB -> 438 MB;  main RSS 290 MB -> 395 MB
```
Finding: confirmed workable — the bridge **copies** the array (one extra full copy in the renderer
until GC, about 2x the payload in the renderer plus 1x in main), about 2.3 ms per MB on this machine.
`readSnapshotMap` returns the stored `map.cc.json.gz` bytes (compressed), so real payloads are a
fraction of the parsed map; no design change. Keep main from holding the buffer after replying.

Open, needs Windows: repeat S1 on Windows (same throwaway app; additionally check that the `file:` URL
comparison in 3.10 must be case-insensitive and how `senderFrame.url` spells the drive letter).

### S2 — Shipping the core binary (confirmed on Linux; Windows and macOS open)

Commands: hello-world Rust binary (`cargo build --release`, prints `current_exe` and args) copied as
`core/target/debug/codecharta-core` and `core/target/release/codecharta-core`; `npm run build`; a
throwaway `dist/bundler/browser/main.js` implementing `resolveCoreExecutable` from 3.10 and spawning
`[serve, --data-dir, userData]`; then `extraResource: ["../core/target/release/codecharta-core"]` added
temporarily to `appBuild.js` and `npm run package:local` (1m17s).
```
unpackaged: isPackaged false, resourcesPath …/visualization/node_modules/electron/dist/resources,
  __dirname = appPath = …/visualization/dist/bundler/browser,
  default core = …/core/target/debug/codecharta-core (resolved as appDir/../../../../core/…), mode 755,
  spawn ok, args ["serve","--data-dir","/home/mike/.config/codecharta-visualization"]
unpackaged, CODECHARTA_CORE_PATH="…/dir with spaces/codecharta-core": spawn ok
packaged:  isPackaged true, resourcesPath …/codecharta-visualization-linux-x64/resources,
  __dirname = …/resources/app.asar, core = …/resources/codecharta-core (next to app.asar, not inside),
  mode 755, spawn ok
zip: -rwxr-xr-x … codecharta-visualization-linux-x64/resources/codecharta-core
```
Finding: path rule in 3.10 confirmed on Linux (packaged → `process.resourcesPath/codecharta-core`;
unpackaged → `<repo>/core/target/debug/…` four levels above `dist/bundler/browser`). `userData` on Linux
is `~/.config/codecharta-visualization` packaged and unpackaged, which is what
`directories::BaseDirs::config_dir()` + `codecharta-visualization` gives with no `XDG_CONFIG_HOME`
(confirmed for Linux only). Open, needs Windows and macOS: run the same throwaway `main.js` there; on
macOS packaging from Linux (S3) already shows the file at `….app/Contents/Resources/codecharta-core`.

### S3 — Packaging the darwin binary from Linux (Linux part confirmed; Gatekeeper open)

Commands: a scratch script calling `@electron/packager` (ESM, loaded with `import()`) for
`darwin`/`arm64`, `asar: true`, `extraResource` = one binary with mode 755 and one with mode 644, then
`bestzip` (this machine has no native `zip`, so bestzip used its `archiver` fallback; GitHub's ubuntu
runners have native `zip`, which also stores Unix modes). The Linux ELF stood in for a darwin binary
(no macOS linker here); only file mode and placement were under test.
```
-rwxr-xr-x … codecharta-visualization.app/Contents/Resources/codecharta-core
-rw-r--r-- … codecharta-visualization.app/Contents/Resources/codecharta-core-644
```
Findings:
- `@electron/packager` and `bestzip` (both the archiver fallback and, per S2, the linux package)
  **keep the mode they are given**; they neither add nor drop the executable bit. Unzipping the linux zip
  with `unzip` restores 755.
- So the only place the bit is lost is `actions/upload-artifact` / `download-artifact` (documented to
  drop permissions; cannot be run here). The 3.11 design stands: `chmod +x core/dist/*/codecharta-core`
  after download, **and** a packaging check that reads each zip's central directory (e.g. `unzip -Z`, or
  the external attributes via a small node script) and fails unless the core entry is `-rwx`.
- Open risk, needs macOS: Gatekeeper on a downloaded app with a nested unsigned binary. The existing
  `createDarwinArmREADME` already tells users to run `xattr -cr codecharta-visualization.app/`, which is
  recursive and would also clear quarantine on `Contents/Resources/codecharta-core`. Also unverified here:
  an arm64 macOS executable must carry at least an ad-hoc signature to run; the Rust/Apple linker adds
  one when building natively on macOS, so build the darwin core on a macOS runner (as 3.11 plans), do
  not cross-link from Linux.

### S4 — Rust on Windows and batch files (open, needs Windows; nothing guessed)

Owner procedure on Windows (Rust >= 1.77.2, the toolchain the workspace will pin). In a scratch folder:
```
cargo new s4batch && cd s4batch
cargo add windows-sys --features Win32_Foundation,Win32_System_JobObjects,Win32_System_Threading
```
`src/bin/echo_args.rs` (prints what arrives, one line per arg, for the batch file to call):
```rust
fn main() { for (i, a) in std::env::args().enumerate().skip(1) { println!("{i}:[{a}]"); } }
```
`ccsh.cmd` next to `target\debug\` copies of the binaries, mirroring the real wrapper
(`analysis/node-wrapper/binScripts/*/ccsh.cmd` → `…\ccsh.bat %*`):
```
@echo off
"%~dp0echo_args.exe" %*
```
`src/main.rs`:
```rust
use std::process::Command;
fn main() {
    let dir = std::env::current_exe().unwrap().parent().unwrap().to_path_buf();
    let cmd = dir.join("ccsh.cmd");
    let cases = ["plain", "with space", "a&b", "a^b", "(paren)", "a|b", "a<b>c", r"trailing\", r"C:\dir with space\",
                 "50%", "%PATH%", "bang!", "!PATH!", "quote\"inside", "", "line\nbreak", "cr\rx", "tab\tx", "ünïcödé"];
    for case in cases {
        match Command::new(&cmd).args(["analyse", case]).output() {
            Ok(out) => println!("{case:?} -> exit {:?} stdout {:?} stderr {:?}", out.status.code(),
                String::from_utf8_lossy(&out.stdout), String::from_utf8_lossy(&out.stderr)),
            Err(e) => println!("{case:?} -> spawn error kind {:?}: {e}", e.kind()),
        }
    }
}
```
Run `cargo build`, copy `ccsh.cmd` into `target\debug\`, run `target\debug\s4batch.exe` once from
`cmd.exe` and once from PowerShell, also once with the folder renamed to contain a space and once with
`%` in the folder name. Record, per case: passed unchanged (`2:[<case>]`), altered, or `InvalidInput`.
This decides the exact `check_batch_args` set (3.6 currently: `"`, `%`, `!`, CR, LF, NUL).

Job-object race: extend `main.rs` with a variant that spawns `ccsh.cmd` whose body is
`"%~dp0echo_args.exe" %*` followed by `start /b ping -n 30 127.0.0.1 >nul`, assigns the child to a job
object (`CreateJobObjectW`, `SetInformationJobObject` with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`,
`AssignProcessToJobObject`) (a) right after `spawn()` and (b) with `CREATE_SUSPENDED`
(`std::os::windows::process::CommandExt::creation_flags`) then `ResumeThread` on the main thread after
assignment; then close the job handle and check in Task Manager / `tasklist /fi "imagename eq ping.exe"`
whether `ping.exe` survives. Repeat (a) 50 times in a loop to see if any grandchild escapes. Note:
std's `Child` does not expose the main thread handle, so (b) needs `CreateProcessW` directly or a
crate; record whether that is acceptable or whether the job is assigned before the batch can start
children in practice.

### S5 — Askpass (confirmed on Linux; Windows open)

Setup (all local, no network): bare repo served by a 20-line Python `http.server` subclass on
`127.0.0.1:18089` answering 401 + `WWW-Authenticate: Basic` without `user:secret-pw` (dumb HTTP after
`git update-server-info`); a user-mode `sshd` on `127.0.0.1:22222` with its own host key and an
ed25519 key with passphrase; `HOME` pointed at a temp folder with `GIT_CONFIG_NOSYSTEM=1`. Helper: a
Rust binary copied to `…/helper dir/codecharta core` (spaces in folder and file name) that logs argv,
env and whether stdin is a tty, then answers by prompt. Every command ran under
`setsid -w env -u DISPLAY -u WAYLAND_DISPLAY -u SSH_AUTH_SOCK … </dev/null` (no terminal) with
`GIT_TERMINAL_PROMPT=0 GCM_INTERACTIVE=never GIT_OPTIONAL_LOCKS=0 GIT_PAGER=cat TERM=dumb`.
```
A1 credential fill, no askpass       -> fatal: could not read Username …: terminal prompts disabled (128)
A2 credential fill + GIT_ASKPASS      -> argv=["Username for 'https://example.invalid': "], then
                                         argv=["Password for 'https://user@example.invalid': "] -> ok
A4 http clone (401) + askpass        -> same two prompts for 'http://127.0.0.1:18089' -> clone ok
A5 helper exits 1                    -> "error: unable to read askpass response from '…/codecharta core'"
                                         then "terminal prompts disabled" (128)
B1 ssh clone, no askpass             -> "Host key verification failed." (128)
B2 ssh clone + GIT_ASKPASS + SSH_ASKPASS + SSH_ASKPASS_REQUIRE=force
   -> argv=["The authenticity of host '[127.0.0.1]:22222 ([127.0.0.1]:22222)' can't be established.\n
            ED25519 key fingerprint is: SHA256:…\nThis key is not known by any other names.\n
            Are you sure you want to continue connecting (yes/no/[fingerprint])? "] -> "yes"
   -> argv=["Enter passphrase for key '/tmp/…/scratch': "] (path truncated by ssh) -> clone ok
B3 ssh push, host known              -> passphrase prompt only -> push ok
B4 same without SSH_ASKPASS_REQUIRE  -> helper never called, "Permission denied (publickey)" (128)
B5 only GIT_ASKPASS for ssh          -> helper never called, "Permission denied (publickey)" (128)
```
Findings for plan 04 (all confirmed on Linux with git 2.56 / OpenSSH 10.6):
- argv shape: exactly one argument, the prompt, for git and ssh alike; stdin is not a tty. The prompt
  never equals a subcommand name, so the dispatch rule in 3.6 (endpoint variable set and `argv[1]` not a
  known subcommand) works. The answer is the first stdout line; a non-zero exit is a clean "cancel".
- `GIT_TERMINAL_PROMPT=0` does not stop `GIT_ASKPASS`; it only stops the terminal fallback. Keep both.
- ssh needs `SSH_ASKPASS` **and** `SSH_ASKPASS_REQUIRE=force` when there is no `DISPLAY`
  (`GIT_ASKPASS` alone does not reach ssh). The env set in 3.6 is right as written.
- The host-key prompt is multi-line and expects `yes`, `no` or the fingerprint; the UI must show the
  whole text and offer yes/no. ssh truncates long prompts (the key path was cut), so the UI must not
  parse paths out of prompts. `SSH_ASKPASS_PROMPT` was unset for both prompts.
- A helper path with spaces works on Linux.

Open, needs Windows (Git for Windows and its bundled OpenSSH): build the same helper as an `.exe`, put
it in `C:\Temp\helper dir\codecharta core.exe`, create a bare repo and clone it over ssh to a local
`sshd` (Windows OpenSSH Server feature, or Git for Windows' `/usr/bin/sshd` run as a user on port
22222) and over HTTP to the same Python server; from PowerShell with no console attached
(`Start-Process -NoNewWindow` is not enough — run it from a scheduled task or a small Rust launcher that
uses `CREATE_NO_WINDOW` and closed stdin), set the same variables and run A2, A4, B2, B3, B4. Record the
argv shape, whether a path with spaces works, whether Git for Windows' ssh honours
`SSH_ASKPASS_REQUIRE=force` (`ssh -V` must be >= 8.4), and whether Git Credential Manager stays silent
with `GCM_INTERACTIVE=never`.

### S6 — Contract generation: ts-rs confirmed, specta not needed

Commands: scratch crate with `serde` 1.0.229, `serde_json` 1.0.154, `ts-rs` 12.0.1 (MIT, MSRV 1.78)
with features `serde-json-impl` and `no-serde-warnings`; types mirroring 3.2 / 3.4 plus a `Method`
trait and a const `METHODS` table; a `main` that calls `TS::export_all(&Config::new()
.with_out_dir(dir).with_large_int("number"))` per method type and writes `coreApi.ts` itself; output
copied into `visualization/app/codeCharta/model/` (temporarily), `npx biome check --write`, then
`npx tsc --noEmit -p tsconfig.json` with a consumer file; folder deleted afterwards.
```
ShellPathTarget = { kind: "dataFolder" } | … | { kind: "snapshotMap"; projectId: string; folderId: string; snapshotId: string }
AdjacentTagged  = { state: "ready" } | { state: "failed"; detail: string }
ErrorCode       = "BAD_REQUEST" | "NOT_FOUND" | …          ToolId = "git" | "ccsh" | …
ToolStatus      = { …, path: string | null, durationMs: number, plainU64: number, optionalU64: number | null, skippedIfNone?: string }
ToolsReport     = { …, customPaths: { [key in ToolId]?: string } }       // BTreeMap<ToolId, String>
ErrorPayload    = { …, details: { [key in string]: JsonValue } }        // BTreeMap<String, serde_json::Value>
RequestId       = number | string                                       // untagged enum
EmptyParams     = Record<symbol, never>                                  // struct with no fields
coreApi.ts      = CoreMethods map + RENDERER_METHODS `as const satisfies ReadonlyArray<keyof CoreMethods>`
biome check --write: "Checked 14 files … Fixed 14 files" (format only); second run clean; tsc: no errors
```
Findings:
- Internally and adjacently tagged enums, `rename_all` on enums and variants, `Option<T>` → `T | null`,
  `BTreeMap` (enum keys become optional keys, which matches serde), `serde_json::Value` → `JsonValue`,
  and unit `()` → `null` all come out right and agree with the serde JSON printed alongside.
- `u64`/`i64` default to `bigint`, which is wrong for JSON. Per-field `#[ts(type = "number")]` works,
  but **`Config::with_large_int("number")` once in `export-contract` is simpler and safer** (covers
  `RequestId`'s `i64` too); keep the plan's rule that no wire integer exceeds 2^53.
- The method map is not a ts-rs feature but is easy: a `Method` trait with associated `Params`/`Result`
  types, a `const fn entry::<M>()` storing `<M::Params as TS>::name` / `export_all` function pointers,
  and a hand-written emitter for `coreApi.ts`. **Gotcha:** `export_all` on a primitive, `()` or
  `Option<String>` returns "this type cannot be exported"; the emitter must skip types whose
  `TS::output_path()` is `None` instead of failing. Imports are only needed for named types.
- `serde_json::Value` lands in a subfolder `serde_json/JsonValue.ts`; acceptable (the generated folder
  still imports nothing outside itself).
- ts-rs output is not Biome-formatted (commas in object types, semicolons). Use
  `biome check --write` (format + safe fixes) rather than `biome format --write` in `npm run contract`;
  the result then passes Biome lint without a lint exclusion. Each file keeps ts-rs's
  "generated … Do not edit" header line.
- Caution for the renderer: `visualization/tsconfig.json` has `strictNullChecks: false`, so `T | null`
  from the contract is not enforced by `tsc`; generated nullability is documentation only unless that
  changes. Not a generator problem.
- Decision: **ts-rs 12** for M1.5, with `with_large_int("number")`, features `serde-json-impl` (+
  `no-serde-warnings`), the trait-based method table above, and `biome check --write` on the output.
  specta was not evaluated further because ts-rs covered every shape.

### Effect on plan 01 M1–M3 and on D1–D13

- M1.5: ts-rs confirmed (details above); `npm run contract` should run `biome check --write`.
- M3 (3.10): read `event.senderFrame` before any `await`; add `frame-src 'none'` to the CSP; `internal`
  navigation accepts the trusted page with query/hash. Fix `ensureElectron.js` for npm 12.
- 3.11: `chmod +x` after artifact download plus a zip-mode check, as planned; build the darwin core on
  macOS.
- No finding contradicts D1–D13.
