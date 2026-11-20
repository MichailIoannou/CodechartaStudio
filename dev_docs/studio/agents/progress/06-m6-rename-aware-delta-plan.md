---
name: 06-M6 task 6 — rename-aware delta (working plan, not started)
state: todo
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

- [ ] Owner/designer decision recorded here (option, and whether a rename with metric changes keeps
      the "changed" colour or gets its own marker)
- [ ] `files.renames` transient field, reducer, action `setRenames`, selector; not saved, not restored;
      spec "should not report the renames as missing from a saved session"
- [ ] `getDeltaFile(fileStates, renames)` and `DeltaGenerator` re-keying; specs "should match a renamed
      file to its old path", "should keep an unrelated removed file removed", "should ignore a rename
      whose old path is not in the reference map"
- [ ] `structureTreeSelector` takes the renames; spec "should recompute the delta when the renames arrive"
- [ ] `CompareWriteStore.setRenames` from `ChangedFilesService.load` (git source only), cleared with the
      changed-files filter on start, exit and deactivation
- [ ] e2e in the fake bridge: a renamed file shows as changed, not as removed plus added
- [ ] Changelog: extend "Changed files"

## Out of scope

Copies (`C<score>`), renames across the two folders of a cross-folder comparison without a clone that
has both commits (no git list), and similarity thresholds (git's default `-M` is kept).
