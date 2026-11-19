# 04 — Git: branches, history and the everyday git workflow

- **Depends on:** `01-core-and-desktop-shell.md` (core workspace, process runner, tools check, JSON-RPC dispatcher, generated contract, `DesktopBridge` and its fake), `03-projects-and-managed-store.md` (projects, folders, `(projectId, folderId)` → path in the core). Exact needs: section 4.1.
- **Unlocks:** `05-commit-analysis-and-snapshots.md`, `06-compare-commits-and-prs.md` (section 4.2).
- **Size:** M1 M · M2 M · M3 M · M4 L · M5 M · M6 S · M7 L · M8 M · M9 M · M10 M · M11 L · M12 M

## 1. Goal

A project folder that is a git repository gets a **History** view like the Git tool window of Rider / Visual Studio: a branches tree (local, remote, tags), a commit list with a branch graph, and a details pane with message and changed files. The nav bar always shows the current branch. On top of that read-only part (M1–M6, shippable alone) the app offers the everyday workflow of Zed / VS Code / Rider (M7–M12): a **Changes** tab (staged / unstaged / untracked / conflicted, stage, unstage, discard, read-only diff), **commit** (subject + body, amend), **sync** (fetch, pull, push, upstream on first push) and **branch management** (create, switch, rename, delete local and remote, set upstream).

All git behaviour lives in the headless core (`core/crates/codecharta-core/src/git/`), reachable over JSON-RPC (`git.*`) and partly from the command line (`codecharta-core git status|branches|log`). The renderer consumes the generated contract through `DesktopBridge`. The Electron shell gets no git code: its relay forwards the `git.*` / `prompt.*` methods and notifications like every other contract entry.

Credentials are asked for when git needs them and **never stored**: HTTPS goes through the user's own credential helper; when git or ssh must ask (ssh passphrase or password, host-key confirmation, HTTPS credentials without a helper) git runs the core binary in askpass mode, the serving core emits `prompt.requested`, the renderer shows an Angular modal, and the answer goes to git once.

## 2. Current state (verified in source)

Renderer routing and chrome (paths relative to `visualization/app/codeCharta/`)
- Routes in `visualization/app/app.config.ts`; paths in `routing/routePaths.ts`: `routePaths = { metrics: "", domain: "domain", dependencies: "dependencies" }`, `routeLinks`, `type ViewId = keyof typeof routePaths`, `VIEW_IDS`, `viewIdForLink(url)` (unknown → `"metrics"`).
- `routing/keepAliveRouteReuse.strategy.ts` detaches and re-attaches every route: a view keeps DOM, scroll and state across switches and never runs its destroy logic.
- `routing/showSpinnerBeforeBuildingView.guard.ts` waits for `ViewReadinessStore.markReady(view)` up to 10 s (`VIEW_SWITCH_MAX_WAIT_MS`); a view that never calls `markReady` must not use this guard.
- `ViewId` is a key type in `features/navBar/components/viewSwitcher/viewSwitcher.component.ts` (`VIEW_TABS`, `isViewAvailable: Record<ViewId, Signal<boolean>>`), `features/navBar/components/viewModeBar/viewModeBar.component.ts` (`groupLabels`), `features/nodeContextMenu/components/nodeContextMenu/nodeContextMenu.component.ts` (`JUMP_TARGETS`, `jumpTargets` iterates `VIEW_IDS`), `features/shared/services/loadingFileProgressSpinner.service.ts` (`DRAWING_PHASE_OF_VIEW`). A new view id breaks the type check in all four.
- `routing/viewHandoff.store.ts` `ViewHandoffStore.handOverNode(view, nodePath)` then `router.navigateByUrl(routeLinks[view])` shows a node in another view (pattern: `features/nodeContextMenu/stores/nodeContextMenu.write.store.ts` `showNodeInView`). Node paths start with `fileRoot.rootPath` (`util/fileRoot.ts`, default `/root`).
- `routing/closeDialogsOfLeftView.effect.ts` closes every `dialog[open]` inside the active view on `NavigationStart` (selector `router-outlet + * dialog[open]`).
- `views/codeCharta.component.html` mounts `<cc-nav-bar>`, `<router-outlet>`, `<cc-toast>`. `features/navBar/components/navBar/navBar.component.html`: `navbar-start` = logo, divider, `cc-nav-bar-folder-button`, then `cc-delta-selector` or `cc-map-selector`; `navbar-center` = `cc-view-switcher`; `navbar-end` = `cc-settings-button`. Nav bar height is published as `--cc-bars-height`.
- The metrics view is filled by fixed panels (`cc-sidebar-explorer`, `cc-sidebar-inspector`, `cc-metrics-bar`, `cc-legend-panel`, `cc-file-extension-bar`, `cc-bottom-bar`).
- `features/shared/facade.ts`: `ConfirmDialogComponent` (inputs `title`, `message`, `testId`; output `confirmed`; `open()`/`close()`; fixed No / Yes), `FloatingMenuComponent` (input `anchor`, output `dismissed`), `ContextMenuItemComponent` (inputs `icon`, `hoverHint`, `buttonId`; output `itemClick`), `ColumnResizeHandleDirective` (`[ccColumnResizeHandle]="'left'|'right'"`, outputs `widthChange`, `resizeEnd`, `widthReset`), `ToastService.show(text, severity)`. `util/copyToClipboard.service.ts` (`copy(text)`, signal `copied`).
- `util/persistence/localStorage.repo.ts` (`LocalStorageRepo.read/write`) is the pattern for per-user UI state outside `CcState` (example: `features/sidebarExplorer/repos/explorerCollapse.repo.ts`).
- No virtual scrolling exists; `@angular/cdk` is forbidden (`no-angular-material` in `visualization/conf/dependencyCruiser/viewAndFeatureRules.js`).

Renderer tooling
- Jest: `roots: ["<rootDir>/app"]`, jsdom, 80 % global coverage. Playwright drives the web build; `features/localSource/e2e/localSource.po.ts` (`standInForThePicker`) shows replacing a native capability with `page.addInitScript`.
- Biome: `noControlCharactersInRegex`, `noForEach`, `useBlockStatements` are errors; `noConsole` allows only `warn`/`error`.
- `visualization/.codecharta.yml` quality gate per file: complexity ≤ 100, rloc ≤ 472, function complexity ≤ 14, comment lines ≤ 24; file cycles are errors.

Git behaviour, checked on Git for Windows 2.56 (bundled OpenSSH 10.6p1) in throwaway local repositories:
- `log -z --format=tformat:%H%x00%P%x00%s`: every field NUL-terminated, records follow directly; root commit has an empty `%P`.
- `status --porcelain=v2 --branch -z`: headers `# branch.oid`, `# branch.head`, `# branch.upstream`, `# branch.ab +1 -2`; a rename is `2 R. … R100 <newPath>` followed by a separate token `<origPath>`; conflict `u AA …`; untracked `? <path>`. A merge leaves `MERGE_HEAD`, a stopped rebase a `rebase-merge` directory.
- `for-each-ref` with `%00`: one newline-terminated line per ref; `%(*objecttype)` empty for non-tags; `%(worktreepath)` is set for the current worktree too (`C:/…`).
- `rev-parse --path-format=absolute` prints `C:/…`; `--show-prefix` prints an empty line at the root.
- `--end-of-options` accepted by `switch`, `branch` (create, `-d`, `-m`) and `push`.
- `git check-ref-format refs/heads/-x` exits 0: a leading `-` must be rejected by the core itself.
- Without `user.name`/`user.email`, `git commit` on Windows invents an identity from the OS account; with `-c user.useConfigOnly=true` it fails with "Author identity unknown … Please tell me who you are."
- `pull --ff-only` on diverged branches exits 128 "Diverging branches can't be fast-forwarded"; rejected push prints `! [rejected] … (non-fast-forward)`; `branch -d` of an unmerged branch prints "is not fully merged"; `merge --abort` / `rebase --abort` restore the previous state.
- `fetch`/`push --progress` write `\r`-separated progress to stderr (`Counting objects:  50% (2/4)`, `remote: …` padded with spaces), final lines end in `\n`.
- `diff --no-index -- /dev/null <path>` shows an untracked file as added and exits 1; `commit -F <file> --cleanup=whitespace` keeps a body line starting with `#`; `--literal-pathspecs` makes `[ab].txt` literal; `restore --staged` fails without commits ("could not resolve 'HEAD'") where `rm --cached` works; `stash push -m`, `stash list -z --format=%gd%x00%H%x00%gs`, `stash pop` work.
- Askpass: git calls `GIT_ASKPASS` with the prompt as its single argument (`Username for 'https://host': `, `Password for 'https://user@host': `) and uses its stdout line, also with `GIT_TERMINAL_PROMPT=0`. Git for Windows' ssh honours `SSH_ASKPASS` + `SSH_ASKPASS_REQUIRE=force` without `DISPLAY` (prompt `Enter passphrase for <key>: `), but a `.cmd` helper whose path contains a space failed (cmd.exe split it). Without `SSH_ASKPASS_REQUIRE=force` and without `DISPLAY` ssh does not use the helper.

## 3. Decisions of this plan

| # | Decision |
|---|---|
| G1 | History is a **dedicated top-level view** (route `history`, fourth view-switcher tab). Every existing view is full of fixed panels; three panes need the full width; keep-alive routing preserves scroll and selection. |
| G2 | Clients address a repository only as `FolderRef { projectId, folderId }`; the core resolves the path through plan 03. No RPC parameter is a filesystem path, URL or free-form git argument. The CLI may additionally take `--path`. |
| G3 | Minimum git **2.31** (`rev-parse --path-format=absolute`; `--end-of-options`, `%(worktreepath)`, `switch` are older). Older → `gitTooOld`. |
| G4 | Commit order `--date-order` (children before parents, as Rider). Log paging uses a core **log session** that pins tip SHAs, then `--skip`/`--max-count`. |
| G5 | Refresh = Refresh button + window focus (throttled) + after every mutating operation. **No filesystem watcher, no polling.** |
| G6 | With a text, author or path filter the list is flat (no graph). |
| G7 | **Full basic git workflow** (owner decision): fetch, pull, push, commit (amend), stage / unstage / discard, read-only diff, create / switch / rename / delete branches (local and remote), set upstream; stash as stretch. Not offered: interactive rebase, hunk staging, a merge-conflict editor, submodule/LFS management, blame, cherry-pick / revert. |
| G8 | Read commands never run repository-controlled programs (`core.fsmonitor=false`, `--no-ext-diff`, `--no-textconv`, no pager). Mutating commands run hooks, filters, the credential helper, ssh and gpg as a terminal would; the first mutating action per repository and session says so. |
| G9 | **Credentials prompted, never stored** (owner decision, D10). HTTPS uses the user's `credential.helper` (Git Credential Manager may open its own window). Prompts go through the core binary in askpass mode → `prompt.requested` → renderer modal → answer to git once. `GIT_TERMINAL_PROMPT=0` stays. |
| G10 | **One mutating operation per repository at a time**: FIFO queue per `repositoryId` in the core; reads continue (at most 4 concurrent per repository). Network operations stream progress and are cancellable; status and refs are re-read after every mutating operation. |
| G11 | Commit with the configured identity only (`-c user.useConfigOnly=true`); missing identity → `identityUnknown` with instructions. The core never runs `git config` for the user. |
| G12 | Destructive actions always confirm with the exact effect: discard (file names), delete branch (unmerged ⇒ separate force confirmation), delete remote branch, force push (`--force-with-lease=<ref>:<expectedSha>` only, separately confirmed), amend of a commit already on the upstream. Untracked files are discarded to the OS recycle bin. |
| G13 | The core emits `repository.changed` whenever it observes a change (after any mutating operation, or when a read sees a new refs fingerprint or status). Clients use it instead of guessing. |

## 4. Design

### 4.1 Required from plans 01 and 03

Names below are the expected ones. **First task of M1:** read plans 01 and 03 as implemented, use the real names, and record differences in this plan's Notes (section 9).

From plan 01 (core):
- Workspace `core/` with `codecharta-core`, `codecharta-core-api`, `codecharta-cored`; the async runtime it chose (tokio expected; if plan 01 is synchronous, keep these signatures without `async`).
- **Process runner** (expected `codecharta_core::process::Runner`): argv vector, cwd, environment overlay **and removal list**, optional **stdin text** (closed after writing), timeout, stdout cap, cancellation token that kills the process tree, **stderr chunk callback** and **stdout line callback** (streaming rev-list, progress). Errors distinguish timeout, cancelled, output too large, executable missing. Add whatever is missing in plan 01's module, test first, in the milestone that needs it (stdin: M2; streaming stdout: M2; env removal: M7).
- **Tools check** (expected `codecharta_core::tools`): resolved `git` path and version; set git's minimum version to **2.31.0** (M1 task 1; test "should report git below the minimum as too old").
- **JSON-RPC dispatcher** (expected `codecharta-cored/src/rpc/`): method registration, typed params / results from `codecharta-core-api`, notification sink, domain error mapping (`error.data` carries the domain code), generic cancel (as built: the `core.cancel` notification with the request id, overview section 10).
- **CLI** (clap expected) with a subcommand slot for `git`, and the `askpass` mode slot in `main` (section 4.6).
- **Core data directory** (expected `AppPaths::data_dir()`): cwd for git, temporary commit-message files.
- **Contract generation** into `visualization/app/codeCharta/model/coreApi/` with the drift check.
- Renderer: `DESKTOP_BRIDGE` token (typed by the generated contract: a request method and a notification subscription), `DesktopEnvironment.isDesktop`, the self-contained in-memory fake `createFakeDesktopBridge(seed)` and the Playwright helper `standInForTheDesktopBridge(page, seed)`; the Electron relay forwarding every contract method and notification; the `_electron` smoke suite; the `windows-latest` CI job running `cargo test`.

From plan 03:
- Core: `FolderRef { project_id, folder_id }` in `codecharta-core-api`, and a folder lookup (expected trait `FolderResolver::folder_path(&FolderRef) -> Result<Option<PathBuf>, …>`; `None` = detached folder → `folderNotFound`).
- Core: the recycle-bin helper plan 03 uses for deletions (expected the `trash` crate); if missing, add it there.
- Renderer: `ProjectsService.activeProject` / `activeFolder` signals exported from `features/projects/facade.ts` (M3 task 3 adds the export if missing).

### 4.2 Offered to plans 05 and 06

Core (Rust, in-process — plans 05 and 06 live in the core too):
- `GitService` (section 4.5) with `resolve_commit`, `rev_list_count`, `merge_base`, `is_ancestor`, `measure_distances`, `refs_at`, `status`, `refs`, `changed_files`.
- **Streaming rev-list** for plan 05 (nearest analysed commit, "stale by N"): `GitService::rev_list(repo, RevListRequest, sink)` delivers SHAs in batches as git prints them and stops when the sink says so.
- **Working-tree target** for plan 05: `GitStatus` (`head`, `counts`, `is_clean()`), and the renderer selection item `{ kind: "workingTree" }` (section 4.7) for "Analyse working tree".
- **`repository.changed`** notification (G13) plus an in-core subscription `GitService::subscribe_changes() -> broadcast::Receiver<RepositoryChanged>` so plan 05 can mark snapshots stale.
- For plan 06: `merge_base`; **changed files between two commits** (`changed_files` with `ChangedFilesMode::Direct | SinceMergeBase`, also RPC `git.changedFiles`); **credential-prompting fetch of explicit refspecs** `GitService::fetch_refspecs(repo, FetchRefspecsRequest, ctx)` (queue, askpass, progress, cancel; destination refs restricted to `refs/codecharta/`), from which plan 06 builds `+refs/pull/<n>/head:refs/codecharta/pr/<n>`.
- `OperationQueue::run_exclusive(repository_id, task)`: plans 05/06 must not run a mutating git command outside it.
- `GitRunner` (section 4.5) for any further read command; such commands go through the read environment and are reviewed against G8.
- Test support: `core/crates/codecharta-core/tests/support/git_fixture.rs` (section 5, M1 task 1). Plans 03/05/06 reuse it with `mod support;` in their integration tests.

Renderer:
- Ports in `features/gitHistory/ports/` (section 4.7): `ANALYSED_COMMITS`, `COMMIT_ACTIONS`, `LOADED_MAP_LOCATOR`. Not exported from `features/gitHistory/facade.ts` until a consumer exists (knip); the implementing plan adds the export.
- `CommitSelectionService.selection` (commits and the working-tree item) and `GitRepositoryService.activeRepository`, exported by the first plan that needs them.

