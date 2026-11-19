---
name: 04-M7/M8 renderer — credential prompts, fetch and branches (+ Show in map action)
state: complete
version: 1
---

## Goal

The first write actions in History: the credential prompt dialog for git and ssh, Fetch with progress and
cancel, and switch/create/rename/delete branches with their confirmations; plus "Show in map" as the
primary commit action (renderer halves of plan 04 M7 task 5 and M8 task 2).

## Tasks

Copied from `04-git-branches-and-history.md` section 5, M7 task 5 and M8 task 2. Combined into one agent by
orchestration (same files, weekly budget). Branched from `feature/studio-stack`. Design overrides the plan's
UI: `design/04-history.md` (H5 sync button, H6 notices/banners, H10 menus, H14 branch dialogs, H15
confirmations, H16 credential prompt; "Deviations from the plan"), `design/00-design-principles.md` (toasts,
z-layers, wording), mock-up.

Core contract (verified on the stack): prompts — renderer-callable `prompt.answer {promptId, answer}` and
`prompt.cancel {promptId}`; events `prompt.requested {promptId, requestId, repositoryLabel, kind, message}` and
`prompt.closed {promptId}`; kinds `secret` (masked), `text`, `confirm` (answer `yes`/`no`); show `message`
verbatim; cancel → operation fails with `AUTHENTICATION_CANCELLED`; the shell maps `requestId` to the caller's
`operationId` like `core.progress` (verify; record if not). Fetch/branches — `git.fetch {repo, prune}`,
`git.switch {repo, target}`, `git.branchCreate {repo, name, startPoint, checkout}`, `git.branchRename`,
`git.branchDelete {repo, target: local{refName, force} | remote{remoteRefName}}`, `git.setUpstream`; codes
`BRANCH_EXISTS`, `BRANCH_NOT_FULLY_MERGED`, `BRANCH_CHECKED_OUT_ELSEWHERE`,
`LOCAL_CHANGES_WOULD_BE_OVERWRITTEN` (file list in `details.detail`), `OPERATION_IN_PROGRESS`,
`AUTHENTICATION_REQUIRED`, `NETWORK_UNAVAILABLE`; every call ends with `repository.changed`; cancel with the
`core.cancel` notification via the bridge's `cancel(operationId)`. Credentials are never stored or logged.

From `04-M5-selection-menu-ports.md`: contribute "Show in map" as a `CommitAction` with `isPrimary: true` and
`detailsLabel` "Show in map", before the analyse actions in `provideSnapshotsForGitHistory()`, using 05-M5's
`showCommit(sha)`. Check Out / New Branch menu items arrive here (write actions).

1. Credential prompt dialog and git operation service (M7 task 5)
2. Fetch, branch context menu, commit-menu write entries, create/rename/delete dialogs, effect text, hooks notice (M8 task 2)
3. "Show in map" primary commit action

## Steps

- [x] 1. Credential prompts
- [x] 2. Fetch and branches
- [x] 3. Show in map

## Notes

Environment (2026-11-19): Arch Linux, node 26.13, npm 12.2.2. Branch `feature/studio-04-m7m8-ui` from
`feature/studio-stack` (`75c7bfa7e`). Core built into `core/target/studio-04-m7m8-ui` (linked as
`core/target/debug/codecharta-core` in the worktree).

### 1. Credential prompts and the operation service (M7 task 5)
- **Verified first:** the contract as the progress file states it (`prompt.answer` / `prompt.cancel` renderer methods,
  `prompt.requested` / `prompt.closed` renderer events, `PromptRequested.requestId: RequestId | null`); the shell did
  **not** map `prompt.requested.requestId` — `electron/main.js` rewrote it for `core.progress` only and forwarded
  prompts with the core's wire id. Fixed: `shellPolicy.js pageNotificationOf(method, params, operationIdOf)` (pure,
  `node --test`): progress keeps its rule (mapped, or dropped without an operation); a prompt is mapped, and reaches the
  page with `requestId: null` when its request had no operation id (dropping it would leave git waiting 30 min);
  every other renderer event passes unchanged. The sender checks and the contract filter in `main.js` stay first.
- `GitApiService` (now "the only caller of the bridge for `git.*` and `prompt.*`"): `fetch`, `switchBranch`,
  `createBranch`, `renameBranch`, `deleteBranch`, `setUpstream` take the params object and the caller's operation id
  (`bridge.request(method, params, { operationId })`); `answerPrompt`, `cancelPrompt`, `cancel(operationId)`
  (`bridge.cancel` → `core.cancel`); `onPromptRequested`, `onPromptClosed`, `onProgress`.
