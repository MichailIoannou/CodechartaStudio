---
name: 05-M0 ccsh process spikes
state: progress
version: 1
---

## Goal

Answer how `ccsh` behaves as a child process (layout, launch, output, exit codes, cancel, orphaned
worktrees) before plan 05's core runs analyses. The plan asks for a real Windows machine; this run covers
what Linux can answer and writes the Windows procedure down for the owner.

## Tasks

Copied from `05-commit-analysis-and-snapshots.md`, Milestones, M0. Linux part now; Windows part open.

1. Installed layout and launching `CcshLauncher --version` from a throwaway Rust `Command` without a shell
   (Linux: `analysis/` built with `./gradlew installDist`; record the npm global layout as open for Windows)
2. `ccsh.cmd` launch behaviour — Windows only (open)
3. `ccsh analyse <repo> -o <tmp>/map -p --commit=<sha>` piped: raw stderr (progress segments), stdout (`Map:`
   line, encoding of `─` with and without `-Dstdout.encoding=UTF-8`), exit codes for success, a bad
   `--without=x` (expect 1) and an unknown option (expect 2)
4. Kill a `--commit` run mid-checkout (`kill -9` of the process tree on Linux): orphan in
   `git worktree list --porcelain`; whether `git worktree prune` removes it; `git worktree remove --force`
5. `gh pr list … --json` shape — needs a logged-in `gh` and network (open unless already available)
6. Candidate crates and versions (`regex`, `flate2`, `sha2`, `trash`, `fs4`, `sysinfo`, `async-trait`,
   `tokio-util`) against `core/deny.toml`; note which the core already uses

## Steps

- [ ] 1. Layout and launch (Linux)
- [ ] 2. ccsh.cmd (Windows, open)
- [ ] 3. Output and exit codes (Linux)
- [ ] 4. Killed run and orphan worktree (Linux)
- [ ] 5. gh pr list shape
- [ ] 6. Crates

## Notes

