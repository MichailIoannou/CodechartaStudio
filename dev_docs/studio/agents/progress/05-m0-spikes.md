---
name: 05-M0 ccsh process spikes
state: progress
version: 1
---

## Goal

Answer how `ccsh` behaves as a child process (layout, launch, output, exit codes, cancel, orphaned
worktrees) before plan 05's core runs analyses. The plan asks for a real Windows machine; this run covers
what Linux can answer and writes the Windows procedure down for the owner.

## Tasks

Copied from `05-commit-analysis-and-snapshots.md`, Milestones, M0. Linux part now; Windows part open.

1. Installed layout and launching `CcshLauncher --version` from a throwaway Rust `Command` without a shell
   (Linux: `analysis/` built with `./gradlew installDist`; record the npm global layout as open for Windows)
2. `ccsh.cmd` launch behaviour — Windows only (open)
3. `ccsh analyse <repo> -o <tmp>/map -p --commit=<sha>` piped: raw stderr (progress segments), stdout (`Map:`
   line, encoding of `─` with and without `-Dstdout.encoding=UTF-8`), exit codes for success, a bad
   `--without=x` (expect 1) and an unknown option (expect 2)
4. Kill a `--commit` run mid-checkout (`kill -9` of the process tree on Linux): orphan in
   `git worktree list --porcelain`; whether `git worktree prune` removes it; `git worktree remove --force`
5. `gh pr list … --json` shape — needs a logged-in `gh` and network (open unless already available)
6. Candidate crates and versions (`regex`, `flate2`, `sha2`, `trash`, `fs4`, `sysinfo`, `async-trait`,
   `tokio-util`) against `core/deny.toml`; note which the core already uses

## Steps

- [x] 1. Layout and launch (Linux); npm global layout on Windows stays open (procedure W1)
- [ ] 2. ccsh.cmd (Windows, open; procedure W2)
- [x] 3. Output and exit codes (Linux); Windows rerun open (procedure W3)
- [x] 4. Killed run and orphan worktree (Linux); `taskkill /T /F` rerun open (procedure W4)
- [ ] 5. gh pr list shape (open: `gh` is not installed here; procedure W5)
- [x] 6. Crates

## Notes

Environment: Linux, OpenJDK 27.0.1, system git, Rust stable via rustup, ccsh 2.4.0 from
`cd analysis && ./gradlew installDist` (Gradle 9.8.2 downloaded; build output is git-ignored). Scratch git
repos and the throwaway Rust program (`spawn`, `std::process::Command`, no shell) lived outside the repository.
Short names: `$H` = `analysis/build/install/codecharta-analysis`, `$CP` = `$H/lib/*`,
`LAUNCHER` = `de.maibornwolff.codecharta.ccsh.launcher.CcshLauncher`.

### 1. Installed layout and launch (Linux) — plan 05 "Launching ccsh" holds

```
$H/bin/ccsh      Gradle start script (POSIX sh)        $H/bin/ccsh.bat
$H/ccsh          448-byte bash shim: prints ">> This ccsh file is deprecated! Use bin/ccsh instead. <<" to stderr, runs bin/ccsh
$H/lib/ccsh-2.4.0.jar   the ONLY file in lib/ (53 MB fat jar; Main-Class = LAUNCHER; Enable-Native-Access: ALL-UNNAMED)
```

- Exact command the Unix script runs (`sh -x bin/ccsh --version`):
  `exec java --enable-native-access=ALL-UNNAMED -classpath <APP_HOME>/lib/ccsh-2.4.0.jar:<APP_HOME>/lib/CodeMaatImporter-2.4.0.jar:…:joda-time-2.10.2.jar de.maibornwolff.codecharta.ccsh.launcher.CcshLauncher --version`.
  The script's `CLASSPATH=` still lists about 100 jars that do not exist in `lib/`; the JVM ignores missing entries.
  `build.gradle.kts` patches only `ccsh.bat` to `set CLASSPATH=%APP_HOME%/lib/*`. The `.bat` final line is
  `"%JAVA_EXE%" %DEFAULT_JVM_OPTS% %JAVA_OPTS% %CCSH_OPTS%  -classpath "%CLASSPATH%" …CcshLauncher %*`.
