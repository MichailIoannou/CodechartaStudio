---
name: 02-M6 native window appearance
state: complete
version: 1
---

## Goal

The desktop window opens in the theme's background colour and follows the theme's light/dark scheme
natively (plan 02, Milestones, M6).

## Tasks

Copied from `02-themes.md`, Milestones, M6. Adapted by orchestration to plan 01 as built: the shell
already offers `setWindowBackground` on `window.codeChartaDesktop` (01-M3, `electron/shellActions.js`), and
the renderer reaches the bridge through `DESKTOP_BRIDGE` / `DesktopEnvironment` (01-M4.1). Reuse those;
add a shell call only for what is missing (e.g. `nativeTheme.themeSource`), with plan 01's sender checks
and value validation. Do not add a second bridge global. Do not edit `02-themes.md` (uncommitted owner
edit); record plan corrections in Notes.

1. Pass the theme to the desktop window (effect + shell side), tests "should tell the desktop shell about
   the theme", "should work without a desktop shell"

## Steps

- [x] 1. Native appearance

## Notes


- Reused: `setWindowBackground` (shell action, `shell.json` `windowBackgroundColor`, `BrowserWindow.backgroundColor`
  read at start), `DESKTOP_BRIDGE` (no new port/token; the plan's `NATIVE_APPEARANCE` token and
  `codeChartaDesktop.appearance` were not built: plan 01 shipped a flat bridge).
- Added: shell action `setColorScheme` (`light|dark|system`, validated by `isColorScheme` in `shellPolicy.js`,
  sets `nativeTheme.themeSource`, persists `colorScheme` in `shell.json`); `main.js` applies the persisted scheme
  (default dark) before creating the window; bridge method `setColorScheme` in preload, `DesktopBridge`, fake.
- Deviations: separate `setWindowBackground` + `setColorScheme` calls instead of one `setAppearance`; default window
  background changed from `#ffffff` to `#1e2329` (plan: cc-dark surface); a persisted background that fails
  validation falls back to the default. The effect sends `system` while the preference is "Follow system".
  The colour sent is `theme.render.surface` (equals `chrome.base100`).
- Plan correction for 02-themes M6: use the existing `setWindowBackground` and `DESKTOP_BRIDGE`; no
  `NATIVE_APPEARANCE` token.
