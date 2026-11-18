# 05 — Analyses and snapshots: interface design

Plan: `05-commit-analysis-and-snapshots.md` ("Renderer: state and flow", "Notice wording", "UI
placement", "Badge provider", M4–M7). Builds on `03-projects.md` (P1 project menu, P3 overview) and `owner-decisions.md` (OD1, OD2).
Principles: `00-design-principles.md`. Desktop only.

## Elements

| # | Element | Selector | Lives in | Modelled on |
|---|---|---|---|---|
| W1 | Workspace status: branch, map status, analyses and git activity, progress fill | `cc-workspace-status` | nav bar map slot | `cc-map-selector` trigger and dropdown |
| S2 | Stale notice, a persistent toast | `cc-snapshot-notice` | first item of the toast stack, top right | `cc-toast` alert |
| S3 | (merged into W1) | — | — | — |
| S4 | Snapshots dialog | `cc-snapshots-dialog` | hosted by the nav bar | `scenarioListDialog` |
| S5 | Analyse actions | buttons and menu items | History, W1, P3, S2, S4 | `cc-context-menu-item`, `btn btn-sm` |
| S6 | Preflight problems | inline list | S2 or the dialog that started the run | cluster-explorer `alert` |
| S7 | Batch analysis dialog | `cc-batch-analysis-dialog` | hosted by S4 / History | `saveScenarioDialog` |
| S8 | Clean-up dialog | `cc-cleanup-dialog` | hosted by S4 | `scenarioListDialog` + `deleteConfirmDialog` |
| S9 | Analysis log dialog | `cc-analysis-log-dialog` | hosted by W1 / S4 | `cc-source-viewer` text |
| S10 | History markers and commit actions | `ANALYSED_COMMITS`, `COMMIT_ACTIONS` providers | area 04 H8, H9, H10 | — |

## What the map follows (target)

The design pins down when the map changes, because the plan's flow loads a map whenever the History
selection changes (see Deviations 1):

| The user… | Target becomes | Map |
|---|---|---|
| opens a project | the commit of the restored shown snapshot (plan 03), or "current checkout" when the folder has no remembered snapshot | restored snapshot; no notice unless the target has none |
| uses "Show in map" on a commit (History details, primary commit action, Enter / double-click) | that commit | its exact or nearest snapshot; navigates to the metrics view |
| picks a commit with "Show commit…" (W1) on the map screen | that commit | as "Show in map", without leaving the map |
| uses "Show in map" on "Uncommitted changes", or "Show current checkout" (W1) | current checkout (working tree) | its snapshot, else nearest of HEAD |
| clicks Open on a snapshot (S4) | that snapshot's commit (or the snapshot itself for imports and working-tree snapshots) | that snapshot exactly |
| switches branch, commits, pulls (History) | unchanged; if it is "current checkout" it re-resolves against the new HEAD | nearest for the new HEAD, never analysed automatically |
| selects commits in the History list | unchanged | unchanged; the details pane shows what *would* be shown (S10) |

---

## W1 Workspace status

One nav-bar element for the working folder (owner decisions OD1, OD2). It replaces plan 03's folder
selector, plan 04's branch chip, plan 05's snapshot chip and plan 05's analyses indicator. It looks
like today's map selector (a ghost dropdown trigger) and lives in a new feature
`features/workspaceStatus` (depends on `projects`, `snapshots`, `gitHistory`; nothing depends on it
except `navBar`).

**Where.** Nav bar map slot, right after the project menu (principles §3). During a project
comparison the comparison chip (area 06 C2) takes the slot and W1 shrinks to its icon-only form in
front of it, so activity and progress stay visible.

### Trigger

```
idle, analysed:        [⎇ feature/invoice-rounding  @ 9f8e7d6                      ▾]
idle, stale:           [⎇ feature/invoice-rounding  @ 9f8e7d6  (stale by 4)        ▾]
ahead/behind (≥1536):  [⎇ feature/invoice-rounding ↑2 ↓1  @ 9f8e7d6               ▾]
analysing, 42 %:       [◌ feature/invoice-rounding  Analysing · 42 %               ▾]   fill 42 %
analysing, no %:       [◌ feature/invoice-rounding  Analysing…                     ▾]   sweeping band
pulling:               [↓ feature/invoice-rounding  Pulling · 45 %                 ▾]   fill 45 %
just finished:         [✓ feature/invoice-rounding  @ a1b2c3d                      ▾]   success tint, 1.5 s
failed:                [⚠ feature/invoice-rounding  Analysis failed               ▾]   error tint until opened
plain folder:          [📁 out  snapshot from 3 Nov                                ▾]
imported, unbound:     [📥 out  imported · analysis time unknown                    ▾]
not analysed:          [⎇ main  (not analysed)                                     ▾]
detached HEAD:         [⎇ detached at a1b2c3d  @ 9f8e7d6                           ▾]
```

- **Fixed width** (owner decision OD2a): `btn btn-ghost btn-sm relative overflow-hidden isolate` with a
  **fixed `w-*` per window width** (principles §3), never `max-w` or content width. Nothing that happens
  (an analysis starting, a percentage counting up, a badge appearing, a long branch name) changes the
  element's size or moves its neighbours; only how many characters of the text fit before "…" changes.
  Inside, a CSS grid `grid-cols-[1rem_minmax(0,1fr)_auto_auto] items-center gap-2` keeps every part in
  its place. Children, all `relative z-10` above the fill:
  1. **Activity icon** in a fixed `size-4 grid place-items-center` slot: every icon and the spinner
     are drawn at that size (`loading-xs` is 1 rem; Font Awesome icons `fa-fw text-[0.875rem]`), so
     switching from the branch icon to a spinner or an arrow never moves the text. Idle `fa-code-branch` (git) / `fa-folder` (plain) /
     `fa-file-import` (imported unbound); analysing `loading loading-spinner loading-xs`; fetching
     `fa-cloud-arrow-down`, pulling `fa-arrow-down`, pushing `fa-arrow-up`, each with
     `motion-safe:animate-pulse`; finished `fa-check text-success`; failed `fa-triangle-exclamation
     text-error`.
  2. **Text column** (`minmax(0,1fr)`, `flex min-w-0 gap-2`): **branch** `font-medium truncate
     shrink` (gives way first), then the map part. Ahead/behind `text-xs
     tabular-nums` with `fa-arrow-up`/`fa-arrow-down` icons only at ≥ 1536 px; a dirty dot
     (`size-2 rounded-full bg-warning`, `title` "3 uncommitted changes") after the branch.
  3. **Map part** `text-base-content/70 truncate`: `@ <short>` (`font-mono`) of the analysis in the map,
     or the activity text while something runs, kept short so the branch stays readable ("Analysing ·
     42 %", "Fetching…", "Pulling · 45 %", "Pushing…", "Analysis failed", "Pull failed"); which commit
     is being analysed is in the `title` and the dropdown. The percentage sits in its own
     `tabular-nums w-[4.5ch] text-right` span so counting up never shifts the text.
  4. **Status badge** (one, highest priority first): failed (`badge-error` "failed"), stale / ahead /
     diverged / uncommitted-analysis (`badge-warning`, texts as `noticeText().chip`), imported
     (`badge-ghost`), not analysed (`badge-ghost`), other profile (`badge-ghost` "other profile"). Badges
     follow the never-cut-off rule (principles §5).
  5. `fa fa-caret-down`.
- **Progress fill** (OD2): a `span` `absolute inset-y-0 left-0 z-0 pointer-events-none
  bg-primary/20 transition-[width] duration-300 ease-out` whose `width` is the progress percent.
  - Determinate: from `analysis.progress` `Determinate { percent }` or `git.operationProgress`
    `done/total` (×100).
  - Indeterminate (no percent reported, or `Indeterminate`): a band `w-1/3 bg-primary/20` sweeping
    left→right, `motion-safe:animate-progress-sweep` (new token in `app/tailwind.css` `@theme`:
    `--animate-progress-sweep: progress-sweep 1.4s ease-in-out infinite`, keyframes
    `translateX(-100%) → translateX(300%)`). With `prefers-reduced-motion` the band is a static full-
    width `bg-primary/10`.
  - Finished: the fill runs to 100 %, the background turns `bg-success/15` for 1.5 s, then clears.
  - Failed: background `bg-error/15` until the user opens the dropdown.
  - Two things at once (an analysis and a git operation): the trigger shows the git operation (the
    user is waiting for it); a `badge badge-ghost badge-xs` "+1" says something else runs.
- **Accessibility.** The trigger keeps `aria-haspopup="menu"` and an `aria-label` built from its parts
  ("Branch feature/invoice-rounding, map shows 9f8e7d6, stale by 4 commits, analysing a1b2c3d 42
  percent"). A visually hidden `role="progressbar"` with `aria-valuenow` (omitted when indeterminate)
  and `aria-label` "Analysis of a1b2c3d" sits inside; the trigger does not announce every percent
  (`aria-live` stays on the toast and S2 only).
- `title` (multi-line): "Working folder billing-api (C:\work\billing-api)\nBranch feature/x, 2 to
  push, 1 to pull, 3 uncommitted\nMap shows 9f8e7d6 Release 2.4.0, 4 commits behind the current
  checkout\nAnalysing a1b2c3d — 42 %".
- Narrow: the fixed width steps down with the window (principles §3); at 1024–1279 px the branch
  hides (icon, map part, badge stay; the branch is in the title).

### Dropdown

Map-selector content classes, `w-[28rem] max-w-[32rem] p-2`, three sections in the explorer header
style:

```
MAP
Showing    9f8e7d6  Release 2.4.0                      stale by 4
Asked for  a1b2c3d  Fix invoice rounding  (current checkout)
           [Show commit…] [Show current checkout] [▶ Analyse a1b2c3d] [Snapshots…]
────────────────────────────────────────────────────────────
GIT · billing-api
⎇ feature/invoice-rounding → origin/feature/invoice-rounding     ↑2 ↓1
3 uncommitted changes (1 staged)
[↓ Pull 1 | ▾]                                      [Open History]
────────────────────────────────────────────────────────────
ACTIVITY                                              [Clear finished]
◌ Analysing a1b2c3d  Fix invoice rounding          42 %   [■]
   [██████░░░░░░░░]
… Queued: working tree                                    [■]
✓ Analysed 9f8e7d6 · 1 min 12 s                       [Open]
✖ Analysis of 3c4d5e6 failed: Java 21 is too old.   [Show log] [Retry]
── batch: last 20 commits of main (7 of 20 done)        [Cancel batch]
────────────────────────────────────────────────────────────
[ⓘ Project overview]
```

- **MAP**: the target lines and buttons (labels `text-base-content/60 w-20`, SHAs `font-mono`,
  subjects `truncate`):
  - **"Show commit…"** (`btn btn-ghost btn-xs`, `fa-code-branch`) picks a commit without visiting
    History: it opens the ref picker (area 06 C4, owned by `features/gitHistory`) in a popover beside
    the dropdown. Branches, tags and commits are listed with their analysis state; picking one sets the
    target exactly as "Show in map" in History does. Placeholder "Branch, tag or commit"; `aria-label`
    "Show a commit in the map". Absent for plain folders.
  - "Show current checkout" only when the target is not already the current checkout.
  - "Analyse <short>" (`btn btn-primary btn-xs`) only when the target has no exact snapshot; while its
    job runs it is replaced by the job's ACTIVITY row.
  - "Snapshots…" opens S4.
- **GIT** (git folders only; plain folder: "Plain folder — no git history."): branch → upstream with
  ahead/behind, uncommitted summary, the contextual sync button (`04-history.md` H5, same component),
  "Open History" `btn btn-ghost btn-xs`. Problems (git missing, not a repository) show the area 04
  sentence instead.
- **ACTIVITY** (only when jobs or a git operation exist; was plan 05's jobs popover; this is the one
  place besides the trigger that shows per-job progress bars, because the trigger shows only one
  thing at a time): one row per git
  operation and analysis job — icon, text, state at the right (percent `tabular-nums`, "queued",
  duration, or error `text-error text-xs` with the hint below in `text-base-content/60`), a
  `progress progress-primary` bar under running rows, buttons Cancel (`fa-stop`, "Cancel this
  analysis" / "Cancel the pull"), Open, Show log (S9), Retry. Batches group under a collapsible line
  with "7 of 20 done" and "Cancel batch". "Clear finished" in the header. Many rows: section
  `max-h-60 overflow-y-auto`.
- Footer: `btn btn-ghost btn-sm` "Project overview" (`fa-circle-info`) → area 03 P3.

**States.**

| State | Trigger | Dropdown |
|---|---|---|
| no project | element absent | — |
| project, working folder without analyses | `⎇ main (not analysed)` | MAP: "No analysis yet." + "Analyse current checkout" (`btn-primary`) |
| git unavailable | icon `fa-triangle-exclamation text-warning`, folder label instead of branch | GIT: the area 04 problem sentence + "Open desktop tools" |
| loading git status | branch replaced by `skeleton h-3 w-24` | GIT section skeleton |
| core not running | icon `fa-plug-circle-xmark text-error`, "Core not running" | only "Restart core" (area 01 D4) |

**Keyboard.** As the map selector: Enter / Space / ArrowDown open; Tab moves through the section
buttons; Escape closes and refocuses the trigger. While open, the ref picker popover traps nothing:
Escape closes it first, a second Escape the dropdown.

**Data.** `ProjectsService.workingFolder()`; `GitRepositoryService.status()` (head, upstream,
counts, operationInProgress), `refs()`; `GitOperationService` (running operation, last
`git.operationProgress`); `SnapshotViewService.state()` and `noticeText`; `AnalysisJobsService.jobs()`
and `analysis.progress`; `analysis.cancel`, `analysis.cancelBatch`, `analysis.clearFinished`,
`analysis.enqueue`, `core.cancel`.

## S2 Stale notice (persistent toast)

**Where.** The stale notice is a **persistent toast** (owner decision OD9): it lives in the toast stack
at the top right, just below the nav bar (principles §3 "Toasts"), always as the **first** item, so
every ordinary toast appears below it. It does not close by itself.

Mechanism: the toast container gets a slot for persistent items. `views/codeCharta.component.html`
composes the two features, so neither depends on the other:

```html
<cc-toast>
    <cc-snapshot-notice persistent />   <!-- projected first; rendered only over a map view -->
</cc-toast>
```

`toast.component.html` adds `<ng-content />` as the first child of its `<output class="toast toast-top
toast-end …">`, before the `@for` over `messages()`. The notice renders only while a map view
(metrics, domain, dependencies) is active — not on the project overview, not in History (see
Deviations 2) — and only while there is something to say.

```
                                                ┌──────────────────────────────────────────┐
  nav bar ......................................│ ⚠ No analysis for a1b2c3d — showing      │ ← persistent, first
                                                │   9f8e7d6 (Release 2.4.0), stale by 4    │
                                                │   commits.                               │
                                                │                [▶ Analyse a1b2c3d now] ✕ │
                                                └──────────────────────────────────────────┘
                                                ┌──────────────────────────────────────────┐
                                                │ ✓ Pushed 2 commits to origin/feature/x ✕ │ ← ordinary toast, 5 s
                                                └──────────────────────────────────────────┘
running:   ⓘ Analysing a1b2c3d… (progress in the status at the top)            [■ Cancel]
failed:    ✖ Analysis of a1b2c3d failed: Java 21 is too old. CodeCharta needs Java 22 or newer.
             Open desktop tools to pick another Java.        [Show log] [Retry]  ✕
```

- Same shape as a toast: `alert shadow-lg text-sm w-96 max-w-[calc(100vw-2rem)]`, text wraps,
  actions on their own line right-aligned (`flex justify-end gap-2`). Tone: `alert-warning` (stale,
  ahead, diverged, none), `alert-info` (running, profile-only), `alert-error` (failed, rejected). Icon
  `fa-triangle-exclamation` / `fa-circle-info` / `fa-circle-xmark`. `role="status"`; the toast
  container's `aria-live="polite"` announces changes.
- Text exactly as plan 05's "Notice wording" table (built by `noticeText`); SHAs `font-mono`, subjects
  in parentheses, plurals per principles §8. Additions this design makes:
  - "none" for a plain folder without analyses: "No analysis yet for '<folder>'." — action "Analyse
    now" (not dismissible, plan).
  - git unavailable: "Git is not available — showing the newest analysis." `alert-info`, dismissible,
    action "Open desktop tools".
  - commit not in the repository: "This commit is not in the local repository." `alert-warning`,
    dismissible, no action.
- Action button `btn btn-primary btn-sm`; dismiss `btn btn-ghost btn-xs btn-square fa-xmark`
  `aria-label` "Dismiss notice" (same as ordinary toasts).
- **Running**: "Analysing a1b2c3d…" with `text-xs text-base-content/70` "Progress shows in the status
  at the top." and `btn btn-ghost btn-sm` "Cancel" (`fa-stop`). No progress bar and no spinner: only the
  workspace status animates (principles §5 "One place animates").
- Failed: message + hint (second line, `text-xs`), "Show log" (S9), "Retry"; tool-related codes add
  "Open desktop tools". Rejected (preflight): S6 list inside the toast.
- Dismissal per plan (`folderId|targetKey|shownSnapshotId`, session only); a different target or shown
  snapshot brings it back. The W1 badge never goes away.
- Long subjects are not truncated: the toast wraps (`break-words`); the toast never grows wider than
  `w-96`.
- **Analysis finished for the target**: the persistent toast disappears, the map switches (plan step
  5), ordinary toast (success) "Showing the analysis of a1b2c3d". Finished for another target: toast
  "Analysis of a1b2c3d finished" with no switch.
- Keyboard: not focus-trapping; reachable with Tab after the page content (toast container order).

## S3 (merged into W1)

The analyses indicator and its jobs list are W1's activity icon, progress fill and ACTIVITY
section (owner decision OD2).

## S4 Snapshots dialog

**Where.** Native `<dialog class="modal">`, `modal-box max-w-3xl`, hosted by `navBar.component.html`
next to the export dialog host. Opened from W1 "Snapshots…", P3 "Snapshots…" and P6 "Snapshots…" (area 03). Built in plan
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
| W1 MAP section | "Analyse <short>" | `fa-play` | "Analyse the commit the map should show" | `analyseSelected()` |
| P3 analyses card | "Analyse current checkout" | `fa-play` | "Analyse the files of <label> as they are now" | enqueue working tree |
| S2 | "Analyse <short> now" / "Analyse current checkout" / "Analyse now" | `fa-play` | — | `analyseSelected()` |
| S4 header | as listed in S4 | `fa-play` | — | enqueue |

Every analyse action: on `AlreadyQueued` toast (info) "This analysis is already queued."; on
`AlreadyAnalysed` toast (info) "Already analysed" and the snapshot opens if it is the target; on
`Queued` W1's icon and fill start; on `Rejected` S6.

The primary commit action (Enter / double-click in H8) is "Show in map".

## S6 Preflight problems

Shown in the surface that started the run (S2 for the target, otherwise an `alert` at the top of the
dialog, or — for context-menu starts — inside W1's ACTIVITY section, opened automatically). Layout:

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
- After confirm: dialog closes, W1 opens its dropdown showing the batch in ACTIVITY.

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

The markers are the worded badges of area 04 H8's "Analysis" column ("analysed", "in map",
"queued", "42 %", "failed"); this area supplies their state and `title` text from
`SnapshotCatalogService` and `AnalysisJobsService` (job state wins over snapshot state).

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
   History it would cover the toolbar, and on the project overview the analyses card says the same.
3. **One workspace status element (owner decision OD2).** Plan 05's `cc-snapshot-chip` and
   `cc-analysis-jobs-indicator` and plan 04's `cc-current-branch-chip` are one element, W1, with the
   activity in its icon and progress as its background fill. The snapshots dialog opens from its
   "Snapshots…".
4. **Log of a failed job.** `snapshots.readLog` takes a `SnapshotRef`, but a failed job has no
   snapshot. Data need: `analysis.readLog { jobId }` reading `.failed-<jobId>/run.log` (the plan
   already keeps that file). Until it exists, "Show log" is offered only for snapshots.
5. **The notice is a persistent toast (owner decision OD9)** instead of a banner centred under the
   nav bar: it sits first in the top-right toast stack, above every ordinary toast, and stays until
   dismissed or resolved.
6. **Snapshots dialog is shared with plan 03** (area 03 deviation 2) and gets a folder select for its
   header actions, which the plan leaves unspecified.

## Proposed changes to existing UI (not assumed approved)

None beyond area 03's.
