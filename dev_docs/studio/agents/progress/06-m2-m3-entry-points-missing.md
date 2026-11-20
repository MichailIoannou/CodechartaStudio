---
name: 06-M2/M3 compare entry points and missing analyses
state: complete
version: 1
---

## Goal

Make comparisons reachable from everywhere the design puts them (ref picker, branch comparisons, recent
comparisons, History menus, chip actions) and never fail just because an analysis is missing ("Analyse
missing" / "Use nearest", staleness, size limits) — plan 06 M2 and M3.

## Tasks

Copied from `06-compare-commits-and-prs.md` M2 (core tasks 1–2, renderer 3–8) and M3 (renderer 1–4). Combined
into one agent by orchestration (weekly budget). Branched from `feature/studio-stack` (06-M1 core + renderer
merged). Design overrides the plan's UI: `design/06-compare.md` (C1 entry points — the existing Compare tab,
**no `cc-compare-button`**; C3 dialog; C4 ref picker; C5 preparation; C6 outcomes; "Deviations from the plan"),
`design/04-history.md` (H10 menus), `design/00-design-principles.md`, mock-up.

From `06-m1-compare-core.md` (renderer notes): replace the Base/Head inputs with `cc-ref-picker` and an
`explicit` intent so Base stays base; add base-mode radios and the Pull requests | Recent lists (the PR list
itself needs `hosting.list*`, which is blocked on gh/glab fixtures — show the design's not-available state);
History entries go through 04-M5's `COMMIT_ACTIONS` port to `CompareFacade.compareCommits` /
`compareWithParent` / `compareWithCurrent` / `openDialog`; the port has no disabled state — add an optional
`disabledReasonFor?` (C1: disabled "Compare with Parent" for a root commit). For M3: `needsDecision` and
`continueWithShownSnapshots()` exist; add the `analysing` phase (enqueue only the missing side through the
snapshots feature) and the stale wording; harden the race where a snapshot-view resolve already in flight
replaces a freshly loaded pair. Core tasks: `Revision` refuses short names today — branch and explicit intents
need their own fields (`06-m1-compare-core.md`). Parallel work note: another agent adds History write actions
(04-M7/M8 renderer: branch context menu, fetch) at the same time — contribute branch-menu entries through a port
or the smallest possible hook, and keep shared-file edits small.

M2: 1–2 core intents · 3 ref picker · 4 dialog (no button) · 5 recent comparisons · 6 History entry points ·
7 chip actions · 8 docs/e2e. M3: 1 missing-side paths · 2 preparation list · 3 staleness and size limits · 4 e2e.

## Steps

- [x] M2 core intents
- [x] M2 ref picker and dialog
- [x] M2 recent comparisons
- [x] M2 History entry points
- [x] M2 chip actions and docs
- [x] M3 missing sides and preparation
- [x] M3 staleness and size limits
- [x] E2E

## Notes

Environment (2026-11-19): Arch Linux, rustc 1.95, git 2.56, node 26, npm 12.2. Branch `feature/studio-06-m2m3` from
`feature/studio-stack` (`ba35acc3e`). Own `CARGO_TARGET_DIR` `core/target/studio-06-m2m3`.

### Verified first
- On the stack: 06-M1 core and renderer, 06-M4 core (`compare.changedFiles`), 06-M5 core (`changeRequest` intent,
  `alreadyMerged`, `baseTip`, `HEAD_NOT_LOCAL`, `hosting.status`, `hosting.fetchChangeRequestHead`; no
  `hosting.list*`). 04-M5 `COMMIT_ACTIONS`, `cc-commit-context-menu`, `ANALYSED_COMMITS`; 05-M4/M5
  `AnalysisJobsService`, `SnapshotViewService`. No `git.searchCommits`, no branch context menu (04-M7/M8 renderer
  builds it in parallel), no `cc-ref-picker`.

### M2 core
- Task 1: `CompareIntent::Branch { folder, branch, target, baseMode }` with full ref names (`Revision`); without
  `target`: the current branch, or (compared branch is current / detached HEAD) the folder's default branch from the
  project record's `FolderGitFacts.defaultBranch` (local, then `origin/<name>`; none → `UNKNOWN_REVISION`).
  `ResolvedComparison.origin` (`commits` | `branches` | `pullRequest`) added — the chip's base-mode badge needs it.
  Tests (plan names with `should_`): merge base by default, target tip in tip mode, default branch for the current
  branch, already merged.
- Task 2: `CompareIntent::Explicit { base: SideInput, head: SideInput, baseMode }`, `SideInput { folder, rev }`,
  `RefInput::Rev { name: TypedRevision }` (new value: a `Revision` or a check-ref-format branch-like name — never an
  expression). Lookup: tag, local branch, remote branch (git's order), then a unique hash prefix of ≥ 4 digits
  (`GitService::resolve_abbreviated`, `rev-parse --verify --quiet`: unknown and ambiguous both exit 1 →
  `UNKNOWN_REVISION`). The base stays the base; `mergeBase` only when the base names a branch or tag. Both sides in
  one folder (`BAD_REQUEST` otherwise; cross-folder is M6). Tests: tag + unique prefix, unknown ref, ambiguous prefix
  (found among 1 000 fast-import commits; deterministic).
- Later fix (`fix(core): keep the branch name of a merge base that is the target tip`): a merge base equal to the
  target tip keeps the tip's label, so `main...feature/x` shows `base 9f8e7d6 main` (found in the e2e).
- M3 gap: `NearestSnapshot.behind` / `ahead` (the descendant / diverged chip forms need both numbers).
- Not done: CLI flags `--branch/--target/--mode` for `compare resolve` (no task asks for them; the CLI keeps the M1
  `commits` intent).
- Gates each core commit: `cargo fmt --check`, clippy `-D warnings` with and without `--all-features`, `cargo test`
  853 / `--all-features` 857 passed (final), `npm run contract` without drift.

### M2 renderer (design over plan)
- **Ref picker** (C4, design deviation 6: `features/gitHistory/components/refPicker`, exported through the gitHistory
  facade with `parseRefRange` / `RefRange` / `RefResolution`): combobox + listbox (`z-[70]`, `max-h-72`), groups
  Branches / Tags / Commits, analysis dots from `ANALYSED_COMMITS`, empty query = current, default, 5 most recent
  branches, then tags; commits after 250 ms through `git.log` (subject filter + hash prefix in the newest page; the
  plan's `git.searchCommits` does not exist); "Searching commits…", "No branch, tag or commit matches 'xyz'.";
  ↑/↓/Enter/Escape (first Escape closes the list, second reaches the dialog)/Tab; pasting `a..b` / `a...b` fills
  both sides and the base mode. Under each picker: the resolved short SHA, subject and dot ("analysed" /
  "not analysed"). **Gaps:** PR rows and the Snapshots group (M5/M6); the "nearest is N commits older" dot form under
  the picker needs a resolution per side before Compare — not built. Branch/tag groups are capped at 50 matches each
  (the design gives a cap only for commits).
- **Dialog** (C3): pickers replace the M1 inputs, `explicit` intent, `toRevision` removed from `CoreGateway`; the
  modal box is `overflow-visible` so the list is not clipped. Base-mode radios only when the base names a
  branch/tag, remembered per project (`BaseModeRepo`, localStorage). An unknown side reports `refNotFound` for the
  first side no picker resolved. No compare button (deviation 1); the plan test "should hide the button without a
  project" does not apply.
- **Lists**: segmented control with **Recent** only. The Pull requests segment is left out: `hosting.list*` does not
  exist and the design words no "list not built" state (C7's NotInstalled text points at a number entry that M5
  builds) — stopped there instead of improvising; M5 adds the segment. Recent rows: `main...feature/x` (mono), the
  folder label when the project has several git folders (my reading of the design's "label"), relative age with the
  date in `title`; empty "No comparisons yet."; click fills folder, sides and base mode. Recorded on `active` and
  `noDifferences`, by the tip a merge base came from.
- **History** (C1/H10): `provideCompareForGitHistory()` (compare facade → `app.config.ts`, after the snapshots
  actions): "Compare" (two commits, also an H9 button), "Compare with Parent" (disabled for a root commit: "This
  commit has no parent"), "Compare with Current", "Compare with…" (also the H9 button the mock-up shows), all
  `fa-code-compare` with the C1 hints. `CommitAction.disabledReasonFor?` added; `cc-context-menu-item` gained
  `disabledReason` (aria-disabled, reason in `title`, no click). Branch menu: new `BRANCH_ACTIONS` port
  (`BranchMenuTarget { repo, refName, name, kind, isCurrent }`, `BranchAction { id, icon, labelFor, hoverHintFor,
  isOfferedFor, run }`); compare provides "Compare with '<target>'" (C1: current branch, or the default branch for the
  current branch; not for tags) and "Compare with…" (H10, for every kind; wording/hint reused from the commit menu).
  "Compare with HEAD" on the working tree and the snapshot-dialog entries are M6 (working-tree sides).
- **Chip** (C2): base-mode badge `badge-ghost badge-xs` "since merge base" / "tip vs tip" with the design titles for
  branch / PR origins, hidden below `xl`; "Copy as text" uses the tip a merge base came from (`main...feature/x`).
  The PR link in the copied text waits for M5 (plan test renamed accordingly).
- Docs: `gh-pages/.../compare.md` "Comparing commits in the desktop app"; the changelog entry rewritten (one entry
  for M1–M3).

### M3 renderer
- `CompareService.analyseMissing()`: holds the map, enqueues each missing side once (`ANALYSIS_GATEWAY` → snapshots'
  `AnalysisJobsService`; `alreadyAnalysed` needs no wait, `rejected` becomes the side's failure), phase `analysing`,
  `CompareState.analyses`. An effect follows the jobs: any cancelled → `analysisCancelled` ("The analysis was
  cancelled. Nothing was compared."); all finished → resolve again (cached in the core) and go on; a failed side
  comes back as `needsDecision` with "The analysis of a1b2c3d failed: <message>" in its row and Use nearest.
  `cancelAnalyses()` cancels the batch. Closing the dialog only stops following (the batch keeps running, C3).
- `cc-compare-preparation` (C5): side rows, failure line, profile / size alerts, Use nearest (titles as M1),
  **Analyse missing** (primary, focused), Compare anyway for a size warning; analysing rows "analysing… 42 %" /
  "queued" with `progress progress-primary` and one **Cancel analysis**. Block hides every go-ahead. "Show log" for a
  failed side is not offered (S9 lives in snapshots; next step if wanted).
- Staleness: chip badge "stale by N" (ancestor), "ahead by N" (descendant), "diverged N↓ M↑" (W1 forms); titles "No
  analysis for X. Showing Y, N commits older." / "…, which is ahead by N commits." / "… from a diverged line: N
  behind / M ahead." (05's notice sentences — the design gives only the ancestor form literally); the preparation
  row uses the same suffixes.
- Race: `SnapshotGateway.holdMap()` → `SnapshotViewService.holdShownSnapshot()` (bumps its ticket, ends an in-flight
  status, pins the shown snapshot as the target) before analysing and before loading a pair, so a resolution
  already in flight (or a finished analysis that answers the old target) cannot replace the pair.
- Size limits are the core's provisional 15 MB / 60 MB (06-M0 task 4 still open).

### Fake bridge
`compare.resolve` gained `branch` and `explicit` intents (typed names → refs / unique prefix), merge bases from the
seeded parents (a merge base that is the tip keeps its name), nearest ancestor snapshots with `behind`, and the size
verdict from `mapBytes` (15 / 60 MB). Body stays self-contained.

### Screenshots (scratch Playwright spec, not committed; stand-in seeded with main / feature/x / a later unanalysed
branch, 1920×1080, cc-dark and cc-light)
Picker empty (Branches: current, main, recent; Tags) and with a query (branches incl. origin/main, Commits with
dots); dialog with resolved lines and "Since the merge base / Tip vs tip"; preparation (BASE analysed, HEAD "not
analysed · nearest: a1b2c3d, 2 commits older", Use nearest + Analyse missing); analysing row "analysing… 42 %" with
bar and Cancel analysis (W1 shows "Analysing · 42 %"); cancelled alert; size warn / block alerts; chip "stale by 2"
+ "since merge base" with the stale title; History root-commit menu with "Compare with Parent" greyed and the H9
"Compare with…" button; two-commit menu "Compare". Matches C2–C5/C1 in both themes. **Finding for the designer:** at
1920 px with the stale and base-mode badges the base side's branch label truncates to nothing ("base 9f8e7d6"),
like M1's 1280 px finding — the map slot is narrow; not changed.

### Shared files touched (small)
`app/app.config.ts` (one spread), `features/gitHistory/facade.ts`, `ports/commitActions.port.ts`
(`disabledReasonFor?`), new `ports/branchActions.port.ts`, `components/commitContextMenu` (disabled items),
`features/shared/components/contextMenuItem` (`disabledReason` input), `features/snapshots/services/snapshotView
.service.ts` (`holdShownSnapshot`), the stand-in bridge, `CHANGELOG.md`, `gh-pages` compare doc.

### For 04-M7/M8 (branch menu) and 06-M4/M5
- Branch menu: inject `BRANCH_ACTIONS` (optional, multi) and list the offered ones after the History's own items
  (H10 puts "Compare with… (06)" last), label `labelFor(target)`, `title` `hoverHintFor(target)`.
- 06-M5: add the Pull requests segment before Recent in `compareDialog` (`compare-lists`), PR rows in the picker,
  the chip's PR badge and the PR link in Copy as text; `ResolvedComparison.origin` is already `pullRequest` for PRs.
- 06-M4: the Changes mode reads `CompareStore.state()` (`base`/`head` `LoadedSide`, `resolved.baseTip`); recents and
  base mode live in `repos/`.
- 06-M6: `RefInput` is a tagged enum with one variant — add `workingTree` / `imported`; `SideInput.folder` already
  per side.

### Open entries closed (2026-11-20, `06-m4-m5-ui.md`)
- The branch menu (`cc-branch-context-menu`) now lists the offered `BRANCH_ACTIONS` after its own items.
- The Pull requests segment sits before Recent in `compare-lists` (see `06-m4-m5-ui.md`, "M5"); PR rows in the ref picker
  still wait for the listing (06-M5 tasks 2–3).
