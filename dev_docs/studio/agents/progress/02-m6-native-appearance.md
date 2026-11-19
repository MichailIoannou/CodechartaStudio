---
name: 02-M6 native window appearance
state: progress
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

- [ ] 1. Native appearance

## Notes

