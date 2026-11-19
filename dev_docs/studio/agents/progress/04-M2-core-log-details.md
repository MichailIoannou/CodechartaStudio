---
name: 04-M2 core - log, details, queries, changed files, rev-list stream
state: complete
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
- [x] 2. Details and changed files
- [x] 3. Queries and stream
- [x] 4. Caching, RPC, CLI

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

### 2. Details and changed files
- Api: `GitFileChange`, `GitChangedFile`, `ChangeTotals`, `GitCommitDetails` (`#[serde(flatten)] summary`),
  `ChangedFilesMode`, `GitChangedFiles`. Error code appended: `UNKNOWN_REVISION`.
- Classification (`failure.rs`), verified with git 2.56 for an unknown full sha: `show` / `diff-tree` /
  `rev-list --stdin` say `bad object`, `rev-list A..B` `Invalid revision range`, `A...B` `Invalid symmetric
  difference expression`, `merge-base` (also `--is-ancestor`) `Not a valid commit name`, plus `unknown
  revision` and `expected commit type` (a sha naming a blob or tree, see below) → `UNKNOWN_REVISION`.
  `for-each-ref --points-at <unknown>` exits 0 with nothing.
- `git/parse/log.rs` `DETAILS_FORMAT` / `parse_details` (exactly ten fields; message without trailing
  newlines). `git/parse/changed_files.rs`: `DIFF_TREE_ARGS`, `parse_name_status` (first letter A/M/D/R/C/T,
  another upper-case letter `Unknown`, anything else `PARSE_FAILED`; R/C consume old and new path),
  `parse_numstat` (keyed by the new path; `-` = binary = null counts), `join_changed_files` (at most
  `MAX_LISTED_FILES` = 5000, totals over all). Captured: `show_details.txt`, `diff_tree_name_status.txt`,
  `diff_tree_numstat.txt`, `diff_tree_root_name_status.txt` (`capture.sh`).
- `git/details.rs` (plan's `read.rs` part): `commit_details`, `changed_files` + `ChangedFilesRequest`.
  `DETAILS_LIMITS` 30 s / 8 MiB. Name-status and numstat run in parallel. **Every sha goes to `show` /
  `diff-tree` as `<sha>^{commit}`**: `show -s <blob sha>` prints the blob, so without the peel a valid-looking
  sha of a blob or tree would be read as something else; with it git refuses (`UNKNOWN_REVISION`) and an
  annotated tag's sha is peeled to its commit. `SinceMergeBase` answers the merge base as `from`.
- `git/query.rs` starts with `merge_base` (needed here; task 3 adds the rest).
- Tests: the plan's (captured in `git/parse/changed_files.rs`, `git/parse/log.rs`; fixture in
  `tests/git_details.rs`), plus `should_list_every_file_of_a_root_commit_as_added`,
  `should_fail_parse_on_a_missing_path_or_count`, the classification test and an unknown sha in the
  unrelated-histories test.

### 3. Queries and stream
- **Stdout line streaming, as built:** plan 01's runner already streams output chunks
  (`OutputMode::Stream(mpsc::Sender<OutputChunk>)`, UTF-8 safe), so no second runner mode was added. New:
  `process/lines.rs` `LineSplitter` (lines split across chunks wait for the rest; `\n` / `\r\n` dropped),
  the port method `GitProcess::stream(invocation, chunks, cancel)` (implemented by `Tools`, `FixtureGit`,
  `RecordingGit`; a default that collects first serves the unit-test fakes), and
  `GitCli::stream_lines(command, cancel, on_line)`: lines go to `on_line` as git prints them; `Break` cancels a
  child token, which stops the process tree, and that stop is answered as success (a cancel of the request
  itself stays `CANCELLED`); a non-zero exit is classified with the streamed stderr. Dropping the receiver
  after `Break` keeps the runner's output readers from waiting.
- `REV_LIST_LIMITS` 300 s, stdout cap = the runner's ceiling `MAX_OUTPUT_CEILING_BYTES` (256 MiB) — the
  runner refuses "no cap", and 256 MiB is about 6 million SHA lines.
- Api: value `Revision` (`HEAD`, a `CommitSha`, or a `FullRefName` that also passes the `check-ref-format`
  rules: no `..`, `@{`, `//`, `~ ^ : ? * [ \ space`, no component starting with `.` or ending `.lock`, no
  trailing `/` or `.`). **Deviation:** the plan runs `git check-ref-format`; the rules are checked while the
  value is deserialised instead, so no process runs for validation and a bad value never reaches a handler.
  `GitCommitDistance`, `RefsAt { branches, tags }`.
