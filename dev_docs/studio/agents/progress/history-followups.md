---
name: History and workspace status follow-ups (designer answers O9.2, O9.6, O9.7)
state: complete
version: 1
---

## Goal

Clear the quality-gate errors of the History files, then build the designer's answers of 2026-11-21 to
O9.2, O9.6 and O9.7 (`04-history.md` H5, H6, H13; principles §3; `05-snapshots.md` W1; `03-projects.md` P3).

## Steps

- [x] Gate (structural): context sentences of `gitErrorText` as a table; `resolveRefText` split into named
      refs and hash prefixes; shared operation names and selected-row look. `commitList.component.ts` left
      alone on the orchestrator's order (refactored on the stacked PR branches)
- [x] O9.2: "Work in '<label>'" stays in the History; untracked diff command with `/dev/null` (`NUL` on
      Windows); commands in toasts wrap; selection outline in every History list
- [x] O9.6: toasts below the History toolbar and notices; notice actions on their own line; no toast for a
      conflicts stop in the History; sync actions disabled during a merge or rebase; Publish for a branch
      without upstream in the branch menu; approved wording
- [x] O9.7: conflicts toast with "Open History" outside the History; merge state in W1's GIT section; W1
      stays open behind a confirmation; "Open History" in W1 and on the working-folder card
- [x] Changelog, gates

## Notes

Branch `feature/studio-history-followups` from `feature/studio-next`. No core change.

- **Is the History shown?** New root `HistoryNavigation` (gitHistory, exported by the facade): `isShown` from the
  active view, `open()`. A conflicts stop counts as "started in the History" when the History is the view on
  screen (also for a pull started from W1 while the History is shown, since its notice is then visible).
- **Toast offset.** Shared `ToastOffsetDirective` (`[ccToastOffset]="isOnScreen"`) publishes the element's height
  as `--cc-toast-offset` on the document root; the toast stack's top is `bars height + offset`. The History
  wraps its toolbar and notices in `history-header` with it, on while the History is the active view (the view is
  kept alive, so destroy alone would not remove it).
- **Sync during a merge.** `SyncContext.inProgress`: the main part shows Fetch, Pull/Push/Publish/Force Push are
  disabled with "Finish or abort the merge first." (any operation in progress is named: rebase, cherry-pick…).
  Set Upstream stays enabled. The branch context menu's Push/Force Push are not held during a merge (H5 names
  the sync button only).
- **Nothing to pull.** The Pull menu item is disabled with "Nothing to pull: the remote has no new commits. Use
  Push." when the counts show nothing behind; `SyncActionsService.pull()` itself only refuses for detached HEAD,
  missing/gone upstream or an operation in progress, so the "Pull" follow-up of a rejected push (counts from an
  older fetch) still pulls.
- **Publish in the branch menu**: every local branch without upstream (current or not) offers "Publish 'x'"
  instead of Push.
- **Conflicts toast** outside the History: "Git stopped on conflicts in n files. Finish or abort the merge in the
  History." (rebase when the pull rebased) + "Open History".
- **Work in '<label>'**: `FolderChoice.staysOnView` (projects service, small additive change) keeps the view when
  the folder has no analysis instead of turning to the project overview.
- **W1**: the GIT section adds "Merging — 2 files have conflicts. Finish or abort it in the History." and an
  "Open History" button after the sync button; a click inside a `<dialog>` is no outside click.
- **P3 card**: "Open History" `btn btn-sm` at the bottom of the card for git folders that are not missing.
- **Untracked diff** command uses `navigator.userAgent` to pick `NUL` on Windows (nothing else in the renderer
  knows the platform).

### Open questions for the designer

1. Pull disabled at "nothing behind" relies on counts from the last fetch; a remote that moved since shows Pull
   disabled until Fetch. Keep it, or leave Pull enabled and let git answer "Already up to date"?
2. Should the branch context menu also hold Push/Force Push/Publish during a merge or rebase?

## O11 tweaks

Designer answer of 2026-11-22 (O11.1), branch `feature/studio-o11-tweaks`.

- Pull stays enabled at "nothing behind": `pullReasonOf` only refuses for the blocking reasons (detached, no or gone
  upstream, operation in progress); "Nothing to pull: ..." is gone. The counts may be stale, so git answers; a pull with
  nothing new shows the existing "Already up to date" toast. The main part of the sync button still shows Fetch when
  nothing is behind, so only the caret's Pull item changed.
- The branch context menu holds Push, Publish and Force Push during a merge, rebase or any other operation in
  progress, with the sync button's reason ("Finish or abort the merge first."): `branchMenuItems` takes the operation
  as a fourth argument, fed from `SyncActionsService.inProgress`.
- Tests: `syncState`, `branchMenu`, branch context menu specs; two e2e tests in `gitWorkflow.e2e.ts`.