- `CredentialPromptService` (root): a queue of `PromptRequested` (questions only), `current`, `waitingCount`;
  `answer` / `cancel` drop the prompt from the queue first, then call the core (a `NOT_FOUND` for a prompt that closed
  meanwhile is ignored); `prompt.closed` drops it. No answer is ever held in a signal.
- `cc-credential-prompt-dialog` (`components/credentialPromptDialog`), mounted in `views/codeCharta.component.html`
  next to `<cc-error-dialog>`, outside the router outlet; renders only when `isDesktop()` (web build: absent; the
  component checks it itself because `CodeChartaComponent` is constructed with `new` in its spec). Design H16: native
  dialog `modal-box max-w-md`, `aria-labelledby` the title, title "Git Needs Your Input" (+ " (1 of 2)" while more
  wait), repository label `text-sm text-base-content/60`, the message verbatim in the `<pre>` (`max-h-48`, scrolls),
  `type=password` for secret / `text` for text, `maxlength` 4096 (the core's limit; an input cannot hold a line break),
  the help line "CodeCharta passes this to git once and does not keep it.", Cancel / OK (Enter submits); confirm: no
  input, No / Yes, focus on No. Escape and the backdrop close the native dialog; the `close` handler cancels a prompt
  that is still current (`prompt.cancel`). The answer is read from the input element on submit and the input is
  emptied before the request is sent; it is also emptied whenever the current prompt changes or is cancelled.
- `GitOperationService` (root): `run({ kind, repo, send(operationId) })` → fresh `git-operation-<n>` id, `running`
  (`{ repo, kind, operationId, progress }`), `core.progress` of that id only, `isBusy`, `isCancellable` (network
  kinds: fetch, remote delete), `cancel()` (`bridge.cancel`), and `GitRepositoryService.refresh("afterWrite")` after
  every operation, also after a failure. A second `run` while one runs answers `null` (the controls are disabled; the
  core would queue it anyway).
- Stand-in bridge (body stays self-contained): git writes (`git.fetch`, `git.switch`, `git.branchCreate`,
  `git.branchRename`, `git.branchDelete`, `git.setUpstream`) change the seeded refs/status, bump the fingerprint and
  emit `repository.changed`; seed `unmergedBranches`, `fetchedRefs`, and `slow` per method: a slow write emits its
  `progress` and `prompts` under the caller's operation id and waits for every prompt to be answered (then answers as
  usual), a `prompt.cancel` (`AUTHENTICATION_CANCELLED`) or `cancel(operationId)` (`CANCELLED`); every prompt that
  leaves is announced with `prompt.closed`, like the core.
- Tests (plan names where they apply): `credentialPromptDialog.component.spec.ts` — message verbatim with the label;
  password for secret, text for text; yes / no for confirm; answer sent once on Enter and the input empty right after;
  `prompt.cancel` on Cancel and when Escape closes the dialog; second prompt queued with "(1 of 2)"; closes on
  `prompt.closed` without an answer; absent in the web build; **the answer never reaches `console.*`, the page's HTML
  or the prompt state** (`current`, `waitingCount`). `gitOperation.service.spec.ts` — fresh id and progress while
  running, cancel through `bridge.cancel(operationId)`, progress of other requests ignored, no second operation, cancel
  only for network kinds, re-read after a failure. `shellPolicy.test.js` — three mapping cases. "Stays open across
  view switches" holds by placement (outside the outlet) and is checked in the e2e of task 2.

### 2. Fetch and branches (M8 task 2)
- **Sync button** (`cc-sync-button`, design H5) after the current branch in `cc-history-toolbar`: `join` of the main part
  (`fa-rotate` "Fetch", `title` "Fetch from all remotes"; label hidden below `xl`, `aria-label` kept) and the caret
  ("More sync actions") with a floating menu: Fetch · Fetch and Remove Deleted Branches (`prune: true`) · Set
  Upstream… (only on a branch). **Design over plan / scope:** the plan's three `cc-sync-buttons` are one split button
  (OD3); Pull, Push, Publish, Force Push and the state-dependent main action arrive with M11 ("unbuilt features are
  not shown"), so the main part always fetches for now. "(last fetched 12 min ago)" is left out: nothing reports
  when the last fetch ran. Running: "Fetching…", disabled, static icon, `title` "Fetching — progress shows in the
  status at the top" (mock-up), the caret becomes Cancel (`fa-stop`, "Cancel the fetch") → `bridge.cancel`; any
  other running write disables both parts with "Waiting for the previous git operation…". The button is only in the
  History toolbar; W1's GIT section and the project overview card get it with M11 (and the confirmation host then has
  to move next to the credential prompt, see below).