- `git/query.rs`: `resolve_commit` (`rev-parse --verify --quiet --end-of-options <rev>^{commit}`, exit 1 =
  `UNKNOWN_REVISION`, then `show -s -z SUMMARY_FORMAT`), `rev_list_count` (`rev-list --count A..B`),
  `merge_base`, `is_ancestor` (0 / 1 / classified error), `measure_distances` (at most
  `MAX_DISTANCE_CANDIDATES` = 200, else `BAD_REQUEST` before any git runs; four `rev-list --left-right
  --count C...T` at a time; `UNKNOWN_REVISION` candidates left out, order kept, duplicates measured twice),
  `refs_at` (`for-each-ref --points-at=<sha> --format=%(refname) refs/heads/ refs/tags/`; an annotated tag
  counts when it peels to the commit), `rev_list` + `RevListRequest` (`rev-list --date-order [--first-parent]
  [--max-count=n] --stdin`, stdin = includes then `^<exclude>`; batches of `REV_LIST_BATCH` = 1000; the last
  partial batch is delivered unless the sink broke; answers the number delivered; no includes = 0 without
  git). Matching `GitService` methods; `rev_list(folder, request, cancel, sink)`.
- Tests (`tests/git_queries.rs`): the plan's ten cases plus `should_refuse_more_than_the_allowed_candidates`;
  unit tests for `LineSplitter` and `Revision`.

### 4. Caching, RPC, CLI
- Structural commits first: `refactor(core): share the folder resolution of the git routes` (`folder_route!`
  macro in `serve/git_routes.rs`) and `refactor(core): pass git, folder and cancellation of a read together`
  (`git::FolderGit { git, folder, cancel }` with `read` / `run` / `run_raw`, so no internal read takes more
  than four parameters; `LogContext { at_root, memory, repository }` for the log).
