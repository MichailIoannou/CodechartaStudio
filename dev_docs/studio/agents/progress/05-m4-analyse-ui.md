---
name: 05-M4 analyse from the UI and browse snapshots
state: progress
version: 1
---

## Goal

Analyse the current checkout or a commit from the desktop app, see progress, and list, open and re-open
snapshots — the step that makes maps appear in projects (plan 05, Milestones, M4).

## Tasks

Copied from `05-commit-analysis-and-snapshots.md`, Milestones, M4, **adjusted to the design**, which
overrides the plan's UI: `design/05-snapshots.md` (W1 workspace status in the nav bar map slot — it absorbs
the plan's `cc-analysis-jobs-indicator` (S3 merged into W1) and the branch chip (H2); S4 snapshots dialog;
S5 analyse actions; S6 preflight problems; S9 analysis log dialog; read "Deviations from the plan"),
`design/00-design-principles.md`, `design/journeys.md`, `design/owner-decisions.md` (OD5 core offline, OD8
toasts top right, OD9 stale notice is a persistent toast — the notice itself is 05-M5), mock-up
`design/mockups/studio-screens.html`. Branched from `feature/studio-stack` (05-M3 core, 03-M5 projects UI,
03-M6 open/import and move dialog present).

Also in scope: 05-M3 task 5 (the fake bridge's scriptable `analysis.*` / `snapshots.*` handlers and
notification emitters `completeJob`, `failJob`, … — the factory body stays self-contained) and wiring 03-M6's
move/bind dialog (P9) into the snapshots dialog (S4), which is its host. Failed-job logs: the core has
`read_failed_log` but no RPC — add `analysis.readLog {jobId}` api-first if S9 needs it (core change: cargo
gates with and without `--all-features`, own `CARGO_TARGET_DIR`). Out of scope here: task 5 (history badges,
S10) — it plugs into the History commit list, which another agent is building (04-M3/M4); leave it for after
04-M4 and say so.

Parallel work note: other agents work on 04-M3 (History view) and 02-M7 (metrics bar, toasts) at the same
time. Keep shared-file edits (nav bar, `app.config.ts`, fake bridge, `CHANGELOG.md`) small and localised.

1. Jobs and snapshot catalog services
2. Loaded snapshot registry
3. W1 workspace status (replaces the jobs indicator), including analysis progress
4. Snapshots dialog (S4) with Open, Show log (S9), analyse actions (S5), preflight problems (S6), move/bind (P9)
5. ~~History badges~~ — after 04-M4
6. Changelog
+ 05-M3 task 5: fake bridge analysis/snapshot handlers

## Steps

- [ ] 1. Jobs and catalog
- [ ] 2. Registry
- [ ] 3. Workspace status W1
- [ ] 4. Snapshots dialog
- [ ] 5. History badges (later)
- [ ] 6. Changelog
- [ ] Fake bridge analysis handlers (05-M3 task 5)

## Notes