- The Unix script also exports `LC_CTYPE=C.UTF-8` (or `LC_ALL`) when the locale is not UTF-8 (see item 3, finding 7).
- By hand: `java --enable-native-access=ALL-UNNAMED -classpath "$CP" LAUNCHER --version` prints `CodeCharta ccsh`,
  `version "2.4.0"`, `Copyright(c) 2024, MaibornWolff GmbH`; exit 0.
- From Rust `Command` (no shell, stdin null, `.output()`): `Command::new("$H/bin/ccsh").arg("--version")` and
  `Command::new("java").args(["--enable-native-access=ALL-UNNAMED","-Dstdout.encoding=UTF-8","-Dstderr.encoding=UTF-8","-classpath","$H/lib/*",LAUNCHER,"--version"])`
  both give `code=Some(0)`, the same three stdout lines, empty stderr. The `lib/*` wildcard works without a shell (Java
  expands it).
- Design: `JavaDirect` ("require `APP_HOME\lib` to contain at least one `.jar`") is correct and sufficient. Do not parse the
  script's CLASSPATH and do not assume several jars.
- Open (W1): the npm global layout on Windows.

### 3. Output and exit codes (Linux) — plan holds; corrections for progress, classification and flags

Command shape (stdin `</dev/null`, stdout and stderr into separate files, inspected as raw bytes):

```
java --enable-native-access=ALL-UNNAMED [-Dstdout.encoding=UTF-8 -Dstderr.encoding=UTF-8] -classpath "$CP" LAUNCHER \
     analyse <repo> -o <tmp>/map -p [-q] --commit=<full sha>
```

| Run | exit | stdout | stderr |
|---|---|---|---|
| `--commit=<sha>`, no `-q` | 0 | 935 B: parser chatter, blank lines, 72× `─`, `Analysis done: 4 files with rawtextparser, unifiedparser, dependencyparser, domainlanguageparser, git history`, blank, `Map: <abs>/d8ced38.map.cc.json.gz`, `Not in the map:` and `  svn history: left out with --commit, which reads a git commit` | 6.5 KB: logger lines, progress, JDK warnings |
| same with `-q` | 0 | 763 B: `Analysing <folder> with … ...`, blank, `─`×72, `Analysis done`, `Map:`, `Not in the map:` | 594 B: only the three JDK 27 lines `WARNING: Final field lineComments in class …TokeiLanguage has been mutated reflectively …` |
| plain, no `--commit` | 0 | `Map: <tmp>/ok4/map.cc.json.gz` (no prefix) | 6.3 KB |
| `--without=x` | 1 | `--without does not know x. Leave out one of: rawtextparser, unifiedparser, dependencyparser, domainlanguageparser, git, svn` | empty |
| `--nonsense` | 2 | empty | `Unknown option: '--nonsense'` and `Possible solutions: --not-compressed` |
| missing folder | 1 | `The folder <path> does not exist.` | empty |
| `--commit` with `--local-changes` | 1 | `--commit and --local-changes are mutually exclusive.` | empty |
| `--commit=0123…4567` (full-length sha that does not exist) | 1 | `ccsh analyse failed: Failed to create git worktree for commit 0123…: Git command failed with exit code 128: git -c core.quotepath=off worktree add /tmp/codecharta-wo…` | empty |
| `--commit=deadbeefdeadbeef` (not a sha, not a date) | 0 | success, but the map is for HEAD (file prefix `20acbf8.`) | none of note |
| `analyse <repo> -i`, stdin closed | none within 20 s (`timeout` killed it, 124) | nothing | nothing |

Findings:

1. **Exit codes confirmed.** 0 success; 1 for `AnalysisException`/failures, message on **stdout**, stderr empty; 2 for picocli
   argument errors, message on **stderr**, stdout empty. The plan's "exit 2 → invalid-arguments, exit 1 → last non-empty
   stdout line" holds; exit 2 must be diagnosed from stderr.
2. **Unknown refs are not rejected.** `--commit=deadbeefdeadbeef` fell through to the `git log --before=<ref> -1` fallback and
   analysed HEAD with exit 0. Plan 05 passes only a full sha confirmed by `git cat-file -e <sha>^{commit}`; keep that
   preflight mandatory, and add a post-run check that the output file name starts with a prefix of the requested sha
   (`git rev-parse --short` length is chosen by git: compare `sha.starts_with(prefix)`).
