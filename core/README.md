# CodeCharta core

The headless core of the CodeCharta desktop app. It owns everything that is not presentation (later:
projects, the managed store, git, `ccsh` runs, snapshots, comparisons) and knows nothing about Electron,
Angular or any other UI. The Electron shell in `visualization/electron/` starts it and relays between it
and the renderer; anything else can drive it the same way, or use its command-line subcommands.

## Crates

| crate | kind | holds |
|---|---|---|
| `codecharta-core-api` | library + `export-contract` bin | request, response, event and error types; the single source of truth for the protocol and the generated TypeScript contract |
| `codecharta-core` | library | domain logic; no JSON-RPC framing, no stdio |
| `codecharta-cored` | bin `codecharta-core` | `serve` (JSON-RPC 2.0 over stdio) and the command-line subcommands; framing, dispatch and CLI only |

## Requirements

Rust stable (see `rust-toolchain.toml`; the workspace needs at least the `rust-version` in `Cargo.toml`)
with the `rustfmt` and `clippy` components. rustup picks the toolchain from `rust-toolchain.toml`.

## Build and run

```bash
cd core
cargo build                                   # target/debug/codecharta-core, which the shell uses in development
cargo build --release                         # target/release/codecharta-core, packaged next to the app
cargo run -p codecharta-cored -- --version
cargo run -p codecharta-cored -- --data-dir /tmp/cc-data serve   # JSON-RPC on stdin/stdout, log on stderr
cargo run -p codecharta-cored -- doctor [--json]                 # tools report; exit 0 = ready, 1 = a required tool is not usable
cargo run -p codecharta-cored -- projects list [--json]          # projects of the store; reads only
cargo run -p codecharta-cored -- projects create --name demo --folder .[=<label>[:primary|fork|helper]]
cargo run -p codecharta-cored -- projects add-folder --project <id> --path <dir> [--label <l>] [--role fork]
```

The `projects` commands exit 0 when done, 1 when the core refused (message on stderr) and 2 for a usage
error; `create` and `add-folder` print the id they made, or the whole project with `--json`. Writing commands
take the store lock, so they fail with `STORE_LOCKED` while the app runs.

The data folder (settings file `core-settings.json`, default store `store/`, `logs/`) is `--data-dir`, else
`CODECHARTA_DATA_DIR`, else `codecharta-visualization` in the user's configuration folder (`%APPDATA%`,
`~/Library/Application Support`, `$XDG_CONFIG_HOME` or `~/.config`) — the same folder Electron uses as the
app's `userData`. The desktop shell always passes `--data-dir`.

## Child processes

Only `codecharta-core`'s `process` module starts child processes, and domain code goes through
`Tools::run` (`tools` module), which finds the tool, sets `JAVA_HOME` for ccsh when needed and applies the
hardened environment (no terminal prompts, no pager, no colour), a timeout, an output cap, cancellation
and process-tree kill. Tests use the `cc-fake-tool` binary (modes chosen by its first argument) and
`tests/support` (`fake_tool`, `install_fake_command`, `TempRepo` with a temporary `HOME` and
`GIT_CONFIG_NOSYSTEM=1`).

## Gates

Run all of them before every commit that touches `core/`:

```bash
cd core
cargo fmt --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test --all-features
```

CI also runs `cargo deny check licenses sources` (`deny.toml`): every dependency must carry a licence
that `../license_policy.json` allows and come from crates.io. Check a new crate's licence before adding it.

`--all-features` switches on `test-methods`, which adds test-only protocol methods (`core.sleep`) that the
protocol tests need. They never ship and never appear in the contract.

## Protocol

JSON-RPC 2.0, one JSON object per line, requests and notifications on stdin, responses and notifications
on stdout; nothing else is ever written to stdout (the log goes to stderr). The first request must be
`core.hello` with the client's `protocolVersion`. Domain errors are JSON-RPC error `-32000` with
`data = { code, message, details }`; the codes are listed in `codecharta-core-api/src/error.rs` and only
ever appended to.

A new method or event is added in this order: types, `Method` impl and registry entry in
`codecharta-core-api`, then `npm run contract`, then the library function in `codecharta-core`, then the
dispatch arm in `codecharta-cored`.

## Contract regeneration

The TypeScript types in `visualization/app/codeCharta/model/coreApi/` and the shell's allow-list
`visualization/electron/coreMethods.generated.json` are generated from `codecharta-core-api` and
committed. After any change to the api crate:

```bash
cd visualization
npm run contract          # needs the root node_modules (npm i in the repository root) for Biome
```

CI fails when the committed files differ from a fresh generation.
