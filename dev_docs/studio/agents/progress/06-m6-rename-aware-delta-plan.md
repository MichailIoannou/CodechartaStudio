---
name: 06-M6 task 6 — rename-aware delta
state: complete
version: 1
date: 2026-11-21
---

## Goal

During a project comparison whose changed files came from git, a file git reports as renamed (`R<score>`)
is drawn as one changed building at its new path, with its deltas against the old path's metrics,
instead of a removed building at the old path and an added one at the new path.

## Why a plan first

Plan 06 section 8 ("Rename awareness"): the rename pairs must reach `DeltaGenerator`, which runs inside
`structureTreeSelector` (`lenses/structure/store/structureTree.selector.ts`). A lens may not read view
state (`lens-no-view-state`), so the pairs cannot come from `sharedView` or from `CompareStore`. They have
to enter through the file store, next to the two files, which changes a persisted home. That is a
decision for the owner and the designer before code is written.

## What exists (2026-11-21)

- `compare.changedFiles` answers `ChangedFile { change, path, previousPath }`; renames carry
  `previousPath`, paths relative to the folder (`/${rootName}/${path}` is the node path).
- `CompareState.changedFiles` holds the list in the renderer (a signal, not NgRx).
- `getDeltaFile(clone(fileStates))` → `DeltaGenerator.getDeltaFile(reference, comparison)` matches nodes
  by `path` only (`getReferenceNodesByPath`, `addExistingAndNewNodesToDeltaMap`).
- The inspector shows "renamed from <old path>" for the selected file (06-M6 task 4); the Changes list
  shows `old → new`. The map shows the old path as removed and the new one as added.

## Options

1. **Pairs in the file store (plan 06's assessment).** A new `files` field `renames: { from: string; to: string }[]`
   (node paths), set by `CompareWriteStore` with the git list and cleared when the comparison ends;
   `visibleFileStatesSelector`'s consumer in the lens gets it as a second input; `DeltaGenerator` keys
   each renamed reference node under its new path and overwrites `path` and `name` with the comparison
   node's, so `applyComparisonToReferenceNode` sees one changed node.
   - Cost: `files` is persisted (IndexedDB for uploads): the field must be transient (not saved, not
     restored) or a `DB_VERSION` bump with a migration; `actionsRequiringRerender` and
     `actionsRequiringSaveCcState` need a decision; the lens selector's memoisation now depends on the
     list (a list arriving after the map renders the delta twice).
2. **A transient slice outside `files`, read by a renderer selector.** Keep `structureTreeSelector` as
   is and remap in `renderer/renderModel` (allowed to read view state), after the delta: merge the
   removed node at `from` into the added node at `to`. Avoids the persisted home but duplicates delta
   arithmetic outside `DeltaGenerator` and works on the decorated tree (three clones already, see
   `visualization/LENS_DATA_RULES.md` section 3).
3. **Leave the map as it is.** The list and the inspector already name the rename; the cost of 1 or 2
   is high for a stretch item.

Recommendation for the owner: option 1 with a transient `files.renames` (no `DB_VERSION` bump, added
to the never-restored keys like `sharedView.changedFilesFilter`), because only `DeltaGenerator` should
do delta arithmetic.

## Steps (option 1, once approved)

- [x] Owner/designer decision recorded here (option, and whether a rename with metric changes keeps
      the "changed" colour or gets its own marker). **Owner, 2026-11-21: option 1** — a transient
      rename list in the file store (node paths `{ from, to }`), not saved and not restored, no
      `DB_VERSION` bump; only `DeltaGenerator` does the delta arithmetic. A renamed file with metric
      changes keeps the ordinary "changed" colouring, no new marker (the inspector line already names
      the rename).
- [x] `files.renames` transient field, reducer, action `setRenames`, selector; not saved, not restored;
      spec "should not report the renames as missing from a saved session"
- [x] `getDeltaFile(fileStates, renames)` and `DeltaGenerator` re-keying; specs "should match a renamed
      file to its old path", "should keep an unrelated removed file removed", "should ignore a rename
      whose old path is not in the reference map"
- [x] `structureTreeSelector` takes the renames; spec "should recompute the delta when the renames arrive"
- [x] `CompareWriteStore.setRenames` from `ChangedFilesService.load` (git source only), cleared with the
      changed-files filter on start, exit and deactivation
- [x] e2e in the fake bridge: a renamed file shows as changed, not as removed plus added
- [x] Changelog: extend "Changed files"

## As built (2026-11-21)

- **Where the list lives.** `files` is the array of file states, so it cannot carry a field. The list is
  its own top-level slice of the file store, `CcState.fileRenames: FileRename[]`
  (`stores/fileStore/store/fileRenames/`, action `SET_FILE_RENAMES` / `setFileRenames`), beside
  `files`, `isLoadingFile` and `currentFilesAreSampleFiles`. Not saved: `writeCcState` drops it
  together with `files` in one function (`withoutFileStore`). Not restored: the restore only applies
  the named slices, so a session saved without it has nothing missing (the plan's "missing keys" spec
  became "should leave the renames of the shown comparison out of the record"). Not in
  `actionsRequiringSaveCcState` or `actionsRequiringRerender`: the map re-renders because the
  accumulated data changes.
- **Selector.** `renamesOfTheDeltaSelector` hands the list to `structureTreeSelector` only in delta
  state and one frozen empty list otherwise, so leaving a comparison (head shown alone, then the list
  cleared) builds the single map once. `ChangedFilesService` never replaces an empty list with another
  empty one, which would rebuild the delta for nothing.
- **DeltaGenerator.** `getDeltaFile(reference, comparison, renames = [])`: before matching, each pair
  whose old path is only in the reference and whose new path is only in the comparison re-keys the
  reference node under the new path and takes the comparison node's `path` and `name`. A pair also
  applies reversed (reference holds the new path, comparison the old), so after "swap" the rename still
  matches without rewriting the list; the delta then shows the comparison's (old) path. Pairs that
  match neither way are ignored. Folders are left alone: a folder whose only file moved away stays as
  a removed, empty folder.
- **Compare.** `ChangedFilesService.load` sets the `renamed` entries (copies excluded) as node paths
  `/<root>/<path>`; `clear()` (was `clearFilter()`) drops the filter and the renames on start,
  deactivation and exit — on exit after the head is shown alone.
- E2E: "should show a file git renamed as one file at its new path, not as removed plus added"
  (`compare.e2e.ts`, sample1's `sample1OnlyLeaf.scss` → sample2's `ParentLeaf/sample2LeafMergedIn.kt`);
  checked to fail with the hand-off disabled.

## Out of scope

Copies (`C<score>`), renames across the two folders of a cross-folder comparison without a clone that
has both commits (no git list), and similarity thresholds (git's default `-M` is kept).