3. **A missing full sha yields `Failed to create git worktree …`** (exit 1), not `No commit found for`. Under the plan's
   classification order it would show as `worktree-failed` with the Windows long-path hint. Preflight `unknown-commit`
   catches it first in normal use; keep `No commit found for` only as a secondary rule and do not rely on it for full shas.
4. **`meta.commitHash` is not written** (confirmed by running). The `--commit` map's meta is
   `{"projectName":"","apiVersion":"2.1","checksum":"f87c71b6…"}` — the same keys as a plain run; root node name is `root`.
   The only trace of the commit is the file name prefix (`d8ced38.map.cc.json.gz`). The plan's decision (the core records the
   commit in `snapshot.json`) holds. Note `meta.apiVersion` is `"2.1"` in the file.
5. **Progress (stderr).** Each update starts with `\r`: ` <pct>% [===>   ] <n>/<total> <unit>, ETA: <N/A|HH:MM:SS>` plus an
   optional ` parsed file: <name>`. The plan's regex matched 347 of 347 percent segments on a 30,000-file `--commit` run
   (89 s wall clock, exit 0, 347 CR and 51 LF in 56 KB of stderr). Units seen: `Files` and `Byte` (singular). stderr is mixed
   with `[thread] INFO/WARN …Logger -` lines and JDK warnings, so stderr is a log, never an error signal. **The overall
   percent rule must change**: several parsers report `Files` with the same total (345 updates for `Files:30000`, the
   sequence 0→100 repeated, non-monotonic), and `Byte:1952115` is a different unit. "Trackers keyed by `unit:total`, Σparsed/Σtotal"
   merges same-sized trackers and mixes units. Use only the `Files` unit, show the percent of the most advanced `Files` tracker
   (max over updates per total), never decrease, cap at 99 until exit; ignore `Byte`; `Indeterminate` between phases. Add a
   fixture test from captured bytes.
6. **Stdout chatter.** Without `-q` stdout also carries `Checking if RawTextParser is applicable...`, `Creating git.log file...`,
   a run of `0x0E` (SO) control bytes from the git-log step, then `Parsing files...`. Decode lossily and strip C0 control
   characters other than `\n \r \t`. `Map:` is in the final block in both modes, so `parse_map_line` (last `Map: ` line) works.
   `-q` removes chatter and progress together, so the core must not pass `-q` (the plan already omits it).
7. **Encoding of `─`.** In a UTF-8 locale the bytes are `e2 94 80` with or without `-Dstdout.encoding=UTF-8`. With
   `LC_ALL=C LANG=C LC_CTYPE=C` and no flag, `java` writes `3f` (`?`) for every one; with `-Dstdout.encoding=UTF-8` it writes
   `e2 94 80`. Through `bin/ccsh` with `LC_ALL=C` it is UTF-8 too, because the script exports `C.UTF-8`. The plan's
   `-Dstdout.encoding=UTF-8 -Dstderr.encoding=UTF-8` in `JavaDirect` is therefore required, and `CCSH_OPTS` in `Executable`
   is harmless. Re-check on Windows with a non-ASCII path (W3).
8. **JDK 27 warnings on stderr** (even with `-q`, exit 0): three `WARNING: Final field lineComments … mutated reflectively …`
   lines. They do not collide with the plan's `java-too-old` markers (`ccsh needs Java`, `Unrecognized option: --enable-native-access`),
   but nothing may treat non-empty stderr as failure. Candidate analysis-side fix (plan 05 "Optional analysis-side changes"):
   `--enable-final-field-mutation=ALL-UNNAMED` is not valid on older JDKs, so it cannot go in the core's `prefix_args`.
9. **Interactive trap.** `analyse <repo> -i` with stdin closed prints no menu and does not exit; the
   `Select an analyser to execute` watchdog string never appears. Rejecting `-i` in `build_analyse_argv` is the real protection;
   the 30 min watchdog is the fallback. Keep stdin `Stdio::null`.
10. ccsh creates the missing parent folder of `-o` (`-o <tmp>/ok1/map` worked with no `ok1`).

### 4. Killed run and orphan worktree (Linux) — plan "Worktree janitor" must change

