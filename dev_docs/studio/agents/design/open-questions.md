# Open questions for the owner

Each question has a recommended default. The design files already follow the default; an owner
answer that differs means the named file is changed, nothing else.

## Area 03 — projects

1. ~~One nav-bar control for folders and snapshot status?~~ **Decided by the owner (OD1, OD2):** one
   working folder at a time, chosen in the project menu; the workspace status element replaces the
   map selector, branch chip and analyses indicator.
2. ~~Explicit active folder?~~ **Decided (OD1):** the working folder, chosen in the project menu.
3. ~~How many folders side by side?~~ **Moot (OD1):** one.

## Area 04 — history

4. ~~Confirm a branch switch?~~ **Decided by the owner (2026-11-18):** the default stands. Confirm only
   when the working tree has changes; a clean switch happens at once, as in Rider and VS Code.
5. ~~Where do git failures show?~~ **Decided by the owner (2026-11-18), differs from the default:** every
   git failure shows as a toast, like successes. `04-history.md` (and any area quoting the in-view error
   notice) must change; the designer has to reconsider how a toast carries the failure details, since
   toasts close after 5 s and cannot hold buttons.

## Area 05 — snapshots

6. ~~Does selecting a commit in History change the map?~~ **Decided by the owner (2026-11-18):** the
   default stands. Selection only shows the analysis status in the details pane; "Show in map"
   (Enter / double-click) changes the map. Plan 05's load-on-every-selection is superseded.
7. ~~Stale notice in History?~~ **Decided by the owner (2026-11-18):** follow the UI design, which is the
   default: the banner shows over the map views only; History shows the same facts per commit in its
   details pane.

## Area 06 — compare

8. ~~A "Compare" button in the nav bar?~~ **Decided (2026-11-18):** the owner has no preference, so the
   default stands: no button; the existing Compare tab in the metric view's mode bar opens the compare
   dialog in project mode, and History offers compare on commits and branches. Add the button only if
   the hover mode bar proves too hidden.

## Area 02 — themes

9. ~~"IntelliJ Light" or "Rider Light"?~~ **Decided by the owner (2026-11-18), differs from the default:**
   use the name JetBrains officially gives it. Rider's help page ([User interface
   themes](https://www.jetbrains.com/help/rider/User_interface_themes.html)) calls its default light theme
   **"Rider Day"** (dark: "Rider Night"); neither "Rider Light" nor "IntelliJ Light" is the official Rider name.
   JetBrains IDEs from 2025.3 default to an "Islands" look ("Islands Light"), which Rider's page does not
   mention. The designer and plan 02 must check the palette against the installed Rider before renaming.
10. ~~**Panel edges on dark.** *Default:* add a `base-300` border to the explorer and inspector edges
    (`02-themes.md`, proposed change 1), because their shadow vanishes on a dark map.~~ **Decided by the
    owner (2026-11-18), pending the designer's check:** "Look at how Zed or Rider do it and copy that."
    Rider's Islands look (default since 2025.3) uses rounded tool-window panels with "more distinct tool
    window borders" ([JetBrains blog](https://blog.jetbrains.com/platform/2025/12/meet-the-islands-theme-the-new-default-look-for-jetbrains-ides/),
    via a [summary](https://www.plushcap.com/content/jetbrains/blog/jetbrains-meet-the-islands-theme-the-new-default-look-for-jetbrains-ides-the-jetbrains-platform-blog));
    gap size and whether the edge is a line or a gap are unverified. Zed's [theme docs](https://zed.dev/docs/extensions/themes.md)
    only define a `border` colour and a `border.variant` "visual divider"; that panels are split by a 1px
    divider line is unverified. The designer must check both installed apps and align `02-themes.md`
    proposed change 1; a themed border line is consistent with the `base-300` default, rounded gapped
    panels would differ from it and must be stated.

## Area 01 — desktop tools

11. ~~**Confirm before changing the store folder?** *Default:* yes, one yes/no before the folder picker,
    because the app restarts afterwards.~~ **Decided by the owner (2026-11-18)**: see OD5 in
    `owner-decisions.md`. The "app restarts" premise is dropped (the core owns the store, the UI
    redraws), and there is **no confirmation**: "Change…" goes straight to the folder picker; the core
    switches and the UI redraws.

## From orchestration

(The orchestrator appends questions here.)

- **O1 (2026-11-18). Root `npm run format:check` fails on the mock-up.**
  `dev_docs/studio/agents/design/mockups/studio-screens.html:438:5` raises Biome
  `lint/complexity/noForEach`. CI fails on this check for every branch that contains the mock-up, and
  the orchestrator may not edit design files. Please fix the mock-up's script (a `for … of` loop), or
  have the owner decide to exclude `design/mockups/` from Biome.
  - *Answer (designer, 2026-11-18):* fixed in the mock-up (`for … of`); root `npm run format:check`
    passes again. Every later mock-up is checked with it before committing.
