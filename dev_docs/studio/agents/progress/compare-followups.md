---
name: Compare follow-ups — quality gate and the designer's answers O9.5 / O9.8
state: complete
version: 1
---

## Goal

Bring the compare files under the quality gate, then build C2 revision 2 and the other O9.5 / O9.8 answers
(`design/06-compare.md`, `design/mockups/compare-chip-before-after.html`).

## Steps

- [x] Gate (structural): `compareDialog.component.ts` 131 → 64 (folder row → `CompareFolderChoice` +
      `cc-compare-folder-row`, lists → `cc-compare-lists`); `compare.service.ts` 106 → 80 (`typedSides.ts`,
      `shownSides.ts`, `compareErrors.ts`)
- [x] C2 revision 2: one button (base → head, stale dot, PR icon, caret), `w-32` / `xl:w-56` / `2xl:w-72`, compare and PR
      icons only from 1280 px; details in a `role="dialog"` dropdown (base mode, side rows with short commit, label,
      analysed / stale badge, "showing …", Change…, Swap, PR link, Copy as text, Leave compare; git line in the
      noDifferences form); ArrowDown opens, Escape closes and refocuses
- [x] Project menu icon-only below 1280 px during a comparison (`ProjectSwitcherComponent.isIconOnlyBelowXl`, set by the
      nav bar)
- [x] C7 "Pull requests cannot be listed here. Enter a number to open one." (GitLab: "Merge requests …")
- [x] C8 Changes rows follow inverted delta colours
- [x] Imported side label from the store import time (`createdAt`)
- [x] Ref picker: three newest working-tree analyses (imports all listed)
- [x] Differing folders in the chip's title and dropdown rows
- [x] Folder checkbox right after the folder select
- [x] C10 inspector git line: badge, "renamed from <old path>", no "in git"
- [x] C11 wording: success toast "Removed 4 fetched pull requests.", error toast with Details
- [x] E2E: the chip at 1920 / 1280 / 1024 px (mouse only): width per breakpoint, no overflow, left of the view tabs,
      project menu label shown / hidden, details and Leave compare reachable
- [x] Changelog, user docs

## Notes

### Readings of the design
1. **Merge-base side in the chip** is named by the branch it came from (`baseTip`): "main → feature/x", title
   "Base: main (9f8e7d6)", as the mock-up shows; after Swap the former base is named by its short commit again.
2. **Button labels** follow C2: branch, tag, `#123` / `!123`, "working tree", "imported 12 Nov"; the dropdown row keeps
   "PR #123" beside the short commit.
3. **Dropdown "showing" line** sits under the side's row ("showing 3c4d5e6, 2 commits older"), as in the mock-up; the
   badge keeps the full stale sentence as its `title`.
4. **PR line** reads "Pull request #7 ↗" (no request title is known without a listing).
5. **Swap** keeps the dropdown open so the swapped rows are visible; Change…, Copy and Leave close it.
6. **C10 for a rename** shows the badge "renamed" and the text "renamed from <old path>" (literal C10); a copy reads
   "copied from <old path>".
7. **Folder checkbox** comes directly after the base folder select; with it checked the head folder select follows it.

### Deviations / open
- **C11 "only when such refs exist"** is not built: no core method tells whether `refs/codecharta/` holds refs, and
  `FolderAction.isOfferedFor` is synchronous. The item is still offered for every present git folder; with nothing to
  remove the toast says "'billing-api' has no fetched pull requests." Needs a core count (for example in
  `hosting.status` or a new `hosting.fetchedRefs`).
- At 1024 px an unnamed button of the collapsed inspector (`aria-hidden` panel header) draws over the top of the
  chip's dropdown (panels area, seen in the e2e screenshot); not changed here.

### Shared files touched (small, additive)
`features/navBar/components/navBar/navBar.component.html` (one input binding) and its spec stub,
`features/projects/components/projectSwitcher` (one input, two class bindings), `CHANGELOG.md`, the gh-pages compare doc.
No fake-bridge change.

## O11 tweaks

Designer answer of 2026-11-22 (O11.2), branch `feature/studio-o11-tweaks`.

- C10 says "renamed" once: the inspector git line is the worded badge plus "from <old path>" (a copy: "copied" badge,
  "from <old path>"). Reading 6 above is superseded. `fileGitChange.component.spec.ts` covers rename and copy.
- C11 (no core count), the PR line, Swap and the z-order bug are not part of this change.
