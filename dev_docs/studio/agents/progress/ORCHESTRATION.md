# Orchestration state

Single source of truth for which milestone of plans 01–06 is where. Updated and committed by the
orchestrator after every change of state. Another machine continues from this file alone.

## Branching

- `feature/studio-integration` (local, branched from `main` at `96a239f00`) collects this file and
  every verified milestone. It is never pushed or merged into `main` without the owner.
- Each milestone runs on `feature/studio-<plan>-<milestone>` (e.g. `feature/studio-01-m1`), branched
  from the current tip of `feature/studio-integration`, and is merged back into it after verification.
- Spikes run on throwaway branches; only their progress file is kept.

## Design gate

`dev_docs/studio/agents/design/STATUS.md` **does not exist** (checked 2026-11-18). Every area
(01-desktop-tools, 02-themes, 03-projects, 04-history, 05-snapshots, 06-compare) counts as not ready.

## Milestones

State: todo · blocked · in progress · done. "UI" = needs its design area to be ready.

| Milestone | Kind | State | Blocked on | Branch | Last verified commit |
|---|---|---|---|---|---|
| 01-M0 Spikes | spike | in progress | — | feature/studio-01-m0 (throwaway, progress file only) | — |
| 01-M1 Core skeleton, protocol, contract, CI | core | todo | 01-M0 | feature/studio-01-m1 | — |
| 01-M2 Process runner, tools, settings, doctor | core | todo | 01-M1 | feature/studio-01-m2 | — |
| 01-M3 Electron shell | shell | todo | 01-M2 | feature/studio-01-m3 | — |
| 01-M4.1 Renderer seam (desktop bridge port, fake) | renderer, no UI | todo | 01-M3 | feature/studio-01-m4 | — |
| 01-M4.2 Desktop tools panel | UI | blocked | design 01-desktop-tools; 01-M4.1 | — | — |
| 02-M0 Spike | spike | todo | — | throwaway | — |
| 02-M1 Dark by default | UI | blocked | design 02-themes | — | — |
| 02-M2 No-flash boot | UI | blocked | design 02-themes; 02-M1 | — | — |
| 02-M3 Radial map and word cloud | UI | blocked | design 02-themes; 02-M2 | — | — |
| 02-M4 Dependency graph, color-range diagram | UI | blocked | design 02-themes; 02-M3 | — | — |
| 02-M5 Editor schemes and quick toggle | UI | blocked | design 02-themes; 02-M4 | — | — |
| 02-M6 Native window appearance | UI | blocked | design 02-themes; plan 01 | — | — |
| 03-M0 Spikes | spike | todo | plan 01 (shell for item 1) | throwaway | — |
| 03-M1 Store core | core | todo | plan 01 core | — | — |
| 03-M2 Projects: core, RPC, CLI, shell, fake | core + shell | todo | 03-M1 | — | — |
| 03-M3 Snapshots: core, RPC, CLI, shell | core + shell | todo | 03-M2 | — | — |
| 03-M4 Renderer load path | renderer | todo | 03-M3; check for visible parts first | — | — |
| 03-M5 Projects UI | UI | blocked | design 03-projects | — | — |
| 03-M6 Import and store settings | UI | blocked | design 03-projects | — | — |
| 03-M7 Local source and scenarios | UI | blocked | design 03-projects | — | — |
| 04-M1 Core: fixtures, contract, runner, status, refs | core | todo | plan 03 core | — | — |
| 04-M2 Core: log, details, queries, changed files | core | todo | 04-M1 | — | — |
| 04-M3 History view, branches pane, chip | UI | blocked | design 04-history | — | — |
| 04-M4 Commit list with graph, filters, details | UI | blocked | design 04-history | — | — |
| 04-M5 Selection, keyboard, context menu, ports | UI | blocked | design 04-history | — | — |
| 04-M6 Read-only end-to-end and docs | UI | blocked | design 04-history | — | — |
| 04-M7 Operation queue, progress, prompts | core + UI | todo (core half) | 04-M2; UI half: design 04-history | — | — |
| 04-M8 Fetch and branches | core + UI | todo (core half) | 04-M7; UI half: design 04-history | — | — |
| 04-M9 Changes and diff | core + UI | todo (core half) | 04-M8; UI half: design 04-history | — | — |
| 04-M10 Commit | core + UI | todo (core half) | 04-M9; UI half: design 04-history | — | — |
| 04-M11 Pull, push, abort | core + UI | todo (core half) | 04-M10; UI half: design 04-history | — | — |
| 04-M12 Workflow e2e, docs, stash | UI | blocked | design 04-history | — | — |
| 05-M0 Spikes on a real Windows machine | spike | blocked | owner: needs a Windows machine | — | — |
| 05-M1 Run one analysis from the core | core | todo | plan 04 core | — | — |
| 05-M2 Snapshot records | core | todo | 05-M1 | — | — |
| 05-M3 Queue, preflight, RPC, CLI | core | todo | 05-M2 | — | — |
| 05-M4 Analyse from the UI, browse snapshots | UI | blocked | design 05-snapshots | — | — |
| 05-M5 Nearest snapshot and stale notice | core + UI | todo (core half) | 05-M3; UI half: design 05-snapshots | — | — |
| 05-M6 Batches, retention, cleanup | core + UI | todo (core half) | 05-M5; UI half: design 05-snapshots | — | — |
| 05-M7 E2E and docs | UI | blocked | design 05-snapshots | — | — |
| 06-M0 Spikes | spike | todo | plan 05 core (item 3 needs Windows) | — | — |
| 06-M1 Compare core: commit vs commit | core + UI | todo (core half) | plan 05 core; UI half: design 06-compare | — | — |
| 06-M2 Entry points | UI | blocked | design 06-compare | — | — |
| 06-M3 Missing snapshots and staleness | core + UI | todo (core half) | 06-M1; UI half: design 06-compare | — | — |
| 06-M4 Changed files | core + UI | todo (core half) | 06-M3; UI half: design 06-compare | — | — |
| 06-M5 PRs and merge requests | core + UI | todo (core half) | 06-M4; UI half: design 06-compare | — | — |
| 06-M6 Polish and stretch | UI | blocked | design 06-compare | — | — |

The core/UI split of mixed milestones is provisional; it is confirmed against the plan text when
the milestone is started.

## Deviations from the plans

None yet.

## Session log

- 2026-11-18: file created; no design folder yet, so all UI work is blocked on design.
