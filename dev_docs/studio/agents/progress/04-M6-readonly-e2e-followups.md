---
name: 04-M6 read-only end-to-end, docs and design follow-ups (O8.3)
state: complete
version: 1
---

## Goal

Bring the History view in line with the design as revised on 2026-11-20 (`design/open-questions.md` O8 part 3) and
finish plan 04 M6 (read-only end-to-end and docs), adjusted to what is built.

## Tasks

1. Design follow-ups: toast `commands` + shared `cc-copy-command`; H9 meta rows; H6 wording (`conflicts`,
   `operationInProgress`, `notARepository` actions); H13 `outputTooLarge`; H8 lane variables per theme, selected-row
   outline; H11 solid "conflict" badge.
2. M6: e2e of the read-only History against the stand-in bridge, the desktop smoke test against the real core, README.

Out of scope: 04-M11's UI (pull, push, abort).

## Steps

- [x] 1. `cc-copy-command` and toast `commands`
- [x] 2. H6 sentences and the not-a-repository actions
- [x] 3. H9 meta grid
- [x] 4. H13 diff too large
- [x] 5. H8 lanes, selected-row outline, H11 conflict badge
- [x] 6. M6 e2e, desktop smoke, README, changelog

## Notes

Branch `feature/studio-04-m6` from `feature/studio-next` (`bbb119dee`). Core built into
`core/target/studio-04-m6` (linked as `core/target/debug/codecharta-core`); no core change.

### What was built
- **`cc-copy-command`** (`features/shared/components/copyCommand`, in the shared facade): `font-mono text-xs
  bg-base-200 rounded-md px-2 py-1`, the command `truncate` with the full text in `title`, a `btn btn-ghost btn-xs
  btn-square` "Copy command" whose `fa-regular fa-copy` becomes `fa-solid fa-check` for 2 s
  (`CopyToClipboardService.copy(text, feedbackMs)`; the other users keep 1.5 s). Used by the problem notice
  (safe-directory), the toast and the H13 too-large state.
- **Toasts:** `ToastService.show(text, severity, { details?, action?, commands? })`; every command is a copy block in
  the toast body, always visible (not behind Details). The alert's grid is now `minmax(0,1fr) auto` and the body
  `w-full`, otherwise a long command pushed the text under the dismiss button (seen in the screenshots, fixed).
- **`GitFailureReport`** passes `gitErrorCommands(error)` (the two identity commands for `IDENTITY_UNKNOWN`); the
  identity sentence is only "Git does not know who you are. Run these in a terminal, then commit again:". It also
  fills `inProgress` from the repository status when the caller does not give it.
- **H6 sentences** (`gitErrorText.ts`, `GitErrorContext` gains `operation: "commit" | "pull" | "merge" | "stashPop"`,
  `conflictedFiles`, `inProgress`): `CONFLICTS` with `operation: "commit"` → "Git did not commit: some files still
  have conflicts. …"; with pull / merge / stash pop and a count → "Git stopped on conflicts in <n> files. The notice
  above the list says how to finish or abort." (+ " The stash was kept." for stash pop); `OPERATION_IN_PROGRESS` →
  "A <merge / rebase / cherry-pick / revert / bisect> is in progress. Finish or abort it first.".
- **Not a repository:** the notice offers "Work in '<label>'" when the project has exactly one other git folder
  (kind git, status ok) and "Choose working folder…" when it has several; nothing without one. The panel emits
  `workInFolder` / `chooseWorkingFolder`; `HistoryViewComponent` calls `ProjectsFacade.chooseFolder` (the same
  `ProjectsService.chooseFolder` the project menu P1 calls) or `ProjectsFacade.openFolderMenu()`, which raises
  `ProjectsService.folderMenuRequest`; `cc-project-switcher` opens on a new request with the working folder focused
  (same path as opening it from the keyboard). No folder select in History.
- **H9:** Author / Committer / Parents as `<dl class="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-2 text-sm">`,
  labels `text-xs text-base-content/60`, values `truncate` with the full line plus the relative date in `title`.
  Committer shown when name, email **or date** differ (before: name or email only).
- **H13:** `OUTPUT_TOO_LARGE` is a centred state, not an error: "This diff is too large to show (over 4 MB). Run
  this in a terminal to see it:" + copy block `git diff -- <path>` (staged: `git diff --cached -- <path>`).
- **H8 lanes:** `--cc-lane-1` … `--cc-lane-8` in `tailwind.css`: `:root` maps them to primary, accent, success,
  secondary, warning, info, error, `base-content` at 60 %; cc-light, VS Light and Rider Day use the design's fixed
  values, VS Light and Rider Day with their own primary as lane 1. The graph uses `text-(--cc-lane-n)`. A spec reads
  the stylesheet and checks every light theme's lanes at 3:1 against `base-100`.
