---
name: 01-M1 core skeleton, protocol, contract, CI
state: progress
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
- [ ] 1.3 Protocol envelopes and error codes
- [ ] 1.4 serve over stdio
- [ ] 1.5 Contract generation
- [ ] 1.6 CI
- [ ] 1.7 Docs
- [ ] 1.8 Licences

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

