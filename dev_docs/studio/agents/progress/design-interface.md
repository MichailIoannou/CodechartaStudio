---
name: Studio interface design (designer agent)
state: progress
version: 1
---

## Goal

Produce the interface design for plans 01–06 under `dev_docs/studio/agents/design/`, following
`DESIGNER.md`: enhance the existing shell, never redesign it. Design documents only, no code.

## Tasks

### 1. Principles
- `design/00-design-principles.md`: regions, z-layers, spacing, icons, wording, dark/light checks.

### 2. Areas, in this order
- 03 projects, 04 history, 05 snapshots, 06 compare, 02 themes, 01 desktop tools.
- Each area file: placement, wireframe, all states, keyboard, wording, data needs, deviations.

### 3. Bookkeeping
- `design/open-questions.md`, `design/STATUS.md`; one commit per area.

## Steps

- [x] Read README, overview, DESIGNER brief, UI sections of plans 01–06, existing UI source
- [x] Task 1: principles
- [x] Task 2: area 03 projects
- [x] Task 2: area 04 history
- [x] Task 2: area 05 snapshots
- [ ] Task 2: area 06 compare
- [ ] Task 2: area 02 themes
- [ ] Task 2: area 01 desktop tools
- [ ] Task 3: open questions and STATUS kept current; `DESIGN COMPLETE` when all are ready

## Notes

- The repository `CLAUDE.md` asks for a plan file in `plans/`; the studio README (rule 5) redirects
  that to this folder, so this file is it.
- Status per area lives in `design/STATUS.md`, which the orchestrator reads.
