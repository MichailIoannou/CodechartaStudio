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

## From orchestration

(The orchestrator appends questions here.)
