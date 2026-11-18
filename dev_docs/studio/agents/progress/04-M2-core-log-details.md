---
name: 04-M2 core - log, details, queries, changed files, rev-list stream
state: progress
version: 1
---

## Goal

Commit history in the core: paged log, commit details and changed files, rev-list/merge-base/ancestry
queries, caching, and their JSON-RPC methods and CLI (plan 04, section 5, M2).

## Tasks

Copied from `04-git-branches-and-history.md`, section 5, M2 (tests to write first are listed there).
Branched from `feature/studio-04-m1` (verified, merge into integration pending). From 04-M1: add runner
stdin and stdout line streaming, extend `capture.sh` for log/show/diff-tree captures, own limit constants;
git errors are `ErrorCode` values with git's text in `details.detail`; runner is `git::GitCli` over
`git::GitProcess`.

1. Log pages
2. Commit details and changed files
3. Queries and stream
4. Caching, RPC, CLI (acceptance timing needs a ≥ 100 000-commit clone; if none is available locally without
   network, build one with `git fast-import` in a scratch folder and record the numbers)

## Steps

- [x] 1. Log pages
- [ ] 2. Details and changed files
- [ ] 3. Queries and stream
- [ ] 4. Caching, RPC, CLI

## Notes

Environment (2026-11-19): Arch Linux x86_64, rustc/cargo 1.95, git 2.56.0, node 26.13, npm 12.2.
Branched from `feature/studio-04-m1`.

### 1. Log pages
- Plan 01 runner (test first, `tests/runner.rs`): `RunRequest.stdin` / `ToolRunOptions.stdin`
  (`Option<String>`); with text the child gets a pipe that a spawned task writes and then closes (a child
  that stops reading early only logs at debug level); without text stdin is `Stdio::null()` as before. The
  fake tool gained `echo-stdin`. Tests `should_write_stdin_and_close_it`, `should_keep_stdin_closed_without_text`.
- `GitCommand.stdin` (+ `with_stdin`) and `GitInvocation.stdin` carry it to `Tools` and the fixture's
  `FixtureGit`. `LOG_LIMITS` (60 s / 8 MiB) in `command.rs`.
- Api: `GitCommitSummary`, `GitLogScope` (`kind` tag; `refs` carries `refNames: FullRefName[]`),
  `GitLogFilter`, `GitLogParams` (both `deny_unknown_fields`), `GitLogPage`; values `LogCursor` (1–128 of
  `[A-Za-z0-9_-]`), `LogFilterText` (1–200 chars, no control characters), `RepoRelativePath` (≤ 1024 bytes,
  relative, no `..` segment, no `:`, no control characters — a newline would otherwise add a line to git's
  stdin). Error code appended: `LOG_SESSION_EXPIRED`. Method markers come with task 4 (every `METHODS` entry
  needs a route).
- `git/parse/log.rs`: `SUMMARY_FORMAT`, `parse_log`, `summary_of` (first field and every parent must be a
  `CommitSha`, times numeric, else `PARSE_FAILED`), `clean_text` (control characters other than tab and
  newline become U+FFFD). Captured `testdata/log_history.txt` (`capture.sh` extended; git 2.56 writes one NUL
  after every field, so a record is exactly seven fields).
- `git/log.rs` (plan's `read.rs` part; separate file to keep files small): `LogRequest` (`GitLogParams`
  without the folder), `log_page`. A first page reads the tips (scope `all`: every branch, remote branch and
  tag commit plus the head, via `read_refs`; `head`: `rev-parse --verify --quiet HEAD`, exit 1 = no commits;
  `refs`: the named refs from `read_refs`, an unknown one is `BAD_REQUEST`), deduplicates them, and stores
  `LogSession { tips, filter }` under a random 16-hex id in `git/memory.rs` `GitMemory` (LRU of 8 sessions
  per repository id). No tips: empty page, no `log` run. Cursor `<sessionId>_<offset>`; unknown session =
  `LOG_SESSION_EXPIRED`, malformed cursor = `BAD_REQUEST`. A filter whose three fields are all null counts as
  no filter (`isGraphAvailable` true).
- **Verified: `--literal-pathspecs` disables the `:(top,literal)` magic** (with it, `log --stdin` given
  `:(top,literal)<path>` matched nothing). So the magic is dropped and the log always runs with `-C <root>`
  (from `locate`), which makes the path root-relative and literal. `text` / `author` go with
  `--regexp-ignore-case --fixed-strings`, so neither is ever a regex.
- `GitService::log(&GitFolder, &LogRequest, &cancel)`; `GitService::with_memory(&GitMemory)`; `new` keeps an
  own memory (tests, CLI). `Core` holds one `GitMemory` and hands it to every `core.git()`.
- Fixture: `RecordingGit` (wraps `FixtureGit`, records every `GitInvocation`).
- Tests: the plan's (captured, `git/parse/log.rs`; fixture, `tests/git_log.rs`), plus
  `should_refuse_a_ref_the_repository_does_not_have` and three value tests in the api.

