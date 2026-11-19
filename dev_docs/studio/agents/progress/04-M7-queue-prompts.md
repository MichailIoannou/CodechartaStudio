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

- [x] 1. Spike (Linux) — (b), (d), (g) open, need Windows (procedures below)
- [x] 2. Runner environment
- [x] 3. Queue and progress
- [x] 4. Prompt broker
- [ ] 5. Renderer dialog (later)

## Notes

Environment (2026-11-19): Arch Linux x86_64, rustc/cargo 1.95, git 2.56.0, OpenSSH 10.6p1, node 26.13,
npm 12.2. Branched from `feature/studio-04-m2`. Throwaway scripts lived in the session scratch folder, every
command ran with `env -i` / temporary `HOME`, no network.

### 1. Spike (Linux)
- **(a) argv and stdout** — a helper script as `GIT_ASKPASS` (folder and file name with spaces) under
  `setsid -w` (no controlling terminal), with `CODECHARTA_ASKPASS_ENDPOINT` / `CODECHARTA_ASKPASS_TOKEN`
  set: `git -c credential.helper= credential fill` called it twice with exactly one argument each,
  `Username for 'https://example.test/…': ` then `Password for 'https://ada@example.test/…': `, stdin not a
  tty, both variables visible to the helper; the first stdout line became `username=` / `password=`. Same as
  S5. The real binary is covered by `codecharta-cored/tests/askpass_mode.rs` (task 4).
- **(c) offline ssh passphrase** — `ssh-keygen -y -f <ed25519 key with passphrase>` with `SSH_ASKPASS` and
  `SSH_ASKPASS_REQUIRE=force`, stdin `/dev/null`, no tty: one call, argv `Enter passphrase for "<key path>": `,
  public key printed, exit 0. Without `SSH_ASKPASS_REQUIRE` ssh-keygen also used the helper (no tty), unlike
  the ssh client in S5, which needs `force`. Helper exits 1 → `Load key "…": incorrect passphrase supplied to
  decrypt private key`, exit 255 (no retry): a cancelled ssh prompt looks like a wrong passphrase, so the
  operation's own "cancelled by the user" flag decides `AUTHENTICATION_CANCELLED`, not ssh's text.
- **(e) special characters** — git percent-encodes the URL in its prompts (`a"b%c&d/ü.git` with
  `credential.useHttpPath=true` arrived as `a%22b%25c%26d/%C3%BC.git`); ssh-keygen passes a key path
  verbatim: `Enter passphrase for "/tmp/…/k"e%y&ü": ` arrived byte for byte as one argument. An answer with
  `"`, `%`, `&`, a space and `ü` came back verbatim (`password=pa"ss%w&rd ü`). No quoting layer on Linux.
