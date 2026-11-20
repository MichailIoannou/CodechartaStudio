# 06 — Compare commits, branches and PRs: interface design

Plan: `06-compare-commits-and-prs.md` (sections 4, 6, 7.5, 8, 9; milestones M2–M6).
Principles: `00-design-principles.md`. Desktop only; the web build's Explore / Compare and delta
selector stay as they are.

## Elements

| # | Element | Selector | Lives in | Modelled on |
|---|---|---|---|---|
| C1 | Entry points | existing Compare tab; History items; snapshot rows | mode bar, area 04, area 05 S4 | `cc-mode-toggle`, `cc-context-menu-item` |
| C2 | Comparison chip | `cc-comparison-chip` | nav bar map slot | `cc-delta-selector` |
| C3 | Compare dialog | `cc-compare-dialog` (host `cc-compare-host`) | hosted by the nav bar | `globalConfigurationDialog`, `explorerModeToggle` |
| C4 | Ref picker | `cc-ref-picker` | inside C3 | explorer search bar + map-selector rows |
| C5 | Preparation (missing analyses, size, profiles) | `cc-compare-preparation` | inside C3 | S6 problem list, S3 job rows |
| C6 | Resolve outcomes | messages inside C3 | C3 | cluster-explorer `alert` |
| C7 | Pull / merge request list | `cc-change-request-list` | C3 tab | `scenarioListDialog` rows |
| C8 | Changes explorer mode | `cc-changes-explorer` | explorer, mode "Changes" | `cc-cluster-explorer` |
| C9 | Legend caption | `cc-comparison-legend-caption` | `legendDeltaColorsSection` top | legend text rows |

---

## C1 Entry points

1. **Compare tab in the metric view's mode bar** (existing `cc-mode-toggle`, unchanged look). In
   desktop with a project open and no project comparison active, it opens C3 (plan 06 routes this
   through `FileSelectionModeService.toggle()`). During a project comparison, **Explore** leaves it
   (`CompareService.exit()`). With uploaded/sample maps it behaves as today. No new nav-bar button
   (see Deviations 1).
2. **History** (area 04, contributed `COMMIT_ACTIONS` and branch-menu items):

| Where | Item | Icon | Hint | Intent |
|---|---|---|---|---|
| two commits selected (H9 button, commit menu) | Compare | `fa-code-compare` | "Show what changed between the two commits" | `Commits` |
| commit menu | Compare with Parent | `fa-code-compare` | "Show what this commit changed" (disabled for a root commit: "This commit has no parent") | `WithParent` |
| commit menu | Compare with Current | `fa-code-compare` | "Compare with the commit the map shows" | `WithCurrent` |
| commit menu | Compare with… | `fa-code-compare` | "Choose the other side" | opens C3, head prefilled |
| branch menu | Compare with 'main' | `fa-code-compare` | "Show what 'feature/x' changes compared with 'main'" | `Branch` (target = current branch, or the default branch for the current branch) |
| "Uncommitted changes" menu | Compare with HEAD | `fa-code-compare` | "Compare the working-tree analysis with the last commit" (only when a working-tree snapshot exists) | `WorkingTree` side |

3. **Snapshots dialog** (area 05 S4) row items: "Compare with working tree" (commit rows, when a
   working-tree snapshot exists), "Compare with…" (imported and working-tree rows → C3 with that
   side prefilled).

Starting from the domain or dependency view: toast (info) "Compare runs in the metric view — the
domain and dependency views show a single map." Radial layout: toast (info) "Switched to the treemap
layout — the radial layouts show a single map."

## C2 Comparison chip

**Where.** Map slot (principles §3) while `CompareService.isActive()` or phase `noDifferences`, after
the icon-only form of the workspace status element (area 05 W1), which keeps showing activity and
progress during a comparison.

```
[base  9f8e7d6 main ▾]  ⇄  [head  a1b2c3d feature/x]  stale by 2   #123 ↗   [▾]
       └ caret menu on the right, not on each side
noDifferences:
[≡ No metric differences between 9f8e7d6 and a1b2c3d]  12 files changed in git   [▾]
```

- Container `flex items-center gap-1 min-w-0`. Each side: `btn btn-ghost btn-sm min-w-0 max-w-48
  font-normal` showing `text-xs text-base-content/60` "base" / "head", short SHA `font-mono`, label
  (branch, tag, `#123`, "working tree", "imported 12 Nov" / "imported, date unknown") `truncate`.
  Clicking a side opens C3 prefilled ("Change…").
