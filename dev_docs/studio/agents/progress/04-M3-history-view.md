---
name: 04-M3 history view, branches pane
state: progress
version: 1
---

## Goal

Add the History view (new nav-bar tab, route `history`) with its panel shell, problem notices and the
branches tree, on top of git repository state held in signal services (plan 04, section 5, M3).

## Tasks

Copied from `04-git-branches-and-history.md`, section 5, M3. Branched from `feature/studio-stack` (git
core 04-M1/M2 and projects UI 03-M5 present). Design overrides the plan's UI: `design/04-history.md` (H1 tab,
H3 frame, H4 toolbar shell, H6 problem notices, H7 branches tree; read "Deviations from the plan"),
`design/00-design-principles.md`, `design/journeys.md`, mock-up `design/mockups/studio-screens.html`.
**The plan's task 6 (`currentBranchChip`) is replaced by the design**: H2 is merged into W1 (workspace
status, area 05) — do not build a branch chip; leave the hook for W1 and say so.

From 03-M5: a small `FolderGitService` exists in `features/projects` (cached `git.status`, one `git.log`);
this milestone's `GitRepositoryService` should take over that role (move or delegate; record it). OD1: the
History view follows the working folder; it shows it, it does not choose it. Core methods: `git.repositoryInfo`,
`git.status`, `git.branches`, `git.refsFingerprint`, event `repository.changed` (04-M1); error codes
SCREAMING_SNAKE_CASE with git's text in `details.detail`. Extend the fake bridge's self-contained body with
a `git` seed (refs, status, commits, per-method failures) — this is 04-M1's deferred task 7 seed.

Parallel work note: other agents work on 03-M6 (projects menu entries, desktop tools store rows) and on the
metrics bar / file extension bar / toasts at the same time. Keep changes to shared files (nav bar template,
`VIEW_TABS`, `app.config.ts`, the fake bridge, `CHANGELOG.md`) small and localised.

1. Tidy first: jump targets / modes per view
2. Route and empty History view behind availability
3. API and repository state services (+ fake bridge git seed)
4. Panel shell and problem notices
5. Branches tree
6. ~~Branch chip~~ — replaced by W1 (area 05); not built

## Steps

- [ ] 1. Tidy first
- [ ] 2. Route
- [ ] 3. Repository state
- [ ] 4. Panel shell
- [ ] 5. Branches tree
- [x] 6. Branch chip — replaced by the design (W1)

## Notes

