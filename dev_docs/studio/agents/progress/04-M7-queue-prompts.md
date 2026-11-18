---
name: 04-M7 operation queue, progress, credential prompts
state: progress
version: 1
---

## Goal

Run mutating git operations through a per-repository queue with progress, and broker git/ssh credential
prompts to the UI through an askpass helper that is the core binary itself, never storing answers (D10;
plan 04, section 5, M7).

## Tasks

Copied from `04-git-branches-and-history.md`, section 5, M7. Split by orchestration: core half (tasks 1–4)
now, branched from `feature/studio-04-m2` (verified, merge pending); task 5 (renderer dialog) later, on the
integration branch, with `design/04-history.md`.

Overview section 10 overrides the plan's names: askpass mode is entered when `CODECHARTA_ASKPASS_ENDPOINT`
(pipe/socket name) is set together with `CODECHARTA_ASKPASS_TOKEN` and argv[1] is not a subcommand (not
`CODECHARTA_ASKPASS=1`); cancelling uses the `core.cancel` notification (not `operations.cancel`).
Spike results already known (`01-m0-spikes.md` S5, Linux): git and ssh pass the prompt as the single
argument; `GIT_TERMINAL_PROMPT=0` does not block `GIT_ASKPASS`; ssh needs `SSH_ASKPASS_REQUIRE=force`;
spaces in the helper path work on Linux; non-zero exit is a clean cancel. Windows items stay open for the owner.

1. Spike (Linux parts (a), (c), (e), (f); (b), (d), (g) recorded as open for Windows)
2. Runner environment (askpass variables)
3. Queue and progress
4. Prompt broker, server, helper; `prompt.answer` / `prompt.cancel`; `prompt.requested` / `prompt.closed`
5. Renderer prompt dialog and operations (later, UI)

## Steps

- [ ] 1. Spike (Linux)
- [ ] 2. Runner environment
- [ ] 3. Queue and progress
- [ ] 4. Prompt broker
- [ ] 5. Renderer dialog (later)

## Notes