- `git/memory.rs` `GitMemory` per repository id: sessions (LRU 8), pages (LRU 50, keyed by session id and
  offset), details (LRU 200, keyed by the requested sha), answers (LRU 2000: `rev_list_count`, `merge_base`,
  `is_ancestor`, per-candidate distances and `changed_files`, through `GitMemory::remembered` and the
  `Remembered` trait). Failures are not remembered; an unknown candidate is not remembered (a fetch may
  bring it). Not remembered at all: `resolve_commit` and `refs_at` (refs move), `rev_list` (a stream).
  Clear rules: `forget_logs` (sessions and pages; for the end of every mutating operation, M7+),
  `forget_answers`, `fetched(repository_id, is_shallow)` (always the logs; in a shallow clone also details
  and answers — deepening changes a boundary commit's parents, merge bases and counts),
  `forget_repository`. Nothing calls `fetched` yet: fetch arrives in M8, which must call it.
  `GitService::memory()` exposes it. Every cached service read runs `locate` (one `rev-parse`) for the
  repository id, so two folders of one repository share the memory.
- `measure_distances` measures only candidates without a remembered distance; the 200-candidate limit is
  checked first in the service and, in the route, before the store is read.
- Api: params `GitCommitParams { repo, sha }` (`git.commitDetails`, `git.refsAt`), `GitResolveCommitParams`,
  `GitRevListCountParams`, `GitMergeBaseParams`, `GitIsAncestorParams`, `GitMeasureDistancesParams`,
  `GitChangedFilesParams` (all `deny_unknown_fields`); methods (all **renderer**): `git.log`,
  `git.commitDetails`, `git.resolveCommit`, `git.revListCount` (number), `git.mergeBase` (string | null),
  `git.isAncestor` (boolean), `git.measureDistances`, `git.refsAt`, `git.changedFiles`. Contract regenerated.
  **Deviation:** `git.measureDistances` answers `GitCommitDistances { distances }` instead of a bare
  `Vec<GitCommitDistance>`: the contract generator exports only named result types (an array result left
  `GitCommitDistance` unexported and unimported), and every existing list result is wrapped the same way.
- Routes in `serve/git_routes.rs` via `folder_route!` (`measure_distances` hand-written for the early limit).
- CLI `codecharta-core git log (--project <id> --folder <id> | --path <dir>) [--limit <n, default 50>]
  [--branch <local branch>] [--json]`: pages until `limit`; text `<7-char sha> <YYYY-MM-DD committer date,
  UTC> <author> <subject>`; `--json` prints the `GitCommitSummary[]` (a cursor would be useless after the
  process ends); `--branch x` is the scope `refs/heads/x` (`BAD_REQUEST` if that is no valid ref name).
- Tests: `tests/git_cache.rs` (`should_run_git_once_for_two_identical_detail_requests_and_again_after_clearing`,
  `should_clear_the_query_cache_after_a_fetch_in_a_shallow_repository` — a depth-1 clone with two branches,
  merge base null, `fetch --unshallow`, still null from memory, `fetched(…, true)`, then the root —,
  `should_serve_a_page_read_before_from_memory`, `should_measure_only_candidates_without_a_remembered_distance`);
  `git/memory.rs` unit tests; `codecharta-cored/tests/git_protocol.rs`: `should_page_through_git_log_over_stdio`,
  `should_answer_history_queries_over_stdio`, `should_reject_malformed_history_params_without_running_git`
  (15 malformed params over the nine methods, empty `PATH`, all `BAD_REQUEST`),
  `should_print_three_log_lines_from_cli_with_limit`; CLI unit tests for the log line and the branch scope.

### Acceptance timing (2026-11-19)
Repository built with `git fast-import` in a scratch folder: 100 006 commits (main with a five-commit side
branch merged back every 1 000 commits, a tag every 10 000), 28.8 MiB pack, **no commit-graph file**.
`codecharta-core` release build, `serve` over stdio driven by a script (`projects.inspectFolder`,
`projects.create`, then `git.log` page by page), 16-core Linux, git 2.56:

| scope | offset 0 | 500 … 4500 | offset 5000 | offset 5000 again (page cache) |
|---|---|---|---|---|
| `all` | 435 ms | 417–448 ms | 418 ms | 3.4 ms |
| `head` | 451 ms | ≈ 441 ms | 419 ms | 3.4 ms |

Every page is well under 2 s (the risk table's 5 s `--topo-order` fallback is not needed). The cost is the
`--date-order` walk of the whole history, so it is flat over the offset; a commit-graph would cut it further.

### Gates at the end of M2 (Linux)
- `core/`: `cargo fmt --check`, `cargo clippy --all-targets --all-features -- -D warnings`, `cargo test
  --all-features` (413 passed) green; `npm run contract` leaves no diff; root `npm run format:check` green;
  `visualization/`: `npm run lint`, `npx tsc --noEmit -p tsconfig.json`, `npm test` (636 suites, 4861 passed,
  2 todo; coverage 96.71 / 90.1 / 95.33 / 96.62) green. Only generated `model/coreApi/` files and
  `electron/coreMethods.generated.json` changed in `visualization/`. No changelog entry: nothing user-visible
  until the History UI. Not run on Windows; the git 2.31 spike of M1 is still open.

### For the History UI (04-M3..M6) and plan 05
- Methods (params always carry `repo: { projectId, folderId }`):
  `git.log { repo, scope: {kind:"all"} | {kind:"head"} | {kind:"refs", refNames: string[]}, filter?: { text?,
  author?, path? }, cursor? }` → `GitLogPage { commits: GitCommitSummary[], nextCursor, isGraphAvailable }`.
  Paging: omit `cursor` for page 1 (500 commits); pass the previous `nextCursor` (opaque,
  `<sessionId>_<offset>`) for the next; `nextCursor: null` = last page. With a cursor, scope and filter of page
  1 apply. Pages of one session are stable while branches move; to see new commits start a new log (no
  cursor) — e.g. on `repository.changed`. Up to 8 sessions per repository are kept; an evicted one answers
  `LOG_SESSION_EXPIRED` → restart from page 1. `isGraphAvailable` false with any filter.
  `git.commitDetails { repo, sha }` → `GitCommitDetails` (summary fields flattened, `committerName/Email`,
  `message`, `comparedToParent`, `files` ≤ 5000, `areFilesTruncated`, `totals`).
  `git.resolveCommit { repo, revision: "HEAD" | sha | "refs/…" }` → `GitCommitSummary`.
  `git.revListCount { repo, from, to }` → number; `git.mergeBase { repo, left, right }` → string | null;
  `git.isAncestor { repo, ancestor, descendant }` → boolean; `git.measureDistances { repo, target,
  candidates (≤ 200) }` → `{ distances: GitCommitDistance[] }` (unknown candidates left out; `onlyInCandidate
  == 0` = ancestor, target "stale by `onlyInTarget`"); `git.refsAt { repo, sha }` → `{ branches, tags }` (short
  names); `git.changedFiles { repo, from, to, mode: "direct" | "sinceMergeBase" }` → `GitChangedFiles` (`from`
  = the merge base in `sinceMergeBase`).
- Error codes: new `LOG_SESSION_EXPIRED`, `UNKNOWN_REVISION` (unknown sha/ref, `HEAD` without commits, no
  common history for `sinceMergeBase`); plus M1's (`NOT_A_REPOSITORY`, `PARSE_FAILED`, `COMMAND_FAILED`, …)
  and `BAD_REQUEST` for every malformed param (sha not 40/64 lower-case hex, revision expression, cursor,
  filter path with `..`/`:`/control characters, > 200 candidates, unknown fields).
- Cache invalidation: commit answers are immutable and stay; logs are per session. M7+ mutating operations
  must call `GitMemory::forget_logs(repository_id)`; M8's fetch must call `GitMemory::fetched(repository_id,
  is_shallow)`. The renderer needs no invalidation besides starting a new log after `repository.changed`.
- Plan 05 in-core: `GitService::rev_list(&folder, &RevListRequest { include, exclude, first_parent, max_count },
  &cancel, &mut |batch: &[CommitSha]| ControlFlow)` (batches of 1000, `Break` stops git, answers the count
  delivered); `measure_distances`, `is_ancestor`, `merge_base`, `changed_files(&folder,
  &ChangedFilesRequest)` all take a resolved `GitFolder` and the request's cancellation token.
- Not done here: the fake-bridge `git` seed (renderer, waits for 01-M4.1 as noted in M1).