Scratch repo: one commit with 30,000 small `.java` files (checkout takes 1-2 s). Run:
`setsid java … -Djava.io.tmpdir=<jt> -classpath "$CP" LAUNCHER analyse <big> -o <t>/map -p -q --commit=<sha>`, poll until
`<jt>/codecharta-worktree-*` exists, `kill -9 -- -<pgid>` (java and its `git worktree add` child; 3 files checked out when
sampled, 1,267 of 30,001 after the kill).

```
$ git worktree list --porcelain          # after SIGKILL of the process group, mid-checkout
worktree <big>
HEAD 155dda6ad4c3de095d77eb5ea3b8bb1c97d50e86
branch refs/heads/main

worktree <jt>/codecharta-worktree-11432018671602835247
HEAD 155dda6ad4c3de095d77eb5ea3b8bb1c97d50e86
detached
locked initializing
$ ls <big>/.git/worktrees/codecharta-worktree-…/   -> commondir gitdir HEAD index.lock locked logs refs
$ git worktree prune -v                  # prints nothing; entry and folder remain
$ git worktree remove <path>             # fatal: cannot remove a locked working tree, lock reason: initializing
$ git worktree remove --force <path>     # fatal: cannot remove a locked working tree, lock reason: initializing
                                         #   use 'remove -f -f' to override or unlock first
$ git worktree remove -f -f <path>       # exit 0; entry, folder and .git/worktrees/ gone
```

Second case: only java killed after the checkout was complete (30,001 files, no `git` child alive): the entry is listed
without `locked`; `git worktree prune -v` changes nothing (folder exists); `git worktree remove --force <path>` exits 0 and
removes entry and folder.

Findings:

- **Where it lives**: the JVM temp dir (`java.io.tmpdir`, default `/tmp`; moved by `-Djava.io.tmpdir=<dir>`), as
  `codecharta-worktree-<random digits>`. After a SIGKILL the same dir also holds `codecharta-analysis<digits>/` (per-parser
  intermediate `.cc.json`) and `git<digits>.log`. With `-Djava.io.tmpdir=<jobTempDir>` all of it goes away with the job folder,
  and orphans can be matched by path prefix `<jobTempDir>/codecharta-worktree-`.
- `git worktree prune` alone does **not** remove an orphan while its folder exists (both cases). `git worktree remove` removes
  entry and folder together.
- **Plan change**: a kill during `git worktree add` leaves the entry `locked initializing`, and the plan's
  `git worktree remove --force <path>` **fails** (verified). Use `git worktree remove -f -f <path>` (verified; equivalent to
  `git worktree unlock <path>` then `remove --force`), only after the process tree, including the `git` child, is dead; then
  `git worktree prune`. The retry (3 × 500 ms) still matters for Windows file handles.
- The killed process produced no output; Rust's `ExitStatus::code()` is `None` for a signal. That must map to
  cancelled/crashed, never `analysis-failed`.
- Orphan detection "path starts with `codecharta-worktree-` and `HEAD` equals the job's sha" matched in both cases.

### 5. gh pr list — open

`gh` is not installed in this environment (`which gh` found nothing); nothing was run. See W5.

### 6. Candidate crates — all acceptable under `core/deny.toml`

`cargo add` and `cargo metadata` in a scratch project outside the repository (default features, all targets, so the Windows-only
dependencies of `trash`/`sysinfo`/`fs4` are included; cargo reached the registry, nothing else used the network).

| Crate | Latest | Licence | In `core/Cargo.lock` | deny.toml |
|---|---|---|---|---|
| regex | 1.13.2 | MIT OR Apache-2.0 | no | allowed |
| flate2 | 1.1.11 | MIT OR Apache-2.0 | no | allowed |
| sha2 | 0.11.1 | MIT OR Apache-2.0 | no | allowed |
| trash | 5.4.0 | MIT | no | allowed |
| fs4 | 1.1.0 | MIT OR Apache-2.0 | no | allowed |
| sysinfo | 0.40.4 | MIT | no | allowed |
| async-trait | 0.1.92 | MIT OR Apache-2.0 | no | allowed |
| tokio-util | 0.7.20 | MIT | yes, 0.7.20 (workspace dependency, feature `rt`) | allowed |