### 4.3 Files

Core:

```
core/crates/codecharta-core-api/src/git.rs        contract types (section 4.4); re-exported from lib.rs
core/crates/codecharta-core-api/src/methods/prompt.rs  PromptRequested, PromptClosed, PromptAnswerParams, PromptCancelParams, PromptKind (as built; Secret in src/secret.rs, PromptId in values.rs)
core/crates/codecharta-core/src/git/
  mod.rs                 pub use of GitService, GitRunner, OperationQueue, error helpers
  command.rs             GLOBAL_ARGS, READ_ARGS, read / mutating / network environments, timeouts, caps (named consts)
  runner.rs              GitRunner over plan 01's process runner; failure classification hook
  failure.rs             classify(subcommand, exit, stdout, stderr) -> GitErrorCode
  error.rs               GitResult<T>, constructors for GitError, conversion from runner errors
  revisions.rs           CommitSha, FullRefName, validate_new_branch_name, validate_repo_path
  nul.rs                 split_nul_fields, chunk_records
  parse/{repository,status,status_entries,refs,remotes,log,changed_files,stash,progress}.rs
  parse/testdata/*.txt   captured outputs (include_bytes!)
  fingerprint.rs         fingerprint_of(refs, head) (sha2)
  cache.rs               small LRU (or the `lru` crate if plan 01 already depends on it)
  locator.rs             version check, rev-parse, repository id
  read.rs                status, refs, log sessions and pages, commit details
  query.rs               resolve_commit, rev_list_count, rev_list stream, merge_base, is_ancestor, measure_distances, refs_at, changed_files
  queue.rs               OperationQueue (G10); progress.rs: ProgressReporter, ProgressThrottle (as built in M7)
  working_tree.rs        working tree, diff, stage, unstage, discard
  commit.rs              commit, amend
  branch.rs              switch, checkout remote, create, rename, delete, delete remote, set upstream
  sync.rs                fetch, fetch_refspecs, pull, push, abort
  stash.rs               (stretch)
  changes.rs             RepositoryChanged broadcast, last-seen fingerprint per repository (G13)
  service.rs             GitService facade
core/crates/codecharta-core/src/prompt/
  broker.rs              PromptBroker: sessions per operation, pending prompts, answer once
  server.rs              local pipe / unix socket listener, token check
  kind.rs                classify prompt text as secret / text / confirm
  helper.rs              askpass client: connect, send, print answer (used by codecharta-cored)
core/crates/codecharta-cored/src/rpc/git.rs       git.* method handlers (param validation + GitService call)
core/crates/codecharta-cored/src/serve/prompt_routes.rs  prompt.answer, prompt.cancel, askpass server start, event forwarding (as built)
core/crates/codecharta-cored/src/cli/git.rs       `codecharta-core git status|branches|log`
core/crates/codecharta-cored/src/askpass.rs       askpass mode entry (section 4.6)
core/crates/codecharta-core/tests/support/{mod.rs,git_fixture.rs}
core/crates/codecharta-core/tests/git_{repository,status,refs,log,queries,working_tree,commit,branches,sync,stash}.rs
core/crates/codecharta-core/tests/prompt_roundtrip.rs
core/crates/codecharta-cored/tests/git_protocol.rs   drives `serve` over stdio; CLI output tests
core/crates/codecharta-cored/tests/askpass_mode.rs   runs the real binary in askpass mode
```

Renderer (`visualization/app/codeCharta/`):

```
model/coreApi/git.ts, prompt.ts                    generated (never edited by hand)
views/historyView/historyView.component.ts|html|spec.ts
features/gitHistory/
  facade.ts
  model/loadState.ts  model/commitSelection.ts
  ports/analysedCommits.port.ts  commitActions.port.ts  loadedMapLocator.port.ts
  services/gitApi.service.ts                 the only caller of DESKTOP_BRIDGE for git.*; maps RPC errors to GitError
  services/gitHistoryAvailability.service.ts  gitRepository.service.ts  gitLog.service.ts
  services/commitSelection.service.ts  commitDetails.service.ts  gitOperation.service.ts
  services/gitChanges.service.ts  commitMessage.service.ts  credentialPrompt.service.ts  historyLayout.service.ts
  repos/historyLayout.repo.ts  activeFolder.repo.ts  commitDraft.repo.ts
  util/graphLayout.ts  graphRowGeometry.ts  virtualWindow.ts  branchTree.ts  refLabels.ts  commitDate.ts
       gitErrorText.ts  diffLines.ts  effectText.ts
  components/gitHistoryPanel/ historyToolbar/ syncButtons/ branchesTree/ commitList/ commitRow/ commitGraphCell/
             commitDetails/ commitContextMenu/ branchContextMenu/ createBranchDialog/ renameBranchDialog/
             deleteBranchDialog/ pullChoiceDialog/ pushDialog/ changesPanel/ changeRow/ diffView/ commitBox/
             operationStateBanner/ credentialPromptDialog/ gitProblemNotice/ currentBranchChip/
  services/gitApi.mocks.ts                   data builders for specs
  e2e/gitHistory.e2e.ts  gitHistory.po.ts  gitWorkflow.e2e.ts
```

Changed renderer files: `routing/routePaths.ts`, `app/app.config.ts`, `viewSwitcher.component.ts`, `features/navBar/stores/viewSwitcher.read.store.ts`, `viewModeBar.component.ts`, `navBar.component.ts|html`, `nodeContextMenu.component.ts`, `loadingFileProgressSpinner.service.ts`, `views/codeCharta.component.ts|html` (mounts `<cc-credential-prompt-dialog>` next to `<cc-toast>`, outside the router outlet, so `CloseDialogsOfLeftViewEffect` never closes it), plan 01's fake bridge (git seed), `visualization/CHANGELOG.md`, `visualization/README.md`.

### 4.4 Contract (`codecharta-core-api/src/git.rs`, `prompt.rs`)

All structs derive `Debug, Clone, PartialEq, Serialize, Deserialize` plus the TypeScript-export derive plan 01 chose (e.g. `ts_rs::TS`), with `#[serde(rename_all = "camelCase")]`. Tagged enums use `#[serde(tag = "kind", rename_all = "camelCase")]`. Timestamps are unix seconds (`i64`). SHAs travel as lower-case hex strings (40 or 64). Wire names are stable: variants and fields may be added, never renamed.

```rust
pub use crate::projects::FolderRef;                       // plan 03

#[serde(rename_all = "camelCase")]
pub enum GitErrorCode {
    GitNotFound, GitTooOld, FolderNotFound, NotARepository, DubiousOwnership, BareRepository,
    InvalidArgument, UnknownRevision, LogSessionExpired, Timeout, OutputTooLarge, Cancelled, ParseFailed,
    CommandFailed, LocalChangesWouldBeOverwritten, OperationInProgress, BranchExists, BranchNotFullyMerged,
    BranchCheckedOutElsewhere, IndexLocked, AuthenticationRequired, AuthenticationCancelled, NetworkUnavailable,
    IdentityUnknown, NothingToCommit, HookFailed, NotFastForward, PushRejected, NoUpstream, Conflicts,
    StalePushLease, ChangedSinceListed,
}
pub struct GitError {
    pub code: GitErrorCode,
    pub message: String,                  // one sentence, safe to show
    pub detail: Option<String>,           // git's stderr, trimmed, ≤ 2000 chars, shown verbatim
    pub repository_path: Option<String>,  // only for dubiousOwnership (core → client is allowed)
}
// JSON-RPC: { code: <plan 01 domain error code>, message, data: { domain: "git", ...GitError } }

pub struct GitRepositoryInfo { pub repository_id: String, pub root_path: String, pub folder_prefix: String,
    pub is_shallow: bool, pub is_linked_worktree: bool, pub git_version: String }

#[serde(tag = "kind")] pub enum GitHead { Branch { name: String, commit: Option<String> }, Detached { commit: String } }
pub struct GitUpstream { pub ref_name: String, pub name: String, pub ahead: Option<u32>, pub behind: Option<u32>, pub is_gone: bool }
pub enum OperationInProgress { Merge, Rebase, CherryPick, Revert, Bisect }
pub struct StatusCounts { pub staged: u32, pub unstaged: u32, pub untracked: u32, pub conflicted: u32 }
pub struct GitStatus { pub head: GitHead, pub upstream: Option<GitUpstream>, pub counts: StatusCounts,
    pub operation_in_progress: Option<OperationInProgress> }

pub struct GitLastCommit { pub subject: String, pub committed_at: i64 }
pub struct GitLocalBranch { pub ref_name: String, pub name: String, pub commit: String, pub is_current: bool,
    pub upstream: Option<GitUpstream>, pub checked_out_in_other_worktree: Option<String>, pub last_commit: GitLastCommit }
pub struct GitRemoteBranch { pub ref_name: String, pub remote: String, pub name: String, pub branch_name: String,
    pub commit: String, pub last_commit: GitLastCommit }
pub struct GitTag { pub ref_name: String, pub name: String, pub commit: String, pub is_annotated: bool, pub created_at: i64 }
pub struct GitRemote { pub name: String, pub url: String }          // credentials removed
pub struct GitRefs { pub fingerprint: String, pub head: GitHead, pub local_branches: Vec<GitLocalBranch>,
    pub remote_branches: Vec<GitRemoteBranch>, pub tags: Vec<GitTag>, pub remotes: Vec<GitRemote> }

pub struct GitCommitSummary { pub sha: String, pub parents: Vec<String>, pub author_name: String, pub author_email: String,
    pub authored_at: i64, pub committed_at: i64, pub subject: String }
#[serde(tag = "kind")] pub enum GitLogScope { All, Head, Refs { ref_names: Vec<String> } }
pub struct GitLogFilter { pub text: Option<String>, pub author: Option<String>, pub path: Option<String> }
pub struct GitLogParams { pub repo: FolderRef, pub scope: GitLogScope, pub filter: Option<GitLogFilter>, pub cursor: Option<String> }
pub struct GitLogPage { pub commits: Vec<GitCommitSummary>, pub next_cursor: Option<String>, pub is_graph_available: bool }

pub enum GitFileChange { Added, Modified, Deleted, Renamed, Copied, TypeChanged, Unknown }
pub struct GitChangedFile { pub change: GitFileChange, pub path: String, pub previous_path: Option<String>,
    pub insertions: Option<u32>, pub deletions: Option<u32> }      // None = binary
pub struct ChangeTotals { pub files_changed: u32, pub insertions: u32, pub deletions: u32 }
pub struct GitCommitDetails { #[serde(flatten)] pub summary: GitCommitSummary, pub committer_name: String,
    pub committer_email: String, pub message: String, pub compared_to_parent: Option<String>,
    pub files: Vec<GitChangedFile>, pub are_files_truncated: bool, pub totals: ChangeTotals }
pub enum ChangedFilesMode { Direct, SinceMergeBase }
pub struct GitChangedFiles { pub from: String, pub to: String, pub files: Vec<GitChangedFile>,
    pub are_files_truncated: bool, pub totals: ChangeTotals }

pub struct GitCommitDistance { pub sha: String, pub only_in_candidate: u32, pub only_in_target: u32 }

pub enum GitEntryKind { Staged, Unstaged, Untracked, Conflicted }
pub struct GitWorkingTreeEntry { pub path: String, pub previous_path: Option<String>, pub kind: GitEntryKind,
    pub change: GitFileChange, pub conflict: Option<String> }
pub struct GitWorkingTree { pub status: GitStatus, pub entries: Vec<GitWorkingTreeEntry>, pub are_entries_truncated: bool }
pub struct GitDiff { pub path: String, pub text: String, pub is_binary: bool, pub is_truncated: bool }
pub struct DiscardEntry { pub path: WorkingTreePath, pub kind: GitEntryKind, pub change: GitFileChange }
// as built in M9: paths from the client are the api value `WorkingTreePath` (1–4096 bytes, no NUL, relative,
// no drive prefix, no `..` segment); `git.stage` takes `target: GitStageTarget` = { kind: "paths", paths } | { kind: "all" }

pub struct GitOperationResult { pub status: GitStatus, pub refs: GitRefs, pub message: Option<String> }
pub struct GitFetchResult { pub updated_refs: u32, pub refs: GitRefs }
pub enum GitPullMode { FfOnly, Rebase, Merge }
pub enum GitAbortableOperation { Merge, Rebase }        // as built in M11
pub struct GitStashEntry { pub index: u32, pub sha: String, pub subject: String }

// notifications (as built in M7: GitOperationProgress is not added — progress travels as plan 01's core.progress)
pub struct GitOperationProgress { pub operation_id: String, pub repository_id: String, pub message: String,
    pub done: Option<u32>, pub total: Option<u32> }
pub enum ChangedPart { Status, Refs, WorkingTree }
pub struct RepositoryChanged { pub repo: FolderRef, pub repository_id: String, pub parts: Vec<ChangedPart>,
    pub fingerprint: Option<String> }
```

`prompt.rs`:

```rust
pub enum PromptKind { Secret, Text, Confirm }
pub struct PromptRequested { pub prompt_id: String, pub request_id: Option<RequestId> /* as built: the JSON-RPC id, mapped to the operationId by the shell */, pub repository_label: Option<String>,
    pub kind: PromptKind, pub message: String }                     // message verbatim from git / ssh
pub struct PromptClosed { pub prompt_id: String }
pub struct PromptAnswerParams { pub prompt_id: PromptId, pub answer: Secret }   // never logged (Debug prints "***"); ids are PromptId as built
pub struct PromptCancelParams { pub prompt_id: String }
```

#### JSON-RPC methods

Every `repo` param is a `FolderRef`. Methods marked **(op)** are called with the bridge's `operationId` (the shell maps it to the JSON-RPC request id), run in the operation queue, report `core.progress` (plan 01; `requestId` = the request) when they talk to a remote, are cancellable through the `core.cancel` notification with that request id, and emit `repository.changed` when done (success or failure).

