# 05 — Analyses and snapshots: interface design

Plan: `05-commit-analysis-and-snapshots.md` ("Renderer: state and flow", "Notice wording", "UI
placement", "Badge provider", M4–M7). Builds on `03-projects.md` (P2 folder selector, P3 home).
Principles: `00-design-principles.md`. Desktop only.

## Elements

| # | Element | Selector | Lives in | Modelled on |
|---|---|---|---|---|
| S1 | Snapshot status on the folder selector (replaces the separate chip) | part of `cc-project-folder-selector` | nav bar map slot | `badge` on a ghost button |
| S2 | Stale notice | `cc-snapshot-notice` | `views/codeCharta.component.html`, under the nav bar | `alert` (toast look, but persistent) |
| S3 | Analysis jobs indicator and list | `cc-analysis-jobs-indicator` | `navbar-end`, first child | `cc-settings-button` + `cc-settings-popover-shell` |
| S4 | Snapshots dialog | `cc-snapshots-dialog` | hosted by the nav bar | `scenarioListDialog` |
| S5 | Analyse actions | buttons and menu items | History, P2, P3, S2, S4 | `cc-context-menu-item`, `btn btn-sm` |
| S6 | Preflight problems | inline list | S2 or the dialog that started the run | cluster-explorer `alert` |
| S7 | Batch analysis dialog | `cc-batch-analysis-dialog` | hosted by S4 / History | `saveScenarioDialog` |
| S8 | Clean-up dialog | `cc-cleanup-dialog` | hosted by S4 | `scenarioListDialog` + `deleteConfirmDialog` |
| S9 | Analysis log dialog | `cc-analysis-log-dialog` | hosted by S3 / S4 | `cc-source-viewer` text |
| S10 | History markers and commit actions | `ANALYSED_COMMITS`, `COMMIT_ACTIONS` providers | area 04 H8, H9, H10 | — |

## What the map follows (target)

The design pins down when the map changes, because the plan's flow loads a map whenever the History
selection changes (see Deviations 1):

| The user… | Target becomes | Map |
|---|---|---|
| opens a project | the commit of the restored shown snapshot (plan 03), or "current checkout" when the folder has no remembered snapshot | restored snapshot; no notice unless the target has none |
| uses "Show in map" on a commit (History details, primary commit action, Enter / double-click) | that commit | its exact or nearest snapshot; navigates to the metrics view |
| uses "Show in map" on "Uncommitted changes", or "Show current checkout" (S1) | current checkout (working tree) | its snapshot, else nearest of HEAD |
| clicks Open on a snapshot (S4) | that snapshot's commit (or the snapshot itself for imports and working-tree snapshots) | that snapshot exactly |
| switches branch, commits, pulls (History) | unchanged; if it is "current checkout" it re-resolves against the new HEAD | nearest for the new HEAD, never analysed automatically |
| selects commits in the History list | unchanged | unchanged; the details pane shows what *would* be shown (S10) |

---

## S1 Snapshot status on the folder selector

Area 03 P2 is the single nav-bar control for the shown snapshot (area 03 deviation 1). Area 05 adds:

**Trigger badge** after the display name, `badge badge-sm` + text, from `noticeText(state).chip`:

| Chip | Badge |
|---|---|
| `stale by N` | `badge-warning` "stale by 4" |
| `ahead by N` | `badge-warning` "ahead by 2" |
| `diverged N↓ M↑` | `badge-warning` "diverged 3↓ 1↑" (with `fa-arrow-down`/`fa-arrow-up` icons, not Unicode) |
| `dirty` | `badge-warning` "uncommitted" |
| `imported` | `badge-ghost` "imported" |
| `not analysed` | `badge-ghost` "not analysed" |
| `analysing…` | `badge-info` with `loading loading-spinner loading-xs` "analysing" |
| `failed` | `badge-error` "analysis failed" |
| `·profile` suffix | `badge-ghost` "other profile" added as a second badge |
| none | no badge |

The badge never hides when the banner (S2) is dismissed. Below 1280 px the badge keeps only its
icon form: stale/ahead/diverged → `fa-clock-rotate-left`, failed → `fa-triangle-exclamation`, with the
full text in `title`.

**Target line** at the top of the P2 dropdown, above the folder rows:

```
Showing   9f8e7d6  Release 2.4.0                     stale by 4
For       a1b2c3d  Fix invoice rounding   (current checkout)
          [Show current checkout]  [▶ Analyse a1b2c3d]
──────────────────────────────────────────────────────────────
(folder rows as area 03 P2)
```

- `text-xs`, labels `text-base-content/60 w-16`, SHAs `font-mono`, subjects `truncate`.
- "Show current checkout" (`btn btn-ghost btn-xs`) only when the target is not already the current
  checkout. "Analyse <short>" (`btn btn-primary btn-xs`) only when the target has no exact snapshot;
  while a job runs it becomes the S2 progress row in small.
- Folder rows without snapshots get `btn btn-xs` "Analyse" (`fa-play`), title "Analyse the current
  checkout of <label>".

**Data.** `SnapshotViewService.state()` (`target`, `resolution`, `shown`, `pendingJob`, `status`),
`noticeText(state)`, `analyseSelected()`.

## S2 Stale notice

**Where.** `views/codeCharta.component.html`, after `<cc-nav-bar>`, rendered only while a map view
(metrics, domain, dependencies) is active — not on the project home, not in History (see Deviations 2).
Host `fixed left-1/2 -translate-x-1/2 top-[calc(var(--cc-bars-height)+1.75rem)] z-[65] w-max
max-w-[min(48rem,calc(100vw-2rem))]`: below the mode-bar handle (which sits at `top-full` of the nav
bar), above the side panels (`z-[60]`), under the opened mode bar (`z-[70]`).

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ ⚠  No analysis for a1b2c3d — showing 9f8e7d6 (Release 2.4.0), stale by 4 commits.        │
│                                                   [▶ Analyse a1b2c3d now]  [✕]           │
└──────────────────────────────────────────────────────────────────────────────────────────┘
running:
│ ⓘ  Analysing a1b2c3d… 42 %   [██████░░░░░░░░]                          [■ Cancel]         │
failed:
│ ✖  Analysis of a1b2c3d failed: Java 21 is too old. CodeCharta needs Java 22 or newer.     │
│    Open desktop tools to pick another Java.        [Show log] [Retry]  [✕]                │
```

- `alert alert-warning` (stale, ahead, diverged, none), `alert-info` (running, profile-only), `alert-error`
  (failed, rejected) with `shadow-lg text-sm py-2`, `role="status"`, `aria-live="polite"`. Icon
  `fa-triangle-exclamation` / `fa-circle-info` / `fa-circle-xmark`.
- Text exactly as plan 05's "Notice wording" table (built by `noticeText`); SHAs `font-mono`, subjects
  in parentheses, plurals per principles §8. Additions this design makes:
  - "none" for a plain folder without analyses: "No analysis yet for '<folder>'." — action "Analyse
    now" (not dismissible, plan).
  - git unavailable: "Git is not available — showing the newest analysis." `alert-info`, dismissible,
    action "Open desktop tools".
  - commit not in the repository: "This commit is not in the local repository." `alert-warning`,
    dismissible, no action.
- Action button `btn btn-primary btn-sm`; dismiss `btn btn-ghost btn-sm btn-square fa-xmark`
  `aria-label` "Dismiss notice". Running: `progress progress-primary w-40` (no `value` when
  indeterminate), `btn btn-ghost btn-sm` "Cancel" (`fa-stop`).
- Failed: message + hint (second line, `text-xs`), "Show log" (S9), "Retry"; tool-related codes add
  "Open desktop tools". Rejected (preflight): S6 list inside the alert.
- Dismissal per plan (`folderId|targetKey|shownSnapshotId`, session only).
- Long subjects truncate at `max-w-64` inside the sentence; the whole sentence is in `title`.
- **Analysis finished for the target**: the notice disappears, the map switches (plan step 5), toast
  (success) "Showing the analysis of a1b2c3d". Finished for another target: toast "Analysis of a1b2c3d
  finished" with no switch.
- Keyboard: the notice is not focus-trapping; Tab reaches its buttons after the nav bar. No shortcut.

## S3 Analysis jobs indicator

**Where.** `navbar-end`, first child, before the theme toggle. Absent without jobs.

```
[⟳ 2]        running or queued (loading-spinner loading-xs + count)
[✓]          only finished jobs left (fa-check text-success), until "Clear finished"
[✖ 1]        a failed job not yet cleared (fa-circle-xmark text-error)
```

`btn btn-ghost btn-sm`, `title`/`aria-label` "2 analyses running" / "1 analysis failed" /
"Analyses finished". Opens a popover (`cc-settings-popover-shell`, anchored under the button,
`w-96`):

```
ANALYSES                                              [Clear finished]
⟳ billing-api  a1b2c3d  Fix invoice rounding    42 %  [■]
   [██████░░░░░░░░]
… billing-api  working tree                  queued   [■]
✓ billing-web  9f8e7d6  Release 2.4.0     1 min 12 s  [Open]
✖ billing-api  3c4d5e6  Old commit                     [Show log] [Retry]
   Java 21 is too old. CodeCharta needs Java 22 or newer.
── batch: last 20 commits of main (7 of 20 done)      [Cancel batch]
```

- Rows `py-1 border-b border-base-300`, folder label `font-medium`, target (`font-mono` short SHA
  or "working tree"), subject `truncate`, state at the right: percentage `tabular-nums`, "queued",
  duration, or the error message (`text-error text-xs`, hint below `text-base-content/60`).
- Icon buttons `btn btn-ghost btn-xs btn-square`: Cancel `fa-stop` ("Cancel this analysis"), with
  labels for Open / Show log / Retry.
- Batches group their jobs under a collapsible line (`collapse collapse-arrow`) with progress "7 of
  20 done" and "Cancel batch".
- Empty after clearing: popover closes and the button disappears.
- Many jobs: list `max-h-96 overflow-y-auto`.
- Keyboard: Enter/Space on the button toggles the popover; Escape closes it (native popover).

**Data.** `AnalysisJobsService.jobs()`; `analysis.cancel`, `analysis.cancelBatch`,
`analysis.clearFinished`, `analysis.enqueue` (Retry), `SnapshotViewService.open(ref)`.

## S4 Snapshots dialog

**Where.** Native `<dialog class="modal">`, `modal-box max-w-3xl`, hosted by `navBar.component.html`
next to the export dialog host. Opened from P2 "Snapshots…" and P6 "Snapshots…" (area 03). Built in plan
03 M6 with the columns marked *(03)*, extended in plan 05 M4 (area 03 deviation 2).

```
┌ Snapshots — billing ──────────────────────────────────────────────────────────────────────┐
│ [▶ Analyse current checkout] [▶ Analyse HEAD commit] [Analyse several…]       folder: [All ▾] │
│                                                                                            │
│ ▾ billing-api  (12)                                                                        │
│   COMMIT                         COMMIT DATE    ANALYSED AT      PROFILE   SIZE    FLAGS     │
│   a1b2c3d Fix invoice rounding   3 Nov 14:03    3 Nov 14:10      2f9c…     4.2 MB  ●shown    │
│                                            [Open] [Re-analyse] [Show log] [🗑]              │
│   working tree (on a1b2c3d)      —              4 Nov 09:12      2f9c…     4.3 MB  uncommitted│
│   9f8e7d6 Release 2.4.0          28 Oct         unknown (imported 1 Nov) unknown 3.9 MB imported│
│                                            [Open] [Move to folder…] [Bind to commit…] [🗑]  │
│ ▸ billing-web  (3)                                                                         │
│ ▾ Imported — analysis time unknown  (1)                                                    │
│   export-2024.cc.json  imported 12 Nov 2026          2.0 MB   [Open] [Move to folder…] [🗑]   │
│                                                                                            │
│ This project's analyses use 61.2 MB.                         [Clean up…]          [Close]  │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

- One `collapse collapse-arrow border border-base-300` per folder (scenario list pattern, but the
  header is `bg-base-200`, not `bg-primary`, because several open at once), count `badge badge-sm`.
  Active folder open by default.
- Rows are a CSS grid (`grid-cols-[minmax(0,1fr)_7rem_9rem_5rem_5rem_auto]`), `text-sm`, row hover
  `bg-base-200`; actions appear on hover/focus in a second line (narrow) or at the right (≥ `xl`).
  Column header `text-xs uppercase tracking-wide text-base-content/60`; header tooltip on "ANALYSED AT":
  "Imported snapshots are sorted by the time they were imported."
- Cells: commit `font-mono` + subject `truncate`; dates relative with absolute `title`; "unknown
  (imported <date>)" in `italic text-base-content/60`; profile = first 4 hex of `profileHash` +
  "…", `title` lists `without` / `exclude` / `extraArgs`; a profile other than the project's current
  one gets `badge badge-ghost badge-xs` "other profile"; size `tabular-nums`.
- Flags (`badge badge-xs`): `badge-primary` "shown" (in the map now), `badge-warning` "uncommitted"
  (dirty), `badge-ghost` "imported", `badge-ghost` "partial" with `title` listing `notInMap` ("Not in
  the map: svn history").
- Row actions: **Open** *(03)* → `SnapshotViewService.open(ref)` (closes the dialog, navigates to
  metrics); **Re-analyse** (analysed rows; enqueue with `force`); **Show log** (analysed rows; S9);
  **Move to folder…**, **Bind to commit…** *(03, imported rows)* → area 03 P9; **Delete** *(03)*
  `fa-trash` → confirmation.
- Header buttons (05): "Analyse current checkout", "Analyse HEAD commit" (git folders),
  "Analyse several…" (S7); they act on the folder chosen in the "folder" select at the right
  (`select select-sm`, defaults to the active folder; "All" only filters the list). Disabled with
  title for plain folders where they do not apply ("Not a git repository").
- Footer: "This project's analyses use 61.2 MB." (`snapshots.usage`), "Clean up…" (S8), "Close".
- **Delete confirmation** (deleteConfirmDialog pattern): title "Delete Analysis"; "Move the analysis
  of a1b2c3d (Fix invoice rounding) to the recycle bin?" (imported: "Move the imported snapshot
  'export-2024.cc.json' to the recycle bin? It can only be restored from the recycle bin.") Cancel /
  **Delete**. Deleting the shown snapshot keeps the map on screen (plan) and toasts "The analysis
  shown in the map was deleted; it stays visible until you open another."
- States: loading per folder (skeleton rows); folder with no snapshots `text-sm text-base-content/60`
  "No analyses yet." + "Analyse current checkout"; bridge error per folder `alert alert-error
  text-xs` + "Retry"; delete refused while running: toast (warning) "This analysis is still being
  written. Try again when it has finished."; many rows: dialog body `max-h-[70vh] overflow-y-auto`.
- Keyboard: initial focus on the first header button; rows are focusable (`tabindex="0"`) so their
  actions become visible on focus; Delete key on a focused row opens the delete confirmation.

**Data.** `SnapshotCatalogService.snapshots(folderId)` (`SnapshotEntry[]`), `snapshots.usage`,
`snapshots.delete`, `snapshots.readLog`, `analysis.enqueue`, `ProjectsService.activeProject()`.

## S5 Analyse actions (all entry points)

| Where | Label | Icon | Hint / title | Runs |
|---|---|---|---|---|
| History commit menu (contributed) | Analyse This Commit | `fa-play` | "Run ccsh on this commit in a temporary worktree" | enqueue commit; offered only for unanalysed commits |
| History commit menu | Analyse the Last Commits from Here… | `fa-layer-group` | "Analyse several commits of this line" | S7 prefilled with this commit as tip |
| History "Uncommitted changes" menu | Analyse Working Tree | `fa-play` | "Analyse the files as they are on disk now" | enqueue working tree |
| History details (H9) | "Show in map" (primary), "Analyse this commit" | `fa-map`, `fa-play` | — | see "What the map follows" |
| P2 target line | "Analyse <short>" | `fa-play` | "Analyse the commit the map should show" | `analyseSelected()` |
| P2 folder row without snapshots | "Analyse" | `fa-play` | "Analyse the current checkout of <label>" | enqueue working tree |
| P3 folder table | "Analyse" | `fa-play` | as above | enqueue working tree |
| S2 | "Analyse <short> now" / "Analyse current checkout" / "Analyse now" | `fa-play` | — | `analyseSelected()` |
| S4 header | as listed in S4 | `fa-play` | — | enqueue |

Every analyse action: on `AlreadyQueued` toast (info) "This analysis is already queued."; on
`AlreadyAnalysed` toast (info) "Already analysed" and the snapshot opens if it is the target; on
`Queued` the S3 indicator appears; on `Rejected` S6.

The primary commit action (Enter / double-click in H8) is "Show in map".

## S6 Preflight problems

Shown in the surface that started the run (S2 for the target, otherwise an `alert` at the top of the
dialog, or — for context-menu starts — inside the S3 popover, opened automatically). Layout:

```
✖ The analysis cannot start:
  • Java was not found.  Open desktop tools
  • 'billing-api' is not the root of its repository; git history metrics are skipped.   (warning)
```

`alert alert-error` when any problem has `severity: error`, else `alert-warning` with "Analyse anyway"
(only warnings). One bullet per `PreflightProblem` (`message`, `hint` as `text-xs` second line). Hint
links: tool problems → "Open desktop tools"; `worktree-failed` → copy block `git config --global
core.longpaths true`; `low-disk-space` → "Clean up…" (S8).

## S7 Batch analysis dialog

Native dialog, `modal-box max-w-md`, title "Analyse Several Commits".

```
Folder     billing-api
(•) The last [ 20 ] commits of [ main ▾ ]     ☑ Main line only (first parent)
( ) Every tag
──────────────────────────────────────────────
20 commits: 13 to analyse, 7 already analysed.
About 14 minutes (based on earlier analyses of this folder).
                                  [Cancel] [Analyse 13 commits]
```

- Count `input input-bordered input-sm w-20` (1–200; above 200 `text-error` "At most 200 commits per
  batch."); branch `select select-sm` of local branches (default: current; prefilled tip when opened
  from a commit: "the last [20] commits up to a1b2c3d").
- The summary line comes from a dry run (`analysis.enqueueBatch` with dry run), refreshed 300 ms
  after the inputs settle; while it runs `loading loading-dots loading-xs`. No estimate: "No
  estimate yet — this folder has no earlier analyses."
- Primary button names the count; disabled at 0 ("Nothing to analyse — all commits are analysed.").
- Preflight problems: S6 inside the dialog.
- After confirm: dialog closes, S3 opens its popover showing the batch.

## S8 Clean-up dialog

Native dialog, `modal-box max-w-xl`, title "Clean Up Analyses".

```
Keep  [ 50 ] newest commit analyses per folder
      [  3 ] newest working-tree analyses per folder
      ☑ Analyses of branch tips and tags
Always kept: the analysis shown in the map, imported snapshots.
──────────────────────────────────────────────
Moves 37 analyses (812 MB) to the recycle bin:
 ▸ billing-api — 30 analyses, 701 MB            (collapse, lists commit + date + size)
 ▸ billing-web — 7 analyses, 111 MB
                                 [Cancel] [Move 37 to recycle bin]
```

- Inputs refresh the plan (`snapshots.planPrune`) after 300 ms. Nothing to remove: "Nothing to clean
  up with these settings." and the primary button disabled.
- Primary `btn btn-error`; no second confirmation (the list *is* the confirmation, plan).
- Progress: button `loading`; result toast (success) "Moved 37 analyses (812 MB) to the recycle bin."
  Failure: `alert alert-error` in the dialog.

## S9 Analysis log dialog

Native dialog, `modal-box max-w-3xl`, title "Analysis Log — billing-api a1b2c3d". Body `<pre>` with
`font-mono text-xs whitespace-pre-wrap bg-base-200 rounded-md p-2 max-h-[60vh] overflow-auto`
(interpolation only). Footer: "Copy log" (`fa-regular fa-copy`, "Copied" for 2 s), "Close". Loading:
skeleton; unreadable: "The log could not be read: <message>". Log of a failed job before any
snapshot exists: see Deviations 4.

## S10 History markers and commit actions

Area 04 H8's analysed column and H9's actions, filled by this area's providers:

| Marker | Icon | `title` |
|---|---|---|
| analysed | `fa-cube text-success` | "Analysed 3 Nov 14:10" (+ " — other profile" / " — imported map, analysis time unknown") |
| running | `loading-spinner loading-xs text-info` | "Analysis running — 42 %" / "Analysis queued" |
| failed | `fa-triangle-exclamation text-error` | "Analysis failed: <message>" |
| in the map now | `ring-1 ring-primary rounded-sm` around the icon | adds "\nShown in the map" |

H9 details pane, one commit selected, adds under the SHA line a resolution line (cheap
`snapshots.resolveForCommit`, no map load):

- exact: `fa-cube text-success` "Analysed" + **Show in map**;
- nearest: `fa-clock-rotate-left text-warning` "Not analysed — nearest is 9f8e7d6, 4 commits older" +
  **Show in map** (shows the nearest, with S2) + **Analyse this commit**;
- none: "Not analysed" + **Analyse this commit**.

---

## Deviations from the plan

1. **Selecting a commit does not load a map.** Plan 05's flow resolves *and loads* on every change of
   the History selection. Arrow-keying through the commit list would load and drop a map per row (a
   large map takes seconds and GBs). Design: selection resolves only (details pane, S10); the map
   changes on an explicit "Show in map" (primary commit action, Enter / double-click) or Open in S4.
   The owner rule "selecting an unanalysed commit never starts an analysis" still holds. See "What the
   map follows".
2. **The notice shows over the map views only.** Plan mounts it in the shell for every route; over
   History it would cover the toolbar, and on the project home there is no map to be stale.
3. **No separate snapshot chip** (`cc-snapshot-chip`): its content is S1 on the folder selector (area
   03 deviation 1). Clicking the chip opened the snapshots dialog; that is P2's "Snapshots…".
4. **Log of a failed job.** `snapshots.readLog` takes a `SnapshotRef`, but a failed job has no
   snapshot. Data need: `analysis.readLog { jobId }` reading `.failed-<jobId>/run.log` (the plan
   already keeps that file). Until it exists, "Show log" is offered only for snapshots.
5. **Notice position** `top + 1.75rem`, `z-[65]` instead of `top + 0.5rem`, `z-[70]`: the plan's
   position covers the view-switcher's mode-bar handle and would sit above the opened mode bar.
6. **Snapshots dialog is shared with plan 03** (area 03 deviation 2) and gets a folder select for its
   header actions, which the plan leaves unspecified.

## Proposed changes to existing UI (not assumed approved)

None beyond area 03's.
