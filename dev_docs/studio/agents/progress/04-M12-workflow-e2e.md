---
name: 04-M12 workflow end-to-end and docs (stash not built)
state: complete
version: 1
---

## Goal

Cover the git workflow of the History end to end against the stand-in bridge and document the git actions in
`visualization/README.md` (plan 04, section 5, M12). Stash is a stretch.

## Tasks

Copied from `04-git-branches-and-history.md`, section 5, M12. Built together with 04-M11 task 2 on
`feature/studio-04-m11-ui` (from `feature/studio-04-m6`).

1. e2e `gitWorkflow.e2e.ts`
2. Docs in `visualization/README.md`
3. Stretch: stash

## Steps

- [x] 1. Workflow e2e
- [x] 2. README
- [ ] 3. Stash — not built: the core has no stash method (no `stash.rs`, no `git.stash*` in the contract), and the
  instructions allow the stretch only when the core supports it already.

## Notes

### 1. e2e (as built)
- `features/gitHistory/e2e/gitWorkflow.e2e.ts` ("Git workflow"), its own seed (the billing project on
  `feature/invoice-rounding` tracking `origin/feature/invoice-rounding`, commits `c → b → a`):
  - non-fast-forward pull → hooks notice → "Branches Have Diverged" → Rebase my commits → "Pulled 1 commit", modes
    sent `ffOnly` then `rebase`, the main part then fetches;
  - diverged branch → the choice first → Merge → hooks notice → conflicts toast with the count, the merge notice
    with "1 file has conflicts.", "Abort merge…" → Abort Merge confirmation → the notice goes;
  - Force Push (with Lease)… from the caret → its own confirmation with both short SHAs → hooks notice → "Pushed 2
    commits to …", lease = the remote commit;
  - Publish → "Published 'feature/invoice-rounding' to origin", the main part then fetches;
  - rejected push → error toast with "Pull" → "Pulled 1 commit".
- The plan's stage / commit, discard and passphrase scenarios already run in `gitHistory.e2e.ts` ("History changes",
  "History writes", 04-M7..M10); they were not duplicated. Their two fetch tests now seed a branch level with its
  upstream, because the sync button's main part pulls on the diverged branch of the shared seed (H5).
- `data-testid`s: the plan's list is met by the existing ids (`history-tab-changes`, rows by `data-row-key`,
  `diff-view`, `commit-summary`, `commit-button`, `credential-prompt`); for the one contextual sync button
  `sync-button-main`, `sync-button-caret`, `sync-button-cancel` and `sync-menu-<action>` replace `sync-fetch`,
  `sync-pull`, `sync-push`; new: `history-operation-notice`, `history-operation-abort`, `git-choice-<value>`.
- **Found by the e2e and fixed:** the conflicts error toast covered the notice's "Abort merge…" (see
  `04-M11-pull-push.md`, "Notice layout"); the test still clicks Abort with the toast open.

### Screenshots (Playwright, stand-in; scratch spec, not committed)
1600×900 and 1280×720, cc-dark and cc-light: diverged sync button "Pull ↓1 ↑2", caret menu, pull choice (Cancel /
Merge / Rebase my commits, no default), conflicts toast with the merge notice (buttons clear of the toast at both
sizes), Abort Merge, Force Push. Compared with H5, H6, H15: wording, button order and layouts match; the toast still
covers the toolbar's Log / Changes / Refresh (question 1 in `04-M11-pull-push.md`).

### 2. Docs
`visualization/README.md`, "Commit history (desktop app)" gains "Git actions": the sync button and its main action,
pull (fast-forward, merge or rebase choice, conflicts notice and abort), force push with lease only, branches and
changes, hooks notice, credentials (credential helper, ssh-agent / Pageant, the CodeCharta dialog, nothing stored),
identity commands, and what is not in the app. Changelog: the existing Git history entry extended with pull, push,
publish and force push.

### Gates (final, Linux, before the last commit; for 04-M11 task 2 and 04-M12)
Root `npm run format:check` clean (2702 files); `visualization/`: `npm test` 772 suites, 6279 passed + 2 todo,
coverage 97.23 / 90.35 / 96.16 / 97.2; `npm run lint` (depcruise, styles, knip) clean; `npx tsc --noEmit -p
tsconfig.json` clean; `npm run test:electron` 80/80; `npm run build` ok (the existing initial-bundle budget warning);
`npm run e2e:desktop` 17/17 (core built into `core/target/studio-04-m11-ui`); `npm run e2e:ci` 204/204. No change
under `core/`, so no cargo or contract gates. Temporary `E2E_PORT` 9066 and the chromium channel reverted before
committing.
