---
name: 04-M7/M8 renderer — credential prompts, fetch and branches (+ Show in map action)
state: progress
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
- [ ] 2. Fetch and branches
- [ ] 3. Show in map

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

