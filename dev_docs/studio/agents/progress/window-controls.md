---
name: Window controls (O10, D6 + D7)
state: complete
version: 1
---

## Goal

The desktop setting "Use CodeCharta's title bar" (`01-desktop-tools.md` D6) and the window controls in the nav
bar (D7): the system title bar goes away and the nav bar is the only bar.

## Tasks

1. Shell: the setting in `shell.json` (`useAppTitleBar`), the window options per platform, window state and
   commands for the page, reopening the window with the core running, the Windows overlay colours.
2. Bridge: new functions through the sandboxed preload and the shell's sender check; port, fake, smoke keys.
3. Page: `cc-window-title-bar-setting` in Global Configuration, `cc-window-controls` (Linux), drag region,
   macOS inset, Windows caption-button space, overlay colours from the theme.
4. Verify on KDE; record what cannot be checked here.

## Steps

- [x] 1. Shell
- [x] 2. Bridge
- [x] 3. Page
- [x] 4. Verify on KDE

## Notes

### Built

- **Shell** (`electron/windowShell.js`, `windowPolicy.js`, `main.js`): `shell.json` keys `useAppTitleBar` (default off)
  and `titleBarColors`. `windowFrameOptions` gives `frame: false` (Linux), `titleBarStyle: "hidden"` +
  `titleBarOverlay { color, symbolColor, height: 48 }` (Windows), `titleBarStyle: "hiddenInset"` +
  `trafficLightPosition { 16, 16 }` (macOS). Shell actions on the existing `codecharta:shell` channel (sender check
  unchanged): `windowState`, `controlWindow` (`minimize | toggleMaximize | close`, maximize only when
  `isMaximizable()`), `setUseAppTitleBar`, `reopenWindow`, `setTitleBarColors`. The page hears `shell.windowState`
  on maximize/unmaximize, full screen, focus and blur. `reopenWindow` closes the window and opens a new one at the
  same normal bounds (maximized again if it was) once the old one is closed; `window-all-closed` does not quit
  meanwhile and the core is not touched. The Linux button order is read once at start: `kwinrc` `[org.kde.kdecoration2]`
  `ButtonsOnLeft`+`ButtonsOnRight` on KDE (`XDG_CURRENT_DESKTOP` contains `KDE`), else
  `gsettings get org.gnome.desktop.wm.preferences button-layout` (2 s timeout), else minimize-maximize-close.
  `windowShell.js` and `windowPolicy.js` are added to `script/copyElectron.js`. The window rules live in their own
  files because `main.js` and `shellPolicy.js` would otherwise cross the quality gate's complexity limit.
- **Bridge**: `windowState`, `controlWindow`, `setUseAppTitleBar`, `reopenWindow`, `setTitleBarColors` in the
  preload, `DesktopBridge`, the fake (which follows the setting and toggles maximize) and the smoke test's keys.
- **Page**: feature `windowControls` (facade: `WindowControlsService`, `WindowControlsComponent`). The setting
  `cc-window-title-bar-setting` lives in `globalSettings` (Window section after the desktop tools, desktop only).
  The nav bar gets `cc-window-drag` (global rules in `app.scss`: the bar and its three groups drag, their children
  and any dropdown, popover, dialog or floating menu do not, nothing drags while a modal dialog is open), the
  80 px macOS inset (logo and divider `max-xl:hidden`), the Windows end padding from `env(titlebar-area-*)`, and on
  Linux a `w-3` drag gap plus `cc-window-controls`. The theme effect sends `base-100` / `base-content` as the title
  bar colours on every theme change.

### Verified on this machine (KDE Plasma, Wayland session, two screens, a KWin tiling script active)

Driven through a virtual absolute pointer (`/dev/uinput`) against the built app with `useAppTitleBar: true`,
native Wayland and XWayland (`--ozone-platform=x11`, standing in for a KDE X11 session):

- Frameless window: no system title bar; KWin still draws its shadow, rounded corners and the active-window
  outline around the window (screenshots checked).
- Edge resizing: dragging just outside the left edge resized the window (1256 → 1226 px wide under the tiling
  script, which limits the step), Wayland.
- Double-click on the nav bar's empty space maximizes and a second one restores, Wayland and XWayland — done by
  the system, the shell needs no handling. (The tiling script turns "maximized" into a full-width tile, so
  `isMaximized()` stays false there.)
- Right-click on the empty space: Electron emits `system-context-menu` on Linux, but its point is relative to the
  window's surface including the shadow insets (16, 10), not to the screen or the page, so it cannot place a menu
  on X11. The page itself receives `pointerdown` / `contextmenu` with correct coordinates over drag regions, so
  the nav bar opens the menu from its own `contextmenu` and the shell only suppresses any system menu. The menu
  opens exactly at the pointer on Wayland and XWayland.
- Close hover: the 22 px circle in `#da4453` with a white cross (screenshot); the other buttons use the grey circle.
- `npm run e2e:desktop` adds a smoke test: saving the setting and "Restart now" reopen one window with the drag
  bar and the Linux buttons, while the core process (read from `/proc`) stays the same.

### Not checked here

- A real KDE X11 session (only XWayland), GNOME Wayland, other window managers.
- Windows: the caption-button overlay, its recolouring through `setTitleBarOverlay`, the end padding from
  `env(titlebar-area-width)`, snap layouts, the native system menu on right-click.
- macOS: `hiddenInset` with the traffic lights at (16, 16), the 80 px inset, the logo hiding below 1280 px, full
  screen.

### Deviations and decisions

- The Linux right-click menu is opened by the page, not from the shell's `system-context-menu` point (see above).
- A button the system leaves out (e.g. KDE without minimize) is still shown, after the ones the system names;
  the design only asks for the order. The buttons always sit at the right end, even when the system puts them left.
- The setting row is its own markup in the style of `cc-setting-toggle` (the shared toggle has no helper lines).
- "Reset global settings" does not reset the title bar setting (it lives in the shell's file, not the store).
