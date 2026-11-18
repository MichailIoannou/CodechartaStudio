---
name: 01-M1 core skeleton, protocol, contract, CI
state: complete
version: 1
---

## Goal

Create the Rust workspace in `core/` with the three crates, a JSON-RPC 2.0 `serve` over stdio
(`core.hello`, `core.ping`, `core.shutdown`, `core.cancel`), the generated TypeScript contract, CI and
docs, as plan 01 section 4 M1 describes.

## Tasks

Copied from `01-core-and-desktop-shell.md` section 4, M1 (the test names to write first are listed there).

### 1.1 Commit scope, gitignore, toolchain pin
### 1.2 Cargo workspace, three crates, `core/README.md`
### 1.3 Protocol envelopes and error codes
### 1.4 `serve`: framing, session, dispatch, tracing
### 1.5 Contract generation (`export-contract`, `npm run contract`, `model/coreApi/`, `electron/coreMethods.generated.json`)
- Use ts-rs 12 per `01-m0-spikes.md` S6: `with_large_int("number")`, skip types without `output_path()`,
  format with `biome check --write`.
### 1.6 CI workflow `test_core.yml`
### 1.7 Docs
### 1.8 Licences of core dependencies

## Steps

- [x] 1.1 Commit scope, gitignore, toolchain pin
- [x] 1.2 Cargo workspace and crates
- [x] 1.3 Protocol envelopes and error codes
- [x] 1.4 serve over stdio
- [x] 1.5 Contract generation
- [x] 1.6 CI
- [x] 1.7 Docs
- [x] 1.8 Licences

## Notes

Environment (2026-11-18): Arch Linux x86_64, rustc/cargo 1.95.0 (rustup 1.29.2, toolchain `stable`),
node 26.13.0, npm 12.2.2. No `mise`, `cargo-deny` or `cargo-cyclonedx` installed.

### 1.1
- Verified: `commitlint.config.js` `scope-enum` as the plan says; `mise.toml` pins `java`/`node`, no Rust;
  `.gitignore` had no Rust entries.
- **Deviation (toolchain pin):** `rust-toolchain.toml` with `channel = "1.95.0"` makes rustup refuse to
  run here (`toolchain '1.95.0-x86_64-unknown-linux-gnu' is not installed`; it would download it) because
  this machine has the same version only under the name `stable`. Per the milestone instructions the
  channel is pinned to `stable`, and the workspace declares `rust-version = "1.95"` so an older compiler
  fails clearly. `mise.toml` gets `rust = "stable"` to match (mise's tool name is `rust`; mise is not
  installed here, so not run). Owner: switch both to an exact version (e.g. `1.95.0`) once every machine
  and CI may download it.

### 1.2
- Edition 2024, so `resolver = "3"` (the plan says 2; 3 is the edition-2024 default and MSRV-aware).
- External crate versions live in `[workspace.dependencies]`; crates use `<name>.workspace = true`.
- `clippy::unwrap_used = "deny"` with `core/clippy.toml` `allow-unwrap-in-tests = true` (unwrap stays
  allowed in `#[test]` and `#[cfg(test)]` code only).
- rustfmt defaults (no `rustfmt.toml`). Biome does not check `.rs`/`.toml`/`.md`, so `core/` adds nothing
  to `npm run format:check`. `Cargo.lock` is committed (the workspace ships a binary).

### 1.3
- Crates (latest compatible with Rust 1.95, via `cargo add`): serde 1.0.229, serde_json 1.0.154,
  ts-rs 12.0.1 (`serde-json-impl`, `no-serde-warnings`), thiserror 2.0.21; for 1.4 also added here:
  tokio 1.54.1, tokio-util 0.7.20, tracing 0.1.44, tracing-subscriber 0.3.23, clap 4.6.8.
- `registry.rs`: `Method` (NAME, AUDIENCE, Params, Result) and `Event` (NAME, AUDIENCE, Params) traits;
  `MethodSpec`/`EventSpec` store ts-rs function pointers (`TypeExport { name, export_all, output_path }`),
  as S6 proposed, instead of the `&'static str` type names in plan 3.3 (ts-rs names are not const).
  Lists: `METHODS`, `EVENTS` (core → client) and `CLIENT_NOTIFICATIONS` (client → core, holds
  `core.cancel`, audience shell) — the plan did not say where `core.cancel` is registered.
- `ToolId` (api `methods/tools.rs`) arrived early because `CoreError::ToolNotFound/ToolFailed` need it.
- `CoreError::to_payload`: message is the `Display` text, except `Io` (only its `context`) and
  `Internal` (a fixed sentence); details carry `tool`, `afterMs` or `limitBytes` where present.
- Framing faults carry `data.code`: `BAD_REQUEST` for -32700/-32600/-32602, `NOT_FOUND` for -32601
  (`ResponseError::framing`). Failures whose id is unknown answer with `"id": null`.

### 1.4
- `codecharta-cored` is a library (`cli`, `serve`) plus the thin `main.rs`, so the serve pieces are
  unit-testable and public items are not dead code in a bin.
