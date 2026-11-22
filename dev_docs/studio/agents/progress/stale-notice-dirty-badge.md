---
name: Stale notice after a switch or pull, and a badge that explains uncommitted analyses
state: complete
version: 1
---

## Goal

Owner report: after `git switch` + `git pull` in a terminal, a Studio project showed no "stale by N"
and no stale notice; the "dirty" badge did not say what it meant. Branch
`fix/studio-stale-notice-dirty-badge` from `feature/studio-next`.

## Root cause

A folder with a remembered snapshot starts with the target `{ kind: "snapshot" }`
(`snapshotViewRules.firstTargetOf`), and so does every snapshot opened from S4 or put on the map by
something else. A snapshot target has no analysis target, so it was never resolved and never compared
with HEAD: `noticeTextFor` got no resolution and `stalenessOf` returned null. The app did learn the new
HEAD (the git status is read again on window focus and after app-run git operations); only a
`workingTree` target was re-resolved against it (`resolutionKeyOf`). No core change was needed.

## As built

- `CheckoutComparisonTracker` (`features/snapshots/services/`): while the target is one snapshot with a
  commit and HEAD differs, it measures the commit against HEAD with `git.measureDistances`
  (`GitRepositoryService.distanceOf`) and words the result as a `nearest` resolution of the current
  checkout (`checkoutResolutionOf`). `SnapshotViewService.comparedResolution` is the resolution W1
  compares with.
- Notice: "No analysis of the current checkout — showing <s> (<subject>), stale by N commits." with
  "Analyse current checkout", only while HEAD has no clean analysis in the catalog; the action makes the
  current checkout the target and analyses it. W1 badges the distance whether or not HEAD is analysed,
  and its title says "Map shows <s> <subject>, N commits behind the current checkout".
- Badges (`workspaceStatus/util/triggerBadge.ts`): every W1 badge has a `hint` used as `title` on the
  badge, on the icon-only dot and in the menu, and lowercased in the trigger's `aria-label`. An
  uncommitted analysis reads "uncommitted" (`UNCOMMITTED_ANALYSIS_CHIP` in `noticeText.ts`), titled
  "Map is an analysis of uncommitted changes on <short sha>"; the trigger title adds "with uncommitted
  changes" to the map line.
- `GitRepositoryService.headCommitOf` replaces three copies of the HEAD lookup.
- E2E (`snapshots.e2e.ts`): restored analysis + moved HEAD shows badge, title and notice and analyses
  the checkout; uncommitted badge title.

## Designer questions

1. The "What the map follows" table says a restored project shows its snapshot with "no notice unless
   the target has none", and that a switch or pull leaves a non-checkout target unchanged. Built
   instead (owner's expectation): a snapshot target away from HEAD gets the W1 distance badge and, while
   HEAD has no analysis, the S2 notice. Should an explicitly opened (S4) snapshot also get the notice,
   or only the badge?
2. When HEAD has an analysis of its own but the map shows an older snapshot, only the badge shows. Should
   the notice offer "Show current checkout" there?
3. Plan 05's chip for a dirty working-tree analysis is `dirty`; built "uncommitted" (as S4's flag and
   the design's "uncommitted-analysis" name). Confirm the word and the hint texts
   ("Map is 4 commits behind the current checkout", "Map is an analysis of uncommitted changes on
   a1b2c3d", "This folder has no analysis yet", …).
4. The distance comes from git, not from the snapshot resolution, so a snapshot of another profile is
   not marked "· profile" in this case.