All 75 packages of the scratch tree use licence ids on the allow list (`MIT`, `Apache-2.0`, `Unicode-3.0`, `0BSD`, `Zlib`,
`Unlicense`). `cargo deny` is not installed here, so this is a manual comparison, not a `cargo deny check` run; CI runs the
real one. `tokio` is already a workspace dependency with `process`. `sha2` 0.11 uses `digest` 0.11, a different API from
the 0.10 examples most documentation shows; pick versions at M1 from the then-current registry.

### Design impact for 05-M1..M3

1. Janitor: `git worktree remove -f -f <path>`, then `prune` ("Worktree janitor", "Cancellation").
2. Progress: do not key trackers by `unit:total`; use only the `Files` unit, ignore `Byte` ("Running, progress, cancellation").
3. Failure classification: exit 2 → read stderr; exit 1 → last non-empty stdout line; a signal (`exit_code: None`) is never
   `analysis-failed`; a missing full sha reports `Failed to create git worktree`, so keep `unknown-commit` in preflight.
4. Only full shas reach ccsh (an unknown non-sha ref silently analyses HEAD); verify the output prefix after the run.
5. Keep `-Dstdout.encoding=UTF-8`/`-Dstderr.encoding=UTF-8` in `JavaDirect`; strip C0 control bytes from stdout.
6. Pass `-Djava.io.tmpdir=<jobTempDir>`: relocates worktree, per-parser temp output and git logs into the job folder.
7. stderr is never an error signal (JDK 27 warnings, logger lines).
8. `lib/` holds one fat jar; classpath is `<APP_HOME>/lib/*`.

### Open procedures for the owner (Windows machine)

Needs Java ≥ 22, git, Node and `npm i -g codecharta-analysis` (or the build under test). Paste raw output here.

- **W1 (item 1)**: `npm root -g`; `dir "<root>\codecharta-analysis\public\bin"`; `dir "<root>\codecharta-analysis\public\lib"`;
  `type "<npm prefix>\ccsh.cmd"` (last line ends in `ccsh.bat" %*`). Then run
  `java --enable-native-access=ALL-UNNAMED -classpath "<root>\codecharta-analysis\public\lib\*" de.maibornwolff.codecharta.ccsh.launcher.CcshLauncher --version`
  by hand, and from the scratch Rust program (`Command::new("java").args([...]).output()`), also from a folder with a space in
  its path. Expected: three lines, exit 0. Record whether `lib\` holds one jar.
- **W2 (item 2)**: in the same program run (a) `Command::new("ccsh.cmd").arg("--version")` with the npm prefix on PATH,
  (b) `Command::new(r"<prefix>\ccsh.cmd")` with a space in the path, (c) an argument containing `&`, `%`, `^` and `"`
  (for example `analyse "C:\tmp\a&b" -o "C:\tmp\x\map"`), (d) plan 01's `cmd.exe /d /s /v:off /c "…"` form for a prefix with a
  space. Record per case: spawn result, `ErrorKind`, exit code, stdout. Record `rustc -V` (since 1.77.2 `Command` refuses to
  spawn `.bat`/`.cmd` with arguments it cannot escape safely, `InvalidInput`).
- **W3 (item 3)**: with and without `-Dstdout.encoding=UTF-8`, in a local repo whose folder has a non-ASCII name, run the
  Linux commands above (`--commit=<sha>`, `--without=x`, `--nonsense`) with `Stdio::piped`; hexdump the `─` run (expect
  `e2 94 80` with the flag), the `Map:` line bytes for the non-ASCII path, and the `\r` framing of stderr.
- **W4 (item 4)**: start `--commit=<sha>` on a repo with tens of thousands of files, poll `%TEMP%\codecharta-worktree-*`,
  then `taskkill /pid <java pid> /t /f`. Record `git worktree list --porcelain` (look for `locked initializing`),
  `git worktree prune -v`, `git worktree remove --force <path>`, `git worktree remove -f -f <path>`, and whether open file
  handles delay the delete (retry after 500 ms). Repeat with a repo containing 200-character paths and
  `core.longpaths` unset to see the `Failed to create git worktree` text.
- **W5 (item 5; any OS with `gh` logged in)**: in a GitHub clone,
  `gh pr list --state all --search <sha> --json number,title,state,baseRefName,headRefName`; record the JSON shape, the empty
  result (`[]`) for a sha in no PR, the exit code and message when logged out, and on a non-GitHub remote.
