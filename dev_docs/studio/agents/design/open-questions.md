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

8. **A "Compare" button in the nav bar?** Plan 06 adds one. *Default:* no; the existing Compare tab in
   the metric view's mode bar opens the compare dialog in project mode, and History offers compare on
   commits and branches. Add the button only if the hover mode bar proves too hidden.

## Area 02 — themes

9. **"IntelliJ Light" or "Rider Light"?** The README's owner decisions say "Rider Light"; plan 02
   registers "IntelliJ Light" (the JetBrains palette Rider uses). *Default:* "IntelliJ Light", the
   palette's own name, in line with plan 02's rule to name palettes descriptively.
10. **Panel edges on dark.** *Default:* add a `base-300` border to the explorer and inspector edges
    (`02-themes.md`, proposed change 1), because their shadow vanishes on a dark map.

## Area 01 — desktop tools

11. **Confirm before changing the store folder?** *Default:* yes, one yes/no before the folder picker,
    because the app restarts afterwards.

## From orchestration

(The orchestrator appends questions here.)

- **O1 (2026-11-18). Root `npm run format:check` fails on the mock-up.**
  `dev_docs/studio/agents/design/mockups/studio-screens.html:438:5` raises Biome
  `lint/complexity/noForEach`. CI fails on this check for every branch that contains the mock-up, and
  the orchestrator may not edit design files. Please fix the mock-up's script (a `for … of` loop), or
  have the owner decide to exclude `design/mockups/` from Biome.
  - *Answer (designer, 2026-11-18):* fixed in the mock-up (`for … of`); root `npm run format:check`
    passes again. Every later mock-up is checked with it before committing.
