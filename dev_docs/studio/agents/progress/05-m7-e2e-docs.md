---
name: 05-M7 E2E and docs
state: complete
version: 1
---

## Goal

Cover analyses and snapshots end to end in the web build (stand-in bridge) and in the desktop shell, and describe them
in the user docs (plan 05, Milestones, M7).

## Tasks

Copied from `05-commit-analysis-and-snapshots.md`, Milestones, M7. Done on `feature/studio-05-m6-ui` together with the
05-M6 renderer tasks.

1. Web Playwright with the fake bridge (`features/snapshots/e2e/snapshots.e2e.ts`, selectors only in `snapshots.po.ts`)
2. One case in the `_electron` smoke suite with fake-ccsh as ccsh and a temporary repository
3. User docs page under `gh-pages/src/content/docs/docs/visualization/`

## Steps

- [x] 1. Web e2e
- [x] 2. Desktop smoke case
- [x] 3. Docs page

## Notes

### 1. Web e2e
- Already on the branch from 05-M5: "should show the stale notice for a scripted resolution and switch to the analysis
  of the current checkout" (the plan's first two cases in one).
- The plan's third case "should keep the chip after dismissing" is now "should keep the staleness in the workspace
  status after dismissing the notice": the chip is W1's badge (design deviation 3).
- Added for 05-M6: "should analyse the last commits of the current branch in one batch and cancel it" (S4 → S7 → W1
  ACTIVITY batch line → Cancel batch) and "should delete one analysis and clean up the older ones" (S4 delete with
  confirmation, footer size, S8 plan and prune, success toast). Page object gained the selectors.
- This e2e found the W1 outside-click race described in `05-m6-batches-retention.md`.

### 2. Desktop smoke
- `electron/smoke.e2e.ts` "should create a snapshot folder in a temporary store": a temporary git repository with one
  commit (git called with `-c user.name/user.email/commit.gpgsign=false`), `core-settings.json` in the temporary data
  folder naming `core/target/debug/fake-ccsh` as ccsh and java (as the core's CLI tests do), `FAKE_CCSH_SCENARIO`
  `{ write_map: true }` passed through the shell's environment to the core. The project is created over the bridge,
  the page reloads into it, and the UI starts the analysis (W1 → "Analyse current checkout"); the test waits for the
  finished job and checks `store/projects/<project>/snapshots/<folder>/<snapshot>/snapshot.json` and that W1 no longer
  says "not analysed".
- Needs `cargo build` in `core/` (builds `fake-ccsh` beside `codecharta-core`); locally, `core/target/debug/fake-ccsh`
  is a symlink into the shared target folder like the core binary.

### 3. Docs
- `gh-pages/src/content/docs/docs/visualization/user-controls/analyses.md` ("Analyses and snapshots"), in the sidebar
  after Compare (`astro.config.mjs`): requirements (ccsh ≥ 2.2.1, Java ≥ 22, git), where to analyse, progress and the
  activity, the notice and staleness, the snapshots dialog, batches, clean-up and the recycle bin, the
  `codecharta-core analyse` / `projects list` / `snapshots list` commands, limits (submodules, LFS, long paths, svn).
  No screenshots (the desktop app has no hosted demo to take them from). The gh-pages site was not built locally
  (its dependencies are not installed in this worktree).
