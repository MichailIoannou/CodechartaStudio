# CodeCharta Studio — agent plans

Implementation plans for turning the standalone CodeCharta visualization into a project- and git-aware desktop app. Written for an implementing agent with no other context.

**Everything the work needs lives in this folder and travels through git.** Nothing may depend on `.claude/`, local agent memory or any other machine-local state: the work is continued on other machines from a fresh clone.

## Reading order

| File | What it delivers | Depends on |
|---|---|---|
| `00-overview-and-decisions.md` | Verified facts, shared architecture decisions D1–D13, snapshot record, amendments | — (read first) |
| `01-core-and-desktop-shell.md` | Headless Rust core in `core/` (JSON-RPC over stdio), thin Electron shell, generated contract, process runner, tools check | — |
| `02-themes.md` | Dark theme (the default) and editor-style color themes | — (independent) |
| `03-projects-and-managed-store.md` | Projects with many folders; managed store on disk; opening a cc.json creates a project | 01 |
| `04-git-branches-and-history.md` | Branches, commit history, changes, commit, pull, push, credential prompts | 01, 03 |
| `05-commit-analysis-and-snapshots.md` | Run `ccsh` per commit, snapshot records with git/hosting state, "stale by N commits" | 01, 03, 04 |
| `06-compare-commits-and-prs.md` | Delta between commits, branches, PRs / merge requests | 01, 03, 04, 05 |
| `progress/` | Working notes: one file per milestone in progress or done (created by the implementing agent) | — |

## Where code goes

- `core/` (new, repository root): the headless Rust core. All non-UI behaviour: projects, managed store, git, `ccsh` runs, snapshots, comparison, PR lookup. Usable from the command line without any UI.
- `visualization/`: all UI changes, inside its existing directory structure. `visualization/electron/` stays a thin shell that starts the core and relays to it.
- `analysis/`: unchanged.

Order of work: `02` any time; `01 → 03 → 04 → 05 → 06`. Each plan is split into shippable milestones. Work one milestone per session.

## Rules for the implementing agent

1. Read `00-overview-and-decisions.md`, then your plan, then the repository's `CLAUDE.md` and `CODE_QUALITY.md`.
2. Re-verify every path, symbol and command the milestone names before changing code. Resolve anything marked `UNVERIFIED` with the spike task given.
3. One milestone at a time; structural commits before behavioural ones; tests first.
4. A milestone is done when these are green: root `npm run format:check`; in `visualization/`: `npm test`, `npm run lint`, `npx tsc --noEmit -p tsconfig.json`, and `npm run build && npm run e2e:ci` if UI flows changed; in `core/`: `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test`, and no drift in the generated TypeScript contract.
5. **Progress files.** The repository's `CLAUDE.md` asks for a plan file per instruction in `plans/`. For this work that file goes in `dev_docs/studio/agents/progress/<plan>-<milestone>-<short-name>.md` instead (same template as `plans/template.md`: frontmatter `name`, `state: todo | progress | complete`, then Goal, Tasks, Steps with checkboxes, Notes). Keep `state` and the checkboxes current and commit the file with the code, so the next session on any machine can resume from it. Record there: what was verified, deviations from the plan and why, spike results, and what is left.
6. Do not silently diverge from a shared decision; if one turns out wrong, record the evidence in the progress file and amend `00-overview-and-decisions.md` section 7 in the same commit.

## Owner decisions (settled 2026-11-18)

Git
- **Full basic git workflow**, in the manner of Zed / VS Code / Rider: status and changes, stage/unstage, commit (and amend), fetch, pull, push, branch create/switch/rename/delete, on top of the branch tree and commit history. Not planned: interactive rebase, hunk staging, a merge-conflict editor.
- **Credentials are asked for when git needs them and never stored.** HTTPS uses the user's own credential helper; SSH passphrases/passwords and host-key questions appear in an app prompt through an askpass helper. PR / merge-request listing uses the user's own `gh` / `glab` login. Fetching a PR head writes a private ref (`refs/codecharta/pr/<n>`) into the clone, only on an explicit click.
- The git tool window is its own top-level **History** view.

Projects and snapshots
- **Opening a cc.json directly stays possible.** It creates (or reuses) a project named after the folder containing the file — the project name can be changed later independently of the folder — and opens the file as an **imported snapshot whose analysis time is stated as unknown**.
- "Stale by N commits" is a non-modal banner with "Analyse now" plus a permanent chip. Selecting an unanalysed commit never starts an analysis by itself. A comparison with a missing side asks (Analyse missing / Use nearest).
- Store: `%APPDATA%\codecharta-visualization\store`, changeable (data is copied). Deletions go to the OS recycle bin; no automatic pruning. Single app instance.

Themes
- **Dark is the default theme for everyone.** It is the most important theme deliverable.
- Additional themes are **token-color redefinitions after known editor schemes**: CodeCharta Light, Nord, One Dark (Atom), VS Dark, VS Light, Darcula (Rider dark), Rider Light. Adding a theme must be data only.
- "White Background" stays as a per-map override. Dark-theme screenshots are composited onto the theme background.

Architecture
- **Headless Rust core in `core/`, existing Electron kept as the shell, existing Angular visualization kept as the UI.** The core is the part intended to outlive this UI.

Process
- An extra `windows-latest` CI job for the desktop unit tests is fine.
- The plans are executed by the owner's agents one milestone at a time; this folder is the only hand-over.

Design review (settled 2026-11-18, details and plan impact in `design/owner-decisions.md`)
- **One working folder at a time.** A project groups folders; the user works in one folder. No
  side-by-side or combined display of several folders. Plan 03's `view.visibleFolderIds` becomes
  `workingFolderId` (03-M1 is affected now).
- Branch chip, analyses indicator and snapshot status are one nav-bar element with a progress fill;
  Fetch / Pull / Push / Publish are one contextual button; the project home is a project overview page.

## Still open (not blocking)

- Renaming the app to "CodeCharta Studio" (app name, userData folder, icons; BSD-3 notices must be kept). Not planned; would be its own small plan. Until then the store path keeps the upstream app name.
- Offering parts upstream (themes, bridge). The plans keep the web build working so this stays possible.