- **Workspace status (W1)** shows the fetch, as design H5 / W1 ask (the sync button does not animate):
  `workspaceTrigger` takes an optional `gitActivity` (`gitActivityOf(running, workingFolder)`; only `fetch` is worded,
  `fa-cloud-arrow-down motion-safe:animate-pulse`, "Fetching · 45 %" / "Fetching…", progress fill from `done/total`,
  title line "Fetching — <git's progress line>", aria "fetching 45 percent"); it wins over a running analysis, which
  then shows as the "+1" badge (W1 "two things at once"). Local writes (switch, create…) are quick and show nothing.
- **Results and failures** (`BranchActionsService.report`): fetch success toasts "Fetched 3 updated refs" / "Already
  up to date"; branch writes toast nothing on success (no wording in the design; the tree and toolbar update).
  Failures are **error toasts that stay until dismissed** with "Details" = git's verbatim `detail` (design deviation
  4, principles §3): `ToastService.show(text, severity, { details?, action? })`, errors no longer time out,
  `cc-toast` gained the Details expansion (`font-mono text-xs whitespace-pre-wrap max-h-40 overflow-auto`), one action
  button and `w-96 max-w-[calc(100vw-2rem)]` with wrapping (`whitespace-pre-line` keeps git's file list on lines).
  `CANCELLED` (the user pressed Cancel) shows nothing. Sentences (`gitErrorSentence(error, context)`) per design H6:
  `LOCAL_CHANGES_WOULD_BE_OVERWRITTEN` lists git's files (indented lines of `detail`, ≤ 10, "and n more"),
  `BRANCH_CHECKED_OUT_ELSEWHERE`, `BRANCH_EXISTS`, `AUTHENTICATION_REQUIRED`, `AUTHENTICATION_CANCELLED`,
  `NETWORK_UNAVAILABLE`; a sentence whose part is unknown falls back to "Git failed: <message>" — for fetch the remote is
  named only when the repository has exactly one (`fetch --all` does not say which remote failed).
- **Branch menu** (`cc-branch-context-menu`, H10) from the branches tree: right-click on a ref row, Menu key or
  Shift+F10 on the active row (inset under it, first enabled item focused, ↑/↓, Escape returns focus to the tree);
  double-click on a local branch switches (H7). Items per `util/branchMenu.ts`: current — Rename…, Set Upstream…;
  other local — Switch To, New Branch from Here…, Rename…, Delete…, Set Upstream…; remote — Check Out as New Local
  Branch…, New Branch from Here…, Delete from Remote…; tag — New Branch from Here…. Push / Force Push (M11) and
  Compare with… (06) are not shown yet. Disabled with the reason in `title`: "Waiting for the previous git operation…"
  while one runs; Switch To / Delete… of a branch another worktree holds: "Checked out in <path>" (H7's wording).
  **Wording supplied here** (design names items, not icons or hints): icons `fa-i-cursor` (Rename), `fa-trash`
  (Delete, Delete from Remote), `fa-link` (Set Upstream), `fa-cloud` / `fa-plus` / `fa-code-branch` as the commit
  menu; hints reuse the commit menu's three ("Switch to this branch", "Create a branch at this commit", "Create a
  local branch that tracks it"), the others have none.
- **Commit menu write entries** (H10) after a second divider below Copy Subject: "Check Out '<branch>'" per local
  branch at the commit other than the current one (≤ 3), "Check Out '<remote>' as New Branch…" (≤ 3), "New Branch
  Here…" (always); disabled while a write runs. `contextMenuItem` gained a `disabled` input (shared, one input +
  `disabled:` classes); the three menus are now `w-max min-w-64 max-w-[32rem]` (seen: "Check Out 'origin/main' as N…"
  was cut at `w-64`).
- **Dialogs** (H14, `cc-branch-dialog`, one native dialog `modal-box max-w-md`, hosted in `cc-git-history-panel`):
  New Branch ("Name" `font-mono`, live rule messages, "Starts at `a1b2c3d` <subject>", "Switch to the new branch" off,
  Cancel / Create branch disabled while invalid); Rename Branch (prefilled, the effect sentence follows the typed name,
  disabled while unchanged); Set Upstream (`select` of remote branches + "No upstream", preselects the current
  upstream; `aria-label` "Upstream" — no visible label in the design); Check Out as New Local Branch (name prefilled
  with the remote's branch name). `util/branchName.ts` checks only what H14 words (leading `-`; spaces, `..`, `~`, `^`,
  `:`, `?`, `*`, `[`, `\`, `@{`; a taken name); the other `BranchName` rules (control characters, `.lock`, a part
  starting with `.`, `HEAD`) are left to the core, whose `BAD_REQUEST` reaches the user as "Git failed: <message>" —
  no wording exists for them.
- **Confirmations** (H15, `cc-git-confirm-dialog` + `GitConfirmationService.ask(): Promise<boolean>`): destructive in the
  `deleteConfirmDialog` layout (Cancel focused, verb `btn-error`), the rest in the `ConfirmDialogComponent` layout (No
  focused / Yes) — its own component because `ConfirmDialogComponent` reports no decline. Texts from `util/effectText.ts`
  (unit-tested): Switch Branch only with changed files (design deviation 5; "from" is the branch in quotes or the
  short SHA of a detached HEAD; "1 changed file stays"), Delete Branch ("stay reachable from" the upstream when it
  exists, else the current branch — what `git branch -d` checks; "become unreachable" only when neither exists),
  Delete Unmerged Branch after `BRANCH_NOT_FULLY_MERGED` with the count from `git.measureDistances` (falls back to
  "has commits not merged" when it cannot count), then `force: true`; Delete Remote Branch; Git Hooks (once per
  repository id and session, inside `GitOperationService.run`; No sends nothing and asks again next time). Escape and
  the backdrop decline. Switching also asks before "Check out as new branch" and "Create … and switch" (both switch).
- **Hosts:** `cc-branch-dialog` and `cc-git-confirm-dialog` live in the History panel, because only the History starts
  writes now; when M11 puts the sync button into W1 / the project overview, move `cc-git-confirm-dialog` next to
  `cc-credential-prompt-dialog` in `views/codeCharta.component.html`.
- Tests (plan names where they apply): `branchActions.service.spec.ts` — switch confirmation names the folder and both
  branches; No sends nothing; clean switch asks only the hooks notice; refusal shows git's files (toast + Details);
  second confirmation before force delete (and declined keeps the branch); remote named on remote delete; fetch
  toasts and a named-remote failure; `CANCELLED` silent; create / rename / track / set upstream params; declines;
  detached HEAD wording. `branchDialog.component.spec.ts` — name validated while typing, each dialog's params.
  `syncButton.component.spec.ts` — progress and Cancel while fetching; disabled while another write runs; caret
  menu. `gitOperation.service.spec.ts` — hooks notice once per repository and session, declined sends nothing.
  `commitContextMenu` / `branchContextMenu` / `branchesTree` specs — entries, disabled reasons, keyboard opening,
  double-click. `effectText`, `branchName`, `branchMenu`, `gitErrorText`, `workspaceTrigger`, toast specs. E2E
  (`gitHistory.e2e.ts` "History writes"): fetch with hooks notice, W1 "Fetching · 45 %" and Cancel; passphrase prompt
  over the metrics view, answered once; New Branch Here… then Switch To with the confirmation; refusal toast with
  git's files and Details.

### 3. "Show in map" (primary commit action)
- `features/snapshots/gitHistory/showInMapAction.ts`, provided **first** in `provideSnapshotsForGitHistory()` (H9 shows it
  first): `label` "Show in Map", `detailsLabel` "Show in map", `fa-solid fa-map`, `isPrimary: true`, `hoverHint` ""
  (design S5 gives none: "—"). Offered for one item — a commit or the uncommitted changes (design "What the map
  follows": the working tree shows the current checkout) — when the folder has at least one snapshot; a folder without
  any has nothing to show (S10 "none" offers only Analyse). Runs 05-M5's `SnapshotViewService.showCommit(sha)` /
  `showCurrentCheckout()`, which resolve exact or nearest, load it and navigate to the map. **Gap closed in the
  action, not in the service:** `showTarget` ignores a request for the target the map already follows, so Show in map
  on that commit would stay in the History; the action then calls `ProjectsFacade.showMap()` itself, once that target
  is shown (`status() === "shown"`), leaving `SnapshotViewService` and its "never leave the view later" test untouched.
  Enter / double-click in the commit list now run it (M5's `runPrimary`).
- Not built: the H9 resolution line ("Not analysed — nearest is 9f8e7d6, 4 commits older") — 05-M5's renderer notes
  leave it open; it needs `snapshots.resolveForCommit` per selection in the details pane.
- Tests: `provideSnapshotsForGitHistory.spec.ts` (labels and order, offered only for one item of an analysed folder,
  commit → `showCommit`, working tree → `showCurrentCheckout`, already-followed target → only `showMap` once shown);
  e2e "Show in map": the details' first button and a double-click open the metrics view with that analysis.

### Screenshots (Playwright, seeded stand-in; scratch spec, not committed)
1600×900, cc-dark and cc-light (theme set on `<html>`): hooks notice; credential prompt secret ("(1 of 3)", masked,
help line), text, confirm (multi-line host-key message wraps in the `<pre>`, No focused / Yes); fetch running (toolbar
"Fetching…" disabled + Cancel square, W1 "Fetching · 45 %" with the fill and the pulsing cloud icon); sync caret menu;
commit menu with Show in Map first and the write entries; New Branch (valid, and with a space: rule message in
`text-error`, Create branch disabled); branch menus (local, remote); Rename (effect sentence); Set Upstream; Check Out
as New Local Branch; Switch Branch (No / Yes); Delete Branch; Delete Unmerged Branch (Cancel / Delete anyway in
`btn-error`); Delete Remote Branch; refusal toast with git's two files, then Details with git's full text. Compared
with H5, H10, H14–H16 and the mock-up: layouts, wording and button order match. **Fixed after looking:** the menus cut
"Check Out 'origin/main' as N…" and "Fetch and Remove Deleted Branc…" at `w-64` / `w-72`; they are `w-max min-w-64
max-w-[32rem]` now. **Seen, not changed (other milestones):** toasts still cover the nav bar's right end (OD8, 02-M7);
the error alert in cc-dark is a bright red block with dark text (daisyUI `alert-error`); the stand-in counted "0 commits
not merged" because its seeded branch was in fact merged (real git refuses only unmerged branches).

### Gates (final, Linux)
Root `npm run format:check` clean; `visualization/`: `npm test` 740 suites, 5901 passed + 2 todo, coverage 97.19 /
90.42 / 96.03 / 97.15; `npm run lint` (depcruise, styles, knip) clean; `npx tsc --noEmit -p tsconfig.json` clean;
`npm run test:electron` 79/79; `npm run build` ok; `npm run e2e:ci` 185/186 then the one failure (an assertion on
`#/metrics`, the metrics route is `#/`) fixed and the history e2e 9/9; `npm run e2e:desktop` 16/16 with the core built
into `core/target/studio-04-m7m8-ui`. Temporary `E2E_PORT` 9039 and the chromium channel reverted.

### Shared files touched
`electron/main.js`, `electron/shellPolicy.js` (+test), `views/codeCharta.component.html|ts` (one dialog),
`features/shared` toast service/component (+specs) and `contextMenuItem` (`disabled` input),
`features/workspaceStatus` (git activity in the trigger), `features/snapshots/gitHistory` (Show in map),
`util/desktop/desktopBridge.mocks.ts` (+spec), `CHANGELOG.md` (two entries rewritten), plan 04 (M7 task 5 and M8
task 2 as built).

### For 04-M9..M11 renderer work
- Every write goes through `GitOperationService.run({ kind, repo, send(operationId) })` (hooks notice, fresh id,
  progress, refresh afterwards); extend `GitOperationKind` and `NETWORK_OPERATIONS` (pull, push → Cancel).
- Confirmations: `GitConfirmationService.ask(GitConfirmation)` with texts in `util/effectText.ts` (add discard, pull
  choice — needs a third button, force push, amend, abort); failures: copy `BranchActionsService.report` (sticky error
  toast with Details; `ToastService` already takes `action` for "Pull" / "Fetch" / "Publish branch").
- M11: make the sync button's main action state-dependent (H5 table), add Pull/Push/Publish/Force Push to the caret
  and to the branch menu (`util/branchMenu.ts`), word "Pulling"/"Pushing" in `GIT_ACTIVITIES` of
  `workspaceTrigger.ts`, put the button into W1 / the project overview, and then move `cc-git-confirm-dialog` next to
  `cc-credential-prompt-dialog` in `views/codeCharta.component.html`.
- The stand-in bridge answers the M8 writes and simulates slow operations with progress and prompts (seed `slow`);
  add the M9–M11 methods the same way.

