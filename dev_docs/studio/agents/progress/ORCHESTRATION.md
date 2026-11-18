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
| 01-M0 Spikes | spike | done (Linux); Windows/macOS items open for owner | owner hardware for S1/S2/S3/S4/S5 remainder | feature/studio-01-m0 | 977074f72 |
| 01-M1 Core skeleton, protocol, contract, CI | core | done | — | feature/studio-01-m1 | c6b3d9a7f (merged 8688edb53) |
| 01-M2 Process runner, tools, settings, doctor | core | in progress | — | feature/studio-01-m2 | — |
| 01-M3 Electron shell | shell | todo | 01-M2 | feature/studio-01-m3 | — |
| 01-M4.1 Renderer seam (desktop bridge port, fake) | renderer, no UI | todo | 01-M3 | feature/studio-01-m4 | — |
| 01-M4.2 Desktop tools panel | UI | blocked | design 01-desktop-tools; 01-M4.1 | — | — |
| 02-M0 Spike | spike | done | — | feature/studio-02-m0 | f0d4006c9 |
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

- 01-M0 (see `01-m0-spikes.md`): contract generator is ts-rs 12 with `with_large_int("number")` and
  `biome check --write` on the output. For M3: the relay reads `event.senderFrame` synchronously before
  any `await`; the CSP gains `frame-src 'none'`. darwin core binary built on a macOS runner.
- Pre-M3 fix needed: with npm 12 `script/ensureElectron.js` reports success but the allowScripts gate
  blocks the Electron download; `npm start` / packaging need `install.js` called directly. To be done
  as task 0 of 01-M3.
- 02-M0 (see `02-m0-spike.md`): plan 02 design holds. For M1: delete `@theme` lines 19-38; task 7 must
  also set label `color` and `border` from the `buildingLabel` palette. E2E on this Linux machine
  needs a temporary `channel: "chromium"` override (no Google Chrome installed); not a repo change.

- 01-M1 (see `01-m1-core-skeleton.md`): `rust-toolchain.toml` channel `stable` + `rust-version = "1.95"`
  (an exact pin made rustup download); workspace `resolver = "3"`; `serve` requires `--data-dir` until
  2.1; licences checked by a `cargo-deny` job in `test_core.yml` (not run locally); Rust prerequisite
  documented in `dev_docs/DEV_START_GUIDE.md` (root README has no prerequisites section).

## Known environment issues (not caused by the milestones)

- This machine runs Node 26.13 while `mise.toml` and CI pin Node 24. On Node 26,
  `app/codeCharta/stores/fileStore/loaders/ccJson/util/urlExtractor.spec.ts` fails 9 tests
  (`Cannot delete property 'location' of #<Window>`). The spec and everything it imports are
  identical to `main`; the rest of the suite (4852 tests) and the coverage gate pass. Needs Node 24
  locally, or a fix of the spec for Node 26 (owner decision).

## Open questions for the owner

1. Windows/macOS spike items of 01-M0 (S1, S2, S3 Gatekeeper, S4, S5) need your hardware; procedures
   are in `01-m0-spikes.md`.
2. `Unicode-3.0` licence (needed by `unicode-ident`, pulled in by every proc macro) is in neither list
   of `license_policy.json`; `deny.toml` has a one-crate exception for now.
3. `actions/cache@v5` in `test_core.yml` is pinned by tag, not SHA; please confirm a SHA.
4. Exact Rust toolchain pin (instead of `stable`) once machines and CI may download it.
5. Node 26 failure of `urlExtractor.spec.ts` (see above): fix the spec, or require Node 24 locally?

## Session log

- 2026-11-18: 01-M1 verified (cargo fmt/clippy/test, contract drift, format, lint, tsc, npm test with the Node 26 caveat) and merged; 01-M2 started.
- 2026-11-18: 02-M0 verified (format check green, notes read); plan 02 now waits only on design 02-themes.
- 2026-11-18: 01-M0 verified (format check green, notes read); 01-M1 and 02-M0 started.
- 2026-11-18: file created; no design folder yet, so all UI work is blocked on design.
