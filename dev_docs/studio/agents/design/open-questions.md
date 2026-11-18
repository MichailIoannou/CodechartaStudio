# Open questions for the owner

Each question has a recommended default. The design files already follow the default; an owner
answer that differs means the named file is changed, nothing else.

## Area 03 — projects

1. **One nav-bar control for folders and snapshot status?** Plans 03 and 05 each add a nav-bar control
   naming the shown snapshot. *Default:* one control (`03-projects.md` P2) carrying the staleness
   badge; the snapshots dialog opens from its "Snapshots…" button.
2. **Explicit active folder.** History, "Analyse" and the stale notice act on one folder. *Default:*
   the user picks it ("Make active" in P2, the folder select in History); it is remembered per
   project. Alternative: always the first shown folder (plan 03's rule), which hides History for
   folders without analyses.
3. **How many folders side by side?** (plan 03 open question 2) *Default:* no limit, no warning.

## Area 04 — history

4. **Confirm a branch switch?** Plan 04 words a confirmation for every switch. *Default:* only when
   the working tree has changes; a clean switch happens at once, as in Rider and VS Code.
5. **Where do git failures show?** *Default:* an error notice inside the History view with a
   "Details" disclosure (toasts close after 5 s and cannot hold buttons); successes stay toasts.

## Area 05 — snapshots

6. **Does selecting a commit in History change the map?** Plan 05 loads the nearest snapshot on every
   selection change. *Default:* no — selection only shows the analysis status in the details pane;
   "Show in map" (Enter / double-click) changes the map. Keeps arrow-key browsing fast with large maps.
7. **Stale notice in History?** *Default:* the banner shows over the map views only; History shows the
   same facts per commit in its details pane.

## Area 06 — compare

8. **A "Compare" button in the nav bar?** Plan 06 adds one. *Default:* no; the existing Compare tab in
   the metric view's mode bar opens the compare dialog in project mode, and History offers compare on
   commits and branches. Add the button only if the hover mode bar proves too hidden.

## From orchestration

(The orchestrator appends questions here.)
