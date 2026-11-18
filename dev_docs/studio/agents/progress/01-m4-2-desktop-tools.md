---
name: 01-M4.2 desktop tools panel
state: complete
version: 1
---

## Goal

Show the desktop tools check in the settings of the desktop app: which of git, ccsh, Java, gh and glab
were found and in which version, with choosing another executable, the data folder, and the core state
(plan 01 section 4 task 4.2). Hidden on the web.

## Tasks

Copied from `01-core-and-desktop-shell.md`, section 4, M4 task 4.2 (tests to write first are listed there).
The interface is specified by `design/01-desktop-tools.md` and `design/00-design-principles.md`; where they
disagree with the plan, the design wins. Owner decisions in `design/owner-decisions.md` apply (the design
shows "core offline" as a toast; the store-folder rows of plan 03 M6 are part of this design area but
belong to 03-M6 — build only what 4.2 and the design assign to this milestone, and say what you left).

Renderer seam from 01-M4.1 (`01-m4-1-renderer-seam.md`): `DESKTOP_BRIDGE`, `DesktopEnvironment`
(`isDesktop`, `coreState`, `requireBridge()`), `valueOrThrow`, `observeDesktopEvent`,
`createFakeDesktopBridge`; `standInForTheDesktopBridge` in `app/playwright.helper.ts` is still to add.
Shell picker signatures: `chooseToolExecutable(tool, { title, filters })` — the Windows `exe, cmd, bat`
filter and the title come from the renderer.

### 4.2 `features/desktopTools`, mount in the settings dialog, Playwright stand-in, changelog

## Steps

- [x] 4.2 Desktop tools panel

## Notes

Environment (2026-11-19): Arch Linux, node 26, npm 12, Electron 44.9.1, `DISPLAY=:1`. Branch
`feature/studio-01-m4-2` from `feature/studio-integration` (`dd809d7a6`).

### 4.2
- Files: `features/desktopTools/` — `facade.ts` (exports `DesktopToolsPanelComponent`),
  `services/desktopTools.service.ts` (root `DesktopToolsService`), `services/toolRows.ts` (pure: rows, summary,
  core notice, names), `components/desktopToolsPanel/*`, `desktopTools.mocks.ts` (report/paths fixtures for specs,
  e2e and screenshots), `e2e/desktopTools.e2e.ts|.po.ts`. Mounted in `globalConfigurationDialog.component.html`
  after the `@if (canOpenLocalFolders)` block, before the reset buttons, behind `@if (isDesktop())`.
  `standInForTheDesktopBridge(page, seed)` added to `app/playwright.helper.ts` (seed `protocolVersion` defaults
  to `CORE_PROTOCOL_VERSION`). The fake needed no change.