- Swap: `btn btn-ghost btn-sm btn-square` with today's `fa fa-arrows-h` and today's title "Switch
  reference and comparison file", as in the delta selector.
- Stale badge per side (`badge badge-warning badge-sm`) "stale by 2", `title` "No analysis for
  a1b2c3d. Showing 9f8e7d6, 2 commits older." (descendant/diverged forms as area 05 W1).
- PR badge: `badge badge-ghost badge-sm` `fa-code-pull-request` "#123" + `fa-arrow-up-right-from-square`;
  link to `changeRequest.url` (`target="_blank"`), `title` = PR title.
- Base mode, when the origin is branches/PR: `badge badge-ghost badge-xs` "since merge base" or "tip
  vs tip", title explains: "Changes on 'feature/x' since it left 'main'" / "Everything that differs
  between the two tips".
- Caret menu (`btn btn-ghost btn-sm btn-square fa-caret-down`, `aria-label` "Comparison actions",
  dropdown like the map selector): **Change…**, **Swap base and head**, **Copy as text** (toast "Copied
  main...feature/x"), **Leave compare** (`fa-xmark`).
- **Space priority** (implementation finding: at 1280 px the branch label truncated to nothing beside
  the stale and base-mode badges). The branch label keeps at least `min-w-16` (about six characters
  plus "…"); everything else gives way first, in this order:
  1. the base-mode badge leaves the chip and becomes the first, non-clickable line of the caret menu
     ("Since the merge base" / "Tip vs tip", with its explanation as `title`);
  2. the "base"/"head" captions hide (the order base ⇄ head and the swap button still say which is
     which; each side's `title` starts with "Base:" / "Head:");
  3. each stale badge shortens to `fa-clock-rotate-left` + the number ("⟲ 2"), full text in `title`;
  4. the PR badge shows only its icon.
  Breakpoints: steps 1 and 2 below 1536 px (`2xl`), step 3 below 1280 px, step 4 below 1024 px. At
  1536 px and above everything shows.
- Keyboard: Tab order base, swap, head, badges, caret. The chip has `role="group"`
  `aria-label="Comparison"`.

**Data.** `CompareState` (`base`, `head`: `LoadedSide { shownCommit, staleBy, … }`, `resolved.origin`,
`resolved.changeRequest`), `comparisonText.ts`, `CompareService.exit()`, `switchReferenceAndComparison`.

## C3 Compare dialog

Native dialog, `modal-box max-w-3xl`, title "Compare".

```
┌ Compare ──────────────────────────────────────────────────────────────────────────────┐
│ Folder  [billing-api ▾]   ☐ Compare with another folder                                │
│                                                                                        │
│ Base  [ main                                    ▾ ]   ⇄   Head [ feature/x            ▾ ] │
│       9f8e7d6 Release 2.4.0  ● analysed                    a1b2c3d Fix invoice…  ○ not analysed
│ ( • Since the merge base  ○ Tip vs tip )     only when base is a branch or tag         │
│                                                                                        │
│ [ Pull requests | Recent ]                                                             │
│ ┌ list (C7 or recent) ─────────────────────────────────────────────────────────────┐   │
│ └──────────────────────────────────────────────────────────────────────────────────┘   │
│ (C5 preparation / C6 outcome replaces the list while it applies)                       │
│                                                             [Cancel] [Compare]         │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Folder** `select select-sm` of the project's git folders (hidden when there is one). "Compare with
  another folder" (`checkbox checkbox-sm`) turns the row into "Base folder [▾] Head folder [▾]" and
  shows `text-xs text-base-content/60`: "Paths are matched as they are. A fork with a different
  layout shows files as removed and added. Without a clone that has both commits the comparison is
  tip vs tip and lists metric changes only."
- **Base / Head**: C4 pickers; under each, the resolved commit (`font-mono` + subject `truncate`) and
  an analysis dot: `fa-circle text-success` "analysed", `fa-circle-half-stroke text-warning` "nearest
  is 2 commits older", `fa-regular fa-circle text-base-content/50` "not analysed". The ⇄ button
  (`fa-arrows-left-right`, "Swap base and head") swaps the inputs.
- **Base mode**: two `radio radio-sm` labels "Since the merge base" (default) and "Tip vs tip",
  remembered per project; hidden when the base is a commit.
- **Lists**: segmented control (`join`, explorer-mode pattern) **Pull requests** · **Recent**. The PR
  segment is absent for folders without a detected or overridden host *and* without a remote.
  Recent: rows "main...feature/x" (`font-mono`), label, relative age; click fills both pickers;
  empty: "No comparisons yet."
- **Compare** `btn btn-primary`: disabled until both sides resolved ("Choose a base and a head");
  `loading` while `resolving` / `loading`. Pasting `a..b` or `a...b` into either picker fills both
  and sets the base mode (two dots = tip, three = merge base).
- Phases inside the dialog: `resolving` → button spinner; `needsDecision` / `analysing` → C5;
  stop statuses → C6; `loading` → button "Loading maps…"; `active` / `noDifferences` → dialog closes,
  map view shows the comparison; `failed` → `alert alert-error` above the footer with the
  `CompareError` sentence (table below) and the dialog stays.
- Keyboard: initial focus on Head when prefilled base, else Base; Ctrl+Enter = Compare; Escape =
  Cancel (also cancels resolving; an analysis batch keeps running and is visible in area 05 S3).

**Error sentences** (`CompareError.kind`):

| Kind | Sentence |
|---|---|
| `refNotFound` | "'<input>' is not a branch, tag or commit of '<folder>'." |
| `analysisFailed` | "The analysis of <short> failed: <message>" + "Use nearest" for that side, "Show log" |
| `analysisCancelled` | "The analysis was cancelled. Nothing was compared." |
| `loadFailed` | "The analyses could not be loaded: <message>" |
| `rootMismatch` | "The two analyses could not be aligned (different root folders). Showing the head alone." |
| `tooLarge` | (C5 block text) |
| `bridgeUnavailable`, `coreUnavailable` | "The CodeCharta core is not running." + "Retry" |
| hosting codes | as C7 empty states |

## C4 Ref picker

Shared component: it lives in `features/gitHistory` (the feature that owns refs), exported through
its facade, and is used here and by area 05 W1 ("Show commit…"). Dependencies stay one-way
(`compare → gitHistory`, `snapshots → gitHistory`).

Combobox: `input input-bordered input-sm w-full font-mono` with `role="combobox"`,
`aria-expanded`, `aria-controls`; result list in a dropdown (`z-[70]`, map-selector content classes,
`max-h-72`).

```
[ feat                                        ▾ ]
 BRANCHES
  ⎇ feature/invoice-rounding     a1b2c3d  Fix invoice rounding    ○
  ☁ origin/feature/invoice-…     a1b2c3d  Fix invoice rounding    ○
 TAGS
  🏷 v2.4.0                       9f8e7d6  Release 2.4.0           ●
 COMMITS
  ◉ f3e2d1c                      Feature flag for currencies       ●
 PULL REQUESTS
  ⤴ #123 Fix invoice rounding    a1b2c3d                           ○
 SNAPSHOTS                                         (only when they exist)
  ✎ Working tree (4 Nov 09:12)
  📥 export-2024.cc.json (imported, analysis time unknown)
```

- Groups with `text-xs uppercase tracking-wide text-base-content/60` headers; rows `py-1 px-2
  rounded-md hover:bg-base-200`; active option `bg-primary/20`. Name `truncate`, short SHA
  `font-mono text-xs`, subject `text-xs text-base-content/60 truncate`, analysis dot at the right
  (`●` `text-success` analysed, `○` `text-base-content/40` not; `title` "Analysed" / "Not analysed").
- Branches and tags filter client-side; commits search after 250 ms (hash prefix or subject, 50
  rows; "Searching commits…" `loading-dots` row while waiting); PRs from the cached list.
- Empty query: current branch, default branch, the 5 most recent branches, then tags.
- No hit: "No branch, tag or commit matches 'xyz'."
- Keyboard: ↓/↑ move through options across groups, Enter picks, Escape closes the list (second
  Escape bubbles to the dialog), Tab moves on and keeps the typed text (resolved on Compare).

## C5 Preparation

Replaces the list area of C3 when a side is missing, the size verdict is not `Ok`, or profiles
differ.

```
 BASE  9f8e7d6 (main)        ● analysed
 HEAD  a1b2c3d (feature/x)   ○ not analysed · nearest: 3c4d5e6, 2 commits older
 ⚠ The two analyses used different profiles; some differences may not be code changes.
                                     [Cancel]  [Use nearest]  [Analyse missing]
analysing:
 HEAD  a1b2c3d  analysing… 42 %  [██████░░░░]
                                     [Cancel analysis]
```

- Side rows `grid grid-cols-[3rem_minmax(0,1fr)_auto] text-sm`, caption `text-xs font-semibold`.
- **Analyse missing** (`btn-primary`, default focus), **Use nearest** (disabled with title "No
  nearest analysis for <side>" or "Both sides would show the same analysis"), **Cancel**.
- Size `Warn`: `alert alert-warning text-sm` "These two analyses are large; comparing may take a while
  and use several GB of memory." + **Compare anyway**. `Block`: `alert alert-error text-sm` "Too large
  to compare in memory. Analyse with a lighter profile or compare a sub-folder." — no go-ahead.
- Analysing: one row per job with progress (`progress progress-primary`), one **Cancel analysis**
  for the batch; a failed job shows its message in the row and "Use nearest" for that side.

## C6 Resolve outcomes

`alert text-sm` inside C3, replacing the list:

| Status | Tone | Text | Actions |
|---|---|---|---|
| `SameCommit` | info | "Both sides are the same commit — nothing to compare." | — |
| `AlreadyMerged` | info | "'feature/x' is already contained in 'main'. Compare tip vs tip, or pick a base commit." | "Compare tip vs tip" |
| `NoCommonAncestor` | warning | "'a' and 'b' share no history. Only tip vs tip is possible." | "Compare tip vs tip" |
| `HeadNotLocal` | info | "The head of #123 is not in your clone yet." | "Fetch from 'origin'" (progress inline, credential prompt from area 04 H16 if git asks; Cancel) |
| identical checksums (after load) | — | dialog closes; chip shows the noDifferences form (C2) | — |

## C7 Pull / merge request list

C3's "Pull requests" segment.

```
[Open | Merged | All]                                   updated 3 min ago  [⟳]
#123  Fix invoice rounding                     draft    feature/x → main   Mia Chen   2 days ago   ●○
#120  Currency table                           fork     mia:currency → main  Mia Chen  1 week ago  ○○
… 30 more (list truncated — open the hosting site for older requests)
──────────────────────────────────────────────────────────
Open PR / MR by number  [ 123 ]  base [ main ▾ ]  [Open]        (only without a working CLI)
```

- State filter: `join` of `btn btn-xs join-item` (Open / Merged / All). Refresh `btn btn-ghost btn-xs
  btn-square fa-rotate` ("Refresh pull requests"), "updated 3 min ago" `text-xs
  text-base-content/60`.
- Rows `scenarioItem`-like `px-3 py-1.5 hover:bg-base-200`: `#n` `font-mono`, title `truncate`,
  badges `badge-ghost badge-xs` "draft", "fork", `badge-success badge-xs` "merged",
  `badge-error badge-xs` "closed"; `head → base` `font-mono text-xs`; author; age; two analysis dots
  (base, head). Click = fills both sides (base per plan 7.4, mode merge base) and resolves; double-click
  = Compare. "Open on GitHub/GitLab" `btn btn-ghost btn-xs btn-square` `fa-arrow-up-right-from-square`.
- Loading: 5 skeleton rows; cached list paints first, refresh spinner on the button.
- Empty states (plan 7.5), `text-sm` in the list area:

| `HostingStatus` | Text | Action |
|---|---|---|
| `provider: None`, unknown host | "This host is not recognised. Treat git.example.org as:" | `btn btn-sm` "GitHub Enterprise", "GitLab" (writes the folder override) |
| `NotInstalled` (GitHub) | "Install the GitHub CLI (gh) to list pull requests, or enter a number below." | link "cli.github.com" |
| `NotInstalled` (GitLab) | "Install the GitLab CLI (glab) to list merge requests, or enter a number below." | link "gitlab.com/gitlab-org/cli" |
| `NotAuthenticated` | "Run `gh auth login --hostname github.com` in a terminal, then refresh." | copy command, refresh |
| `Error` | the CLI's first error line (`font-mono text-xs`) | refresh |
| `Ready`, no rows | "No open pull requests." (/ "No merged pull requests." / "No pull requests.") | — |
| checking (first `hosting.status` not answered yet) | 5 skeleton rows | — |

- **When the segment is shown at all.** The "Pull requests" segment appears only when the folder has a
  remote *and* the core can list hosting requests. A core without hosting support (the methods are
  missing) shows no segment and no placeholder — nothing that reads "coming soon". With hosting
  support but no gh / glab installed, the segment is shown with the `NotInstalled` row above, plus a
  second action "Open desktop tools" (area 01 D5, where gh and glab have their rows). Number entry
  below the list still works in every state except "segment absent".

- GitLab wording uses "merge request" and `!n` instead of `#n` throughout (segment label stays "Pull
  requests" only when the provider is unknown; GitHub "Pull requests", GitLab "Merge requests").
- Number entry: `input input-bordered input-sm w-24 font-mono`, base `select select-sm` (default:
  default branch), "Open" → fetch then resolve; the side label becomes "PR #123".

## C8 Changes explorer mode

**Where.** Explorer mode "Changes" (`fa-solid fa-code-compare`), offered only during a project
comparison; appears in the explorer's mode toggle next to "Files" (and "Clusters" when present). Starting a
comparison does not switch to it; the user's mode stays (see Deviations 4).

```
CHANGES
+12 added · −3 removed · 41 changed                      text-xs, success/error/info coloured numbers
rloc +1 240 · complexity −35                             current area and height metrics
58 files changed in git (4 renamed)
[toggle] Only changed files                              cc-setting-toggle pattern, compact
Files changed in git                                      text-xs text-base-content/60 source line
──────────────────────────────────────────
 modified  invoice.ts         src/billing   +12   [⌖]
 added     currency.ts        src/billing   +80   [⌖]
 renamed   old.ts → money.ts  src/billing         [⌖]
 deleted   legacy.ts          src/old       (not part of the analysis)   greyed
```

- Header block `px-2 py-2 border-b border-base-300 flex flex-col gap-1`.
- Toggle "Only changed files": daisyUI `toggle toggle-xs` + label; `title` "Grey out and flatten
  every file that did not change".
- Source line: "Files changed in git" or "Files with metric changes" (fallback, plan 8), with `title`
  explaining the fallback: "No clone has both commits, so the list shows files whose metrics
  changed."
- Rows 28 px, virtualised (`ListViewport`): worded change badge (as area 04 H9), file name, folder
  `text-xs text-base-content/60 truncate`, height-metric delta `tabular-nums` (`text-success` /
  `text-error` per the delta colours' meaning), "Focus folder" `btn btn-ghost btn-xs btn-square
  fa-crosshairs` (`aria-label` "Focus folder src/billing"). Click selects the building
  (`setSelectedNodePath`); the selected row uses the explorer's selected style.
- Path without a node: `opacity-50`, `title` "Not part of the analysis", no click action.
- Empty: "No files changed." Loading the git list: `loading loading-dots loading-sm` under the summary
  and the metric fallback is not shown meanwhile.
- 20 000 rows stay responsive (virtualised); the summary never lists more than counts.
- Keyboard: rows `role="listbox"`, ↑/↓ move and select, Enter focuses the folder; handled keys stop
  propagation (principles §9).

## C9 Legend caption

Top of `legendDeltaColorsSection.component.html`, during a project comparison only:
`text-xs text-base-content/70` "Δ = head a1b2c3d − base 9f8e7d6" (SHAs `font-mono`). Nothing in
upload delta mode.

---

## Deviations from the plan

1. **No `cc-compare-button` in the nav bar.** Compare already has an entry: the Compare tab of the
   metric view's mode bar, which plan 06 itself reroutes to the dialog in project mode. A second
   "Compare" button would duplicate it in the most crowded part of the bar (principles §3). Entry
   points are that tab, History and the snapshots dialog.
2. **Dialog lists: "Pull requests | Recent".** The plan's third tab "Refs" duplicates what the ref
   picker already lists; dropped.
3. **Chip sides open the dialog.** The plan offers "Change…" only in the caret menu; clicking a side
   is the direct way to change it.
4. **Changes mode is not opened automatically.** The explorer keeps the user's mode; the mode toggle
   shows "Changes" while a comparison is active. Switching modes unasked would discard what the user
   was looking at.
5. **Compare from the "Uncommitted changes" row** ("Compare with HEAD") is added: it is the
   working-tree row of plan 06's table, reached where the working tree appears in History.

6. **Ref picker lives in `features/gitHistory`**, not `features/compare` (plan 5), because the map
   screen's "Show commit…" (area 05 W1) needs it too and `snapshots` may not depend on `compare`.

## Proposed changes to existing UI (not assumed approved)

1. **Compare tab behaviour in desktop project mode**: opens the compare dialog instead of switching to
   two loaded files (plan 06, `FileSelectionModeService.toggle()`); no visual change to the tab.
2. **Delta selector in desktop project mode** is replaced by the comparison chip (plan 06 explicitly
   replaces it); in the web build and for sample maps it stays.