- **H8 selection:** selected commit rows add `outline outline-1 -outline-offset-1 outline-primary/60`.
- **H11:** the "conflict" badge is solid (`badge-warning` without `badge-soft`; `ChangeBadge.isSolid`).
- **Graph header:** the graph column is at least 52 px, so "Graph" no longer runs into "Commit" when the history has
  one lane (seen in the desktop smoke screenshot).
- **M6 e2e** (`gitHistory.e2e.ts`): refs tree with remote groups and tags, ref labels on commits (one plus "+n" in
  the narrow pane), W1 shows the branch, right-click → Copy SHA → toast "Copied bbbbbbb" and the clipboard;
  not-a-repository → "Work in 'billing-web'" switches the History to that folder; identity toast with both copy
  blocks (copy turns into a check, clipboard holds the command); diff too large with its `--cached` command. The
  plan's other M6 scenarios (tab, scope, 5 rows, merge details, search hides the graph, web build without the tab)
  existed already from M3–M5.
- **Desktop smoke** (`electron/smoke.e2e.ts`): "should list the branches of a fixture repository in the History" —
  a real repository (isolated git config) with `main`, `feature/login` and tag `v1.0`, a project created through the
  bridge, History lists the three refs and the commit.
- **Docs:** `visualization/README.md` "Commit history (desktop app)": git ≥ 2.31, Log / Changes, the working folder
  from the project menu, the safe-directory command, `codecharta-core git status|branches|log`.

### Decisions and readings
- **Outline on H8 rows only.** O8.3 lists "an inset outline on the selected row, a solid conflict badge (H8,
  H11)"; H8's text has the outline and H11's text the badge, so changes-panel rows keep their tint without outline.
- **`conflicts` after pull / merge / stash pop needs the count** from the caller (`conflictedFiles`, M11 passes the
  re-read status); without operation or count the sentence falls back to "Git failed: <message>".
- **The slow-first-page notice** keeps its inline command and its own copy button (H6 lists "Retry, copy command" as
  actions of an `alert` row); a `cc-copy-command` block there would repeat the command in the sentence.
- **Shell quoting in the too-large command:** a path with characters outside `[\w./@+-]` is wrapped in double quotes
  (works in bash, zsh, PowerShell and cmd for spaces). Untracked files get `git diff -- <path>` as H13 says, although
  git shows nothing for an untracked file there.
- **Desktop smoke layout:** the Electron test window is narrower than 1280 px, so the History starts with collapsed
  side panes; the test stores the layout of a user who opened the branches pane (`codeChartaHistoryLayout`) instead
  of resizing a window the display cannot grow.

### Seen, not changed
- "Work in '<label>'" / "Choose working folder…" go through `ProjectsService.chooseFolder`, which shows the project
  overview when the new working folder has no analysis — the user then leaves the History. That is P1's behaviour
  (design: "the same call as P1"); question for the designer below.
- In a 384 px toast the identity commands are cut with "…" (full text in `title`, copy copies all).

### Questions for the designer
1. Should "Work in '<label>'" from the History stay in the History when the folder has no analysis (P1 shows the
   project overview then)?
2. `git diff -- <path>` for an untracked file shows nothing; should H13 give `git diff --no-index -- /dev/null
   <path>` (`NUL` on Windows) there?
3. The identity commands do not fit a `w-96` toast; acceptable truncated, or should error toasts with commands be
   wider?

### Screenshots (Playwright, seeded stand-in; scratch spec, not committed)
1600×900, cc-light, cc-dark and Rider Day: Log with a merge (lanes blue/orange in light, primary/teal in dark),
selected row outline, H9 grid with Committer; Changes with the solid conflict badge and the too-large state; the
identity toast (before and after the layout fix); not-a-repository notice with "Work in 'billing-web'".

### Gates (final, Linux)
Root `npm run format:check` clean; `visualization/`: `npm test` 768 suites, 6190 passed + 2 todo, coverage 97.22 /
90.32 / 96.13 / 97.18; `npm run lint` (depcruise, styles, knip) clean; `npx tsc --noEmit -p tsconfig.json` clean;
`npm run test:electron` 80/80; `npm run build` ok; `npm run e2e:desktop` 17/17 (core in `core/target/studio-04-m6`);
`npm run e2e:ci` 199/199. Temporary `E2E_PORT` 9061 and the chromium channel reverted before committing.

### Shared files touched
`features/shared` (copy command, toast service and component, facade), `util/copyToClipboard.service.ts`,
`app/tailwind.css` (lane variables), `features/projects` (`chooseFolder` / `openFolderMenu` on the facade,
`folderMenuRequest`, switcher opens on request), `views/historyView`, `electron/smoke.e2e.ts`, `README.md`,
`CHANGELOG.md` (the Git history entry extended).