- Service: `report`, `paths`, `isChecking`, `progress`, `failure`; `load()` (once per core session:
  `tools.doctor { refresh: false }` + `paths.get`), `recheck()` (`refresh: true` with operationId
  `desktop-tools-check-<n>`, `core.progress` of that id only), `chooseExecutable`, `useDefault`
  (`tools.clearPath`), `showDataFolder`, `restartCore`. An effect loads when `coreState` becomes `ready` and
  forgets the load when it leaves `ready`, so the report is fetched again after an outage (OD5 "reload on
  reconnect"). `CANCELLED` and `CORE_UNAVAILABLE` are silent (D4: no per-request toasts while offline).
- Tests: every plan name (service, panel, dialog, web e2e, smoke "should list five tools from the real core")
  plus: waits for the core, reloads after an outage, failed check keeps the report, chosen report shown,
  Windows picker filter, cancelled picker, use default, reveal failure, restart, spinner while starting,
  skeleton rows, checking progress text, try again; `toolRows.spec.ts` for badges, problems, summary and core
  notices. Coverage of the new files: service 98.5 % lines, others 100 %.

**Followed the design over the plan**
- Summary line from `canUseGit` / `canAnalyse` (design D1, deviation 1).
- "Show" reveals the **data folder** (`{ kind: "dataFolder" }`) next to "Data folder <dataDir>" (design D3);
  the plan said `reveal({ kind: "storeRoot" })` and "Data folder: <storeRoot>".
- Badges incl. optional `badge-warning` "not working"; problem texts after " — " per design D2; version "—".
- In-panel core states starting / restarting (info + spinner) and stopped / unavailable (error + "Restart core"),
  replacing the rows (design D4 "In this section"); skeleton rows, "Checking N of 5…", failure alert with
  "Try again" (design "States of the whole section"); narrow layout below the `sm` breakpoint (two lines per
  tool) using `order-*` classes.
- A failed "Choose…" shows an error toast and keeps the old report (design D2).

**Deviations / gaps (not improvised beyond the minimum)**
- Toast for a failed choose: the renderer never learns the picked file name (the shell sends it straight to
  `tools.setPath`; `TOOL_FAILED` details carry only `tool`), so the text is "The chosen file is not a working
  <tool>: <core message>" instead of "<file name> is not a working <tool>: <message>".
- Picker title "Choose the <tool> executable" and filter name "Programs" (`exe, cmd, bat`, Windows only, detected
  from `navigator.userAgent`): neither design nor plan gives wording; needed because the shell adds none (01-M3).
- A failed reveal toasts the shell's message as is (no design wording).
- "Checking…" before the first `core.progress` arrives (design shows only "Checking 3 of 5…").
- Optional tool `tooOld` (unreachable: optional tools have no minimum) is shown `badge-warning` "too old".
- A custom path that no longer exists is reported `missing` by the core; the design's missing text ("not found
  on PATH…") is shown for it too — slightly misleading, for the designer.
- Error toasts still close after 5 s: "errors stay until dismissed" (OD8 toast changes) is not built here.
- Design contrast observation: `text-warning` / `text-success` summary text on `base-100` in `cc-light` is pale
  (yellow/green on white); used as the design specifies.

**Left for other milestones**
- 03-M6: store-folder rows ("Change…", "Use default", copying state, store toasts).
- Not assigned to any milestone yet (orchestrator): the app-wide persistent core-offline toast and "Back online"
  toast (D4, OD5; needs the persistent slot in `cc-toast`, OD8/OD9), the "Open desktop tools" deep link with
  `openGlobalConfiguration({ section, tool })` (D5), and the W1 offline icon. The panel's own reload on reconnect
  is done.

**Screenshots** (Playwright, stand-in bridge, 1440×1000 and 560 px; scratch spec, not committed)
- Dark, mixed report: summary in warning yellow "Git history is available; analyses need Java."; Git/ccsh
  "found" green, Java "too old" red with "runs ccsh — version 21.0.2 is older than 22.", GitHub CLI "not
  working" yellow with the first line of its problem, GitLab CLI "not installed" ghost with "—"; ccsh shows the
  "custom" badge, a truncated path and "Use default"; long paths end in "…"; the dialog keeps `max-w-2xl`;
  "Data folder" row with "Show" below a thin rule. Light: same layout, badges readable; summary text pale (above).
- All found (light): green check + "Analyses and git history are available."
- Core unavailable (dark and light): red alert with the not-running sentence and "Restart core" in place of
  the rows, "Check again" disabled; "Restart core" wrapped onto two lines, fixed with `whitespace-nowrap`.
- Narrow (560 px): name + badge + actions on the first line, version + full path on the second, purpose below.


**Gates (Linux)**: root `format:check` clean; `npm test` 657 suites, 5013 passed (2 todo), coverage 96.86 / 90.3 /
95.46 / 96.79; `lint` clean; `tsc` clean; `build` ok; `test:electron` 42/42; `e2e:desktop` 10/10; web `e2e:ci`
(temporary uncommitted `BROWSER_CHANNEL = "chromium"`, `CI=1`, 1 worker) 154 passed, 1 flaky that passed on
retry (`clusterExplorer.e2e.ts` "should keep every rendered row the same height", not touched here).
