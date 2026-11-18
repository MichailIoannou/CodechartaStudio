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

- [ ] 1.1 Commit scope, gitignore, toolchain pin
- [ ] 1.2 Cargo workspace and crates
- [ ] 1.3 Protocol envelopes and error codes
- [ ] 1.4 serve over stdio
- [ ] 1.5 Contract generation
- [ ] 1.6 CI
- [ ] 1.7 Docs
- [ ] 1.8 Licences

## Notes

