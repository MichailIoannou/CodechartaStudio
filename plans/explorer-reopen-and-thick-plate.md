---
name: Fast explorer re-open and a thicker map base
state: complete
version: 1
---

## Goal

Re-opening the collapsed explorer must not freeze the app, and the 3D map's root floor gets a visible
slab that grows downward, as the owner's user-script does.

## Tasks

### 1. Explorer re-open
- Measure collapse → expand on a large map with many open folders (Playwright, long tasks, CPU profile),
  compare older builds to rule out the compact bar and nav fit.
- Keep the expanded content alive while collapsed (hidden with `content-visibility: hidden`, same size,
  out of flow) instead of destroying and rebuilding every rendered tree row.
- Unit tests (tree survives collapse, content hidden and inert while collapsed), e2e that expanding keeps
  the same tree rows.

### 2. Thicker map base
- Named uniform for the root floor's thickness in the vertex shader (instanced and plain paths), set by
  the mesh; root floor = the only geometry at y = 0.
- Check picking, bounding box / centre-map fit, screenshots, export, delta mode, side lighting.
- Unit tests for the uniform wiring and bounding box.

### 3. Changelog and checks
- Fixed entry for the re-open freeze (shipped in 2.11.0), Changed entry for the thicker base.
- format, gate, unit, lint, tsc, build, e2e of the touched areas.

## Steps

- [x] Complete Task 1: Explorer re-open
- [x] Complete Task 2: Thicker map base
- [x] Complete Task 3: Changelog and checks

## Notes

- Before: 3 builds (fe460f811, ed5d9c48b, current) all ~0.37 s for 1,270 rows and ~2.7 s for 10,070 rows.
- After: ~0.04 s for 1,270 rows, ~0.19 s for 10,070 rows. Chrome restyled every row on a class change on the
  host or the content and on a sibling being inserted, so hiding uses inline styles and stable wrappers.
- The base depth is 48 map units like the owner's script; on large maps (which lay out much wider) it reads thin.
