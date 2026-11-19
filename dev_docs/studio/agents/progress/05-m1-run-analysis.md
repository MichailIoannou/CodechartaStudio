---
name: 05-M1 run one analysis from the core
state: progress
version: 1
---

## Goal

Run one `ccsh analyse` from the core: validated and hashed analysis profiles, the argv, output and failure
parsing, progress from stderr, a scripted ccsh stand-in, per-platform launch resolution, and a cancellable
runner on plan 01's process runner (plan 05, Milestones, M1).

## Tasks

Copied from `05-commit-analysis-and-snapshots.md`, Milestones, M1 (tests to write first are listed there).
Branched from `feature/studio-04-m11` (plan 03 and 04 cores verified, merge pending).

Must apply the 05-M0 findings (`05-m0-spikes.md`): direct-java launch holds; pass `-Dstdout.encoding=UTF-8`
and `-Djava.io.tmpdir=<jobTempDir>`; exit 1 messages on stdout, exit 2 on stderr; progress keyed on the
`Files` unit only (ignore `Byte`), never decreasing, capped at 99; strip control bytes from stdout; a
signal exit (`code()` is `None`) never maps to `analysis-failed`; non-empty stderr is not a failure (JDK
reflection warnings); never `-i`; a non-sha `--commit` silently analyses HEAD, so only full SHAs are passed.
Output fixtures are the strings captured in 05-M0. Windows items are `#[cfg(windows)]` and unverified here.
Gates with and without `--all-features`.

1. Profiles
2. Argv
3. Output and failures
4. Progress
5. fake-ccsh and test helpers
6. Launcher
7. Runner

## Steps

- [ ] 1. Profiles
- [ ] 2. Argv
- [ ] 3. Output and failures
- [ ] 4. Progress
- [ ] 5. fake-ccsh
- [ ] 6. Launcher
- [ ] 7. Runner

## Notes