- Routing: `dispatch.rs` holds a `ROUTES` table of `(name, fn handler)`; names come from the api
  `Method::NAME` consts; `should_handle_exactly_the_registered_methods` compares it with `METHODS`.
  Test-only routes (`core.sleep { milliseconds }`, emits one `core.progress`) live in
  `serve/test_methods.rs` behind the crate feature `test-methods`; they are not in the api registry, so
  never in the contract. The two protocol tests that need it are `#[cfg(feature = "test-methods")]`, so
  plain `cargo test` skips them; the gates and CI use `--all-features`.
- Session: `core.hello` and `core.shutdown` run inline in the read loop (ordering guaranteed); every other
  request is its own tokio task (inner `tokio::spawn` so a panic becomes an `INTERNAL` answer) tracked by
  a `TaskTracker`. Cancellation is **cooperative**: `core.cancel` cancels the request's token, the handler
  decides how to stop (M2's runner must kill the process tree on it). A second request with an id that is
  still running gets -32600. Unknown notifications are logged and ignored.
- Shutdown (EOF or `core.shutdown`): cancel all tokens, wait up to 5 s for running requests, up to 5 s
  for the writer, then `Runtime::shutdown_timeout(100 ms)` because tokio's stdin read sits on a blocking
  thread that only returns when the client closes the pipe. Exit code 0. Killing child processes on
  shutdown arrives with M2 (`Core::shutdown`).
- **Data dir in M1:** `serve` requires `--data-dir` (exit 2 otherwise); `Core::new(CoreConfig { data_dir })`
  and `path_to_wire` are minimal. M2 task 2.1 replaces this with `CoreConfig::resolve` (`--data-dir` →
  `CODECHARTA_DATA_DIR` → `directories`), `Core::open` and settings.
- Logging: `tracing-subscriber` fmt to stderr, no ANSI, `--log-level` is a level (`off`…`trace`), not an
  `RUST_LOG`-style filter (no `env-filter` feature needed). Only method names are logged, never params.
- Tests added beyond the plan list (1.4): `should_answer_ping_after_hello`, `should_answer_a_request_with_a_string_id`,
  `should_answer_other_requests_while_one_is_running`, `should_exit_cleanly_after_a_shutdown_request`.

### 1.5
- `export-contract` (`codecharta-core-api/src/bin/export-contract/{main,render}.rs`): std-only argument
  parsing (`--ts <dir> --shell <file>`, no clap in the api crate); deletes and recreates the `--ts` folder so
  removed types disappear; ts-rs `Config::new().with_out_dir(..).with_large_int("number")`; exports
  every named params/result/event type plus `ErrorPayload` and `RequestId` (types without
  `output_path()`, e.g. `()`, are skipped as S6 found). `coreApi.ts` imports only the types it references
  (Biome's `noUnusedImports` would fail otherwise) and holds `CORE_PROTOCOL_VERSION`,
  `CORE_ERROR_CODES`, `CoreMethods`, `CoreEvents`, `CoreClientNotifications` (`core.cancel`),
  `RENDERER_METHODS`/`RendererMethod`, `RENDERER_EVENTS`/`RendererEvent`.
- `npm run contract` (in `visualization/package.json`): `cargo run --quiet --locked -p codecharta-core-api
  --bin export-contract …` then `node ../node_modules/@biomejs/biome/bin/biome check --write` on the two
  outputs. Biome is a root devDependency only (not in `visualization/`), so the script calls the root's
  copy by path; root `npm i` is needed, `visualization/node_modules` is not. A second run is a no-op.
- `coreMethods.generated.json` keys come out sorted (`protocolVersion`, `rendererEvents`,
  `rendererMethods`) because serde_json is built without `preserve_order`.
- knip: `app/codeCharta/model/coreApi/**` added to `ignore`. No Biome lint exclusion was needed.
- **Visualization gates:** `npm run lint` and `npx tsc --noEmit -p tsconfig.json` green. `npm test`:
  636 suites, 9 failures, all in `stores/fileStore/loaders/ccJson/util/urlExtractor.spec.ts`
  (`TypeError: Cannot delete property 'location' of #<Window>`), coverage gate met (96.66 / 89.93 /
  95.28 / 96.57). That spec fails alone too and this milestone touches no app code it reaches; it is a
  pre-existing incompatibility of the spec with this machine's Node 26.13 / jsdom (CI uses Node 24).
  Not changed here; worth a small `fix(visualization)` of its own.

### 1.6
- `.github/workflows/test_core.yml`, triggers on push/PR to `main` for `core/**`, the two generated
  contract paths and the workflow itself. Jobs: `core_checks` (matrix ubuntu/windows/macos-latest,
  `fail-fast: false`; fmt on ubuntu only; clippy and test with `--locked --all-features`) and
  `contract_drift` (ubuntu; root `npm ci` only, see 1.5; `npm run contract`; fails on
  `git status --porcelain` of the generated paths, so an uncommitted new file also fails).
- Toolchain: no third-party action. The hosted runners ship rustup; `rustup toolchain install` without
  arguments installs what `core/rust-toolchain.toml` names (rustup >= 1.28 behaviour, checked against
  the local rustup 1.29 help text).
- **Action pins:** most workflows here pin by tag, not SHA; only `actions/checkout` (v6.0.2) and
  `actions/setup-node` (v6.5.0) have SHA pins in the repo (`check-licenses.yml`), and those are copied.
  `actions/cache@v5` has no SHA pin anywhere in the repo, so it is pinned by tag like
  `test_format.yml` / `test_visualization.yml`. **Owner: confirm and add the SHA for `actions/cache@v5`.**
- Validated with Python `yaml.safe_load` (no actionlint here). Not run on GitHub.
- `merge-gatekeeper.yml` waits for every check of a PR, so the new jobs are covered without changes;
  `quality_gate.yml` is the reusable `ccsh gate` workflow and unrelated. Neither changed.

### 1.7
- Root `CLAUDE.md`: third component (Core), Rust requirement, "Core (Rust)" commands and the
  registration order, `npm run contract`, scope `core`, core gates in "Checks Before Committing", key
  file locations, `test_core.yml` under CI/CD. `visualization/TARGET-ARCHITECTURE.md`: section "Desktop
  shell and core". `dev_docs/CONTRIBUTING.md` scope list gains `core` (it mirrors `commitlint.config.js`).
- **Deviation:** the root `README.md` is the user-facing product page and has no developer-prerequisites
  section; the prerequisites live in `dev_docs/DEV_START_GUIDE.md` "Requirements", which gets the Rust line
  instead.

### 1.8
- **Choice: `cargo-deny` in `test_core.yml` (job `core_licences`), not `cargo-cyclonedx` + `purl-patrol`.**
  Why: `check-licenses.yml` runs only on `MaibornWolff/codecharta` pushes to `main` with
  `BREAK_ENABLED: false`, so in this fork it never runs and upstream it never fails; `cargo-deny` gates
  every PR that touches `core/` or `license_policy.json`. An SBOM job for secobserve can be added
  beside the other two later if the owner wants the core in that dashboard.
- `core/deny.toml`: `[licenses] allow` = the 96 `usagePolicy: "allow"` ids of `license_policy.json`
  minus `Nunit` and `StandardML-NJ` — both deprecated SPDX ids that the `spdx` crate (0.13.6, which
  cargo-deny uses) refuses to parse as a licensee ("a deprecated license identifier was used"); checked in
  a throwaway scratch crate. `unused-allowed-license = "allow"`, private (workspace) crates ignored,
  `[sources]` crates.io only.
- **Finding for the owner:** `unicode-ident` (pulled in by every proc macro: serde, clap, thiserror,
  ts-rs, tokio-macros) is `(MIT OR Apache-2.0) AND Unicode-3.0`, and `Unicode-3.0` is in neither list of
  `license_policy.json`. `deny.toml` carries a single-crate exception for it with a comment; remove it once
  `Unicode-3.0` is added to the policy (it is OSI-approved and permissive). `license_policy.json` itself was
  not changed.
- cargo-deny is installed in CI with `cargo install cargo-deny --version 0.21.0 --locked` (cached in
  `~/.cargo/bin`), so no new third-party action and no SHA to confirm. **Not run locally** (it would need a
  global install). Local substitute: a script over `cargo metadata --all-features` evaluated every
  third-party crate's licence expression (60 packages) against the `deny.toml` allow list plus the
  exception: all pass. Licences seen: MIT, Apache-2.0, Unlicense, and Unicode-3.0 (exception).

### For M2 and later plans
- Replace the M1 data-dir stopgap (`serve` requires `--data-dir`, `Core::new(CoreConfig { data_dir })`)
  with `CoreConfig::resolve` + `Core::open` (task 2.1); `HelloResult.dataDir` reads `Core::data_dir()`.
- Add a method: api types + `impl Method` + `METHODS` entry → `npm run contract` → `codecharta-core`
  function → a `Route` in `codecharta-cored/src/serve/dispatch.rs` (`read_params::<M>` /
  `write_result::<M>` / `domain_error`). `should_handle_exactly_the_registered_methods` fails until both
  sides exist. Events: `impl Event` + `EVENTS`; emit with `context.notifier.emit(E::NAME, &payload)`.
- Cancellation is cooperative: long handlers must watch `context.cancel` (M2's runner kills the process
  tree on it). `Session::finish` cancels every token at shutdown; M2 adds `Core::shutdown` (kill
  children) to that path.
- `CoreError` already has every plan-01 variant; `CoreError::to_payload` keeps Io/Internal detail out of
  the payload and logs them via `domain_error`.
- New crates: check licences against `core/deny.toml` (CI `core_licences`).
- Owner to-dos: exact toolchain pin instead of `stable` (1.1); SHA for `actions/cache@v5` (1.6);
  `Unicode-3.0` in `license_policy.json` (1.8); the Node 26 `urlExtractor.spec.ts` failure (1.5).

