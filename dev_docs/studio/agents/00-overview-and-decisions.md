# CodeCharta Desktop enhancement — overview and shared decisions

Status: **owner decisions settled 2026-11-18 (section 9); review status in section 8.**
Audience: the agent that will implement this. Read this file first, then the numbered plan you were assigned.

## 1. What is being built

Six capabilities for the **standalone (Electron) build** of the CodeCharta visualization:

| # | Capability | Plan |
|---|---|---|
| A | Dark theme and selectable color themes | `02-themes.md` |
| B | Projects replace "open files"; a project has many folders (the repo, forks, helper/devops folders) | `03-projects-and-managed-store.md` |
| C | Analyses (snapshots) live in a CodeCharta-managed folder and record the git/GitHub state they were taken at | `03-…` (store) and `05-commit-analysis-and-snapshots.md` (records) |
| D | Basic git UI: branches and commit history, Rider / Visual Studio style | `04-git-branches-and-history.md` |
| E | Create analyses for specific commits; opening a commit without one shows the nearest analysed commit plus a "stale by N commits" notice | `05-commit-analysis-and-snapshots.md` |
| F | Easy delta comparison between commits, branches and PRs / merge requests | `06-compare-commits-and-prs.md` |

Everything except A depends on `01-core-and-desktop-shell.md` (the Electron main-process/IPC foundation, which does not exist today).

## 2. Where the work happens

- Implementation happens in **this repository** (the CodeChartaStudio fork of `https://github.com/MaibornWolff/codecharta`), in `visualization/` (Angular 22, NgRx 22, Tailwind 4 + daisyUI 5, three.js, ECharts, Jest 30, Playwright). All file paths in these plans are relative to the repository root. These plans live in `dev_docs/studio/agents/`.
- The plans were written against `main` at visualization 2.11.0 / analysis (ccsh) 2.4.0, read on 2026-11-18. **Before starting a plan, re-verify every path and symbol it names**; if something moved, adapt and note it in the plan's Notes section.
- The repository's own rules bind the implementer: root `CLAUDE.md`, `CODE_QUALITY.md`, `visualization/TARGET-ARCHITECTURE.md`, `visualization/LENS_DATA_RULES.md`. Where those documents contradict the code or config (some are stale: they mention Angular 20, Puppeteer, Webpack), **config and code win**.

## 3. Verified facts the design rests on

Electron shell
- `visualization/electron/main.js` (55 lines, CommonJS) is the entire main process: one `BrowserWindow`, `app.enableSandbox()`, `setWindowOpenHandler` → `shell.openExternal`, `loadFile("index.html")`. No preload, no IPC, no `webPreferences`, no menu, no native dialogs.
- Web and desktop ship the **same Angular bundle**. `npm run build` = `npm run patch && ng build && cp electron/* package.json dist/bundler/browser`. Packaging (`script/appBuild.js`, `@electron/packager`, `asar: true`) wraps `dist/bundler/browser`, which has **no `node_modules`**: main-process code can only `require` Electron and Node built-ins unless it is bundled.
- CSP (meta tag in `app/index.html`): `default-src 'self'; script-src 'self' 'unsafe-eval' 'sha256-…'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://github.com …`. No `connect-src`, so the renderer cannot call GitHub/GitLab APIs. IPC is not subject to CSP.
- Tests: Jest covers `app/**/*.ts` only (80% global coverage gate). Playwright drives the web build on `http://localhost:9009` only; there is no Electron e2e.

File loading and state
- All loading goes through `LoadFilesUseCase` (`app/codeCharta/load/loadFiles.useCase.ts`): `loadOnBoot()`, `loadFromUpload(readNameDataPairs)`, `reloadAfterReset()`. Bytes → `parseCcFileBytes` (`stores/fileStore/fileStore.facade.ts`) → `NameDataPair { fileName, fileSize, content }`.
- Every loaded map stays fully parsed in NgRx (`CcState.files: FileState[]`) **and** is structured-cloned into IndexedDB (`CodeCharta` DB v36, store `ccstate`, record `1002`). There is no eviction or lazy loading. An 830 MB map costs ~3 GB heap.
- File identity is `fileMeta.fileChecksum`; a second file with the same checksum is **not added, the existing entry is renamed**. UI identity is `fileMeta.fileName`.
- `FilesLoadedSource = "url" | "indexedDB" | "sample" | "upload" | "reset"`.
- A new persisted key in `CcState` needs: reducer + default, restore action in `load/restoredSliceActions.ts`, entry in `load/effects/saveCcState/actionsRequiringSaveCcState.ts`, a numbered migration `migrateToV<N>.ts` and a `DB_VERSION` bump.
- `features/localSource` already links one folder per map via the File System Access API (read-only handle, no absolute path). It cannot drive git or ccsh.

