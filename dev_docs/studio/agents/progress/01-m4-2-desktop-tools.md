---
name: 01-M4.2 desktop tools panel
state: progress
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

- [ ] 4.2 Desktop tools panel

## Notes

