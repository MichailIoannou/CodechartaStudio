---
name: 04 sync button placements (W1 GIT section, P3 working-folder card)
state: complete
version: 1
---

## Goal

Put the H5 sync button into W1's GIT section and the project overview's working-folder card, as one
component shared with the History toolbar, and host the git confirm / choice dialog (and the branch
dialog) so pull, push, publish, force push and abort can ask from every view (left open by
`04-M11-pull-push.md`).

## Steps

- [x] Host `cc-branch-dialog` and `cc-git-confirm-dialog` once in the app shell (`cc-git-dialogs`)
- [x] Sync button in W1's GIT section
- [x] Sync button in the working-folder card's Upstream row
- [x] E2E from the map view and from the project overview
- [x] Changelog, gates

## Notes

Branch `feature/studio-04-sync-placements` from `feature/studio-next`. No core change.

- **One implementation.** `SyncButtonComponent` (unchanged) is exported from the gitHistory facade and used by
  the History toolbar, `cc-workspace-status` and `cc-working-folder-card`; it acts on the working folder through
  the root `SyncActionsService` / `BranchActionsService` / `GitRepositoryService`, which already read the
  working folder's refs app-wide. Running state, Cancel, disabled reasons and toasts are therefore identical in
  all three places (H5 "the same holds where the button appears in W1's dropdown and on the project overview").
- **Dialog hosting.** New `GitDialogsComponent` (`cc-git-dialogs`, gitHistory, exported by the facade) holds
  the branch dialog and the git confirm dialog; `views/codeCharta.component.html` hosts it next to
  `cc-credential-prompt-dialog` (one added line). `cc-git-history-panel` no longer hosts either. The pull choice,
  Force Push and Abort confirmations, the Git Hooks notice and Set Upstream… now open from any view.
- **W1.** A row `workspace-status-sync` under the branch / changes lines of the GIT section, only when the git
  status is known (not for plain folders, git problems or while loading). The dropdown content gets `scale-none`:
  daisyUI's open dropdown sets `scale: 1`, which makes it the containing block of the sync menu's
  `position: fixed` floating menu, so the menu opened ~40 px off its caret (found by the e2e). Clicking a sync
  menu item keeps the dropdown open; answering a confirmation (a click on the modal outside the dropdown) closes
  it, like any outside click.
- **P3 card.** The Upstream row now follows the mockup's two lines: the upstream name (truncated), then the
  ahead / behind sentence ("in sync" / "no upstream" / "upstream gone" / "↑2 to push · ↓1 to pull") with the sync
  button after it, wrapping. Before, the name and the counts were one unbreakable line that ran past the card's
  right edge for long upstream names.
- **Abort** stays where H6 puts it (the History's operation notice); what moved is its confirmation's host. A pull
  started from W1 or the overview that stops on conflicts shows H6's error toast, whose text points to "the
  notice above the list" — which is only in the History (question 1 below).
- Tests: `gitDialogs.component.spec.ts` (confirmation and branch dialog shown from the shell host);
  `workspaceStatus.component.spec.ts` — `should pull with the sync button of its git section`, `should keep its
  dropdown open while an action is chosen from the sync menu`; `workingFolderCard.component.spec.ts` — `should push
  with the sync button next to the upstream and then read in sync`. E2E `gitWorkflow.e2e.ts`, "Sync button outside
  the History": pull choice from W1 on the map view, the W1 sync menu opens directly below its caret, force push
  with lease from the overview card.

### Not done (outside this item)

- W1's "Open History" button next to the sync button and the card's "Open History" button (both in the
  mockups) do not exist yet; not added here.

### Questions for the designer

1. A pull started from W1 or the project overview that stops on conflicts: the H6 toast says "The notice above the
   list says how to finish or abort", but that notice is only in the History. Should the toast get an "Open
   History" follow-up (or another text) when the pull did not start in the History, or should W1 / the card show
   the merge / rebase state with an Abort?
2. Should W1's dropdown stay open after a confirmation is answered (today any click outside it, the modal
   included, closes it, so the "Pulling…" state is then seen only on the trigger)?

### Gates (Linux)

Root `npm run format:check` green (2765 files); `visualization/`: `npm test` 798 suites, 6509 passed (2 todo),
coverage 97.32 / 90.44 / 96.29 / 97.28; `npm run lint` green (no dependency violations, styles, knip);
`npx tsc --noEmit -p tsconfig.json` green; `npm run test:electron` 80 passed; `npm run build` green;
`npm run e2e:desktop` 18 passed; `npm run e2e:ci` 218 passed.
