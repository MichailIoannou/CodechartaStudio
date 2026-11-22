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
   git failure shows as a toast, like successes. Error toasts stay open until dismissed and carry a
   "Details" button (git's full message) and a close button; success toasts still close after 5 seconds.
   `04-history.md` line 151 (failures to the H6 operation banner or W1's ACTIVITY row), line 185 (H6 "operation
   failed" row), lines 584-586 (deviation 4, "error notice in H6 (dismissible, with Details)") and
   `mockups/studio-screens.html` line 565 (the question's old default) must change to this toast behaviour.
   - *Applied (designer, 2026-11-18):* `04-history.md` (H5 results, H6, H12, deviation 4),
     `00-design-principles.md` §3 "Toasts" (error toasts stay, Details, one action) and the mock-up.

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
   - *Applied (designer, 2026-11-18):* the installed Rider 2026.2 ships both "Rider Day" (new UI) and
     "Rider Light" (classic UI); the label is "Rider Day", tokens from `RiderDay.theme.json`
     (`02-themes.md`, T1 and deviation 1).
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
    - *Applied (designer, 2026-11-18):* checked the installed Rider 2026.2 Islands theme files
      (10 px radius, 6 px gaps, no border lines; Zed's compiled-in themes could not be read). The design
      copies Rider's islands: explorer and inspector float as rounded panels 6 px from the edges, tiled
      panes sit on a darker backdrop with 6 px gaps. This differs from the `base-300` default, as stated
      in `02-themes.md` proposed change 1.
12. **Side panels give way when the metrics bar has no room?** At about 900 px with explorer and
    inspector both open, only 236 px of map are free and the bar's tools lie under the inspector
    (02-M7, after O7). *Default:* opening a side panel collapses the other one whenever less than 30rem
    of map would stay free; a window resize collapses the inspector first. Nothing changes above about
    1150 px. *Alternatives:* (a) leave it as a known limit, or (b) let the bar sit above the inspector
    and cover it. Applied in `02-themes.md` T4 "Too little room".
    - *Answer (owner, 2026-11-22):* a compact icon-only metrics bar (one dedicated icon per element:
      layout, area, height, color, edges, labels, scenarios, each with a help text on hover) replaces
      the automatic collapsing of the side panels. Both panels stay open and the bar shrinks to icons
      when too little map space is free (designer must change `02-themes.md` T4 "Too little room" and
      design the compact bar's icons, breakpoint and hover texts; implementer must remove the panel
      give-way behaviour built in 02-panels-give-way).
    - *Applied (designer, 2026-11-22):* `02-themes.md` T4 "Too little room" and the new section "T4
      compact bar": below 30rem of free map (back at 32rem) the bar becomes two rows of 28 px icon
      buttons, 231 px wide, which fits 900 px with both panels open. Icons picked by the owner: area
      footprint tile, height building with an up arrow (new glyphs), color `fa-palette`, edges
      `fa-circle-nodes`, scenarios `fa-regular fa-bookmark`, labels `fa-solid fa-tags`, layout its
      current glyph. Owner follow-up (2026-11-22): the full bar shows the same icons on each card's
      settings button instead of the cog, and Labels uses the standard tags icon. Scenarios shows its
      bookmark in place of its ＋; it opens the menu with "Open saved scenarios" and "Save current state
      as scenario". The tooltip and `aria-label` text is "<cell> · <metric> ·
      <meta>". The give-way removal includes the collapsed inspector strip and its selection dot, which
      existed only for it. Mock-up `mockups/compact-metrics-bar.html`.

13. **Linux window buttons: Breeze look only?** (O10) *Default:* the buttons CodeCharta draws on Linux
    always have KDE Breeze's shape (thin chevrons, diamond, cross, round highlight, red close) in the
    app theme's colours; only the button order follows the system (KDE `kwinrc`, GNOME
    `button-layout`). Other KDE decoration themes (Oxygen, Aurorae themes) and GNOME's Adwaita buttons
    are not imitated. *Alternatives:* (a) read the colours of the system's window decoration from KDE's
    `kdeglobals`; (b) a GNOME look on GNOME. Applied in `01-desktop-tools.md` D7.
    - *Answer (owner, 2026-11-22):* alternative (b): on KDE keep the Breeze look; on GNOME draw GNOME
      (Adwaita-style) buttons (designer must change `01-desktop-tools.md` D7: add the GNOME look with
      shape, colours, light/dark, button order from `button-layout` and how the shell detects the
      desktop; implementer must build both looks; mock-up `mockups/window-controls.html` needs the
      GNOME variant).
14. **"Use CodeCharta's title bar" off by default?** (O10) *Default:* off, so every Linux window manager
    keeps its native frame; *alternative:* on for Windows and macOS, where the system still draws the
    buttons, off on Linux. Applied in `01-desktop-tools.md` D6.
    - *Answer (owner, 2026-11-22):* off everywhere, on every platform; the default stands.
15. **Compact form for the domain and dependency bars?** (question 12) *Default:* only the metrics bar
    gets the compact icon form; the domain bar and the dependency bar keep their behaviour, because
    their cells are few and narrower. *Alternative:* give them the same compact form with their own
    icons. Applied in `02-themes.md` "T4 compact bar", "Other bars".
16. **W1's width now follows its content?** (owner request 2026-11-22: drop `@ <sha>` from the branch
    chip and make it smaller.) *Default (designer):* W1 as wide as its content. *Alternative:* keep
    OD2a's fixed width, only smaller.
    - *Answer (owner, 2026-11-22):* keep the fixed width, just smaller (the alternative). Applied: W1
      is a fixed 18rem (was 22rem), narrowed only by the nav bar fit (`05-snapshots.md` W1, principles §3).

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

- **O2 (2026-11-19). Desktop tools: wording the implementer had to supply (01-M4.2).** Neither
  `01-desktop-tools.md` nor plan 01 gives these, so 01-M4.2 used placeholders. Please confirm or replace:
  1. Native picker title for "Choose…": "Choose the <tool> executable".
     - *Answer (owner, 2026-11-19):* shorter title: "Choose <tool>" (e.g. "Choose git"), not "Choose
       the <tool> executable".
  2. Windows file-type filter name in that picker: "Programs" (`exe, cmd, bat`).
     - *Answer (owner, 2026-11-19):* keep "Programs" (`exe, cmd, bat`).
  3. Toast after a failed "Choose…": the renderer never learns which file was picked, so it reads
     "The chosen file is not a working <tool>: <message>" instead of naming the file.
     - *Answer (owner, 2026-11-19):* keep the generic wording "The chosen file is not a working
       <tool>: <message>", without the file name.
  4. A custom path whose file was deleted still shows "not found on PATH" — which text should it show?
     - *Answer (owner, 2026-11-19):* name the custom path, e.g. "Custom path not found: <path>",
       instead of "not found on PATH" (implementer must change the text in the 01-M4.2 tools panel).
     *Applied (designer):* `01-desktop-tools.md` D1 lists the "custom path missing" text, the picker title and the toast wording from O2.1–O2.3.
  5. In the light theme, the success and warning summary lines are pale on white — token choice?
     - *Answer (owner, 2026-11-19):* nothing, leave as is; decided, no change.

- **O3 (2026-11-19). Rider Day token values (02-M5).** `02-themes.md` names the light JetBrains scheme
  "Rider Day" but gives no token values. 02-M5 derived them from Rider 2026.2's `RiderDay.theme.json`
  (values listed in `progress/02-m5-editor-schemes.md`). Please confirm or replace them.
  - *Answer (owner, 2026-11-19), first question:* keep the derived Rider Day token values. The second
    question (shared dark graph palette) is answered below.

  Also: the shared
  dark dependency-graph palette has a slight blue cast on the neutral Darcula and VS Dark chrome — keep
  one shared dark graph palette, or give those two their own?
  - *Answer (owner, 2026-11-19), second question:* own palettes: Darcula and VS Dark get their own
    neutral graph palettes matching their chrome, instead of the shared slightly blue one (implementer
    must change this in plan 02 / 02-M5).

- **O4 (2026-11-19). Snapshot deletion edge cases (05-M6 core).**
  1. The core no longer falls back to permanent deletion when the recycle bin fails (owner decision:
     deletions go to the recycle bin); it answers `RECYCLE_FAILED` and removes nothing. `05-snapshots.md`
     has no state for this. What should the delete and clean-up dialogs show, and should they offer
     "Delete permanently" (the core accepts `permanently: true`)?
     - *Answer (owner, 2026-11-19):* an error toast stating what happened (the recycle bin failed and
       nothing was deleted); persistent error toast per the Q5 decision. No "Delete permanently" offer in
       the dialogs (designer must change `05-snapshots.md` to add this state).
       *Applied (designer):* `05-snapshots.md` S4 states — error toast with Details, no permanent delete.
  2. Re-analysing a commit with "force" replaces its snapshot; the old copy (same commit and profile) is
     removed for good, not recycled. Acceptable as a replace, or should it go to the recycle bin too?
     - *Answer (owner, 2026-11-19):* accepted as a replace; the old copy is removed, not recycled.
  3. `snapshots.planPrune` / `prune` work per folder; the design's project-wide clean-up dialog would call
     them once per folder. Fine?
     - *Answer (owner, 2026-11-19):* for now just clear the folder you are on, not the entire project's.
       Clean-up/prune applies to the working folder only; a project-wide clean-up is a possible later
       addition (designer must change `05-snapshots.md` to reduce the project-wide clean-up dialog to the
       working folder).
       *Applied (designer):* `05-snapshots.md` S8 now cleans up the working folder only; S4 footer title says so.

- **O5 (2026-11-19). Native picker titles for projects (03-M5).** `03-projects.md` names no titles for the
  native folder pickers. 03-M5 used "Add folder" (P4/P5 add) and "Re-link '<label>'" (P6 re-link). Please
  confirm or replace.
  - *Answer (owner, 2026-11-19), first question:* keep "Add folder" and "Re-link '<label>'".

  Also: at 1024–1279 px the project trigger truncates to e.g. "bill…" with the full name
  in the tooltip, as the width budget implies — acceptable?
  - *Answer (owner, 2026-11-19), second question:* acceptable.
- **O5 addendum (03-M6).** More wording 03-M6 had to supply: the import picker's filter name "cc.json files",
  its picker titles, and a 4 GiB size limit on dropped files (no import limit exists otherwise). Also: "Look
  for commit… in another folder" creates the new project as soon as the folder is picked, so cancelling
  afterwards keeps that project — acceptable? Store change has no confirmation step (per the design) and
  no relaunch (OD5: the core swaps the store live).
  - *Answer (owner, 2026-11-19), first part:* keep the wording (filter name "cc.json files" and picker
    titles) but no size limit: remove the 4 GiB check on dropped files so dropped and picked imports
    behave the same (03-M6 implementer must change this).
  - *Answer (owner, 2026-11-19), second part:* remove it on cancel: cancelling the following step also
    removes the just-created project (03-M6 implementer must change this; designer must change
    `03-projects.md` to say so).
    *Applied (designer):* `03-projects.md` P8 commit binding.

- **O6 (2026-11-19). Metrics bar refresh (02-M7), two points for sign-off.**
  1. The Dependencies view had a rotated LEGEND tab too; 02-M7 replaced it with a Legend tool in the
     dependency bar, like the metrics and domain bars. `02-themes.md` T4 names only the metrics and domain bars.
     Keep it?
     - *Answer (owner, 2026-11-19):* keep it (designer must change `02-themes.md` T4 to name the
       dependency bar too).
       *Applied (designer):* `02-themes.md` T4 names the dependency bar and its Legend tool.
  2. The open legend used to cover the bar's right end (including the new Legend tool), so it now opens above
     the bar. Acceptable?
     - *Answer (owner, 2026-11-19):* no preference; the implementation stands (legend opens above the
       bar).
  Also noted: the blend width in the file extension bar is `min(12px, 100%/3)` per side because the design's
  "narrower than 48 px" rule contradicts its own numbers at exactly 48 px.
  - *Answer (owner, 2026-11-19):* the blend-width note is informational; noted.

- **O7 (2026-11-19). The refreshed metrics bar sits partly under the open explorer (02-M7).** With the Layout
  and tools cells inside the bar it is wider; at 1920 px the open explorer covers its Layout cell (Area was
  already covered before). T4 keeps the bar's position and width unchanged, and upstream PR #4557 centred the
  bars on the whole window on purpose (with an e2e test). Options: A — centre the bar between explorer and
  inspector (offset returns, amends T4 and #4557's test); B — keep window centring but cap the bar's width at
  the free area so it shrinks and truncates beside open panels (amends T4's "unchanged width"); C — no change,
  the covered cells stay a known limitation (tests collapse the explorer first, as scenarios.e2e does).
  Asked of the owner the same day.
  - *Answer (owner, 2026-11-19):* option A: centre the bar between the explorer and the inspector (the
    offset returns). Amends `02-themes.md` T4 ("position and width unchanged") and upstream PR #4557's
    window-centring e2e test (designer must change `02-themes.md` T4; 02-M7 implementer must change the bar
    position and that test).
    *Applied (designer):* `02-themes.md` T4 "Position" bullet; the shell no longer claims an unchanged position.
  - *Changed (owner, 2026-11-22):* the bar is centred on the window again, not between the panels.
    *Applied (designer):* `02-themes.md` T4 "Position" and "T4 compact bar" → "When": the bar's room is the
    width around the window centre that no panel covers, and the compact bar takes over below the full bar's
    minimum, so no panel covers the bar. #4557's window-centring e2e test stands.

- **O8 (2026-11-20). Design follow-ups from implementation** (`progress/ORCHESTRATION.md`, "Deviations
  from the plans"). *Answered (designer, 2026-11-20):*
  1. O2–O7 "designer must change …": all in the design (`02-themes.md` T4 Position and dependency bar,
     `05-snapshots.md` S4/S8, `03-projects.md` P8, `01-desktop-tools.md` D1).
  2. Metrics bar at ~900 px with both panels open: side panels give way (`02-themes.md` T4 "Too little
     room"); asked of the owner as question 12, default applied.
  3. History:
     - committer label: labelled Author / Committer / Parents rows (`04-history.md` H9);
     - identity commands: copy blocks inside the error toast, via a new `commands` option of
       `ToastService.show` (H6, principles §3);
     - `CONFLICTS` (commit; pull, merge, stash pop), `OPERATION_IN_PROGRESS` worded in H6;
       `OUTPUT_TOO_LARGE` is a diff-view state with a copyable `git diff` (H13);
     - Changes tab mock-up added to `mockups/studio-screens.html`;
     - not-a-repository: no folder select; "Work in '<label>'" or "Choose working folder…" (opens the
       project menu) (H6);
     - light theme: per-theme lane variables with darker light values, an inset outline on the selected
       row, a solid "conflict" badge (H8, H11).
  4. Compare:
     - Pull requests without gh/glab: `NotInstalled` row plus "Open desktop tools"; no segment at all
       when the core has no hosting support (`06-compare.md` C7);
     - chip: the branch label keeps `min-w-16` and the other parts give way in a fixed order; captions and
       the base-mode badge leave below 1536 px (C2 "Space priority").
  5. Desktop tools deep link (D5): kept as designed; until the facade entry exists the link opens the
     dialog at its top (`01-desktop-tools.md` D2).

- **O9 (2026-11-20). Design follow-ups from the second implementation round** (details in the progress
  files named per item; each was built with the reading given and can be changed later).
  1. Side panels give way (`progress/02-panels-give-way.md`):
     - a panel opened by a click or focus *inside* the other panel opens collapsed itself, so the panel
       the user works in keeps its place (read literally, clicking an explorer row at ~900 px collapsed the
       explorer under the pointer). Acceptable, and should T4 say so?
     - a new selection does not reopen a collapsed inspector (one click does). Should it?
     - the collapsed inspector strip is not designed; built like the explorer's strip with
       `fa-solid fa-circle-info`. What should it look like?
     - should panels give way in the Dependencies view too (needs a collapsed form of its inspector)?
     - with the core down, "Check again" is disabled and cannot take focus; the deep link only scrolls. OK?
  2. History (`progress/04-M6-readonly-e2e-followups.md`):
     - "Work in '<label>'" uses the same call as P1, which shows the project overview when the folder has
       no analysis, so the user leaves the History. Should switching from the History stay there?
     - for an untracked file H13's `git diff -- <path>` prints nothing; use
       `git diff --no-index -- /dev/null <path>` (`NUL` on Windows)?
     - identity commands are cut off with "…" in the `w-96` toast (full text in `title`, Copy copies all).
       Acceptable, or wider error toasts when they carry commands?
     - the selected-row outline was applied to commit rows only (H8), not to Changes rows. Intended?
  3. Snapshots (`progress/05-m6-batches-retention.md`): wording chosen where the design is silent —
     count validation "Enter a number from 1 to 200.", keep counts "Enter a whole number of 0 or more.",
     tags "N tagged commits: …" / "N older tagged commits left out — at most 200 commits per batch.", the
     working-tree delete question, and a partial clean-up "Moved X of Y; the rest were kept." Approve or
     replace? Should a running batch's activity line start expanded?
  4. Projects (`progress/03-m7-local-source-scenarios.md`): no design covers 03-M7. Wording chosen for a
     missing folder: "The folder "<label>" is not available, so its files cannot be opened. Re-link it in
     the project." A project map's source shows the folder's current files, not the analysed commit, with
     no hint. Should there be one?
  5. Compare (`progress/06-m4-m5-ui.md`):
     - **chip width (most important):** even with the four C2 give-way steps the chip does not fit beside
       the project menu and workspace status: at 1920 px the PR badge is cut off, at 1024 px only the base
       side fits. What else gives way (head label, swap button, a narrower project menu, a second row)?
     - with gh/glab working but no core listing yet, the Pull requests segment shows only the number entry
       with no message; C7 has no state for this. "Core has hosting support" was read as "`hosting.status`
       answers for the folder". OK?
     - number-entry label "Open pull request by number" / "Open merge request by number"; delta colours in
       the Changes rows ignore inverted delta colours. OK?
  6. Pull, push, abort (`progress/04-M11-pull-push.md`):
     - error toasts (top right) cover the right end of the History toolbar and of the first notice; the
       conflicts toast appears exactly when "Abort merge…" is needed. Should git error toasts start below
       the History notices, or the notice keep its actions on the left?
     - should the sync button and Force Push be disabled during a merge or rebase (now git refuses with the
       `operationInProgress` toast)?
     - Push of a non-current branch without upstream is disabled ("'x' has no upstream branch."); should it
       publish instead? Force Push is disabled when nothing on the remote would be replaced. OK?
     - wording supplied: "HEAD is detached: switch to a branch first", "This repository has no remote",
       "The remote has no commits that your branch lacks — use Push". Approve or replace?
  7. Sync button outside the History (`progress/04-sync-placements.md`):
     - a pull started from the workspace status or the project overview can stop on conflicts; the H6
       toast then says "The notice above the list says how to finish or abort", but that notice exists only
       in the History. "Open History" follow-up in the toast, other text, or a merge/rebase state with Abort
       in W1 and the card?
     - answering a confirmation (a click on the modal) closes the W1 dropdown like any outside click, so
       "Pulling…" is then visible only on the trigger. Should the dropdown stay open?
     - the "Open History" buttons next to the sync button in the W1 and P3 mock-ups are not built yet.
  8. Compare polish (`progress/06-m6-polish.md`), built without design where noted:
     - imported side in the chip uses the file's modification date ("imported 12 Nov", or "imported, date
       unknown"); use the time it was imported into the store instead?
     - pickers list every working-tree analysis as "Working tree (4 Nov 09:12)" with "uncommitted changes on
       a1b2c3d", not just the newest. OK?
     - two folders: the chip shows the folder only in each side's tooltip ("… in billing-fork"). Design?
     - "Compare with another folder" checkbox sits at the right end of the folder row; the mock-up has it
       right after the select.
     - "Both sides are the same analysis — nothing to compare." OK?
     - inspector git line (not designed): H9 worded badge plus "in git" / "from <old path>" under the node
       badges.
     - folder-menu "Remove fetched pull requests" (not designed): `fa-broom`, no confirmation (refs can be
       fetched again), result toast.
     - comparisons with a working-tree or imported side are not saved to Recent.

  *Answered (designer, 2026-11-21):*
  1. Panels: yes to all as built, now in `02-themes.md` T4 "Too little room" refinements — the panel the
     user works in never collapses; a new selection does not reopen the inspector but its strip shows a
     dot; the strip mirrors the explorer's with `fa-circle-info`; Dependencies follows the same rule.
     Core down: focus goes to the D1 heading (`01-desktop-tools.md` D2).
  2. History (`04-history.md`): "Work in '<label>'" stays in the History; untracked files use `git diff
     --no-index -- /dev/null <path>` (`NUL` on Windows); commands in toasts wrap instead of "…"
     (toast keeps `w-96`, principles §3); the selection outline applies to every History list.
  3. Snapshots: all wording approved and written into `05-snapshots.md` S4/S7/S8; the batch line in
     ACTIVITY starts collapsed.
  4. Projects: new `03-projects.md` P12 — the missing folder gets a "Re-link folder…" button; a line
     "This is the file as it is in the folder now, not at a1b2c3d." when the map is not current.
  5. Compare (`06-compare.md`): **C2 revision 2** — the chip is one compact button (base → head, stale
     dot, PR icon, caret) of a fixed width per breakpoint (`w-72` / `w-56` / `w-32`), the details move
     into its dropdown, and the project menu shows only its icon during a comparison below 1280 px.
     Before/after: `mockups/compare-chip-before-after.html`. Listing not available: "Pull requests
     cannot be listed here. Enter a number to open one." (C7); number labels approved; Changes rows
     follow the inverted delta colours setting (C8).
  6. Pull and push (`04-history.md` H5, H6; principles §3): in the History toasts start below the
     toolbar and notices, notice actions sit on their own line on the left, and a conflicts stop started
     in the History raises no toast (the notice says it); Pull/Push/Publish/Force Push are disabled
     during a merge or rebase (Fetch stays); a non-current branch without upstream offers Publish; the
     wording is approved, "Nothing to pull" reworded.
  7. Sync outside the History: the conflicts toast gets "Open History" and W1's GIT section shows the
     merge state (Abort stays in the History); the W1 dropdown stays open behind a confirmation
     (`05-snapshots.md` W1). The "Open History" buttons stay in the design (implementation task).
  8. Compare polish (`06-compare.md`): imported dates are the store import time; the ref picker lists
     the 3 newest working-tree analyses; differing folders are named in the chip's title and dropdown
     rows; the folder checkbox goes right after the select; "Both sides are the same analysis —
     nothing to compare." approved; inspector git line as new C10 (badge, "renamed from <old path>", no
     "in git" text); "Remove fetched pull requests" as new C11; working-tree and imported comparisons
     stay out of Recent.

- **O10 (2026-11-22). Owner request: hide the native window decorations (desktop app).** The default
  File / Edit / View / Window menu bar is removed (macOS keeps a minimal app and Edit menu so its shortcuts
  work). The owner wants a setting that hides the native title bar, so the app has a single top bar: our
  nav bar then carries minimize, maximize/restore and close buttons that look almost identical to the
  platform's own — KDE Breeze on Linux (the owner's reference: thin chevron-down, chevron-up, ✕ glyphs,
  no frames), Windows 11 caption buttons on Windows, and the traffic lights on macOS (left side). Needs
  design before implementation (owner decision 2026-11-22, "designer first"):
  - the setting's wording, section and default (off?), and whether switching needs a window restart (the
    shell can recreate the window, or apply `titleBarStyle`/frameless on the next start);
  - placement in the nav bar per platform (right end on Linux/Windows; left of the logo on macOS), spacing,
    sizes, hover/pressed colours (Windows close turns red), focus ring, and the dark/light theme variants;
  - the drag region (which parts of the nav bar move the window, which stay clickable), double-click to
    maximize, and right-click (system menu on Windows?);
  - maximized vs restored icon, a disabled maximize when the window cannot grow, full-screen (macOS);
  - how the nav bar's existing content (project menu, workspace status, view tabs, compare chip, Settings)
    gives way to the extra buttons at narrow widths;
  - which other KDE window decorations themes users have (Breeze is the default) — follow Breeze only, or
    the system's colours?
- **O11 (2026-11-22). Follow-ups from the third implementation round** (built with the reading given):
  1. History (`progress/history-followups.md`): Pull is disabled at "nothing behind", which relies on the
     counts of the last fetch; if the remote moved since, Pull stays disabled until a fetch. Keep, or leave
     Pull enabled and let git answer "Already up to date"? Should the branch context menu also hold Push,
     Force Push and Publish during a merge or rebase (H5 names only the sync button)?
  2. Compare (`progress/compare-followups.md`): C11 "only when such refs exist" is not built (no core
     count of `refs/codecharta/`; the item is offered for every git folder and answers "'<folder>' has no
     fetched pull requests."). Is a core count wanted? C10 read literally shows "renamed" twice (badge and
     "renamed from <path>") — intended? The PR line reads "Pull request #7 ↗" (no title without a listing).
     Swap keeps the chip's dropdown open. At 1024 px the collapsed inspector header's button draws over the
     top of the chip's dropdown — z-order rule?

  *Answered (designer, 2026-11-22), O10:* `01-desktop-tools.md` D6 (setting) and D7 (window controls);
  mock-up `mockups/window-controls.html`.
  - Setting "Use CodeCharta's title bar" in a "Window" section of Global Configuration after the desktop
    tools, off by default (owner question 14); stored in the shell's settings file; applies at the next
    start, with "Restart now", which reopens the window while the core keeps running.
  - The system draws the buttons where it can: macOS real traffic lights (`hiddenInset`, 80 px inset
    before the logo); Windows real caption buttons through `titleBarOverlay` with the theme's colours
    (snap layouts and the red close come for free); Linux `frame: false` with CodeCharta's own
    Breeze-look buttons at the right end (28 px hit areas, 22 px round highlight, red `#da4453` close,
    diamond when maximized, dimmed when the window is not focused, disabled maximize, hidden in full
    screen). Breeze shape only, button order from the system (owner question 13).
  - Drag region: the nav bar background drags, every control is `no-drag`; a 12 px gap before the
    buttons and the macOS inset always stay free. Double-click maximizes/restores; right-click shows
    the system menu on Windows and Minimize/Maximize/Close on Linux.
  - Space: the right half holds only Settings, so Windows and Linux need no give-way down to 1024 px; on
    macOS the logo and divider hide below 1280 px.
  - To verify in implementation: edge resizing and shadow of frameless windows on KDE (X11, Wayland) and
    GNOME Wayland; double-click on a drag region under Linux.

  *Answered (designer, 2026-11-22), O11:*
  1. History (`04-history.md` H5): Pull stays enabled at "nothing behind" and git answers "Already up to
     date" (the counts may be stale); the merge/rebase disabling applies to the branch context menu too.
  2. Compare (`06-compare.md`): no core count for C11 — the item stays for every git folder and the info
     toast says "'<folder>' has no fetched pull requests."; C10 says "renamed" once (badge + "from <old
     path>"); "Pull request #7" without a title is right; Swap keeping the dropdown open is intended.
     z-order: nav-bar dropdowns (`z-[70]`) are always above the side panels, and nothing inside a panel
     (its collapsed strip included) may create a higher layer (principles §4) — the overlap is a bug.

- **O12 (2026-11-22). Follow-ups from the fourth implementation round** (built with the reading given):
  1. Panels (`progress/panels-followups.md`): T4 says the inspector strip mirrors the explorer's "with the
     expand button on the side facing the map", but the explorer strip has its button at the screen edge.
     Built as written (inspector button faces the map), so the strips are not exact mirrors. Move the
     inspector's button to its right end, or the explorer's to face the map? The O11 z-order overlap could
     not be reproduced with the collapsed strip (it sits in the panels' `z-[60]` layer); the screenshot
     may show the view switcher's mode-bar handle (`z-[70]`) drawn over the top of the compare chip's
     dropdown — which of the two `z-[70]` layers wins?
  2. Window controls (`progress/window-controls.md`): when the system leaves a button out (KDE without
     minimize), should ours hide it too? (Now all three show, the missing ones after the named ones.) When
     the system puts the buttons on the left (GNOME `close:`, KDE `ButtonsOnLeft`), should ours move to the
     left end? (Now always right; only the order follows the system.) Should "Reset global settings" also
     switch "Use CodeCharta's title bar" off (it lives in the shell's file, not the store)? The Linux
     right-click menu is opened by the page, because the shell's `system-context-menu` point is offset by
     the window shadow on Linux.
  3. Projects and snapshots (`progress/projects-snapshots-followups.md`): P12's missing-folder alert sits
     in a small modal (there is no file to show), not in the full-screen source view — or should the source
     view open with only the alert? A working-tree analysis made on an older HEAD shows "not at <its sha>"
     — intended wording?
  4. Rename-aware delta (`progress/06-m6-rename-aware-delta-plan.md`, owner decision: option 1, "changed"
     colour): a folder whose only file was renamed away stays as an empty removed folder — hide it? After
     Swap the renamed file is drawn at its old (base) path, because the delta shows the comparison side's
     paths — acceptable? A renamed file without metric changes looks unchanged on the map; only the Changes
     list and the inspector line name the rename — enough?

- **O13 (2026-11-22). Follow-ups from the compact metrics bar** (`progress/02-compact-metrics-bar.md`,
  built with the reading given). O12 item 1's strip question no longer applies: the collapsed inspector
  strip is removed with the give-way.
  1. Height: the full bar is about 96 px tall in the app, the compact bar 72 px (two 28 px rows), so
     switching moves the bar's top edge by about 24 px, against "so the map does not jump". Make the
     compact rows taller?
  2. Linked Height and Color: the full bar disables the Color metric chooser while linked but keeps its
     settings button. The compact Color button therefore opens Color settings directly while linked
     (disabling it would leave the colour settings unreachable). Acceptable?
  3. View tools in the compact bar keep their native `title` tooltip, not the daisyUI one, because
     `cc-bar-tool` is shared with the domain and dependency bars that stay unchanged. Give them the
     daisyUI tooltip in the compact bar only?
  4. Scenarios tooltip: built as "Scenarios · 7 available" (the spec's example), while the card reads
     "7 scenarios available". Which wording?
  5. With both panels open in a 1600 px window the full bar's "AREA" label truncates to "A…" (it did before
     this change too). Wanted, or should labels keep priority over metric names?

- **O14 (2026-11-22). Follow-ups from the nav bar and metrics bar fit** (`progress/02-05-nav-and-bar-fit.md`,
  built with the reading given). The equal 74 px height answers O13.1.
  1. Compare chip at 1024 px: logo, divider, icon-only project menu, icon-only W1 and a labels-only chip
     with `min-w-10` labels overflow by about 15 px, so the labels-only chip lets its labels shrink to
     `min-w-8` with `gap-1 px-2`. Acceptable, or should something else give way (e.g. the arrow)?
  2. The measured full-bar minimum is about 800 px with the sample map (mock-up: 732), because the app keeps
     `px-3` on cells and `gap-1` on the shell, so the bar turns compact earlier. Reduce card padding or the
     shell gap?
  3. To fit 74 px, the labels/scenarios cell lost its separator line and its scenario count shortens
     ("7 scenarios availa…"). OK?
  4. Should the domain and dependency bars also get the 12-character name minimum and the 74 px height?
  5. While dragging the window narrower, the 200 ms width transition can put a nav bar trigger up to about
     8 px under the view tabs until it settles. OK, or narrow instantly and animate only widening?
  6. W1's `aria-label` no longer says "map shows <sha>" (still in the title and dropdown). Bring it back?
