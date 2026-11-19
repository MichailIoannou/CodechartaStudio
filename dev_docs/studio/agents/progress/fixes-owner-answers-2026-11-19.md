---
name: Fixes from the owner's answers to O2, O3 and O5 (2026-11-19)
state: progress
version: 1
---

## Goal

Apply the owner's answers recorded in `design/open-questions.md` (2026-11-19) that change shipped code.

## Tasks

Branched from `feature/studio-stack`. The answers are in the main checkout's `design/open-questions.md`
(uncommitted owner edits at the time of writing; read them there:
`/home/mike/Programming/CodeChartaStudio/dev_docs/studio/agents/design/open-questions.md`, items O2, O3, O5
addendum).

1. O2.1 — the desktop tools native picker title becomes "Choose <tool>" (e.g. "Choose git") instead of
   "Choose the <tool> executable" (`features/desktopTools`).
2. O2.4 — a custom tool path whose file is missing reads "Custom path not found: <path>" instead of "not found on
   PATH" (desktop tools panel; check whether the core's doctor report distinguishes the case — if not, derive it
   in the renderer from the tool source being custom).
3. O3 second question — Darcula and VS Dark get their own neutral dependency-graph palettes matching their
   chrome instead of the shared slightly blue dark one (`util/theme/themes.ts`, palette builders; `themes.spec.ts`
   contrast checks must stay green; data-only where possible).
4. O5 addendum first part — remove the 4 GiB size check on dropped files so dropped and picked imports behave
   the same (`electron/shellPolicy.js` `isDroppedFileSize` / `MAX_DROPPED_FILE_BYTES`, its tests).
5. O5 addendum second part — "Look for commit… in another folder" (open/import dialog, 03-M6): cancelling the
   following step also removes the just-created project (`projects.delete`, recycle bin).

Not here (later milestones): O4 (recycle-bin failure toast and working-folder-only clean-up → 05-M6 renderer),
O6/O7 (02-M7, in progress).

## Steps

- [ ] 1. Picker title
- [ ] 2. Custom path not found
- [ ] 3. Darcula and VS Dark graph palettes
- [ ] 4. No drop size limit
- [ ] 5. Cancel removes the just-created project

## Notes

