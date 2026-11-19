---
name: 04-M9/M10 renderer — changes, diff and commit
state: progress
version: 1
---

## Goal

The Changes tab of History: working-tree changes grouped and stageable, a diff view, discard to the recycle bin,
and the commit box with amend (renderer halves of plan 04 M9 task 2 and M10 task 2).

## Tasks

Copied from `04-git-branches-and-history.md` section 5, M9 task 2 and M10 task 2. Combined into one agent by
orchestration (same area, weekly budget). Branched from `feature/studio-stack`. Design overrides the plan's UI:
`design/04-history.md` (Log/Changes tabs, H11 changes panel, H12 commit box, H13 diff view, H15 confirmations
incl. discard and amend-of-pushed; "Deviations from the plan"), `design/00-design-principles.md`, mock-up.

Core contract (on the stack): `git.workingTree {repo}` → `GitWorkingTree`; `git.diffFile {repo, path, kind}` →
`GitDiff` (≤ 2 MiB shown, `isTruncated`; over 4 MiB `OUTPUT_TOO_LARGE`); `git.stage {repo, target: paths|all}`,
`git.unstage {repo, paths}`, `git.discard {repo, entries: [{path, kind, change}]}` — send rows exactly as listed
(1–1000), each returns a fresh `GitWorkingTree`; codes `CHANGED_SINCE_LISTED`, `NOT_ALLOWED`, `INDEX_LOCKED`,
`IO` (recycle bin unavailable), `RECYCLE_FAILED`. Discard always goes to the recycle bin. `git.commit {repo,
subject, body, amend}` → `GitOperationResult`; codes `IDENTITY_UNKNOWN`, `NOTHING_TO_COMMIT`, `HOOK_FAILED` (hook
output in `details.detail`), `CONFLICTS`, `OPERATION_IN_PROGRESS`. Every call ends with `repository.changed`
(parts incl. `workingTree`).

From `04-M7-M8-ui-prompts-fetch-branches.md`: run every write through `GitOperationService.run` (hooks notice,
progress, refresh); confirmations through `GitConfirmationService.ask` with texts in `effectText.ts`; failures like
`BranchActionsService.report` (error toasts persist, accept a follow-up action). Diff text rendered through
interpolation only (never `innerHTML`). The "Open changes" link and the committer label left open by 04-M4 can be
completed here if the design words them.

1. Changes tab, changes panel, change rows, diff view, diff line parsing (M9 task 2)
2. Commit box, commit message service, draft per repository, amend-of-pushed confirmation (M10 task 2)

## Steps

- [ ] 1. Changes and diff
- [ ] 2. Commit box

## Notes