Delta
- Delta mode = some file has `selectedAs === Reference`. `setDelta({ referenceFile, comparisonFile })` drives everything downstream (structure tree, 3D render, metrics bar, inspector, legend).
- Delta requires **equal root node names**; otherwise it silently falls back to side-by-side aggregation. Nodes are matched by path only (a rename = one removed + one added). Delta colors the height metric only. Radial, dependency and domain views do not support delta.
- `LoadFileService.loadFiles` always ends in standard (non-delta) selection of the newly loaded files, so `setDelta` must be dispatched after the load.

Analysis CLI (ccsh ≥ 2.2.1; current 2.4.0; needs Java ≥ 22 and `git` on PATH)
- `ccsh analyse <folder> -o <file> -p -q` analyses the working tree. `--commit=<ref>` analyses any commit through a temporary `git worktree add --detach` in the system temp dir (the user's checkout is untouched, but `.git/worktrees` is written; a hard kill leaves an orphan fixed by `git worktree prune`).
- With `--commit`, the output file name gets a short-hash prefix even when `-o` is given. The final path is printed on stdout as `Map: <path>`.
- Exit codes: 0 written, 1 analysis failed, 2 argument error. Failure messages go to **stdout**. Progress bars go to stderr as `\r  42% [====>  ] 123/456 …` (suppressed entirely by `-q`). No machine-readable progress, no cancel protocol.
- Git history metrics only when the folder is a repository root (`<folder>/.git` exists).
- `ccsh` with no/unknown arguments enters an interactive dialog — a GUI child process must always pass a known subcommand with arguments.
- cc.json 2.x `meta` = `{ projectName, apiVersion, checksum, commitHash? }` with `additionalProperties: false`. There is no field for full SHA, branch, timestamp, remote or tool version. **Whether `ccsh analyse --commit` actually writes `meta.commitHash` is unconfirmed (two source readings disagree) — plans must not depend on it.**
- No incremental mode on `ccsh analyse`; each run is a full analysis (seconds to ~1 minute on large repos; `dependencyparser` dominates).

Theming
- No theme system exists. `<html data-theme="codecharta">` names a theme daisyUI does not know, so the app renders with **daisyUI's stock light palette** (primary is daisy purple `#422ad5`, not the `#1b9cfc` declared in `app/tailwind.css` `@theme`).
- DOM chrome is ~95% on daisyUI semantic tokens (103 files / 315 usages). The hard-coded color debt is in the renderers (three.js, ECharts, canvas labels, d3) and in persisted `mapState.mapColors` defaults.
- The only appearance switch today is `mapState.isWhiteBackground`.

## 4. Shared architecture decisions

These apply to every plan. A plan may refine but not contradict them.

**D1 — Desktop-only, web build unharmed.** The same bundle keeps serving the web/Docker/npm builds. All new native capability sits behind one injected port, `DesktopBridge`, which is present only in Electron (exposed by the preload as `window.codeChartaDesktop`). When absent, the app behaves exactly as today (upload button, no projects, no git). Themes (plan 02) work in both.

**D2 — A headless Rust core owns all non-UI behaviour (owner decision 2026-11-18; supersedes the earlier TypeScript main-process design).** A new top-level folder `core/` holds a Cargo workspace. Everything that is not presentation lives there: projects and the managed store, git, `ccsh` orchestration and the job queue, snapshot records and the nearest-snapshot logic, comparison resolution, PR / merge-request lookup, tool discovery, credential-prompt brokering. The core has no knowledge of Electron, Angular or any UI and must be fully usable and testable without one.

```
core/
  Cargo.toml                 # workspace
  crates/
    codecharta-core/         # library: domain logic, no I/O framing
    codecharta-core-api/     # request/response/event types (serde); the single source of truth for the contract
    codecharta-cored/        # binary `codecharta-core`: `serve` (JSON-RPC over stdio), `askpass`, plus plain CLI subcommands
```

- **Protocol:** JSON-RPC 2.0, one JSON object per line, over the core's stdin/stdout (`codecharta-core serve`). Requests carry a method name (`projects.list`, `git.log`, `analysis.enqueue`, …); long-running work reports through notifications (`analysis.progress`, `git.operationProgress`, `prompt.requested`, `repository.changed`). stderr is the core's log. Errors use typed codes defined in `codecharta-core-api`.
- **Contract generation:** TypeScript types for every method, event and error code are generated from `codecharta-core-api` (e.g. with `ts-rs`; the implementer confirms the tool) into `visualization/app/codeCharta/model/coreApi/` and committed; CI fails when they drift.
- **Headless use:** the same binary offers direct subcommands (at least `projects list`, `snapshots list`, `analyse`, `doctor`) that call the same library code. This is the proof that the core is headless, and what a future non-Electron front end would build on.

**D3 — Electron stays, as a thin shell.** UI changes go into `visualization/` within its existing directory structure; no new source root there. `visualization/electron/` keeps `main.js` and gains `preload.js` and a small core client. The Electron main process does only what needs Electron: the window, starting/stopping/restarting the core process, relaying renderer requests to the core and core notifications to the renderer, native dialogs (folder/file pickers, message boxes), reveal-in-explorer, and reading a snapshot's map file from disk into the renderer. It contains **no domain logic**. Sandbox and context isolation stay on; the preload exposes one narrow API through `contextBridge`; the relay validates the sender frame and only forwards method names that exist in the generated contract. Paths never come from the renderer except out of native pickers; the renderer addresses folders as `(projectId, folderId)` and the core resolves them.

**D4 — Git and ccsh are external tools, driven by the core as child processes.** The core runs the system `git` and `ccsh` with argument vectors (never a shell string built from input). No libgit2/gitoxide dependency: the user's own git gives identical behaviour, config, hooks and credential helpers. `doctor` reports git / ccsh / Java / gh / glab versions and accepts explicit paths. On Windows `ccsh` is a batch file; the core owns the one safe way to launch it (plan 01).

**D5 — The managed store is plain files on disk, owned by the core.** Default root: `<userData>/store` (on Windows `%APPDATA%\codecharta-visualization\store`), overridable. Layout:

```
<storeRoot>/
  store.json                         # { schemaVersion }
  projects/<projectId>/
    project.json                     # name, folders[], analysis profile, timestamps
    snapshots/<folderId>/
      <snapshotId>/
        snapshot.json                # the record (section 5)
        map.cc.json.gz               # ccsh output, moved here after the run
        run.log                      # captured ccsh output
```

Nothing is written into the user's repositories (apart from what `git worktree` itself does inside `.git`). The store is the source of truth; the renderer holds only what is on screen.

**D6 — Project maps are not persisted in IndexedDB.** Maps loaded from the store use a new `FilesLoadedSource` value (`"project"`) and are excluded from IndexedDB record `1002`; on restart they are re-read from disk. Switching commit unloads the previous snapshot (`removeFiles`) before loading the next. At most the maps needed for the current view (one, or two for a comparison) are in memory.

**D7 — Snapshot identity is (folder, full commit SHA, analysis profile).** Display name of a loaded snapshot is `<folderLabel>@<shortSha>` (plus `+dirty` for working-tree snapshots). The loader must make root node names equal across snapshots of one folder so delta works, and must handle "two commits, identical checksum" explicitly (report "no differences" instead of silently renaming).

**D8 — New renderer code follows the existing layering.** New features under `app/codeCharta/features/` (`projects`, `gitHistory`, `snapshots`, `compare`, `theme`), each behind its `facade.ts`; feature-local state as signal-holding `@Injectable` services; NgRx only where state must live in `CcState`. Components standalone, OnPush, zoneless-safe, daisyUI/Tailwind classes only, no component stylesheets, Font Awesome icons.

**D9 — Testability seam.** `DesktopBridge` is an Angular `InjectionToken` typed by the generated contract. Jest and the web Playwright suite use an in-memory fake. The core is tested with `cargo test` (unit tests plus integration tests against temporary real git repositories and a fake `ccsh` executable), and must pass `cargo fmt --check` and `cargo clippy -- -D warnings`. A protocol test drives `codecharta-core serve` over stdio. A small Playwright `_electron` smoke suite covers shell + core together.

**D9a — Build, packaging, CI.** `cargo build --release` produces one `codecharta-core` executable per platform; it ships next to the app as an Electron `extraResource` (a real file outside the asar), and in development the shell uses `core/target/debug`. Because the binary is platform-specific, packaging moves from one Ubuntu runner to a per-OS build matrix. `commitlint.config.js` gains a `core` scope. Details in plan 01.

**D10 — Credentials are prompted, never stored.** The app offers a full basic git workflow (commit, pull, push; plan 04). HTTPS authentication goes through the user's own git credential helper. When git or ssh must ask something (SSH key passphrase or password, host-key confirmation, HTTPS credentials without a helper), the app shows its own prompt through an askpass helper (`GIT_ASKPASS` / `SSH_ASKPASS`), hands the answer to git once, and never stores or logs it. PR / merge-request data comes from the user's own authenticated CLIs (`gh`, `glab`) when present, or from git refs (`refs/pull/*/head`, `refs/merge-requests/*/head`). The app never stores tokens.

**D11 — Dark by default; themes are data.** The default theme is dark for all users. Further themes redefine the token colors after known editor schemes (Nord, One Dark, VS, Darcula/Rider). A theme is one token block plus one registry entry; no component may branch on a theme id.

**D12 — A cc.json can still be opened directly.** Doing so creates or reuses a project named after the file's containing folder and imports the file as a snapshot with `source: "imported"`, whose analysis time is unknown and shown as such (plan 03).

**D13 — This folder is the only hand-over.** Progress notes go in `dev_docs/studio/agents/progress/`, not in `plans/` and not in any machine-local agent state.

## 5. Snapshot record (`snapshot.json`)

```jsonc
{
  "schemaVersion": 1,
  "id": "<fullSha>-<profileHash>",          // or "worktree-<isoTimestamp>-<profileHash>" for dirty/non-git
  "projectId": "…", "folderId": "…",
  "source": "analysed",                     // "analysed" | "imported"
  "git": {                                   // null for non-git folders
    "commit": "<40-hex>", "shortCommit": "<short>",
    "subject": "…", "authorName": "…", "authorDate": "ISO", "commitDate": "ISO",
    "parents": ["<40-hex>"],
    "branchesAtRun": ["main"], "tagsAtRun": ["v1.2"],
    "headAtRun": { "branch": "feature/x", "commit": "<40-hex>", "upstream": "origin/feature/x", "ahead": 2, "behind": 0 },
    "dirty": false,                          // true only for working-tree snapshots
    "remotes": [{ "name": "origin", "url": "https://github.com/owner/repo.git" }]
  },
  "hosting": {                               // best effort, null when unknown
    "provider": "github",                    // "github" | "gitlab"
    "repository": "owner/repo",
    "pullRequests": [{ "number": 123, "title": "…", "state": "open", "baseRef": "main", "headRef": "feature/x" }]
  },
  "analysis": {
    "startedAt": "ISO", "finishedAt": "ISO", "durationMs": 41234,
    "ccshVersion": "2.4.0", "javaVersion": "25",
    "profile": { "without": [], "exclude": [], "extraArgs": [] }, "profileHash": "<8-hex>",
    "exitCode": 0, "notInMap": ["svn history: …"]
  },
  "map": { "file": "map.cc.json.gz", "bytes": 1234567, "checksum": "<meta.checksum>", "rootName": "…" }
}
```

## 6. Delivery order

```
02 Themes ─────────────────────────────────────────────┐ (independent, can ship first or in parallel)
01 Desktop bridge → 03 Projects + store → 04 Git UI → 05 Commit analysis + stale → 06 Compare / PRs
```

Each plan is split into milestones that leave the app shippable. Each milestone ends green on: root `npm run format:check`; in `visualization/`: `npm test`, `npm run lint`, `npx tsc --noEmit -p tsconfig.json`, and `npm run build && npm run e2e:ci` when UI flows changed.

## 7. Amendments found while writing the plans

These override the text above where they conflict. The numbered plans already follow them.

- **`meta.commitHash` is confirmed NOT written by `ccsh analyse --commit` in 2.4.0** (plan 05, "Current state"). The snapshot record is the only source of commit identity.
- **Root names (D7):** ccsh output uses a constant root node name, so snapshots of one folder already satisfy delta's equal-root requirement; normalisation is only needed for imported maps (plan 05).
- **D6 — unloading:** `removeFilesFromState` in `stores/fileStore/store/files.reducer.ts` does not guard an empty list. Never remove the last map and then load; replace in one step (load the new set, then remove the old) as plan 03 specifies. `FileSelectionModeService.lastSetFilesOfPreviousMode` also retains whole `FileState` arrays and must be cleared on project switches (plan 06).
- **Snapshot ids are directory names:** no `:`; working-tree ids use `worktree-<YYYYMMDD>T<HHmmssSSS>Z-<profileHash>` (UTC). Imported snapshots have `analysis: null` plus `imported: { at, originalFileName }`.
- **D2:** the renderer addresses folders only as `(projectId, folderId)`; filesystem paths never cross IPC from the renderer except through native pickers.
- **Credential prompts:** the askpass helper is the core binary itself (`codecharta-core askpass`), so `GIT_ASKPASS` / `SSH_ASKPASS` point at a real executable; it asks the serving core over a local pipe, which emits `prompt.requested` to the UI (plan 04).
- **D4:** on Windows `ccsh` is a batch file, which Node will not spawn without a shell; plan 01 defines the one safe launch path. The tools check also covers `gh` and `glab`. Minimum git is 2.31 (plan 04).
- **D5:** one more write into user repositories exists: fetching PR/MR heads into `refs/codecharta/pr/<n>`, only on an explicit click (plan 06).
- **D8:** the git tool window is also a new top-level view (`views/historyView`, route id `history`), not only a feature.
- **Persisted keys:** besides the chain in section 3, add the key to `DEFAULT_STATE` in the state mocks, and never dispatch an allow-listed action before `loadOnBoot()` has restored preferences (it would save defaults over the saved session) — see plan 02.

## 8. Review status

Plans 01–06 were each written by a planner that read the source at the versions named in section 2. **The independent verification pass was cut short**, so treat cited paths, symbols and CLI flags as needing a re-check at the start of each milestone; items the planners could not confirm are marked `UNVERIFIED` with a spike task.

## 9. Owner decisions

Settled on 2026-11-18; see `README.md` in this folder.

## 10. Cross-plan names — plan 01 wins

The plans were written in parallel, so a few names differ between them. Where they do, use these and correct the other plan in the same commit:

| Topic | Use | Seen elsewhere |
|---|---|---|
| Cancelling a running request | `core.cancel` notification with the request id (plan 01) | `operations.cancel` in plan 04 |
| Renderer call shape | `bridge.request(method, params, { operationId })`, `bridge.subscribe(event, handler)` (plan 01) | `bridge.<namespace>.<method>(…)` in plan 03 examples |
| Askpass mode switch | `CODECHARTA_ASKPASS_ENDPOINT` set (pipe/socket name) and `CODECHARTA_ASKPASS_TOKEN`; the binary enters askpass mode when the endpoint variable is present and argv[1] is not a subcommand | `CODECHARTA_ASKPASS=1`, `CODECHARTA_ASKPASS_PIPE` |
| Shared git test fixtures | `core/crates/codecharta-core/tests/support/git_fixture.rs`, re-exported from `tests/support/mod.rs`; created by whichever plan needs it first, extended by the others | `support/fixture_repo.rs` in plan 03 |
| Minimum git version | 2.31.0, enforced by `tools.doctor` | "no minimum" in older text |
| New methods and events | Added to `codecharta-core-api` first, then regenerated TypeScript, then the core function and dispatch arm | — |
| Error transport | JSON-RPC error `-32000` with `data = { code, message, details }`; codes are append-only | — |

Before starting the first milestone of plans 03–06, read plan 01's "offers" list as implemented and reconcile the plan's "Required from plan 01" list against it; record the result in the progress file.

## 11. Review status (supersedes section 8)

- Plans 01–06 were checked against this repository at visualization 2.11.0: cited paths, symbols, npm scripts and persistence steps were confirmed or corrected, and the owner decisions applied.
- The backend halves of plans 01, 03, 04, 05 and 06 were then rewritten for the Rust core. **That rewrite has not had an independent review**, and nothing in `core/` exists yet, so every Rust-side statement (crate choices, std behaviour for batch files, askpass with an `.exe`, type generation) is a design intent marked `UNVERIFIED` with a spike where it matters.
- Nothing was built or run: `node_modules` was not installed, so daisyUI theme syntax and Electron 44 behaviour are also spike items.
