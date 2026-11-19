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

- [ ] 1. Credential prompts
- [ ] 2. Fetch and branches
- [ ] 3. Show in map

## Notes

