# User journeys — how the screens fit together

Visual version: `mockups/studio-screens.html` (also the owner review page). The area files describe
each element. This file walks through the app as a user meets it: what the
main map screen looks like today, what Studio adds to it, and how a user gets from one thing to the
next (projects, commits, analyses, History, compare). Element ids (P2, S1, H8, C3, …) point into the
area files.

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

- 📂 opens the browser's file dialog for `.cc.json` files. The dropdown next to it ("sample1 +1")
  chooses which loaded maps are shown. Hovering a view tab shows a small mode bar under it; for the
  metric view it has **Explore** / **Compare** (two loaded files as a delta).
- Nothing on this screen knows about projects, git, commits or analyses: a map is a file.

## 2. The same screen in CodeCharta Studio (desktop)

```
┌ nav bar ───────────────────────────────────────────────────────────────────────────────────────────────┐
│ [logo] │ [▣ billing ▾] [⎇ billing-api @ 9f8e7d6  stale by 4 ▾]   Metric Domain Dependencies History   [⎇ feature/x ↑2 ●] [⟳ 1] [☀] Settings │
│          P1 project     P2 what the map shows (S1 status)          H1 new tab                         H2 branch chip     S3 jobs T2 theme       │
├──────────────┬────────────────────────────────────────────────────────────────────────┬────────────────┤
│ EXPLORER   « │   ┌ S2 ⚠ No analysis for a1b2c3d — showing 9f8e7d6, stale by 4 commits ┐   │ inspector      │
│ Files|Changes│   │                                  [▶ Analyse a1b2c3d now]  [✕]   │   │ (unchanged)    │
│ …            │   └──────────────────────────────────────────────────────────────────┘   │                │
│              │                 3D city of the shown analysis                          │                │
│              │        metrics bar (unchanged)                                         │                │
└──────────────┴────────────────────────────────────────────────────────────────────────┴────────────────┘
```

Reading the nav bar left to right answers four questions:

| Control | Answers | Click to |
|---|---|---|
| **P1** project switcher (replaces 📂) | Which project am I in? | switch project, create one, open a cc.json, manage, close |
| **P2** folder selector (replaces the map dropdown) | Which folder and which commit does the map show, and is it current? (`@ 9f8e7d6`, badge "stale by 4") | pick another commit ("Show commit…"), go back to the current checkout, analyse, choose shown folders, open the list of analyses ("Snapshots…") |
| **H2** branch chip | Which branch is checked out in the active folder, and is it in sync / dirty? | open History |
| **S3** jobs indicator (only while analyses run or wait) | Is CodeCharta analysing something? | see progress, cancel, open results |

The explorer, inspector, metrics bar, legend and bottom bar are unchanged. During a comparison the
explorer offers one more mode, **Changes** (C8), and P2's place is taken by the comparison chip (C2).

## 3. Journeys

### J1 First start, no project yet

1. The app opens on the **project home** (P3 b): "Open a project to see its code as a city." with
   **New project…**, **Open cc.json…**, **Show sample maps**. The view tabs are hidden (no map).
2. **New project…** (P4): name it, **Add folder…** picks the repository folder (native picker), its
   label and role are filled in. **Create project**.
3. The home now shows the project's folders (P3 c), each with **Analyse** (and **Import cc.json…**).
4. **Analyse** → the jobs indicator (S3) appears in the nav bar with progress.
5. When it finishes, the map opens for the current checkout; the nav bar reads
   `billing ▾ | billing-api @ a1b2c3d ▾` on the left and `⎇ main` on the right, and the view tabs
   appear including **History**.

### J2 Opening a cc.json someone sent

1. P1 → **Open cc.json…** (or Ctrl+O, or drop the file on the window).
2. The open dialog (P8) says where it goes ("New project 'Downloads' with folder …", **Change…**),
   labels it "Imported snapshot — analysis time unknown", and offers to bind it to a commit if the file
   name names one.
3. **Open** → the map shows it; P2 reads "Downloads · imported".

### J3 Everyday start

The app reopens the last project and the analysis it showed. If the folder's checkout moved on since
(someone pulled), P2's badge says "stale by N" and the notice (S2) offers **Analyse … now**. Nothing
runs by itself.

### J4 Looking at another commit — from the map

1. P2 ▾ → **Show commit…** opens the ref picker (C4): type "release" or a hash; each entry shows
   whether it is analysed.
2. Pick one:
   - analysed → the map switches to it; P2 reads `@ <sha>` with no badge;
   - not analysed → the map shows the nearest analysed commit and the notice says so ("No analysis
     for … — showing …, stale by 4 commits") with **Analyse … now**; after the analysis the map
     switches by itself.
3. P2 ▾ → **Show current checkout** returns to the folder's current state.

### J5 Looking at another commit — from History

1. **History** tab (or click the branch chip). The History view (H3) shows branches, the commit graph
   and details for the folder named in "Repository".
2. Clicking or arrowing through commits only fills the details pane, which says whether each commit
   is analysed ("Not analysed — nearest is 9f8e7d6, 4 commits older"). The map does not change yet.
3. **Show in map** (or Enter / double-click) → back to the metric view showing that commit, exactly as
   in J4 step 2. **Analyse this commit** queues it without leaving History.

### J6 Everyday git

In History: commit on the **Changes** tab (H11, H12); **Fetch / Pull / Push** next to the branch (H5);
branch actions from the branch's context menu (H10). After a pull or a switch, the branch chip
updates; if the map follows the current checkout it re-resolves and may show "stale by N" (S1, S2).

### J7 Comparing two commits

- From the map: hover **Metric** → **Compare** in the mode bar opens the compare dialog (C3); choose
  base and head (or a pull request); **Compare**.
- From History: select two commits → **Compare**; or a commit's menu → **Compare with Parent**; or a
  branch's menu → **Compare with 'main'**.
- Missing analyses are offered first (C5: **Analyse missing** / **Use nearest**).
- The map shows the delta; P2's place shows the comparison chip (C2) `base 9f8e7d6 main ⇄ head a1b2c3d
  feature/x`; the explorer offers **Changes** (C8). **Explore** in the mode bar, or the chip's **Leave
  compare**, returns to one map.

### J8 Switching project

P1 ▾ → another project: its last shown analysis loads; History, P2 and the branch chip follow that
project's active folder.

## 4. Web build

Unchanged from section 1, except the theme picker in Settings and the theme toggle in the nav bar.