| Method | Params | Result |
|---|---|---|
| `git.repositoryInfo` | `{ repo }` | `GitRepositoryInfo` |
| `git.status` | `{ repo }` | `GitStatus` |
| `git.branches` | `{ repo }` | `GitRefs` |
| `git.refsFingerprint` | `{ repo }` | `String` |
| `git.log` | `GitLogParams` | `GitLogPage` |
| `git.commitDetails` | `{ repo, sha }` | `GitCommitDetails` |
| `git.resolveCommit` | `{ repo, revision }` | `GitCommitSummary` |
| `git.revListCount` | `{ repo, from, to }` | `u64` (reachable from `to`, not from `from`) |
| `git.mergeBase` | `{ repo, left, right }` | `Option<String>` |
| `git.isAncestor` | `{ repo, ancestor, descendant }` | `bool` |
| `git.measureDistances` | `{ repo, target, candidates }` | `GitCommitDistances { distances: Vec<GitCommitDistance> }` (as built in M2: the contract generator exports only named result types) |
| `git.refsAt` | `{ repo, sha }` | `{ branches: Vec<String>, tags: Vec<String> }` |
| `git.changedFiles` | `{ repo, from, to, mode: ChangedFilesMode }` | `GitChangedFiles` |
| `git.workingTree` | `{ repo }` | `GitWorkingTree` |
| `git.diffFile` | `{ repo, path, kind: GitEntryKind }` | `GitDiff` |
| `git.stage` (op) | `{ repo, target: GitStageTarget }` — `{ kind: "paths", paths }` or `{ kind: "all" }` (as built in M9, like M8's tagged targets) | `GitWorkingTree` |
| `git.unstage` (op) | `{ repo, paths }` | `GitWorkingTree` |
| `git.discard` (op) | `{ repo, entries: Vec<DiscardEntry> }` | `GitWorkingTree` |
| `git.commit` (op) | `{ repo, subject, body, amend }` (as built in M10: `GitCreateCommitParams`, since `GitCommitParams` is `{ repo, sha }`; `body` is `""` for none) | `GitOperationResult` |
| `git.fetch` (op) | `{ repo, prune }` | `GitFetchResult` |
| `git.pull` (op) | `{ repo, mode: GitPullMode }` | `GitOperationResult` |
| `git.push` (op) | `{ repo, branchRefName, remote, setUpstream, forceWithLeaseExpected: Option<CommitSha> }` (as built in M11: `GitPushParams`) | `GitOperationResult` |
| `git.switch` (op) | `{ repo, target: GitSwitchTarget }` — `{ kind: "local", refName }` or `{ kind: "trackRemote", remoteRefName, localName }` (as built in M8: a tagged `target` instead of two param shapes) | `GitOperationResult` |
| `git.branchCreate` (op) | `{ repo, name, startPoint, checkout }` | `GitOperationResult` |
| `git.branchRename` (op) | `{ repo, refName, newName }` | `GitOperationResult` |
| `git.branchDelete` (op) | `{ repo, target: GitBranchDeleteTarget }` — `{ kind: "local", refName, force }` or `{ kind: "remote", remoteRefName }` (on the remote; as built in M8) | `GitOperationResult` |
| `git.setUpstream` (op) | `{ repo, refName, upstreamRefName: Option<String> }` | `GitOperationResult` |
| `git.abortOperation` (op) | `{ repo, operation: GitAbortableOperation }` — `"merge"` or `"rebase"` (as built in M11: `GitAbortOperationParams`) | `GitOperationResult` |
| `git.stashList` / `git.stashPush` (op) / `git.stashPop` (op) | stretch (M12): `{ repo }` / `{ repo, message, includeUntracked }` / `{ repo, index }` | `Vec<GitStashEntry>` / `GitOperationResult` |
| `prompt.answer` | `PromptAnswerParams` | `null` |
| `prompt.cancel` | `PromptCancelParams` | `null` |

Notifications: `core.progress` (plan 01's `ProgressParams`, at most every 200 ms per operation; as built in M7 there is no `git.operationProgress`), `repository.changed` (`RepositoryChanged`), `prompt.requested` (`PromptRequested`), `prompt.closed` (`PromptClosed`).

#### Parameter validation (in `rpc/git.rs`, before anything runs; failure → `invalidArgument`)

- `repo`: ids match plan 03's id pattern; unknown or detached folder → `folderNotFound`.
- `sha`, `from`, `to`, `left`, `right`, `ancestor`, `descendant`, `target`, `startPoint`, `forceWithLeaseExpected`, `candidates[i]`: `CommitSha` (40 or 64 lower-case hex). `candidates` ≤ 200.
- `revision`: `HEAD`, a `CommitSha`, or a `FullRefName` (starts with `refs/`, ≤ 1024 chars, no char < 0x20, no leading `-`) that `git check-ref-format` accepts. Expressions (`~`, `^`, `..`, `@{`) are rejected.
- `refNames[i]`, `refName`, `branchRefName` (under `refs/heads/`), `remoteRefName`, `upstreamRefName` (under `refs/remotes/`): `FullRefName` and present in a fresh refs listing.
- `remote`: a configured remote name, never a URL.
- `name`, `localName`, `newName`: `validate_new_branch_name` (section 4.6).
- `paths[i]`, `entries[i].path`, `path` (1–1000 entries): ≤ 4096 chars, no NUL, relative, no `..` segment, and present in the working-tree listing re-read **inside the queue** (else `changedSinceListed`).
- `subject` 1–200 chars, `body` ≤ 20 000, no NUL; stash `message` ≤ 200. As built in M10 (api values `CommitSubject`, `CommitBody`): the subject is one line, not only spaces, without control characters.
- `filter.text`, `filter.author` ≤ 200; `filter.path` ≤ 1024, relative, no NUL, no `..`.
- `cursor` ≤ 128 chars of `[A-Za-z0-9_-]`; `promptId` ≤ 64 chars of `[A-Za-z0-9_-]` and pending; `answer` ≤ 4096 chars, no NUL, CR or LF.

### 4.5 Running git (core)

Every invocation goes through `GitRunner` → plan 01's process runner, as an argument vector, never a shell:

```
args = [...GLOBAL_ARGS, ("--no-optional-locks", "-c", "core.fsmonitor=false" for reads), "-C", <root or folder>, <subcommand>, ...]
GLOBAL_ARGS = ["--no-pager", "--literal-pathspecs", "-c", "core.quotepath=off", "-c", "color.ui=false",
               "-c", "log.showSignature=false", "-c", "i18n.logOutputEncoding=UTF-8"]
base env (all git calls) = GIT_TERMINAL_PROMPT=0, GIT_PAGER=cat, PAGER=cat, GCM_INTERACTIVE=never;
                           removed: GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE, CODECHARTA_ASKPASS_ENDPOINT,
                           CODECHARTA_ASKPASS_TOKEN
READ env      = GIT_OPTIONAL_LOCKS=0, LC_ALL=C, LANG=C
MUTATING env  = LC_MESSAGES=C, LANGUAGE="", GIT_EDITOR=true, GIT_SEQUENCE_EDITOR=true, GIT_MERGE_AUTOEDIT=no;
                removed: LC_ALL — when the user set LC_ALL=<x>, LC_CTYPE, LC_COLLATE, LC_NUMERIC, LC_TIME and
                LC_MONETARY get <x> instead (verified in M7 task 1: LC_ALL outranks LC_MESSAGES)
NETWORK env   = MUTATING env + askpass env (section 4.6); GCM_INTERACTIVE removed unless the user set it (then
                the user's value); DISPLAY=:0 only when the user has no DISPLAY
cwd           = the core data directory (the repository goes in through -C)
```

Reads use `LC_ALL=C` (parsers rely on `-z`, `core.quotepath=off` and explicit formats; stderr stays English for classification). Mutating commands run hooks and gpg, so they keep the user's locale and set only `LC_MESSAGES=C`. Verified in M7 task 1 (git 2.56, Greek and German catalogues): `LC_MESSAGES=C` gives English under `LANG=<other>` and under `LANGUAGE=de`, but **not** under `LC_ALL=<other>`, hence the `LC_ALL` rule above. The user's values of `LC_ALL`, `GCM_INTERACTIVE` and `DISPLAY` are read once when the core starts (`git::command::UserEnvironment`), because the process runner's base environment already replaced `GCM_INTERACTIVE`. `--literal-pathspecs` makes path arguments literal; it also disables the `:(top,literal)` magic (verified in M2 task 1), so the log filter's path goes without magic and the log runs with `-C <repository root>`.

```rust
pub struct GitRunner { /* runner handle, git path, data dir */ }
pub enum CommandKind { Read, Mutating, Network }
pub struct GitCommand<'a> { pub root: &'a Path, pub kind: CommandKind, pub args: Vec<OsString>, pub stdin: Option<String>,
    pub timeout: Duration, pub max_stdout: usize, pub askpass: Option<AskpassEnv> }
pub struct GitOutput { pub exit_code: i32, pub stdout: Vec<u8>, pub stderr: String }
impl GitRunner {
    pub async fn run(&self, command: GitCommand<'_>, ctx: &OperationContext) -> GitResult<GitOutput>;   // classifies failures
    pub async fn run_raw(&self, command: GitCommand<'_>, ctx: &OperationContext) -> GitResult<GitOutput>; // exit code is the caller's business (merge-base, diff --no-index)
    pub async fn stream_lines(&self, command: GitCommand<'_>, ctx: &OperationContext,
        on_line: &mut (dyn FnMut(&[u8]) -> ControlFlow<()> + Send)) -> GitResult<()>;
}
pub struct OperationContext { pub operation_id: Option<String>, pub cancel: CancellationToken,
    pub progress: Option<ProgressSink> }
```

Timeouts / stdout caps (named consts in `command.rs`): repository 10 s / 64 kB · status and working tree 30 s / 16 MB · refs 30 s / 32 MB · log page 60 s / 8 MB · details and changed files 30 s / 8 MB · diff 30 s / 4 MB (cut to 2 MB, `is_truncated`) · queries 30 s / 64 kB · rev-list stream 300 s / no cap (streamed) · stage / unstage / discard 60 s / 1 MB · commit 600 s / 1 MB (hooks) · branch operations 120 s / 1 MB · fetch, pull, push, delete remote 1800 s / 1 MB (a human may be answering a prompt) · abort 120 s / 1 MB.

Parsers split with `split(|b| *b == 0)` on bytes and decode UTF-8 lossily; control characters other than tab and newline in commit text become U+FFFD. Every record parser validates its first field (a SHA or a known token) and fails with `parseFailed` otherwise.

**Repository** (`locator.rs`)

```
git --version
git … -C <folder> rev-parse --path-format=absolute --is-bare-repository --is-shallow-repository --git-dir --git-common-dir --show-prefix --show-toplevel
```
- `git version 2.47.1.windows.1` → first two numbers; < 2.31 → `gitTooOld`. Cached per executable.
- `rev-parse` prints one value per line in option order. Exit ≠ 0 with first line `true` → `bareRepository`; exit 128 with `not a git repository` → `notARepository`; `dubious ownership` → `dubiousOwnership` (`repository_path` = folder).
- `root_path` = normalised `--show-toplevel`; `folder_prefix` = `--show-prefix` without trailing `/`; `is_linked_worktree` = git dir ≠ common dir.
- `repository_id` = canonical common git dir (`dunce::canonicalize` or equivalent without the `\\?\` prefix), lower-cased on Windows. All caches, queues and change tracking key on it. Pure normalisation function with an injected platform for tests.

**Status** (`parse/status.rs`)

```
git … status --porcelain=v2 --branch -z --untracked-files=normal --ignore-submodules=dirty
```
NUL-terminated tokens. Headers: `# branch.oid <sha>|(initial)`, `# branch.head <name>|(detached)`, `# branch.upstream <name>`, `# branch.ab +<a> -<b>`. Entries: `1` ordinary, `2` rename/copy (**the next token is the original path and must be consumed**), `u` unmerged, `?` untracked, `!` ignored. For `1`/`2`, `X ≠ .` counts staged, `Y ≠ .` unstaged (both possible). `branch.upstream` without `branch.ab` → `is_gone`, ahead/behind `None`. `operation_in_progress` from the worktree git dir, in order: `rebase-merge` or `rebase-apply` → rebase; `MERGE_HEAD` → merge; `CHERRY_PICK_HEAD`; `REVERT_HEAD`; `BISECT_LOG`.

**Refs and remotes** (`parse/refs.rs`, `parse/remotes.rs`)

```
git … for-each-ref --format=%(refname)%00%(objectname)%00%(objecttype)%00%(*objectname)%00%(*objecttype)%00%(HEAD)%00%(symref)%00%(upstream)%00%(upstream:track,nobracket)%00%(worktreepath)%00%(creatordate:unix)%00%(contents:subject) refs/heads refs/remotes refs/tags
git … config -z --get-regexp ^remote\..*\.url$
```
- 12 fields per line. Skip refs with non-empty `symref`. A ref's commit is `*objectname` when `objecttype` is `tag`, else `objectname`; skip tags not peeling to a commit. `upstream:track` is empty, `gone`, or `ahead N` / `behind N` comma list. `checked_out_in_other_worktree` = `worktreepath` when non-empty and different from the root after the `repository_id` normalisation.
- Remote branch `refs/remotes/<remote>/<branch>`: `<remote>` is the longest configured remote name prefixing the rest.
- `config -z` records `key\nvalue\0`; exit 1 with empty output = no remotes. Strip credentials: for `scheme://user[:pw]@host/…` drop through `@`; leave `git@host:path` unchanged.
- `head` comes from the status header (both commands run in parallel). `fingerprint` = SHA-256 over sorted `refname sha` lines plus `branch:<name>:<sha>` or `detached:<sha>`.

**Log** (`read.rs`, `parse/log.rs`)

Without `cursor` a log session is created: read refs (cached by fingerprint); tips = scope `all`: all branch, remote and tag commits plus head; `head`: head commit; `refs`: the named refs. No tips → empty page, no git call. Store `{ tips, filter }` under a random session id (LRU of 8 sessions per repository); cursor = `<sessionId>_<offset>`; unknown session → `logSessionExpired`.

```
git … log -z --no-decorate --date-order --format=tformat:%H%x00%P%x00%aN%x00%aE%x00%at%x00%ct%x00%s
        --max-count=<PAGE_SIZE + 1> --skip=<offset>
        [--regexp-ignore-case --fixed-strings --grep=<text>] [--author=<author>] --stdin
stdin:  one tip SHA per line, then with a path filter: "--\n:(top,literal)<path>\n"
```
`PAGE_SIZE = 500`; seven fields per commit (`chunk_records(tokens, 7)`); record 501 only sets `next_cursor`; `is_graph_available` = no filter. Pages cached (LRU 50 per repository).

**Commit details**

```
git … show -s -z --format=tformat:%H%x00%P%x00%aN%x00%aE%x00%at%x00%ct%x00%s%x00%cN%x00%cE%x00%B --end-of-options <sha>
root:      git … diff-tree -r -z --root --no-commit-id --no-ext-diff --no-textconv -M --name-status <sha>
otherwise: git … diff-tree -r -z --no-ext-diff --no-textconv -M --name-status <parents[0]> <sha>
the same two with --numstat instead of --name-status
```
- `show`: ten fields; `message` = `%B` without trailing newlines.
- `--name-status -z`: `<status>\0<path>\0`; `R`/`C`: `<status>\0<old>\0<new>\0`. A/M/D/R/C/T, else unknown.
- `--numstat -z`: `<ins>\t<del>\t<path>\0`; renames `<ins>\t<del>\t\0<old>\0<new>\0`; `-` (binary) → `None`. Joined by new path.
- Merge commits compare with the first parent. At most 5 000 files (`are_files_truncated`); totals count all. Cached by SHA (LRU 200).
- `changed_files(from, to, mode)` uses the same two `diff-tree` commands with `<from> <to>`; `SinceMergeBase` first resolves `merge-base <from> <to>` and diffs from it (no merge base → `unknownRevision` with "no common history").

**Queries** (`query.rs`)

| Function | Command | Result |
|---|---|---|
| `resolve_commit` | `rev-parse --verify --quiet --end-of-options <revision>^{commit}`, then the `show -s` format | exit 1 → `unknownRevision` |
| `rev_list_count` | `rev-list --count <from>..<to>` | integer |
| `rev_list` (stream) | `rev-list --date-order [--first-parent] [--max-count=<n>] --stdin`; stdin = include SHAs, then `^<sha>` per exclude | SHAs in batches of 1 000 to the sink; `ControlFlow::Break` kills git |
| `merge_base` | `merge-base <left> <right>` | exit 1 + empty stdout → `None` |
| `is_ancestor` | `merge-base --is-ancestor <a> <d>` | 0 true, 1 false, else error |
| `measure_distances` | per candidate `rev-list --left-right --count <candidate>...<target>` → `<a>\t<b>`, 4 in parallel | unknown candidates omitted |
| `refs_at` | `for-each-ref --points-at <sha> --format=%(refname) refs/heads refs/tags` | short names |

Arguments are validated SHAs, so `A..B` cannot read as an option. Results are cached by argument (LRU 2 000); cleared after a fetch in a shallow repository. `measure_distances` for plan 05: `only_in_candidate == 0` ⇒ the candidate is an ancestor and the target is "stale by `only_in_target`". In a shallow clone counts are lower bounds (`is_shallow`).

```rust
pub struct RevListRequest { pub include: Vec<CommitSha>, pub exclude: Vec<CommitSha>, pub first_parent: bool, pub max_count: Option<u32> }
pub struct FetchRefspecsRequest { pub remote: String, pub refspecs: Vec<Refspec> }   // as built (git/sync.rs): Refspec::new(force, source, destination) -> CoreResult<Refspec>; both full well-formed ref names, destination under refs/codecharta/, else BAD_REQUEST
pub struct ChangedFilesRequest { pub from: CommitSha, pub to: CommitSha, pub mode: ChangedFilesMode }

impl GitService {
    pub fn new(deps: GitServiceDeps) -> Self;   // runner, folder resolver, prompt broker, notification sink, data dir
    pub async fn repository_info(&self, repo: &FolderRef) -> GitResult<GitRepositoryInfo>;
    pub async fn status(&self, repo: &FolderRef) -> GitResult<GitStatus>;
    pub async fn refs(&self, repo: &FolderRef) -> GitResult<GitRefs>;
    pub async fn refs_fingerprint(&self, repo: &FolderRef) -> GitResult<String>;
    pub async fn log(&self, params: &GitLogParams) -> GitResult<GitLogPage>;
    pub async fn commit_details(&self, repo: &FolderRef, sha: &CommitSha) -> GitResult<GitCommitDetails>;
    pub async fn resolve_commit(&self, repo: &FolderRef, revision: &Revision) -> GitResult<GitCommitSummary>;
    pub async fn rev_list_count(&self, repo: &FolderRef, from: &CommitSha, to: &CommitSha) -> GitResult<u64>;
    pub async fn rev_list(&self, repo: &FolderRef, request: RevListRequest,
        sink: &mut (dyn FnMut(&[CommitSha]) -> ControlFlow<()> + Send)) -> GitResult<u64>;
    pub async fn merge_base(&self, repo: &FolderRef, left: &CommitSha, right: &CommitSha) -> GitResult<Option<CommitSha>>;
    pub async fn is_ancestor(&self, repo: &FolderRef, ancestor: &CommitSha, descendant: &CommitSha) -> GitResult<bool>;
    pub async fn measure_distances(&self, repo: &FolderRef, target: &CommitSha, candidates: &[CommitSha]) -> GitResult<Vec<GitCommitDistance>>;
    pub async fn refs_at(&self, repo: &FolderRef, sha: &CommitSha) -> GitResult<RefsAt>;
    pub async fn changed_files(&self, repo: &FolderRef, request: ChangedFilesRequest) -> GitResult<GitChangedFiles>;
    pub async fn working_tree(&self, repo: &FolderRef) -> GitResult<GitWorkingTree>;
    pub async fn diff_file(&self, repo: &FolderRef, path: &RepoPath, kind: GitEntryKind) -> GitResult<GitDiff>;
    pub async fn stage(&self, repo: &FolderRef, paths: StageTarget, ctx: &OperationContext) -> GitResult<GitWorkingTree>;
    pub async fn unstage(&self, repo: &FolderRef, paths: &[RepoPath], ctx: &OperationContext) -> GitResult<GitWorkingTree>;
    pub async fn discard(&self, repo: &FolderRef, entries: &[DiscardEntry], ctx: &OperationContext) -> GitResult<GitWorkingTree>;
    pub async fn commit(&self, repo: &FolderRef, request: CommitRequest, ctx: &OperationContext) -> GitResult<GitOperationResult>;
    pub async fn fetch(&self, repo: &FolderRef, prune: bool, ctx: &OperationContext) -> GitResult<GitFetchResult>;
    pub async fn fetch_refspecs(&self, repo: &FolderRef, request: FetchRefspecsRequest, ctx: &OperationContext) -> GitResult<GitFetchResult>;
    pub async fn pull(&self, repo: &FolderRef, mode: GitPullMode, ctx: &OperationContext) -> GitResult<GitOperationResult>;
    pub async fn push(&self, repo: &FolderRef, request: PushRequest, ctx: &OperationContext) -> GitResult<GitOperationResult>;
    pub async fn switch(&self, repo: &FolderRef, target: SwitchTarget, ctx: &OperationContext) -> GitResult<GitOperationResult>;
    pub async fn branch_create(&self, repo: &FolderRef, request: BranchCreateRequest, ctx: &OperationContext) -> GitResult<GitOperationResult>;
    pub async fn branch_rename(&self, repo: &FolderRef, ref_name: &FullRefName, new_name: &BranchName, ctx: &OperationContext) -> GitResult<GitOperationResult>;
    pub async fn branch_delete(&self, repo: &FolderRef, target: BranchDeleteTarget, ctx: &OperationContext) -> GitResult<GitOperationResult>;
    pub async fn set_upstream(&self, repo: &FolderRef, ref_name: &FullRefName, upstream: Option<&FullRefName>, ctx: &OperationContext) -> GitResult<GitOperationResult>;
    pub async fn abort_operation(&self, repo: &FolderRef, operation: AbortableOperation, ctx: &OperationContext) -> GitResult<GitOperationResult>;
    pub fn subscribe_changes(&self) -> tokio::sync::broadcast::Receiver<RepositoryChanged>;
}

pub struct OperationQueue { /* per repository_id FIFO */ }
impl OperationQueue {
    pub async fn run_exclusive<T, F>(&self, repository_id: &str, cancel: &CancellationToken, task: F) -> GitResult<T>
        where F: Future<Output = GitResult<T>> + Send;   // a cancelled queued task is dropped without running
}
```

The newtypes `CommitSha`, `FullRefName`, `Revision`, `BranchName`, `RepoPath` are constructed only through validating `TryFrom<&str>` (section 4.4 rules), so a value reaching the runner is always valid.

**Failure classification** (`failure.rs`), first match wins. Runner errors map to `timeout`, `cancelled`, `outputTooLarge`, `gitNotFound`; any failure after the user cancelled a prompt of that operation → `AUTHENTICATION_CANCELLED` (as built in M7: `PromptSession::settle`, applied before these rules; a cancelled helper makes git or ssh fail with varying texts). For a non-zero exit, stderr (and stdout where noted) is matched: `dubious ownership` → dubiousOwnership; `not a git repository` → notARepository; `index.lock` → indexLocked; `terminal prompts disabled`, `Authentication failed`, `could not read Username`, `Permission denied (publickey`, `Host key verification failed` → authenticationRequired; `Could not resolve host`, `unable to access`, `Connection timed out` → networkUnavailable; `already exists` (branch create / rename) → branchExists; `is already checked out at`, `used by worktree` → branchCheckedOutElsewhere; `would be overwritten by` → localChangesWouldBeOverwritten; `is not fully merged` → branchNotFullyMerged; `Author identity unknown`, `Please tell me who you are` → identityUnknown; `nothing to commit`, `no changes added to commit` (stdout) → nothingToCommit; `pre-receive hook declined` → pushRejected; `Diverging branches can't be fast-forwarded`, `Not possible to fast-forward` → notFastForward; `stale info` → stalePushLease; `! [rejected]`, `failed to push some refs` → pushRejected; `has no upstream branch` → noUpstream; `CONFLICT` (stdout or stderr), `could not apply` → conflicts (as built in M11: network commands are classified over stderr and stdout, since a merge names its conflicts and a porcelain push its refused refs on stdout — `[rejected]`, `[remote rejected]`; the pull and push rules come before the branch rules, as a refused tag push says `already exists`; `There is no tracking information` → noUpstream too); any other non-zero exit of `commit` → hookFailed (verified in M10, git 2.56: a `pre-commit` hook exiting 1 leaves only its own output on stderr; the commit rules live in `commit.rs`, checked in stderr and stdout before the general ones, plus `You have nothing to amend` → nothingToCommit, `unmerged files` → conflicts and `gpg failed to sign` → commandFailed); anything else → commandFailed. Every error carries git's verbatim `detail`, and the UI always shows it. Each rule gets a test with a captured or fixture-produced text.

### 4.6 Mutating operations and credential prompts (core)

All mutating operations run in `OperationQueue::run_exclusive(repository_id, …)`, re-read what they validate **inside** the queue (status, refs, working-tree listing), and end — successfully or not — by dropping the repository's status, refs and log-session caches, returning fresh `GitStatus` + `GitRefs`, and emitting `repository.changed`. Every ref argument is preceded by `--end-of-options` (M1 task 1 confirms on 2.31; if missing, the minimum version rises), every path list by `--`.

`validate_new_branch_name`: 1–200 chars, no leading `-`, no char < 0x20 or 0x7F, not `HEAD`, no `@{`, no `..`; then `git check-ref-format refs/heads/<name>` exits 0.

**Working tree** (`working_tree.rs`)

| Operation | Command | Notes |
|---|---|---|
| `working_tree` | the status command of 4.5 with `--untracked-files=all` and without `--branch` (as built in M9: every untracked file is a row of its own, so it can be staged, shown and discarded by itself), run at the repository root, parsed by `parse/status_entries.rs` | `1`/`2` with `X ≠ .` → staged entry, `Y ≠ .` → unstaged entry (both possible); `2` consumes the original path; `u` → conflicted with its `XY` (change `modified`); `?` → untracked (change `added`). ≤ 5 000 entries (`are_entries_truncated`). Paths are repository-relative whichever folder the project names. |
| `diff_file` | staged: `diff --no-ext-diff --no-textconv --no-color --cached -M -- <path> [<previous path>]`; unstaged: `diff --no-ext-diff --no-textconv --no-color -- <path> [<previous path>]`; untracked: `diff --no-ext-diff --no-textconv --no-color --no-index -- /dev/null <path>` (exit 1 = differences); conflicted: `diff --no-ext-diff --no-textconv --no-color -- <path>` (as built in M9: `--no-textconv` here too, G8; a rename's previous path goes along so git pairs them) | read environment at the root; `(path, kind)` must be listed (else `CHANGED_SINCE_LISTED`); `is_binary` on `Binary files … differ`; > 4 MiB → `OUTPUT_TOO_LARGE`, else cut after the last whole line within 2 MiB |
| `stage` | `add --pathspec-from-file=- --pathspec-file-nul --` (paths NUL-separated on stdin; as built in M9, see below); all: `add -A` | paths listed as unstaged, untracked or conflicted (staging a conflicted file marks it resolved); a rename's previous path goes along |
| `unstage` | `restore --staged …`; without commits `rm --cached --force --quiet …` (as built in M9: without `--force` git refuses a staged new file changed again since; `--cached` keeps the working tree), paths on stdin as for `stage` | paths listed as staged; a rename's previous path goes along |
| `discard` | as built in M9, per named row: staged modification / deletion / type change → `restore --source=HEAD --staged --worktree`; unstaged one → `restore --worktree` (back to the index, the staged change stays); added, renamed or copied path (staged, or unstaged intent-to-add) → unstage as above, then recycle bin, and a rename's previous path back from `HEAD` (staged) or the index (unstaged); untracked → recycle bin only. Paths on stdin as for `stage`. | G12. The client sends the rows it named; if any `(path, kind, change)` is no longer listed, the whole call fails with `CHANGED_SINCE_LISTED` and changes nothing. A staged row of a path that also has an unstaged row needs that row named too (`NOT_ALLOWED`), since returning the file to `HEAD` would drop it. Conflicted rows → `NOT_ALLOWED` (use Abort). All checks, including confinement (`store::paths::confine_entry_to_folder`: the canonical parent lies inside the canonical root, the entry itself is not followed, so a symlink is trashed as a link), run before anything changes; the recycle bin goes first, then the git commands. Decided in M9 (spike, git 2.56): `restore --source=HEAD --staged --worktree` on the new path of a staged rename leaves the old path deleted, and on both paths it deletes the new file for good — so the fallback is built: restore the old path, unstage the new one, recycle it. |

**Commit** (`commit.rs`)
- Preconditions: at least one staged entry unless `amend`; `operation_in_progress` is `None` or `Merge` (`Rebase` → `operationInProgress`); no conflicted entries (`conflicts`). As built in M10: checked inside the queue against the status counts (not the listing, which stops at 5 000 entries); concluding a merge needs no staged entry (a merge whose result equals `HEAD` could not be concluded otherwise); amend during a merge → `operationInProgress`, as git refuses it; cherry-pick, revert and bisect → `operationInProgress` like a rebase.
- Message written to `<dataDir>/git-messages/message-<random>.txt` (subject, blank line, body — left out when blank —, UTF-8, LF; CRLF in the body becomes LF), then `-c user.useConfigOnly=true commit --cleanup=whitespace [--amend] -F <absolute file>`; the file is deleted on every path (drop guard: `tempfile::TempPath`). Timeout 600 s (`COMMIT_LIMITS`).
- `identityUnknown`: the UI shows `git config --global user.name "Your Name"` and `git config --global user.email "you@example.com"` to copy. The core never runs them.
- Hooks and gpg run as in a terminal; `--no-verify` is not offered; a failing hook → `hookFailed` with its output.
- Amend of a commit on the upstream (`is_ancestor(HEAD, upstream)`) needs the renderer's extra confirmation (G12). The commit box pre-fills the previous message from `git.commitDetails` of `HEAD`.

**Branches** (`branch.rs`)

| Operation | Preconditions (inside the queue) | Command |
|---|---|---|
| switch to local | branch exists; not checked out elsewhere; no operation in progress. **No app-side dirty-tree check** (owner decision): git carries changes over or refuses. | `switch --no-guess --no-recurse-submodules --end-of-options <name>`; refusal → `localChangesWouldBeOverwritten` with git's file list |
| switch tracking a remote branch | as above; `localName` unused | `switch --no-guess --no-recurse-submodules -c <localName> --track --end-of-options refs/remotes/<remote>/<branch>` (as built in M8: the full remote-tracking ref; `localName` is the value of `-c`, a validated `BranchName`) |
| `branch_create` | name valid and unused; start point a commit; with `checkout` the switch preconditions | `branch --no-track --end-of-options <name> <startPoint>`; with `checkout` one command instead, `switch --no-guess --no-recurse-submodules -c <name> --no-track --end-of-options <startPoint>` (as built in M8: no branch is left behind when the switch is refused) |
| `branch_rename` | local ref exists; new name valid and unused | `branch -m --end-of-options <old> <new>` |
| `branch_delete` local | not current; not checked out elsewhere | `branch -d --end-of-options <name>`; after `branchNotFullyMerged` and a second confirmation `force: true` → `branch -D --end-of-options <name>` |
| `branch_delete` remote | remote ref exists | `push --progress --delete --end-of-options <remote> refs/heads/<branch>` (network; as built in M8 — after `--end-of-options` git would read `--delete` as a refspec) |
| `set_upstream` | local ref; upstream a remote-tracking ref or none | `branch --set-upstream-to=refs/remotes/<remote>/<branch> --end-of-options <name>` / `branch --unset-upstream --end-of-options <name>` |

**Sync** (`sync.rs`) — network environment with askpass, `--progress`, stderr through `parse/progress.rs` (split on `\r` and `\n`, keep the last non-empty line, strip `remote: ` and trailing spaces, `NN%` → `done/total = NN/100`), throttled to one `core.progress` per 200 ms (`GitCli::run_reporting`), cancellable (kills the process tree and closes the operation's open prompts).

| Operation | Command | Outcome |
|---|---|---|
| `fetch` | `fetch --all --progress [--prune] --no-recurse-submodules --no-auto-maintenance` | `updated_refs` = changed fingerprint lines |
| `fetch_refspecs` | `fetch --progress --no-recurse-submodules --no-auto-maintenance --no-tags --refmap= --no-write-fetch-head --end-of-options <remote> <refspec…>` | for plan 06; destinations under `refs/codecharta/` only. As built in M8: without the empty `--refmap` git also updated `refs/remotes/<remote>/…` (found by the test), without `--no-tags` it follows tags. Not an RPC method: plan 06 builds the refspec from a PR number |
| `pull` FfOnly (default) | `pull --ff-only --progress --no-recurse-submodules` | `notFastForward` → renderer opens the pull choice; repository unchanged |
| `pull` Rebase | `pull --rebase --progress --no-recurse-submodules` | `conflicts` → stop, banner |
| `pull` Merge | `pull --no-rebase --no-edit --progress --no-recurse-submodules` | `conflicts` → stop, banner |
| `push` | `push --progress --porcelain [-u] [--force-with-lease=refs/heads/<upstream branch or b>:<expectedSha>] --end-of-options <remote> refs/heads/<b>:refs/heads/<upstream branch or b>` (as built in M11: the lease names the remote ref being replaced, the destination) | `-u` on first push; `pushRejected` → "Pull first"; `stalePushLease` → "fetch, review, retry". Never `--force`; never a bare `--force-with-lease`. |
| `abort_operation` | `merge --abort` / `rebase --abort` (not network) | only when `operation_in_progress` matches (as built in M11: else `NOT_ALLOWED`) |

Conflicts are not resolved in the app: the banner lists conflicted files, says "Resolve the conflicts in your editor, stage the files, then commit (merge) or continue the rebase in a terminal", and offers Abort (confirmed) and Refresh. `rebase --continue` is not offered; after a merge, Commit concludes it.

**Stash** (stretch, M12): `stash list -z --format=%gd%x00%H%x00%gs`, `stash push [--include-untracked] -m <message>`, `stash pop --index stash@{<n>}` (a pop conflict → `conflicts`; git keeps the stash).

**Security.** Mutating commands run hooks (`pre-commit`, `commit-msg`, `post-checkout`, `post-merge`, `pre-push`, `reference-transaction`, …), filters (LFS), the credential helper, ssh and gpg exactly as a terminal would. The renderer shows a one-time notice per repository and session before the first mutating action, and the docs say so.

#### Credential prompts (askpass)

**Mode selection** (as built in M7; verified on Linux with the real binary, Windows open — progress file 04-M7): `GIT_ASKPASS` and `SSH_ASKPASS` point **directly at the `codecharta-core` executable**. Git and ssh call it with the prompt as `argv[1]` only, so the mode is chosen by environment (overview section 10): `main()` checks, **before** CLI parsing, that `CODECHARTA_ASKPASS_ENDPOINT` is set and that there is exactly one argument naming no subcommand (`codecharta_cored::askpass::askpass_prompt`), then runs the helper and exits; `codecharta-core askpass <prompt>` is the explicit form. The serving core never has the endpoint variable itself, and the runner removes `CODECHARTA_ASKPASS_ENDPOINT` / `CODECHARTA_ASKPASS_TOKEN` from every child except the network commands of its own operation. Running a native executable avoids the `.cmd` quoting problems with `"`, `%`, `&` in prompts. Fallback if the Windows spike shows git or ssh cannot run the binary directly: a two-line `askpass.sh` / `askpass.cmd` wrapper written into the data directory that calls the binary.

Askpass environment of a network command (as built in M7: `process::AskpassSetup { git_helper, ssh_helper,
endpoint, token: Secret }` carried by `GitCommand::network(…)` → `GitInvocation.askpass` → `RunRequest.askpass`;
the runner adds these variables last, so nothing else can replace them, and the token exists as text only in
the child's environment):
```
GIT_ASKPASS=<core exe>   SSH_ASKPASS=<core exe, space-free form>   SSH_ASKPASS_REQUIRE=force
  (without a space-free form: SSH_ASKPASS and SSH_ASKPASS_REQUIRE are removed, also the user's own)
DISPLAY=:0 only when the user has no DISPLAY (older OpenSSH)
CODECHARTA_ASKPASS_ENDPOINT=<pipe or socket name>   CODECHARTA_ASKPASS_TOKEN=<per-operation token>
GIT_TERMINAL_PROMPT=0 (kept)   GCM_INTERACTIVE removed unless the user set it (GCM may show its own window)
```
The helper paths come from `git::askpass::askpass_helpers` (`AskpassHelpers { git, ssh }`, platform and file
system injected; `SystemHelperFiles` is the real one).

Space-free path for `SSH_ASKPASS` on Windows (Git for Windows' ssh failed on a helper path with a space; UNVERIFIED whether that also holds for an `.exe`): use the path as is when it has no space; otherwise its 8.3 short name via `GetShortPathNameW` (`windows-sys`); otherwise copy the executable to `<dataDir>/askpass/codecharta-core.exe` when that path has no space (re-copied when the size or modification time differs); otherwise leave `SSH_ASKPASS` unset (HTTPS prompts still work) and fail ssh prompts with "CodeCharta cannot ask for ssh passphrases on this machine. Load the key into ssh-agent / Pageant first."

Flow for one network operation (as built in M7):
1. `core.prompts().open_session(SessionRequest { request_id: Some(context.id), repository_label })` → a `PromptSession` guard with a 32-byte random token (64 hex digits) bound to the operation; `session.askpass()` is the `AskpassSetup` for `GitCommand::network(…)` (`None` while no askpass server listens).
2. Git (or ssh) runs `codecharta-core` with the prompt text as `argv[1]`.
3. The helper (`prompt/helper.rs` `ask_broker`, entered from `codecharta-cored/src/askpass.rs`) connects to `CODECHARTA_ASKPASS_ENDPOINT`, sends one JSON line `{ "token", "prompt" }`, waits for `{ "answer": "…" }` or `{ "cancel": true }`, writes `answer + "\n"` to stdout and exits 0; exits 1 on cancel, any error, or no answer within 30 min. It prints nothing else, writes nothing to disk, logs nothing (stderr stays empty; logging is not even initialised).
4. `prompt/server.rs` `AskpassServer` listens on `\\.\pipe\codecharta-askpass-<16 hex>` (Windows; `first_pipe_instance`, `reject_remote_clients`; the default pipe DACL gives other local users read access only, so they cannot send a token) or `<tmp>/cc-askpass-<16 hex>/s` (folder created `0700` before the socket exists, socket `0600`, `/tmp` instead when the path would exceed 100 bytes; removed when the server is dropped) — one listener per `serve` run, started by `serve` with `askpass_helpers(current_exe)`. A request line is at most 64 KiB and must arrive within 10 s. The token is compared in constant time against every open session; an unknown token, a closed session or a prompt over 4096 characters gets the connection closed without an answer. A known token creates `PromptRequested { promptId, requestId, repositoryLabel, kind, message }` (`kind.rs`: ends in `(yes/no)?` or `(yes/no/[fingerprint])?` → confirm; contains `Username` → text; else secret) and emits `prompt.requested`.
5. The renderer answers with `prompt.answer` or `prompt.cancel`. The broker writes the answer to that one connection and drops it; answers are `codecharta_core_api::secret::Secret` (`zeroize` on drop, `Debug` / `Display` print `***`) and never logged: the session traces method names only, and a refused answer (`BAD_REQUEST`: more than 4096 characters, NUL, CR or LF) is described without repeating it. A second answer to the same prompt is `NOT_FOUND`.
6. Ending the operation (success, failure, cancel) drops its session: pending prompts get `prompt.closed`, their helpers exit 1, later connections with that token are refused. Every prompt that leaves the pending set (answered, cancelled, closed) is announced with `prompt.closed`. A prompt cancelled by the user makes the operation fail with `AUTHENTICATION_CANCELLED` (`session.settle(result)`), whatever git or ssh said (ssh-keygen reports a cancelled passphrase as a wrong one).

The token travels only by environment, never on a command line. HTTPS with a configured credential helper never reaches the broker.

### 4.7 Renderer

The renderer talks to the core only through `GitApiService` (`features/gitHistory/services/gitApi.service.ts`): one method per RPC method, typed by the generated `model/coreApi/git.ts`, mapping RPC errors to `GitError` (`data.domain === "git"`; plan 01 transport errors → `commandFailed` with their text). Notifications are observed through the bridge's subscription.

**Route and view.** `routePaths.history = "history"` (and `routeLinks.history`); lazy route `{ path: routePaths.history, loadComponent: () => import("app/codeCharta/views/historyView/historyView.component").then(m => m.HistoryViewComponent) }`; **no** `showSpinnerBeforeBuildingView` guard. `HistoryViewComponent` (`cc-history-view`, host `block h-[calc(100vh-var(--cc-bars-height))] overflow-hidden bg-base-100`) renders `<cc-git-history-panel>`. Forced edits: `VIEW_TABS` entry `{ view: "history", label: "History", title: "Show branches and commit history", matchesExactly: false }`; `ViewTab.hasModes` (false for history; `openModeBar` ignores it); `isViewAvailable.history` from `GitHistoryAvailability`; `groupLabels.history = "History"`; `JUMP_TARGETS` becomes `Partial<Record<ViewId, …>>` without history; `DRAWING_PHASE_OF_VIEW.history = "Loading the history"`.

**Availability.** `isAvailable = computed(() => bridge !== null && projects.activeProject() !== null)`. Turning false while History is active navigates to `routeLinks.metrics` (`replaceUrl`). `#/history` in the web build shows "Commit history is available in the desktop app."

**Nav-bar chip** (`cc-current-branch-chip`, end of `navbar-start`): renders nothing without a repository; otherwise `<a class="btn btn-ghost btn-sm gap-1 max-w-56" [routerLink]="routeLinks.history">` with `fa-solid fa-code-branch`, branch name (`truncate`) or `detached at <7-char sha>`, `↑n` / `↓n`, a `badge badge-warning badge-xs` dot when dirty, full text in `title`.

**Panel.** Toolbar, optional problem banner, operation-state banner, tabs **Log** | **Changes** (badge with changed-file count; tab kept per project in `codeChartaHistoryTab.<projectId>`).

Log tab panes: `cc-branches-tree` (260 px, 180–480, resizable) — filter, "All branches", groups Local / Remote (per remote) / Tags, `/` nests (`util/branchTree.ts`), current branch bold with `fa-check`, `↑n ↓n` chips, gone upstream `badge-warning`, Remote and Tags capped at 200 rows until "Show all"; `cc-commit-list` (rest) — virtualised rows: graph · subject with ref labels · analysed badge · author · date; when the working tree is dirty, a first row **"Uncommitted changes (n)"** (selection item `workingTree`, no graph lane); `cc-commit-details` (380 px, 280–640) — one commit: message (`whitespace-pre-wrap`), author, date, SHA with copy, parents as links, changed files with letter and `+n −n` ("Changes compared with the first parent" for merges); two commits: both subjects, "A is n commits ahead, m behind B" (`git.measureDistances`), and the two-commit `CommitAction`s; working tree: counts and a link to the Changes tab. Widths in `codeChartaHistoryLayout`.

Changes tab panes: `cc-changes-panel` (360 px, 260–640) — groups Conflicted / Staged / Changes / Untracked with counts; row = letter (`M A D R U ?`), file name, folder in `text-base-content/60`; hover buttons Stage (`fa-plus`) / Unstage (`fa-minus`) / Discard (`fa-rotate-left`); group "Stage all" / "Unstage all"; Ctrl/Shift multi-select; `cc-commit-box` at the bottom. `cc-diff-view` (rest) — `util/diffLines.ts` classes (`+` → `bg-success/10 text-success`, `-` → `bg-error/10 text-error`, `@@` → `text-info`, headers → `text-base-content/60`), interpolation only, monospace, virtualised above 2 000 lines, "Binary file" / "Diff truncated at 2 MB".

`cc-commit-box`: subject (counter, warning > 72), body, "Amend last commit" (fills the last message when the box is empty; off restores the draft), **Commit** (`btn btn-primary btn-sm`, disabled without staged files unless amending, without subject, or while an operation runs; Ctrl+Enter). Draft per repository in `codeChartaCommitDraft.<repositoryId>` (message only), cleared after a commit. During a merge: "This commit concludes the merge."

Toolbar: folder picker (`select select-sm` of project folders that are repositories; hidden for one), search / author / path (debounced 300 ms; Log tab only), Refresh (`fa-rotate`, F5), and from M8 `cc-sync-buttons`: Fetch (`fa-cloud-arrow-down`, prune option), Pull (`fa-arrow-down`, badge `behind`), Push (`fa-arrow-up`, badge `ahead`; "Publish branch" without upstream). While an operation runs: spinner, last `core.progress` message, Cancel (`core.cancel` through `bridge.cancel(operationId)`); other mutating controls of that repository disabled ("Waiting for the previous git operation…").

**Branch actions** (`cc-branch-context-menu`, also in the commit context menu): local → Switch to, New branch from here…, Rename…, Delete…, Set upstream…, Push / Force push (with lease)…; remote → Check out as new local branch…, New branch from here…, Delete from remote…; tag → New branch from here…. The current branch offers Rename, Push, Set upstream only.

**State services** (`providedIn: "root"`, signals only, nothing in `CcState`):

```ts
export type LoadState<T> = { kind: "idle" } | { kind: "loading" } | { kind: "ready"; value: T } | { kind: "failed"; error: GitError }
// gitRepository.service.ts
activeRepository: Signal<FolderRef | null>; repository: Signal<LoadState<GitRepositoryInfo>>
status: Signal<LoadState<GitStatus>>; refs: Signal<LoadState<GitRefs>>
selectFolder(folderId: string): void; refresh(reason: "manual" | "focus" | "afterWrite" | "changed"): Promise<void>
// gitLog.service.ts
scope; filter; commits: Signal<readonly GitCommitSummary[]>; graphRows: Signal<readonly GraphRow[]>
isGraphAvailable; hasMore; page: Signal<LoadState<void>>; setScope(); setFilter(); loadNextPage(); reload()
```

Rules: every async result carries a generation counter and late results are dropped; `refresh("focus")` on window `focus`, at most every 5 s, calls `git.status` + `git.refsFingerprint` and reloads refs and log only on a changed fingerprint; `repository.changed` for the active repository triggers `refresh("changed")` for the named parts; a refs reload restarts the log at page one and keeps the selection when still listed; `logSessionExpired` → one silent `reload()`; `GitLogService` carries `GraphLayoutState` across pages; ref labels are computed in the renderer (`util/refLabels.ts`).

**Virtual scrolling** (`util/virtualWindow.ts`): `windowOf({ scrollTop, viewportHeight, rowHeight, rowCount, overscan }) → { firstIndex, lastIndex, offsetTop, totalHeight }`; rows 28 px; `scrollTop` written to a signal once per animation frame; `ResizeObserver` for the viewport; `loadNextPage()` within 100 rows of the end.

**Keyboard** (list `tabindex="0"`, `role="listbox"`, `aria-activedescendant`): ↑/↓ select; Shift+↑/↓ or Ctrl+click set the second selection; Home/End, PageUp/PageDown; Enter / double-click runs the primary `CommitAction`; Ctrl+C copies the SHA; Menu or Shift+F10 opens the context menu; Ctrl+F or `/` focuses search; F5 refreshes; Escape drops the second selection.

**Selection** (`commitSelection.service.ts`):

```ts
export type SelectionItem = { kind: "commit"; commit: GitCommitSummary } | { kind: "workingTree"; status: GitStatus }
export interface CommitSelection { repo: FolderRef; items: readonly SelectionItem[] }   // one or two, list order (working tree first)
```
A third Ctrl+click replaces the second item.

**Context menu** (`cc-commit-context-menu`): offered `COMMIT_ACTIONS`; divider; Copy SHA; Copy subject; divider; "Check out '<branch>'" per local branch at the commit (≤ 3), "Check out '<remote/branch>' as a new local branch" (≤ 3); "New branch here…". Write entries appear from M8.

**Ports** (`features/gitHistory/ports/`, injected with `{ optional: true }`):

```ts
// analysedCommits.port.ts — plan 05
export interface AnalysedCommitMarker { state: "analysed" | "running" | "failed"; isLoadedInMap: boolean }
// as built in M4 (design H8 words more states): state adds "queued"; optional progressPercent, analysedAt, note, failureMessage
export interface AnalysedCommitsProvider { markersFor(repo: FolderRef): Signal<ReadonlyMap<string, AnalysedCommitMarker>> }
export const ANALYSED_COMMITS = new InjectionToken<AnalysedCommitsProvider>("ANALYSED_COMMITS")
// commitActions.port.ts — plan 05 ("Analyse this commit", "Analyse working tree"), plan 06 ("Compare with…")
export interface CommitAction { id: string; label: string; icon: string; hoverHint: string; isPrimary: boolean
    isOfferedFor(selection: CommitSelection): boolean; run(selection: CommitSelection): void }
export const COMMIT_ACTIONS = new InjectionToken<readonly CommitAction[]>("COMMIT_ACTIONS")   // multi
// loadedMapLocator.port.ts — plan 05
export interface LoadedMapLocator { nodePathOf(repo: FolderRef, repositoryRelativePath: string): string | null }
export const LOADED_MAP_LOCATOR = new InjectionToken<LoadedMapLocator>("LOADED_MAP_LOCATOR")
```
Absent providers: the "Analysed" column is hidden, no contributed actions, changed files as plain text. With a locator, a file with a node path is a button: `handOverNode("metrics", nodePath)` then navigate. Badges: `fa-cube text-success` analysed, `loading-spinner loading-xs` running, `fa-triangle-exclamation text-error` failed, `ring` when loaded.

**Credential prompt dialog** (`cc-credential-prompt-dialog`, Angular component, native `<dialog class="modal">`, mounted in `views/codeCharta.component.html` outside the router outlet). `CredentialPromptService` subscribes to `prompt.requested` / `prompt.closed`. Title "Git needs your input", the repository label, `message` verbatim in `<pre class="whitespace-pre-wrap">` (interpolation), input `type="password"` for secret / `text` for text; confirm shows Yes / No answering `yes` / `no`; OK / Cancel; Escape = cancel. Prompts queue, one at a time. The input is cleared right after `prompt.answer`; the value never enters a signal outliving the dialog, is never logged or persisted.

**Dialogs and confirmations** (texts from `util/effectText.ts`, unit-tested). `ConfirmDialogComponent` for yes/no; native `<dialog>` components for inputs or more choices.
- Switch: "Switch '<folder>' from 'main' to 'feature/x'? Your 3 changed files stay as they are if git can carry them over; otherwise git refuses and nothing changes."
- Create branch: name input (client-side rules while typing), read-only start commit, "Switch to the new branch" (off). Rename: "Renames the local branch 'a' to 'b'. Its upstream setting is kept; the remote branch is not renamed."
- Delete local: "Delete the local branch 'feature/x'? Its commits stay reachable from 'origin/feature/x'." (or "…become unreachable"); after `branchNotFullyMerged` a separate "'feature/x' has 2 commits not merged into 'main'. Deleting it anyway makes them unreachable (recoverable only through git reflog). Delete anyway?"
- Delete remote: "Delete 'feature/x' on remote 'origin'? This removes it for everyone who uses that remote."
- Discard: "Discard changes to 'src/a.ts' and 'src/b.ts'? Tracked files return to the last commit; untracked files go to the recycle bin." (≤ 10 names, then "and n more").
- Pull choice (after `notFastForward`): "'main' and 'origin/main' have diverged (2 local, 3 remote commits). Choose how to combine them:" — Rebase my commits / Merge / Cancel, no default.
- Push: no confirmation; first push "Publish 'feature/x' to 'origin' and track it". Force push: "Replace 'origin/feature/x' (at abc1234) with your 'feature/x' (at def5678)? 2 commits on the remote that are not in your branch are removed from it. The push fails if the remote moved since abc1234." — the SHA shown is the one sent.
- Amend of a pushed commit: "The last commit 'abc1234 Subject' is already on origin/main. Amending it rewrites it; pushing afterwards needs a force push. Amend anyway?"
- Abort: "Abort the merge and return 'main' to the state before the pull? Changes made while resolving are lost."
- Hooks notice (once per repository and session): "Git runs this repository's hooks and filters, as it would in a terminal. Continue?"

**Errors and empty states** (`cc-git-problem-notice`, `util/gitErrorText.ts`, one sentence per code): `gitNotFound` / `gitTooOld` → full-pane message with a button to plan 01's tools check; `notARepository`; `dubiousOwnership` → `git config --global --add safe.directory <path>` to copy (never run); `bareRepository` → unsupported; no commits → "No commits yet."; shallow → "Shallow clone: history is cut off, counts are lower bounds."; failed page → "Could not load more commits — Retry"; first-page `timeout` → hint about `git commit-graph write --reachable`. Mutating failures → toast with the sentence and "Details" showing git's verbatim `detail`; `identityUnknown` shows both commands; `authenticationRequired` adds "Check your credential helper or ssh key; CodeCharta asks only when git asks."; `localChangesWouldBeOverwritten` lists git's files.

### 4.8 Graph lane layout (`util/graphLayout.ts`, pure TypeScript)

```ts
export interface GraphLayoutState { lanes: readonly (string | null)[]; laneColors: readonly number[]; nextColor: number }
export interface GraphEdge { fromLane: number; toLane: number; color: number }
export interface GraphRow { sha: string; lane: number; color: number; incoming: readonly GraphEdge[]
    outgoing: readonly GraphEdge[]; passing: readonly GraphEdge[]; laneCount: number }
export const EMPTY_GRAPH_STATE: GraphLayoutState
export function layoutGraph(commits: readonly { sha: string; parents: readonly string[] }[], state: GraphLayoutState): { rows: GraphRow[]; state: GraphLayoutState }
```

Per commit in list order (`lanes[i]` = SHA lane `i` waits for, or null):
1. `waiting` = lanes waiting for this SHA. If none, take the lowest free lane (append if none) with the next colour (cycling `LANE_COLOR_COUNT = 8`). The commit's lane = lowest in `waiting`.
2. `incoming` = one edge per waiting lane to the commit's lane; free the others.
3. `passing` = every other occupied lane, straight.
4. First parent: if a lane already waits for it, edge there and free the commit's lane; else the commit's lane waits for it. (As built in M4, after design H8 and the mock-up: the commit's lane always waits for its first parent, so lanes join at the fork point's dot through step 2.)
5. Further parents: existing waiting lane, else lowest free lane with a new colour.
6. No parents: free the commit's lane. 7. Trim trailing free lanes.

`util/graphRowGeometry.ts` → SVG paths (lane pitch 14 px, row 28 px, dot radius 4 px, cubic curves for diagonals). `cc-commit-graph-cell`: one inline `<svg>` per row, `stroke="currentColor"`, colour classes `text-primary`, `text-secondary`, `text-accent`, `text-info`, `text-success`, `text-warning`, `text-error`, `text-neutral` (themes apply); beyond `MAX_DRAWN_LANES = 24` show `+n`.

Required `graphLayout.spec.ts` cases: linear history in lane 0; branch tip opens a second lane and joins at the fork; merge puts the first parent in the commit's lane and the second in a new lane; octopus merge gets one lane per extra parent; a freed lane is reused; a root ends its lane and a second root keeps its own; lanes stay open when parents are not loaded; same rows for a list as for the list split into two pages with the state carried over (every split point of a 12-commit fixture); empty page keeps the state; the input state is not mutated.

### 4.9 Headless CLI (`codecharta-cored/src/cli/git.rs`)

```
codecharta-core git status   (--project <id> --folder <id> | --path <dir>) [--json]
codecharta-core git branches (--project <id> --folder <id> | --path <dir>) [--json]
codecharta-core git log      (--project <id> --folder <id> | --path <dir>) [--limit <n, default 50>] [--branch <name>] [--json]
```
Same `GitService` calls as the RPC methods (`--path` builds an ad-hoc repository context without a project). Text output: `status` → `main ↑1 ↓0 · 2 staged, 1 unstaged, 0 untracked`; `branches` → one line per ref with `*` for the current branch; `log` → `<7-char sha> <date> <author> <subject>`. `--json` prints the contract type. Exit codes follow plan 01's CLI convention (expected: 0 ok, 1 domain error printed as `error[<code>]: <message>` on stderr, 2 argument error). No CLI for mutating commands in this plan.

## 5. Milestones

Gates per milestone: core work — `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test` (also on plan 01's `windows-latest` job), no drift in the generated contract; UI work — root `npm run format:check`; in `visualization/`: `npm test`, `npm run lint`, `npx tsc --noEmit -p tsconfig.json`, and `npm run build && npm run e2e:ci` when UI flows changed. Tests first: write the listed tests, see them fail, implement. Rust test names `should_…` with `// Arrange / Act / Assert`; Jest names start with "should". Commit scope `core` for `core/`, `visualization` for UI, `docs` for progress-only commits.

Progress: before a milestone, create `dev_docs/studio/agents/progress/04-M<n>-<short-name>.md` (template in `README.md`), keep state and checkboxes current, commit it with the work; record verifications, spike results, deviations and measured numbers there.

M1–M6 are read-only and ship alone; M7–M12 add the workflow, each shippable (unbuilt features are not shown).

### M1 — Core: fixtures, contract, runner, repository, status, refs (M)

1. **Reconcile and fixtures.** Read plans 01 and 03 as implemented; record real names in section 9. Build `core/crates/codecharta-core/tests/support/git_fixture.rs` (`tempfile`): `TempRepo::new()` (the existing fixture, extended) runs git with `GIT_CONFIG_GLOBAL`/`GIT_CONFIG_SYSTEM` = an empty file, `GIT_CONFIG_NOSYSTEM=1`, `HOME`/`USERPROFILE` = the temp dir, `GIT_AUTHOR_NAME=Ada Author`, `GIT_AUTHOR_EMAIL=ada@example.test`, `GIT_COMMITTER_NAME=Carl Committer`, `GIT_COMMITTER_EMAIL=carl@example.test`, `GIT_AUTHOR_DATE` = `GIT_COMMITTER_DATE` = `@<1700000000 + 60·n> +0000`, `-c init.defaultBranch=main -c commit.gpgsign=false -c core.autocrlf=false`. API: `commit(msg, files)`, `write_file`, `branch`, `checkout`, `merge(names, msg)` (`--no-ff`), `tag(name, annotated)`, `with_bare_origin()` (a bare repository added as `origin` by path, `push -u`), `clone_of_origin()` (second working clone for "remote moved" scenarios), `linear_history(n)` (via `git fast-import`), `path()`, `env()`. (No `FolderResolver` fake: the service takes a resolved `GitFolder`, see section 9.) Record outputs of every section 4.5 command into `src/git/parse/testdata/` and correct section 4.5 if git differs. Spike (findings in the progress file): with git 2.31 (portable or container) confirm `--end-of-options` on `switch`, `branch`, `push`, `rev-parse`, and `rev-parse --path-format=absolute`; set git's minimum version in plan 01's tools check.
   - Tests: should_create_identical_shas_on_every_run; should_not_read_the_user_git_configuration; should_fail_commit_without_identity_when_use_config_only_is_set; plan 01 tools: should_report_git_below_minimum_as_too_old.
   - Commit: `test(core): add deterministic git fixture repositories`
2. **Contract and helpers.** `codecharta-core-api/src/git.rs` (read types only; mutating types arrive with their milestone), `nul.rs`, `revisions.rs`, `cache.rs`; regenerate TS types.
   - Tests: should_split_nul_fields_and_drop_trailing_empty; should_reject_record_count_not_multiple; should_accept_40_and_64_hex_shas_and_reject_upper_case_short_and_dash; should_reject_ref_names_with_control_chars_leading_dash_or_without_refs_prefix; should_evict_least_recently_used; should_serialize_error_codes_as_stable_camel_case_strings.
   - Commit: `feat(core): add git contract types and argument validation`
3. **Runner and failures.** `command.rs`, `runner.rs`, `failure.rs`, `error.rs` (process runner faked).
   - Tests: should_pass_global_and_read_args_and_read_env_on_reads; should_use_mutating_env_without_lc_all; should_remove_git_dir_and_askpass_variables; should_use_data_dir_as_cwd; one test per read-relevant classification rule; should_map_missing_executable_to_git_not_found; should_carry_detail_trimmed_to_2000_chars.
   - Commit: `feat(core): run git through the process runner`
4. **Repository.** `parse/repository.rs`, `locator.rs`.
   - Tests (captured): should_parse_root_prefix_shallow_and_worktree. (fixture): should_report_root_for_subfolder; should_give_two_folders_of_one_repository_the_same_id; should_report_not_a_repository; should_flag_linked_worktree; should_flag_depth_1_clone_as_shallow; should_reject_git_below_2_31 (faked version); should_normalise_drive_letter_case_on_windows (pure, injected platform).
   - Commit: `feat(core): detect git repositories of project folders`
5. **Status.** `parse/status.rs`, `GitService::status`.
   - Tests (captured): branch, upstream, ahead/behind; gone upstream; detached head; no commits; counts of all four kinds; consumes rename original path. (fixture): clean after commit; merge in progress.
   - Commit: `feat(core): read git status summary`
6. **Refs and remotes.** `parse/refs.rs`, `parse/remotes.rs`, `fingerprint.rs`, `refs`, `refs_fingerprint`.
   - Tests (captured): split local / remote / tags; peel annotated tags; skip symbolic remote head; parse `ahead 2, behind 1`, `gone`, empty; remote name with a slash; strip https credentials, keep scp-like url. (fixture): mark current branch; fingerprint changes when a branch moves, stable otherwise.
   - Commit: `feat(core): list git branches, tags and remotes`
7. **RPC and CLI.** `serve/git_routes.rs` (`git.repositoryInfo`, `git.status`, `git.branches`, `git.refsFingerprint`), `changes.rs` (emit `repository.changed` when a read sees a new fingerprint), `cli/git.rs` (`status`, `branches`), plan 01's fake bridge gets a self-contained `git` seed (refs, status, commits, per-method failures).
   - Tests (`codecharta-cored/tests/git_protocol.rs`): should_answer_git_status_over_stdio_for_a_fixture_folder; should_return_folder_not_found_for_unknown_or_detached_folder; should_reject_malformed_params_without_running_git (one per section 4.4 rule that applies); should_emit_repository_changed_when_fingerprint_changes; should_print_status_and_branches_from_cli_with_path_and_json.
   - Commit: `feat(core): expose git status and branches over json-rpc and cli`
   - Acceptance: `codecharta-core git branches --path <real repo>` lists its branches.

### M2 — Core: log, details, queries, changed files, rev-list stream (M)

1. **Log pages.** Plan 01 runner `stdin` if missing (its tests: should_write_stdin_and_close_it; should_keep_stdin_closed_without_text). `parse/log.rs`, sessions and paging.
   - Tests (captured): seven fields; `parseFailed` when first field is not a SHA; subject with quotes, tabs, non-ASCII; control chars replaced. (fixture): children before parents; 500 + cursor for a 501-commit history, then the rest; same second page after a branch moved; empty page without commits; filter by text, author, path (path with space and brackets); single-branch scope; `logSessionExpired` for unknown cursor; tips fed through stdin (faked runner).
   - Commit: `feat(core): page through git commit history`
2. **Commit details and changed files.** `parse/changed_files.rs`, `commit_details`, `changed_files`.
   - Tests (captured): added / modified / deleted / renamed; numstat joined; binary → None. (fixture): root commit files; merge vs first parent; truncation keeps totals; path with spaces and non-ASCII; `changed_files` Direct vs SinceMergeBase on diverged branches; unrelated histories → `unknownRevision`.
   - Commit: `feat(core): read commit details and changed files`
3. **Queries and stream.** `query.rs`; plan 01 runner stdout line streaming if missing.
   - Tests (fixture): count between commits, zero for same; merge base, None for unrelated; ancestry both ways; distances with an unknown candidate omitted; refs at a commit; resolve `HEAD` and a full ref, reject `HEAD~1`; rev_list streams batches in date order; rev_list stops git when the sink breaks; exclude SHAs honoured; first_parent honoured.
   - Commit: `feat(core): add rev-list, merge-base and ancestry queries`
4. **Caching, RPC, CLI.** LRUs for pages, details, queries (clear rules of 4.5/4.6); RPC `git.log`, `git.commitDetails`, `git.resolveCommit`, `git.revListCount`, `git.mergeBase`, `git.isAncestor`, `git.measureDistances`, `git.refsAt`, `git.changedFiles`; CLI `git log`.
   - Tests: git runs once for two identical detail requests; again after clearing; query cache cleared after fetch in a shallow repository; protocol round trip for `git.log` paging; CLI `git log --limit 3` prints three lines.
   - Commit: `perf(core): cache immutable git answers and expose history queries`
   - Acceptance: paging to offset 5 000 in a clone with ≥ 100 000 commits returns each page in < 2 s; record numbers in the progress file.

### M3 — History view, branches pane, nav-bar chip (M)

1. **Tidy first:** `JUMP_TARGETS` to `Partial<Record<…>>`, `ViewTab.hasModes` (all true). Commit: `refactor(visualization): let a view opt out of jump targets and modes`
2. **Route.** `routePaths.history`, lazy route, empty `HistoryViewComponent`, the four `ViewId` tables, tab behind `GitHistoryAvailability`.
   - Tests: history link maps to history view; History tab hidden without bridge, shown with an open project; no mode bar for History; History not a jump target.
   - Commit: `feat(visualization): add an empty history view behind the bridge`
3. **API and repository state.** `gitApi.service.ts`, `gitApi.mocks.ts`; check `ProjectsService` export (section 4.1); `gitHistoryAvailability.service.ts`, `gitRepository.service.ts`, `activeFolder.repo.ts`, `model/loadState.ts`.
   - Tests: maps a git RPC error to `GitError`; opens the first repository folder; remembers the folder per project; failed state carries the error; drops a late result after a folder change; reloads refs on focus only on a new fingerprint; throttles focus refreshes; refreshes on `repository.changed`; leaves History when the project closes.
   - Commit: `feat(visualization): hold git repository state in signal services`
4. **Panel shell and problems.** `gitHistoryPanel`, `gitProblemNotice`, `util/gitErrorText.ts`, `historyLayout.service.ts` + repo, resize handles.
   - Tests: explains desktop-only without bridge; one test per error state of 4.7; safe-directory command with the path; restores and clamps pane widths.
   - Commit: `feat(visualization): lay out the history panel with its empty states`
5. **Branches tree.** `util/branchTree.ts`, `branchesTree`.
   - Tests: nests on slashes; groups remotes; filters case-insensitively keeping parents open; marks current; shows ahead/behind; flags gone upstream; caps long groups; clicking sets the log scope.
   - Commit: `feat(visualization): show local, remote and tag refs as a tree`
6. **Chip.** `currentBranchChip`, facade export, nav bar.
   - Tests: nothing without repository; name with ↑↓; detached by short SHA; dirty dot; links to History.
   - Commit: `feat(visualization): show the current git branch in the nav bar`
   - Changelog (Added): `- **Git branches**: a project folder that is a git repository shows its current branch in the top bar and its branches and tags in the new History view.`

### M4 — Commit list with graph, filters, details (L)

1. `graphLayout.ts` with the cases of 4.8. Commit: `feat(visualization): lay out commit graph lanes`
2. `graphRowGeometry.ts`, `commitGraphCell` — tests: straight passing lane; curve between lanes; dot in the commit's lane; `+n` beyond the limit. Commit: `feat(visualization): draw commit graph rows as svg`
3. `virtualWindow.ts` — tests: first rows at top; overscan; clamp at end; empty for zero rows. Commit: `feat(visualization): add a fixed-row virtual window helper`
4. `gitLog.service.ts`, `refLabels.ts`, `commitDate.ts` — tests: first page on open; next page carries graph state; no parallel page requests; restart on scope/filter and drop late pages; no graph with a filter; one restart on expired session; labels on their commits; date for a given locale and zone. Commit: `feat(visualization): load commit history page by page`
5. `commitList`, `commitRow` — tests: renders only windowed rows; requests next page near the end; subject, labels, author, date; retry row; no-commits message; "Uncommitted changes (n)" row only when dirty; Analysed column hidden without provider, each marker state with a fake provider. Commit: `feat(visualization): list commits with graph and ref labels`
6. `historyToolbar` (as built: `commitFilters` in the COMMITS pane header, design deviation 10; no folder picker, OD1) — tests: debounced filters; reset button; folder picker hidden for one repository; refresh on button and F5. Commit: `feat(visualization): filter commit history by text, author and path`
7. `commitDetails.service.ts`, `commitDetails` — tests: message, author, date, SHA; files with change and counts; first-parent note for merges; truncation note; latest answer wins on fast selection changes; parent link selects parent; file button only with a locator node, handing over to metrics. Commit: `feat(visualization): show commit details and changed files`
   - Changelog: rewrite to `- **Git history**: a project folder that is a git repository gets a History view with its branches, tags and commit graph, a search by text, author and path, and the changed files of each commit; the top bar shows the current branch.`

### M5 — Selection, keyboard, context menu, ports (M)

1. `commitSelection.service.ts`, `model/commitSelection.ts` — tests: one item on click; second on Ctrl+click ordered (working tree first, then newest); third replaces the second; cleared on repository change; kept across refresh when still listed; working-tree item selectable and carries status. Commit: `feat(visualization): select commits and the working tree`
2. Keyboard in `commitList` — tests: one per shortcut of 4.7; focused row scrolled into the window; `aria-activedescendant`. Commit: `feat(visualization): navigate commit history by keyboard`
3. Ports, `commitContextMenu`, two-commit summary — tests: copy SHA / subject; offered contributed actions first, others skipped; primary action on Enter and double-click; nothing on Enter without primary; distance sentence for two commits; opens at the focused row from the keyboard. Commit: `feat(visualization): add commit context menu and extension ports`

### M6 — Read-only end-to-end and docs (S)

1. **e2e** `gitHistory.e2e.ts` + `gitHistory.po.ts` (selectors only in the page object; `data-testid`: `view-switcher-history`, `current-branch-chip`, `branches-tree`, `branch-row`, `commit-list`, `commit-row`, `commit-details`, `changed-file`, `history-search`, `commit-context-menu`), fake bridge via `standInForTheDesktopBridge` with one project, one folder, 6 commits on `main`, a merged `feature/login`, tag `v1.0`, `origin/main` one behind. Scenario "should browse history with the fake bridge": chip `main ↑1`; tree lists the refs; 6 rows; merge commit details show message and two files; search narrows and hides the graph; right-click offers Copy SHA. Plus "should hide the History tab in the plain web build". Extend plan 01's `_electron` smoke with "History lists the branches of a fixture repository" (real core). Commit: `test(visualization): cover the history view end to end`
2. **Docs.** `visualization/README.md` desktop section: git ≥ 2.31, the History view, the safe-directory note, the `codecharta-core git` CLI. Commit: `docs(visualization): document the git history view`

### M7 — Operation queue, progress, credential prompts (L)

1. **Spike (no commit; findings in the progress file, then correct 4.5 / 4.6).** In throwaway repositories, no network: (a) git with `GIT_ASKPASS` = the debug `codecharta-core` binary and `CODECHARTA_ASKPASS_ENDPOINT` + `CODECHARTA_ASKPASS_TOKEN` (overview section 10) — does git pass the prompt as `argv[1]` and use stdout? (b) Git for Windows' ssh with `SSH_ASKPASS` = the `.exe`, from a path with and without a space, and via `GetShortPathNameW`; (c) offline ssh passphrase prompt through `ssh-keygen -y -f <encrypted key>` with `SSH_ASKPASS_REQUIRE=force` and no tty; (d) inbox OpenSSH 9.5 (`core.sshCommand=C:/Windows/System32/OpenSSH/ssh.exe`) with the same; (e) prompts containing `"`, `%`, `&`, non-ASCII; (f) `LC_MESSAGES=C` under a German `LANG`; (g) GCM with `GCM_INTERACTIVE` unset against a non-resolving `https://` host (which prompt path GCM takes). If (a) or (b) fails, switch to the wrapper fallback of 4.6. Anything needing a real remote becomes a manual check (section 6).
2. **Runner environment.** Plan 01 runner env removal if missing; `AskpassEnv` building in `command.rs` (space-free path logic with injected platform and file system).
   - Tests: should_set_askpass_variables_only_for_network_commands; should_remove_gcm_interactive_unless_user_set; should_set_display_only_when_unset; should_use_short_path_or_copy_when_exe_path_has_space; should_leave_ssh_askpass_unset_without_space_free_path; should_never_log_the_token.
   - Commit: `feat(core): prepare askpass environment for network git commands`
3. **Queue and progress.** `queue.rs`, `parse/progress.rs`.
   - Tests: two operations of one repository run in order; two repositories in parallel; next starts after a failure; cancelled queued task never runs; last progress line of a `\r` stream; `NN%` → done/total; strip `remote: ` and trailing spaces; progress throttled to 200 ms.
   - Commit: `feat(core): queue git operations per repository`
4. **Prompt broker, server, helper.** `prompt/{broker,server,kind,helper}.rs`, `codecharta-cored/src/askpass.rs`, `main` check of `CODECHARTA_ASKPASS_ENDPOINT`, RPC `prompt.answer` / `prompt.cancel`, notifications `prompt.requested` / `prompt.closed`.
   - Tests (unit): classify yes/no as confirm, `Username` as text, else secret; constant-time token check refuses a wrong token and sends nothing; refuses a token of a closed session; answers each prompt once; closes pending prompts when the operation ends; `Secret` Debug prints `***`.
   - Tests (`codecharta-core/tests/prompt_roundtrip.rs`): broker + server in-process, a client using `helper.rs` receives the answer; cancel → helper error.
   - Tests (`codecharta-cored/tests/askpass_mode.rs`, real binary via `env!("CARGO_BIN_EXE_codecharta-core")`): with `CODECHARTA_ASKPASS_ENDPOINT` + token, the binary prints exactly the answer plus newline and exits 0; exits 1 on cancel and on a wrong token; prints nothing to stderr.
   - Tests (real git, offline): `git -c credential.helper= credential fill` with stdin `protocol=https\nhost=example.test\n\n` and the askpass env → two `prompt.requested` (Username, then Password), answers appear as `username=` / `password=` in git's output (UNVERIFIED that git asks through askpass here — spike (a) settles it); if spike (c) succeeded, `ssh-keygen -y` on an encrypted fixture key receives the passphrase through the broker. SSH host-key and remote password prompts stay manual.
   - Commit: `feat(core): broker git and ssh credential prompts through askpass`
5. **Renderer prompt and operations.** `credentialPrompt.service.ts`, `credentialPromptDialog` in `views/codeCharta.component.html`, `gitOperation.service.ts` (fresh `operationId`, `running: Signal<{ repositoryId; label; progress } | null>`, cancel, refresh afterwards).
   - Tests: dialog shows the message verbatim; password input for secret, text for text; yes/no for confirm; input cleared after answering; `prompt.cancel` on Cancel and Escape; second prompt queued; closes on `prompt.closed`; stays open across view switches; refresh after an operation, also after failure; cancel goes through `bridge.cancel(operationId)` (`core.cancel`).
   - Commit: `feat(visualization): answer git credential prompts in a dialog`

### M8 — Fetch and branches (M)

1. **Core.** `sync.rs` fetch and `fetch_refspecs`, `branch.rs`, `validate_new_branch_name`, RPC entries; contract types for these calls.
   - Tests (fixture with bare origin): fetch a new remote branch and prune a deleted one only when asked; progress reported; cancel aborts a running fetch; `fetch_refspecs` writes `refs/codecharta/…` and refuses other destinations; switch to an existing branch; unrelated local change carried over; refusal leaves the tree untouched with git's file list; refuse during a merge; refuse a branch checked out in another worktree; tracking branch from a remote branch, refuse an existing local name; create at a commit without touching the tree; rename keeps upstream; delete merged; unmerged → `branchNotFullyMerged`, deleted only with force; refuse deleting the current branch; delete on the remote; set and unset upstream; reject invalid names (`-x`, `..`, `@{`, `HEAD`, control chars); `--end-of-options` before every ref (faked runner); `repository.changed` after each operation.
   - Commit: `feat(core): add fetch and branch management`
   - As built: the tests live in `tests/git_branches.rs`, `tests/git_fetch.rs` (fixture helpers
     `tests/support/git_operations.rs`) and `codecharta-cored/tests/git_protocol.rs`; the refusal of other
     `fetch_refspecs` destinations is a `Refspec::new` refusal, so no such refspec can be built.
2. **Renderer.** `syncButtons` (Fetch), `branchContextMenu`, commit-menu write entries, create / rename / delete dialogs, `util/effectText.ts`, hooks notice.
   - Tests: switch confirmation names both branches and the folder; No sends nothing; refusal shows git's files; second confirmation before force delete; remote named on remote delete; name validated while typing; progress and Cancel while fetching; other actions disabled while one runs; hooks notice once per repository and session.
   - Commit: `feat(visualization): fetch and manage branches from history`
   - Changelog: extend with `, and lets you fetch, switch, create, rename and delete branches`.

### M9 — Changes and diff (M)

1. **Core.** `parse/status_entries.rs`, `working_tree.rs`, RPC `git.workingTree`, `git.diffFile`, `git.stage`, `git.unstage`, `git.discard`.
   - Tests (captured): file changed in index and worktree listed twice; rename with previous path; conflicted with code; untracked. (fixture): stage / unstage a file with space and brackets; stage all; unstage without commits; discard a modified tracked file; discard a staged new file and an untracked file to the recycle bin (trash injected); discard a staged rename (decides the UNVERIFIED item); `changedSinceListed` when the listing changed; refuse an unlisted path; refuse trashing through a symlinked folder outside the repository; untracked file as added diff; binary diff flagged; large diff truncated.
   - Commit: `feat(core): stage, unstage, discard and diff working tree files`
   - As built: tests in `tests/git_working_tree.rs` (plus unit tests in `parse/status_entries.rs`,
     `working_tree.rs`, `store/paths.rs`) and `codecharta-cored/tests/git_protocol.rs`; details in
     `progress/04-M9-changes-diff.md`.
2. **Renderer.** Tabs, `gitChanges.service.ts`, `changesPanel`, `changeRow`, `diffView`, `util/diffLines.ts`.
   - Tests: four groups; stage / unstage from row and group; discard confirmation names the files and sends exactly those rows; diff lines coloured; diff rendered through interpolation only; list refreshed after each action and on focus; tab remembered per project.
   - Commit: `feat(visualization): show working tree changes with a diff`
   - Changelog: extend with `, and shows changed files with their diff, to stage, unstage or discard`.

### M10 — Commit (M)

1. **Core.** `commit.rs`, RPC `git.commit`.
   - Tests (fixture): commit staged files with subject and body; body line starting with `#` kept; amend; refuse with nothing staged; `identityUnknown` without identity (fixture without identity env, `user.useConfigOnly=true`) and git config unchanged; pre-commit hook exiting 1 → `hookFailed` with its output; conclude a merge; refuse during a rebase; message file deleted after success and failure.
   - Commit: `feat(core): commit and amend`
   - As built: tests in `tests/git_commit.rs` (plus unit tests in `git/commit.rs`) and
     `codecharta-cored/tests/git_protocol.rs`; details in `progress/04-M10-commit.md`.
2. **Renderer.** `commitBox`, `commitMessage.service.ts`, `commitDraft.repo.ts`, amend-of-pushed confirmation.
   - Tests: Commit disabled without staged files or subject; Ctrl+Enter commits; amend fills the last message into an empty box; asks before amending a pushed commit; draft per repository, cleared after commit; identity instructions with both commands; hook output after a failed hook.
   - Commit: `feat(visualization): commit staged changes from the changes panel`
   - Changelog: extend with `, stage and commit changes`.

### M11 — Pull, push, abort (L)

1. **Core.** `sync.rs` pull, push, abort; RPC entries.
   - Tests (fixture with bare origin and a second clone): fast-forward pull; `notFastForward` leaves the repository unchanged; rebase / merge when asked; `conflicts` leaves the operation in progress; abort merge and rebase; first push sets upstream; `pushRejected` when the remote is ahead; force with lease only with the expected SHA; `stalePushLease` when the remote moved; never `--force` (faked runner); askpass env and progress on every network command (faked runner).
   - Commit: `feat(core): pull, push and abort`
   - As built: tests in `tests/git_sync.rs` (plus unit tests in `git/sync.rs`, `git/failure.rs`,
     `git/error.rs`, `methods/git.rs`) and `codecharta-cored/tests/git_protocol.rs`; details in
     `progress/04-M11-pull-push.md`.
2. **Renderer.** Pull and Push in `syncButtons`, `pullChoiceDialog`, `pushDialog` with the separate force-push confirmation, `operationStateBanner`.
   - Tests: fast-forward-only by default; rebase / merge offered only after `notFastForward`; conflicted files listed with a confirmed Abort; publish without upstream; Pull offered after a rejected push; force-push text with both SHAs and that SHA sent; ahead/behind badges.
   - Commit: `feat(visualization): pull and push from history`
   - Changelog: rewrite to `- **Git**: a project folder that is a git repository gets a History view with its branches, tags and commit graph, a search, the changed files of each commit, and a Changes tab to stage, commit, pull and push; git asks for passwords and passphrases in a CodeCharta dialog and nothing is stored.`

### M12 — Workflow end-to-end, docs; stash (stretch) (M)

1. **e2e** `gitWorkflow.e2e.ts` (extra `data-testid`: `changes-tab`, `change-row`, `stage-button`, `discard-button`, `diff-view`, `commit-subject`, `commit-button`, `sync-fetch`, `sync-pull`, `sync-push`, `credential-prompt`). Scenarios: stage and commit (row moves to Staged, commit clears the box); discard asks and names the file; passphrase prompt (fake emits `prompt.requested`, OK sends `prompt.answer`); rebase / merge offered after a non-fast-forward pull; force push needs its own confirmation. Commit: `test(visualization): cover the git workflow end to end`
2. **Docs.** `visualization/README.md`: git actions, hooks note, credentials (credential helper, askpass dialog, nothing stored, ssh-agent / Pageant recommended), identity instructions, out of scope. Commit: `docs(visualization): document the git workflow`
3. **Stretch: stash.** `stash.rs`, RPC, a "Stash" menu in the Changes tab. Tests (fixture): stash and pop including untracked when asked; stash kept when pop conflicts. Commits: `feat(core): stash and pop changes`, `feat(visualization): stash and pop from the changes tab`.

## 6. Rules, security and manual verification

**Repo rules that bite.**
- Core: no `unsafe` except the `GetShortPathNameW` call (one function, commented); no shell; no new git library (no libgit2 / gitoxide, D4). Crates added only where named here (`tempfile` dev, `sha2`, `windows-sys` on Windows, `zeroize`, `dunce` or equivalent) unless plan 01 already provides one.
- dependency-cruiser: `views/historyView` imports only feature facades; `navBar` reaches the chip and `GitHistoryAvailability` only through `features/gitHistory/facade.ts`; `gitHistory` never imports `navBar`; `services/` never imports `components/`; production code never imports `*.mocks.ts`; generated `model/coreApi/` is imported, never edited.
- knip: do not export ports, `CommitSelectionService` or helper types from the facade until a consumer exists.
- Biome: no control characters in regexes, no `forEach`, block statements, no `console.log`.
- Quality gate and `CODE_QUALITY.md`: functions < 25 lines, ≤ 3–4 parameters (request objects), no magic numbers; parsers and `graphLayout.ts` split into small functions.
- Zoneless / OnPush: scroll, `ResizeObserver`, `focus`, rAF callbacks write signals; `jest.useFakeTimers()` for debounce / throttle; no `fakeAsync`.
- Keep-alive: the History view is detached, not destroyed; root services own listeners.
- Styling: daisyUI / Tailwind classes only, Font Awesome, native `<dialog>`, theme tokens.
- Persistence: nothing in `CcState`; `LocalStorageRepo` keys `codeChartaHistoryLayout`, `codeChartaHistoryFolder.<projectId>`, `codeChartaHistoryTab.<projectId>`, `codeChartaCommitDraft.<repositoryId>`; nothing credential-like is ever written.
- Bundle: the History view is lazy; only the chip and `GitHistoryAvailability` are in the initial bundle.
- Changelog: one entry under `## [unreleased]` `### Added 🚀`, rewritten as milestones land; no file or symbol names.

**Security checklist** (review every mutating task): the relay forwards only contract methods; the core validates every param; no client sends a path, URL, remote URL or free-form git argument; refs / remotes / paths are looked up in a fresh listing inside the queue, preceded by `--end-of-options` or `--`, passed as argv elements; untracked deletion only to the recycle bin after canonical confinement; credentials never stored, cached, logged or kept in long-lived renderer state; the askpass token is random per operation, compared in constant time, passed only by environment; no `--force`, no `-D`, no `--force-with-lease` without its separate confirmation; the runner logs only executable, subcommand, exit code and duration.

**Manual verification (packaged app, Windows).**
1. A project on a mid-size clone: chip shows the branch; History present; Local / Remote / Tags populated; ahead/behind match `git status -sb`.
2. Scroll 10 000+ commits fast: no lasting gaps; graph lines connect across 500-row pages; first 50 rows match `git log --graph --date-order --oneline --all`.
3. Search by text, author, a path with a space; clear each. Merge commit files match `git diff --name-status <parent1> <merge>`. Two selected commits' numbers match `git rev-list --left-right --count A...B`.
4. Commit in a terminal, click back into the app: chip and list update without Refresh.
5. Switch with a conflicting local change: git refuses, file named, file unchanged; with a non-conflicting change: carried over.
6. New branch at an old commit (tree untouched); names `-x`, `a..b`, `HEAD` rejected; rename; delete merged (one confirmation) and unmerged (second confirmation).
7. Fetch with the network unplugged: error within seconds. HTTPS with GCM: GCM's window appears; with `credential.helper` unset: CodeCharta prompt "Username for 'https://…'" then masked "Password for …"; Cancel ends with "cancelled".
8. SSH key with passphrase not in an agent: masked "Enter passphrase for …"; wrong passphrase re-prompts as ssh does; first connection shows the host-key question with Yes / No. Repeat with `core.sshCommand` = inbox OpenSSH. Afterwards: no passphrase, password or token in the core log, the app log or `%APPDATA%\codecharta-visualization`.
9. Changes: modify / add / delete / rename; stage / unstage single and all; coloured diff; discard tracked (named) and untracked (recycle bin).
10. Commit with body; amend; amend after push (extra confirmation); failing `pre-commit` hook (output shown); no `user.name` on a fresh account (instructions, no commit, global config unchanged).
11. Push a new branch (published); push when the remote is ahead (rejected, Pull offered); diverged pull (choice dialog); conflicting pull (banner, Abort restores); force push with lease (both SHAs).
12. Long fetch + another action: waits; Cancel the fetch: the queued action runs.
13. App installed in a path with spaces and a user name with a space: HTTPS prompts work; ssh prompts work through the short-path or copied binary, or show the documented ssh-agent message.
14. Dubious ownership (clone from an elevated shell): notice with the command. Plain folder, empty `git init`, `--depth 1` clone, linked worktree, path > 260 characters, `c:\` vs `C:\`: each shows the documented state.
15. git missing from PATH: "git not found" with the link to the tools check.
16. Switch to the Metric view and back: History keeps scroll and selection. Web build (`npm run dev`): no History tab, no chip, no console errors.
17. `codecharta-core git status|branches|log --project <id> --folder <id>` in a terminal matches the UI.

## 7. Out of scope

Interactive rebase, `rebase --continue/--skip`, reset, cherry-pick, revert; hunk / line staging, side-by-side or editable diffs, diffs inside the History details pane; a merge-conflict editor; submodule, LFS, tag, remote and `git config` management; blame, file history, reflog; storing or managing credentials, keys or tokens, a built-in ssh client, `--no-verify`; bare repositories; PR / MR listing and fetching UI (plan 06 uses `fetch_refspecs`); running analyses, snapshots, stale notices (plan 05); filesystem watching, polling, auto-fetch; mutating CLI subcommands.

## 8. Risks and unknowns

| Risk | Resolution |
|---|---|
| Plans 01/03 expose different names or lack runner features (stdin, stdout streaming, env removal, generic cancel). | M1 task 1 reconciles; missing features are added in plan 01's modules, test first, in the milestone that needs them. |
| Byte layouts differ in detail from section 4.5. | Captured outputs from fixtures (M1 task 1); every parser validates its first field. |
| `--end-of-options` missing on git 2.31 for some commands. | M1 spike; minimum version rises instead of dropping the guard. |
| `--date-order` + `--skip` slow on huge repositories without a commit-graph. | Measured in M2 task 4; page cache, 60 s timeout, commit-graph hint; if the first page exceeds 5 s, switch to `--topo-order` (lanes only need children before parents). |
| Git or ssh cannot run the core binary as askpass directly (mode by env var), or ssh rejects a path with spaces. | M7 spike; fallbacks: short path, copied binary, `.sh` / `.cmd` wrapper; last resort a clear "use ssh-agent" message. |
| A network operation waits on a prompt or a GCM window nobody answers. | Modal outside the router outlet; 1800 s timeout; Cancel always available and closes prompts; `GIT_TERMINAL_PROMPT=0`. |
| Prompt spoofing by another local process connecting to the pipe. | Per-operation random token, constant-time compare, no answer to unknown tokens, token never on a command line, socket mode 0600, named pipe rejects remote clients. |
| An answer leaks into logs (JSON-RPC trace, panic message). | `Secret` wrapper with redacting `Debug`; the dispatcher's trace redacts `prompt.answer` params; test asserts the log contains no answer. |
| Error classification by English text is brittle. | `LC_ALL=C` for reads, `LC_MESSAGES=C` for mutations (UNVERIFIED, M7); fallback `commandFailed` with verbatim detail; classification tests on the CI git. |
| State changes between confirmation and execution. | Re-read inside the queue, `changedSinceListed`; force push carries the shown SHA. |
| Windows-only behaviour (paths, pipes, short names) untested on Linux CI. | Pure functions with injected platform; plan 01's `windows-latest` job runs `cargo test`; manual checks 13–14. |
| A repository-controlled program runs during a read. | `core.fsmonitor=false`, no ext-diff / textconv / pager; every new read command reviewed against G8. |
| Thousands of refs. | Tips via stdin; tree groups capped at 200; refs cached by fingerprint. |
| Git fixture tests slow or flaky. | One fixture per test module where possible, no network, isolated config, `fast-import` for long histories. |

Open, proceeding on the default: commit order by date (Rider) rather than topological; no refresh while focused beyond focus, Refresh, `repository.changed` and post-operation refresh.

## 9. Notes

Reconciled names from plans 01 and 03, deviations and measured numbers are recorded here by the implementing agent (details in `dev_docs/studio/agents/progress/`).

Cross-plan items:
- Plan 01: runner stdin, stdout line streaming, env removal; generic `core.cancel` (as built); git minimum version 2.31; the `askpass` mode check in `main` before CLI parsing; redaction of `prompt.answer` in the RPC trace; relay forwarding `prompt.*` and `repository.changed`.
- Plan 03: `FolderRef` in the API crate, the core folder resolver, the recycle-bin helper, `ProjectsService` exported from `features/projects/facade.ts`.
- Plan 05: in-core `GitService` (`rev_list` stream, `measure_distances`, `status`, `subscribe_changes`), the `workingTree` selection item, `ANALYSED_COMMITS` / `COMMIT_ACTIONS` / `LOADED_MAP_LOCATOR` ports; mutating git only through `OperationQueue`; fixtures from `tests/support/git_fixture.rs`.
- Plan 06: `merge_base`, `changed_files` / `git.changedFiles`, `fetch_refspecs` into `refs/codecharta/pr/<n>` (prompts and progress included), `COMMIT_ACTIONS` for "Compare with…"; fixtures from `tests/support/git_fixture.rs`.

Reconciled with plans 01 and 03 as implemented (04-M1 task 1, 2026-11-18):
- Async runtime: tokio. Process runner: `codecharta_core::process::ProcessRunner::run(RunRequest, &CancellationToken)`
  (`RunRequest { tool, program, args, cwd, env, timeout, max_output_bytes, askpass, output }`, `RunOutput
  { exit_code, stdout: String, stderr: String, duration }`; output is decoded UTF-8 with U+FFFD, not bytes).
  Tools: `codecharta_core::tools::Tools::run(ToolId::Git, args, ToolRunOptions, &cancel)`; git's minimum
  `2.31.0` is already in `tools/definitions.rs`, and the plan 01 test is `tests/tools.rs`
  `should_report_too_old_below_minimum`. No stdin, no stdout line streaming yet (M2), env removal added in M1.
- Dispatcher: `codecharta-cored/src/serve/dispatch.rs` (`ROUTES`, `read_params`, `write_result`,
  `domain_error`, `Notifier`), one `serve/<domain>_routes.rs` per domain — so `rpc/git.rs` is
  `serve/git_routes.rs`. Cancel is the `core.cancel` notification (overview section 10). CLI: clap in
  `codecharta-cored/src/cli/` — `cli/git.rs` as planned; refusals print `<ERROR_CODE>: <message>`, exit 1.
- Contract: one `codecharta-core-api/src/methods/<domain>.rs` per domain (so `git.rs` is `methods/git.rs`),
  `method!` macro, `METHODS` / `EVENTS` in `registry.rs`; `npm run contract` regenerates
  `visualization/app/codeCharta/model/coreApi/`. Error codes are `ErrorCode` (SCREAMING_SNAKE_CASE,
  append-only, `ErrorCode::ALL`); JSON-RPC `-32000` with `data = { code, message, details }`. There is no
  separate `GitErrorCode` on the wire: git codes are appended to `ErrorCode`, git's text goes in
  `details.detail` (plan 01 wins, overview section 10).
- Plan 03: `FolderRef { projectId, folderId }` in `methods/projects.rs`; `GitRemote { name, url }` exists there
  too and is reused; folder lookup is `ProjectRepository::resolve_folder(&FolderRef) -> ResolvedFolder
  { path, kind, status }` (unknown → `NOT_FOUND`, a missing folder → status `missing` → `FOLDER_UNAVAILABLE`);
  recycle bin `codecharta_core::recycle::SystemRecycler`; credential stripping
  `folders::inspector::strip_credentials`. Plan 03's simple `git::GitRunner` trait (`run(cwd, args)`, used
  by the folder inspector) stays; plan 04's richer runner is `git::GitCli` over a new port `git::GitProcess`.
- Fixture: `tests/support/git_fixture.rs` `TempRepo` (plan's `FixtureRepo`), extended as M1 task 1 lists;
  `FixtureGit` (its `GitRunner`) gains the plan 04 port too.
- As built in M1: api `methods/git.rs` (not `src/git.rs`), routes `serve/git_routes.rs` (not `rpc/git.rs`),
  plan 04's runner struct is `git::GitCli` over the port `git::GitProcess`, `GitService` methods take a
  resolved `GitFolder` and the request's `CancellationToken`, git error codes are appended `ErrorCode` values
  (SCREAMING_SNAKE_CASE) with git's text in `details.detail`, `CommitSha` / `FullRefName` are api `values.rs`
  types. Details and the open git 2.31 spike: `progress/04-M1-core-status-refs.md`.
- As built in M2 (details: `progress/04-M2-core-log-details.md`): runner stdin is `RunRequest.stdin`;
  stdout line streaming is `GitCli::stream_lines` over plan 01's existing chunk stream plus
  `process::lines::LineSplitter` and the port method `GitProcess::stream`. Log in `git/log.rs`
  (`LogRequest`, `log_page`), details and changed files in `git/details.rs` (`ChangedFilesRequest`), queries
  and the stream in `git/query.rs` (`RevListRequest`, `ShaSink`), caches in `git/memory.rs` (`GitMemory`,
  held by `Core`; `fetched(repository_id, is_shallow)`, `forget_logs`, `forget_answers`). Service reads
  take `(&GitFolder, …, &CancellationToken)`; internal reads take a `FolderGit { git, folder, cancel }`.
  New api values `Revision`, `LogCursor`, `LogFilterText`, `RepoRelativePath`; error codes
  `LOG_SESSION_EXPIRED`, `UNKNOWN_REVISION`. `git.measureDistances` answers `GitCommitDistances`.
- As built in M8 (details: `progress/04-M8-fetch-branches.md`): mutating operations take `(&GitFolder, …,
  &OperationContext { cancel, request_id, progress })` (`git/operation.rs`) and need
  `GitService::with_operations(Operations { queue, prompts })`, which `Core::git()` sets. Inside the queue a
  `Mutation { git, folder, repository, prompts, context }` re-reads refs and runs `run` (mutating) or
  `run_network` (prompt session, progress, `settle`); every operation ends with `forget_logs`, a fresh
  status + refs read and `RepositoryChanges::announce_operation` (`repository.changed` with parts
  `status`, `refs`), also after a failure. Branch commands in `git/branch.rs` (`BranchCreateRequest`,
  `BranchRenameRequest`, `SetUpstreamRequest`), fetch in `git/sync.rs` (`Refspec`, `FetchRefspecsRequest`,
  `count_updated_refs`). New api value `BranchName`; api enums `GitSwitchTarget`, `GitBranchDeleteTarget`;
  error codes `BRANCH_EXISTS`, `BRANCH_NOT_FULLY_MERGED`, `BRANCH_CHECKED_OUT_ELSEWHERE`,
  `LOCAL_CHANGES_WOULD_BE_OVERWRITTEN`, `OPERATION_IN_PROGRESS`, `AUTHENTICATION_REQUIRED`,
  `NETWORK_UNAVAILABLE`.
- As built in M9 (details: `progress/04-M9-changes-diff.md`): `git/working_tree.rs` (the `GitService` entry
  points `working_tree`, `diff_file`, `stage`, `unstage`, `discard`, and `read_entries`) over
  `parse/status_entries.rs`; `Operations` and `Mutation` carry the injected `recycler` (`Core` gives its
  `SystemRecycler`); `Mutation::run_command` / `root`. Every operation now announces `repository.changed` with
  parts `status`, `refs`, `workingTree`. New api value `WorkingTreePath`, api enum `GitStageTarget`, error code
  `CHANGED_SINCE_LISTED`. Path lists reach git on stdin (`--pathspec-from-file=- --pathspec-file-nul --`), so
  no path is ever an argument and 1 000 long paths fit any command-line limit.
- As built in M10 (details: `progress/04-M10-commit.md`): `git/commit.rs` (`GitService::commit(&GitFolder,
  CommitRequest, &OperationContext)`, `CommitRequest { subject, body, amend }`, `MESSAGE_FOLDER_NAME`),
  `GitCli::data_dir`, `COMMIT_LIMITS`. New api values `CommitSubject`, `CommitBody`; params
  `GitCreateCommitParams`; method `git.commit` answering `GitOperationResult`; error codes `IDENTITY_UNKNOWN`,
  `NOTHING_TO_COMMIT`, `HOOK_FAILED`, `CONFLICTS` (M11's pull reuses `CONFLICTS`).
- As built in M11 (details: `progress/04-M11-pull-push.md`): `GitService::pull(&GitFolder, GitPullMode, …)`,
  `push(&GitFolder, &PushRequest, …)` and `abort_operation(&GitFolder, GitAbortableOperation, …)` in
  `git/sync.rs`; params `GitPullParams`, `GitPushParams`, `GitAbortOperationParams`, api enums `GitPullMode`,
  `GitAbortableOperation`; methods `git.pull`, `git.push`, `git.abortOperation` answering
  `GitOperationResult`. Error codes `NOT_FAST_FORWARD`, `PUSH_REJECTED`, `NO_UPSTREAM`, `STALE_PUSH_LEASE`.
  `Mutation::run_network` classifies stderr and stdout (`error::network_failed`) and, without an ssh helper,
  words ssh refusals as the ssh-agent / Pageant message (`error::SSH_AGENT_MESSAGE`).