- **(f) locale** — git 2.56 with its `de` and `el` catalogues (`git status` outside a repository):
  `LANG=en_US.UTF-8 LANGUAGE=de` → German; `+ LC_MESSAGES=C` → English; `LANG=el_GR.UTF-8 LC_MESSAGES=C
  LANGUAGE=` → English; **`LC_ALL=el_GR.UTF-8 LC_MESSAGES=C LANGUAGE=` → Greek**. `LC_ALL` outranks
  `LC_MESSAGES`, so section 4.5 was wrong for users who set `LC_ALL`. Fix (task 2): mutating and network
  commands remove `LC_ALL` and give its value to `LC_CTYPE`, `LC_COLLATE`, `LC_NUMERIC`, `LC_TIME`,
  `LC_MONETARY` (hooks keep the user's locale); `LANG=el_GR.UTF-8 LC_CTYPE=el_GR.UTF-8 LC_MESSAGES=C` → English.
- Section 4.5 and the askpass environment of 4.6 corrected in the task 2 commit; 4.6's mode selection and
  flow in the task 4 commit.

Open, needs Windows (Git for Windows 2.47+ with its bundled OpenSSH; build `cargo build -p codecharta-cored`
and use `target\debug\codecharta-core.exe`; run from a process without a console, e.g. a scheduled task or a
small launcher with `CREATE_NO_WINDOW` and closed stdin, as in S5):
- **(b)** First run `cargo test -p codecharta-cored --all-features --test askpass_mode` (it drives the real
  binary through the broker and a named pipe). Copy the exe to `C:\Temp\nospace\codecharta-core.exe` and
  `C:\Temp\with space\codecharta-core.exe`. Then by hand, for each copy and for its `GetShortPathNameW` form (`for %I in ("C:\Temp\with
  space\codecharta-core.exe") do echo %~sI`): set `SSH_ASKPASS=<path>`, `SSH_ASKPASS_REQUIRE=force`,
  `GIT_ASKPASS=<path>`, `CODECHARTA_ASKPASS_ENDPOINT=none`, `CODECHARTA_ASKPASS_TOKEN=none` and clone
  `ssh://user@127.0.0.1:22222/<bare repo>` from a local sshd (S5 setup) with `GIT_SSH_COMMAND` unset. The
  helper finds no broker and exits 1 silently, so ssh reports a failed passphrase / host-key read when it
  could start the helper, and `ssh_askpass: exec(…)` when it could not. Record which, per path.
- **(d)** The same with `git -c core.sshCommand=C:/Windows/System32/OpenSSH/ssh.exe` (inbox OpenSSH; `ssh -V`
  must be ≥ 8.4 for `SSH_ASKPASS_REQUIRE`).
- **(g)** With GCM installed and `GCM_INTERACTIVE` unset in the parent: `git -c credential.helper=manager
  ls-remote https://does-not-resolve.invalid/x.git` with the askpass env above. Record whether GCM shows a
  window, asks through `GIT_ASKPASS`, or fails at once, and how long it takes.
- Then `ssh-keygen -y -f <encrypted key>` with the env of (c), from both paths of (b).

### 2. Runner environment
- Plan 01's `process::AskpassSetup` was `{ helper, endpoint }` without the token; now `{ git_helper,
  ssh_helper: Option<PathBuf>, endpoint, token: Secret }`. `askpass_env` adds `GIT_ASKPASS`, `SSH_ASKPASS` +
  `SSH_ASKPASS_REQUIRE=force` (only with an ssh helper), `CODECHARTA_ASKPASS_ENDPOINT`,
  `CODECHARTA_ASKPASS_TOKEN`, last, after everything else; without an ssh helper `child_env` removes the
  user's `SSH_ASKPASS` / `SSH_ASKPASS_REQUIRE` too.
- `codecharta_core_api::secret::Secret` (new, api crate so `prompt.answer` can use it): `Zeroizing<String>`
  (crate `zeroize` 1.9.1, Apache-2.0 OR MIT, allowed by `deny.toml`), `Debug` / `Display` print `***`,
  `expose()` is the only way to the text, JSON as a plain string, TypeScript `string`. tokio gains the `net`
  feature (for task 4; adds `socket2` 0.6.5, MIT OR Apache-2.0) and windows-sys `Win32_Storage_FileSystem`.
- `git/command.rs`: `CommandKind::Network`; `GitCommand.askpass` + `GitCommand::network(folder, args, limits,
  askpass)`; `GitInvocation.askpass` (passed on only for `Network`), forwarded by `Tools` and the fixture's
  `FixtureGit` as `RunRequest.askpass`. `UserEnvironment { locale_all, gcm_interactive, display }` read once in
  `Core::open` (empty = unset), handed to `GitCli` / `GitService::with_user_environment`; `invocation_of`
  takes it as third argument. Mutating + network: `LC_ALL` removed and spread over the five categories
  (spike f). Network: `GCM_INTERACTIVE` = the user's value or removed; `DISPLAY=:0` only without one.
- `git/askpass.rs`: `askpass_helpers(&HelperLocation { executable, data_dir, platform }, &dyn HelperFiles) ->
  AskpassHelpers { git, ssh }` — git always gets the executable; ssh: the executable when not Windows or no
  space; else its short name (`GetShortPathNameW`, the only `unsafe` in the core, one function with a SAFETY
  note, type-checked with `cargo check --target x86_64-pc-windows-gnu`, not run); else a copy at
  `<dataDir>/askpass/codecharta-core.exe` when that path has no space (copied again when size or
  modification time differ; the copy gets the source's modification time); else `None`.
- Tests: the plan's six (`should_set_askpass_variables_only_for_network_commands`,
  `should_remove_gcm_interactive_unless_user_set`, `should_set_display_only_when_unset` in `git/command.rs`;
  `should_use_short_path_or_copy_when_exe_path_has_space`, `should_leave_ssh_askpass_unset_without_space_free_path`
  in `git/askpass.rs`; `should_never_log_the_token` in `tests/runner.rs`: a real child run with the askpass
  setup under a TRACE subscriber, the child prints the token, the log does not contain it), plus
  `should_drop_lc_all_but_keep_its_locale_for_hooks`, `should_read_empty_user_values_as_unset`,
  `should_never_print_the_token_of_an_invocation`, `should_keep_a_path_with_a_space_elsewhere`,
  `should_copy_only_when_the_executable_changed`, `should_leave_the_users_ssh_askpass_out_without_an_ssh_helper`,
  `should_print_the_token_of_a_setup_as_stars` and the two `Secret` tests. `tracing-subscriber` became a
  dev-dependency of `codecharta-core` (already a workspace crate). The log test installs a *global*
  subscriber: with a single scoped one, tracing asks the subscriber of whichever test thread reaches a log
  call first whether it is wanted, and parallel tests made it flaky.

### 3. Queue and progress
- `git/queue.rs` `OperationQueue::run_exclusive(repository_id, &cancel, task)`: one tokio mutex per repository
  id (FIFO hand-over), held in a map entry that is removed when the last waiter or runner of that repository
  leaves (`busy_repositories()` for tests and diagnostics). A cancel while waiting returns `CANCELLED` and the
  task future is dropped unpolled. `Core::operation_queue()` is the one instance (plans 05/06 use it too).
- `git/parse/progress.rs`: `ProgressUpdate { message, done, total }`, `last_progress_line` (split on `\r` and
  `\n`, newest non-empty after trimming the end), `progress_of` (strips one `remote: `, trailing spaces; the
  first word `NN%` with NN ≤ 100 gives `done = NN, total = 100`).
- `git/progress.rs`: `PROGRESS_INTERVAL` 200 ms, `ProgressThrottle::admit(now)` (first passes, then one per
  interval, the rest dropped), `ProgressReporter::new(sink).push(stderr_chunk, now)` (a line counts once its
  `\r` / `\n` arrived; chunks may split lines). `GitCli::run_reporting(command, cancel, sink)` streams the
  command (plan 01's chunk stream), reports progress, and answers the collected stdout and stderr with the exit
  code (classification is the caller's, as for `run_raw`).
- **Deviation — no `git.operationProgress` event:** plan 01's `core.progress { requestId, message, done, total }`
  already carries exactly this, and the shell already maps `requestId` back to the renderer's `operationId`
  for it. M8+ routes pass `|update| context.notifier.progress(ProgressParams { request_id: context.id.clone(),
  message: update.message, done: update.done, total: update.total })` as the sink. The renderer knows the
  repository of its own operation, so `repositoryId` is not needed in the payload.
- Tests: the plan's eight (`queue.rs`: `should_run_two_operations_of_one_repository_in_order`,
  `should_run_operations_of_two_repositories_in_parallel`, `should_start_the_next_operation_after_a_failure`,
  `should_never_run_a_cancelled_queued_task`; `parse/progress.rs`:
  `should_keep_the_last_line_of_a_carriage_return_stream`, `should_read_nn_percent_as_done_of_100`,
  `should_strip_remote_prefix_and_trailing_spaces`; `progress.rs`: `should_throttle_progress_to_200_ms`), plus
  `should_forget_a_repository_once_its_operations_ended`, `should_have_no_counts_without_a_percentage`,
  `should_report_only_finished_lines_and_drop_reports_within_the_interval`,
  `should_report_progress_and_keep_the_output_of_a_reporting_run` (`runner.rs`).
- Not done here (M8 builds it on these pieces): the operation wrapper that runs inside the queue, opens the
  prompt session, re-reads inside the queue, calls `GitMemory::forget_logs` / `fetched`, and emits
  `repository.changed` at the end.

### 4. Prompt broker, server, helper
- Api first: `methods/prompt.rs` (`PromptKind` secret | text | confirm, `PromptRequested { promptId, requestId,
  repositoryLabel, kind, message }`, `PromptClosed { promptId }`, `PromptAnswerParams { promptId, answer:
  Secret }`, `PromptCancelParams { promptId }`, both `deny_unknown_fields`; `MAX_PROMPT_MESSAGE_CHARS` /
  `MAX_PROMPT_ANSWER_CHARS` 4096); value `PromptId` (1–64 of `[A-Za-z0-9_-]`, generated as 32 hex digits);
  error code appended: `AUTHENTICATION_CANCELLED`. Methods `prompt.answer` and `prompt.cancel` are the only
  new **renderer** methods (result `null`); events `prompt.requested` / `prompt.closed` (renderer). Nothing
  that opens sessions, reveals the endpoint or the token is callable. Contract regenerated.
- **Deviation — `requestId`, not `operationId`:** the core knows only the JSON-RPC request id of the request
  that runs git; the shell maps it back to the renderer's `operationId` exactly as plan 01 specifies for
  `core.progress`. The relay (01-M3) must apply that mapping to `prompt.requested` too.
- `codecharta-core/src/prompt/`: `kind.rs` `classify`; `broker.rs` `PromptBroker` (in `Core`, `Arc`,
  `core.prompts()`): `attach` / `detach` (by the server), `open_session(SessionRequest { request_id,
  repository_label }) -> PromptSession` (guard; `askpass()`, `is_cancelled_by_user()`, `settle(result)`;
  dropping it closes the session and its prompts), `ask(token, message)` (server side), `answer`, `cancel`,
  `subscribe() -> broadcast::Receiver<PromptEvent>`. Token check: every session compared with an XOR fold over
  equal-length tokens, no early exit, result through `std::hint::black_box`; tokens 64 hex digits from
  `getrandom`. `server.rs` `AskpassServer::start(broker, helpers)` (wire types `AskpassRequest { token: Secret,
  prompt }`, `AskpassReply` `{"answer":…}` / `{"cancel":true}`); `helper.rs` `ask_broker(endpoint, token,
  prompt) -> HelperOutcome` (blocking std I/O on a thread with the 30-minute timeout; named pipe opened as a
  file on Windows, retried while `ERROR_PIPE_BUSY`).
- **Only the current user can reach the endpoint**: Linux/macOS — the socket lives in
  `<temp>/cc-askpass-<16 hex>/` created with mode `0700` *before* the socket is bound (no window), the socket
  is then `chmod 0600`; on macOS `temp_dir()` is already per user. Tested
  (`should_make_the_socket_reachable_only_by_the_current_user`). Windows — `first_pipe_instance(true)` (fails
  if anyone pre-created the name), `reject_remote_clients(true)`; the default named-pipe DACL grants full
  access to the creator owner, SYSTEM and administrators and *read* access to Everyone, so another local user
  can open the pipe read-only but cannot write a token and gets nothing; the token still has to match.
  Untested on Windows (type-checked only); an explicit owner-only DACL would need more `unsafe` and is not done.
- cored: `askpass.rs` (`askpass_prompt` = the dispatch rule of overview section 10; `run_askpass` prints the
  answer and `\n`, exit 0, else exit 1, nothing on stderr; logging is never initialised in this mode), `main.rs`
  checks it before clap; explicit `codecharta-core askpass <prompt>` subcommand. `serve` starts the
  `AskpassServer` (helpers from `current_exe()` via `askpass_helpers`) and forwards broker events as
  notifications (`serve/prompt_routes.rs`); a server that cannot start only logs a warning. The session's
  request trace logs method names only (unchanged), so `prompt.answer` params never reach the log.
- Test-only method (feature `test-methods`, not in the contract): `core.credentialFill` runs `git -c
  credential.helper= credential fill` as a network command with a prompt session — the first real
  end-to-end path over stdio, and the template for M8's operations.
- Tests (unit, `prompt/*.rs`): `should_classify_yes_no_as_confirm_username_as_text_else_secret`,
  `should_refuse_a_wrong_token_and_send_nothing`, `should_refuse_a_token_of_a_closed_session`,
  `should_answer_each_prompt_once`, `should_close_pending_prompts_when_the_operation_ends`,
  `should_fail_with_authentication_cancelled_after_the_user_cancelled`,
  `should_refuse_an_answer_with_a_line_break_without_repeating_it`, `should_refuse_an_overlong_prompt`,
  `should_offer_no_askpass_without_a_listening_server`, `should_give_every_session_its_own_token`,
  `should_match_only_the_same_token`, server wire and socket-mode tests; `Secret` Debug in the api (task 2).
  `tests/prompt_roundtrip.rs`: answer reaches the helper; cancel, end of operation and a wrong token give no
  answer; no listening after the server is dropped. `codecharta-cored/tests/askpass_mode.rs` (real binary):
  prints exactly answer + newline, exit 0, empty stderr; exit 1 and no output on cancel and on a wrong token;
  the explicit subcommand; **real git** `credential fill` asks Username (text) then Password (secret) and gets
  both verbatim (`"`, `%`, `&`, space, `ü`); **ssh-keygen -y** on an encrypted key gets the passphrase
  (unix); over stdio (`test-methods`): two `prompt.requested` with `requestId`, two `prompt.answer`, two
  `prompt.closed`, git's output, and the core's trace-level log contains neither answer; `prompt.cancel` over
  stdio → `AUTHENTICATION_CANCELLED`; unknown / malformed answers → `NOT_FOUND` / `BAD_REQUEST` without the
  answer in the reply. SSH host-key and remote password prompts stay manual (section 6, checks 7, 8, 13).

### Gates at the end of tasks 1–4 (Linux)
- `core/`: `cargo fmt --check`, `cargo clippy --all-targets --all-features -- -D warnings` (also with
  `--target x86_64-pc-windows-gnu`, type-check only), `cargo test --all-features` (475 passed) green;
  `npm run contract` leaves no diff; root `npm run format:check` green; `visualization/`: `npm run lint`,
  `npx tsc --noEmit -p tsconfig.json`, `npm test` (636 suites, 4861 passed, 2 todo; coverage 96.71 / 90.1 /
  95.33 / 96.62) green. Only generated `model/coreApi/` files and `electron/coreMethods.generated.json`
  changed in `visualization/`. No changelog entry: nothing user-visible until task 5. Not run on Windows.

### Fix: tests build without the `test-methods` feature
- Verification found that `cargo clippy --all-targets -- -D warnings` (no `--all-features`, the gate of README
  rule 4) failed: `tests/protocol.rs` imported `Instant` / `ANSWER_TIMEOUT` used only by its
  `test-methods` tests (came in earlier in the 03-M2…04-M2 stack), and `tests/askpass_mode.rs` imported
  `PROTOCOL_VERSION` / `hello_params` and defined `Inbox` used only by its stdio tests. Those imports and
  `Inbox` are now `#[cfg(feature = "test-methods")]`; no lint changed, no test removed.
- Both forms now pass: `cargo clippy --all-targets [--all-features] -- -D warnings` (also for
  `x86_64-pc-windows-gnu`), `cargo test` (471 passed) and `cargo test --all-features` (475 passed; the four
  extra are the `test-methods` protocol tests).

### Prompt protocol for task 5 (renderer)
- Subscribe to `prompt.requested` (`PromptRequested`) and `prompt.closed` (`PromptClosed`) in a root service.
  `requestId` arrives already mapped to the `operationId` the renderer passed to `bridge.request` (shell
  relay, 01-M3) — or `null` for a prompt outside a request (none exist yet).
- `kind`: `secret` → masked input; `text` → visible input; `confirm` → Yes / No buttons that answer the
  literal `yes` / `no` (ssh also accepts a fingerprint; not offered). Show `message` verbatim
  (interpolation, multi-line, may be cut by ssh); never parse paths out of it.
- Answer: `bridge.request("prompt.answer", { promptId, answer })`; cancel (button, Escape):
  `bridge.request("prompt.cancel", { promptId })`. Both answer `null`; `NOT_FOUND` means the prompt already
  closed (ignore); `BAD_REQUEST` for an answer with a line break or over 4096 characters (validate first).
- Close the dialog on `prompt.closed` for its `promptId` (it follows every answer and cancel, and arrives for
  every pending prompt when the operation ends). Queue a second `prompt.requested` behind the open one.
- Clear the input after answering; keep nothing (no signal holding the answer after the request).
- The operation then answers normally, or fails with `AUTHENTICATION_CANCELLED` after a cancel (say
  "cancelled", not an error). Progress: `core.progress` with the same `requestId`. Cancelling the whole
  operation: `bridge.cancel(operationId)` (→ `core.cancel`), which also closes its prompts.

### For M8–M11 (mutating operations)
- Run every mutating command inside `core.operation_queue().run_exclusive(&repository_id, &context.cancel,
  async { … })` (repository id from `locate`); re-read status / refs / listings inside it.
- Network commands: open `core.prompts().open_session(SessionRequest { request_id: Some(context.id.clone()),
  repository_label })` inside the queue (so a waiting operation has no session), build
  `GitCommand::network(root, args, limits, session.askpass().cloned())`, run it with
  `GitCli::run_reporting(&command, &context.cancel, &progress_sink)` (sink → `core.progress`), classify a
  non-zero exit with `command_failed`, then `session.settle(result)`; the session drops at the end of the
  operation, closing its prompts. Long timeouts (1800 s) because a person may be answering.
- Mutating (non-network) commands: `GitCommand { kind: CommandKind::Mutating, .. }` (keeps hooks' locale,
  English git messages even under `LC_ALL`).
- Afterwards always: `GitMemory::forget_logs` (fetch: `fetched(repository_id, is_shallow)`), fresh status /
  refs, `repository.changed`.
- Classification rules for authentication / network texts (`authenticationRequired`, `networkUnavailable`)
  and their error codes are not added yet (M8/M11, append-only). A missing ssh helper (Windows, no space-free
  path) leaves ssh without askpass; M11 should map its failure to the documented "load the key into
  ssh-agent / Pageant" message.


