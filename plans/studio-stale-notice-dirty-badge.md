---
name: Studio stale notice for a restored snapshot, and a dirty badge that explains itself
state: complete
version: 1
---

## Goal

After the current checkout moves away from a restored (or opened) snapshot, the workspace status and the
stale notice say how far the map is from the current checkout and offer to analyse it. The badge for an
analysis of uncommitted changes says what it means when hovered.

## Tasks

### 1. Compare a snapshot target with the current checkout
- Measure the shown snapshot's commit against HEAD (`git.measureDistances`) while the target is one snapshot
- Turn the distance into a nearest-like resolution for the notice and W1 (badge, title "… behind the current checkout")
- Notice "No analysis of the current checkout — …" with "Analyse current checkout" only while HEAD has no analysis;
  the action switches the target to the current checkout and analyses it

### 2. Badges explain themselves
- Uncommitted-analysis chip text from `noticeText`, "uncommitted" instead of "dirty"
- Every W1 badge carries a hint used as `title` (badge and icon-only dot) and in the aria-label

### 3. Tests, docs
- Unit tests first, e2e with the fake bridge (restored snapshot + HEAD moved; dirty badge title)
- Changelog entry rewrite if needed, progress note

## Steps

- [x] Complete Task 1: Compare a snapshot target with the current checkout
- [x] Complete Task 2: Badges explain themselves
- [x] Complete Task 3: Tests, docs

## Notes

- HEAD changes made outside the app arrive through the window-focus refresh of the git status; no core change.
- The comparison lives in `CheckoutComparisonTracker` and the badge rules in `triggerBadge.ts`, which keeps
  both files below the complexity gate.
- Designer questions and details: `dev_docs/studio/agents/progress/stale-notice-dirty-badge.md`.
