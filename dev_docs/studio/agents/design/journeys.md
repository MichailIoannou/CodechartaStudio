# User journeys — how the screens fit together

The area files describe each element. This file walks through the app as a user meets it: what the
main map screen looks like today, what Studio adds to it, and how a user gets from one thing to the
next (projects, folders, commits, analyses, History, compare). Visual version:
`mockups/studio-screens.html` (also the owner review page). Element ids (P1, W1, H8, C3, …) point into
the area files; OD1–OD4 are in `owner-decisions.md`.

## 1. The main screen today (visualization 2.11.0)

```
┌ nav bar ─────────────────────────────────────────────────────────────────────────────────────┐
│ [logo] │ [📂] [sample1 +1 ▾]            Metric  Domain  Dependencies                 Settings │
├──────────────┬───────────────────────────────────────────────────────────────┬───────────────┤
│ EXPLORER   « │                                                               │ (inspector,   │
│ Shown 8 …    │                   3D city of the loaded map(s)                 │  opens when a │
│ [search    ] │                                                    [view cube]│  building is  │
│ ▸ root       │                                                               │  selected)    │
│   files…     │        ┌ floating metrics bar: Layout · Area · Height · Color · Edges · Labels ┐│
│              │        └─────────────────────────────────────────────────────────────────────┘│
├──────────────┴───────────────────────────────────────────────────────────────┴───────────────┤
│ file extension bar                                                                            │
│ bottom bar: hovered path                                                       attribution    │
└───────────────────────────────────────────────────────────────────────────────────────────────┘
```

- 📂 opens the browser's file dialog for `.cc.json` files; the dropdown next to it chooses which loaded
  maps are shown. Hovering a view tab shows a mode bar; for the metric view it has **Explore** /
  **Compare**.
- Nothing here knows about projects, git, commits or analyses: a map is a file.

## 2. The same screen in CodeCharta Studio (desktop)

```
┌ nav bar ──────────────────────────────────────────────────────────────────────────────────────────────────┐
│ [logo] │ [▣ billing / billing-api ▾] [⎇ feature/x  @ 9f8e7d6  stale by 4 ▾]   Metric Domain Dependencies History   [☀] Settings │
│          P1 project + working folder   W1 workspace status                    H1 new tab                    T2 theme      │
├──────────────┬───────────────────────────────────────────────────────────────────────┬────────────────┤
│ EXPLORER   « │   ┌ S2 ⚠ No analysis for a1b2c3d — showing 9f8e7d6, stale by 4 commits ┐ │ inspector      │
│ Files|Changes│   │                                  [▶ Analyse a1b2c3d now]  [✕]   │ │ (unchanged)    │
│ …            │   └──────────────────────────────────────────────────────────────────┘ │                │
│              │                 3D city of the shown analysis                        │                │
│              │        metrics bar (unchanged)                                       │                │
└──────────────┴──────────────────────────────────────────────────────────────────────┴────────────────┘
```

| Control | Answers | Click to |
|---|---|---|
| **P1** project menu (replaces 📂) | Which project and which of its folders am I working in? | switch folder (top: this project's folders), switch project (below: other projects, each opens to its folders), Overview, New project…, Open cc.json…, Manage project…, Close project |
| **W1** workspace status (replaces the map dropdown) | Which branch; which commit the map shows and whether it is current; is anything running? Its icon becomes the activity (analysing, pulling, pushing) and its background fills as a progress bar | pick another commit (Show commit…), back to the current checkout, analyse, Snapshots…, Pull / Push (one contextual button), Open History, see and cancel running work, Project overview |
| **S2** stale notice | The commit asked for has no analysis, so a nearby one is shown | Analyse that commit; the map switches when it is done |

The explorer, inspector, metrics bar, legend and bottom bar are unchanged. During a comparison the
explorer offers one more mode, **Changes** (C8), and the comparison chip (C2) sits next to W1's
icon-only form.

## 3. Journeys

### J1 First start, no project yet

1. The app opens on the **project overview** page in its "no project" state (P3 b): **New project…**,
   **Open cc.json…**, **Show sample maps**. No view tab is active.
2. **New project…** (P4): name it, **Add folder…** picks the repository folder; more folders (a fork,
   a helper folder) can be added now or later. **Create project**.
3. The overview shows the project with its working folder (the primary one): git state, "No analysis
   yet", **Analyse current checkout**.
4. **Analyse** → W1's icon turns into a spinner and its background fills as the analysis runs.
5. When it finishes, W1 flashes green and the map opens; the nav bar reads `billing / billing-api ▾ |
   ⎇ main @ a1b2c3d ▾`.

### J2 Opening a cc.json someone sent

1. P1 → **Open cc.json…** (or Ctrl+O, or drop the file on the window).
2. The dialog (P8) says which project and folder it goes into, labels it "Imported snapshot — analysis
   time unknown", and offers to bind it to the commit its name points to.
3. **Open** → that folder becomes the working folder; W1 reads "imported · analysis time unknown".

### J3 Everyday start

The last project, working folder and analysis reopen. If the checkout moved on since (someone pulled),
W1's badge says "stale by N" and S2 offers **Analyse … now**. Nothing runs by itself.

### J4 Switching folder or project

- P1 ▾ → the top section lists the current project's folders; choose another (for example the fork).
  Its last analysis loads; W1, History and the overview follow it.
- P1 ▾ → expand another project under "Other projects" → choose one of its folders. Project and
  working folder change in one step.

### J5 Looking at another commit — from the map

1. W1 ▾ → **Show commit…** opens the ref picker (C4): type a branch, tag or hash; each entry shows
   whether it is analysed.
2. Pick one: analysed → the map switches; not analysed → the nearest analysis shows with "stale by N"
   and **Analyse**; after the analysis the map switches by itself.
3. W1 ▾ → **Show current checkout** returns to the folder's current state.

### J6 Looking at another commit — from History

1. **History** tab, or W1 ▾ → **Open History**.
2. Browsing commits only fills the details pane, which says whether each commit is analysed.
3. **Show in map** (or Enter / double-click) → metric view with that commit. **Analyse this commit**
   queues it; progress shows on W1.

### J7 Everyday git

- **Pull / Push / Publish / Fetch** is one button (H5) that offers what the branch needs now: Pull when
  behind, Push when ahead, Publish without upstream, Fetch otherwise; the caret lists the rest. It is in
  the History toolbar, in W1's dropdown and on the project overview. While it runs, W1's icon turns into
  the arrow and its background fills.
- Committing: History → **Changes** tab: stage files (per file, or Stage all), write the message,
  **Commit** (H11, H12).
- After a pull or switch, W1 updates; a map that follows the current checkout may now say "stale by N".

### J8 Comparing two commits

- From the map: hover **Metric** → **Compare** opens the compare dialog (C3); choose base and head (or
  a pull request).
- From History: select two commits → **Compare**; a commit's menu → **Compare with Parent**; a branch's
  menu → **Compare with 'main'**.
- Missing analyses are offered first (C5: **Analyse missing** / **Use nearest**).
- The map shows the delta; the comparison chip (C2) sits next to W1; the explorer offers **Changes**.
  **Explore** or the chip's **Leave compare** returns to one map.

### J9 Checking on a project

P1 ▾ → **Overview** (or W1 ▾ → **Project overview**) opens P3: working folder and its git state,
analyses, recent commits, the project's folders. **Show map** returns to the map.

## 4. Web build

Unchanged from section 1, except the theme picker in Settings and the theme toggle in the nav bar.
