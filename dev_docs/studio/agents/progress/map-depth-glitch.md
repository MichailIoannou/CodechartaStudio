---
name: Grey floor triangles cutting through buildings on the 3D map
state: complete
version: 1
---

## Goal

Find and fix the large grey triangles from the folder floors that cover buildings on the 3D map (owner's report,
desktop app on Linux, AMD GPU, ANGLE Vulkan and `--use-angle=gl`).

## Cause

`CodeMapMesh` set `material.precision = "lowp"`. three.js then prefixes both shaders with
`precision lowp float`, so the vertex shader computes the instance matrix, model-view and projection in low
precision. Desktop GPUs used to ignore that, but radeonsi (and RADV, through SPIR-V RelaxedPrecision) honour it and
compute in 16-bit floats (10-bit mantissa). The clip-space depth error then grows with the camera distance until
one triangle of a floor's top quad ends in front of a building: the glitch changes with the camera and gets worse
when zoomed out. The same reduced precision breaks the per-vertex lighting, which is why buildings looked almost
black (the `#820E0E` question was this bug, not the palette).

Evidence (scratchpad of session 6324e0ce, `glitchwork/`):

- A shader probe (`fp16probe.mjs`): `lowp`/`mediump` in a vertex shader compute in fp16 under ANGLE GL on the
  RX 9070 XT (radeonsi), fp32 under SwiftShader and, for that probe, under ANGLE Vulkan in Playwright's Chromium.
- `before-gl-out*.png` (feature/studio-next), `main-gl-out0.png` (main): floors over buildings, dark buildings.
- `after-gl-out*.png`, `electron-gl-fixed.png`: correct map with the fix, web and desktop.

The line dates from #1551 (image sharpening), so `main` and every release since have the bug. It is not caused by
the studio branch.

## Fix

The map material asks for `highp` explicitly. Unit test in `codeMapMesh.spec.ts` asserts the precision. No e2e
pixel check: CI renders with SwiftShader, which computes in fp32 whatever the shader asks for, so a screenshot there
cannot fail on this bug.

## Blank strip at the bottom (owner's later desktop run)

Not reproduced. The renderer and camera take `window.innerWidth/innerHeight` on start and on every `resize`,
unchanged from `main`; growing the window in Playwright and running Electron 44 with `--use-angle=gl` both kept
the drawing buffer equal to the window. WebGL's default framebuffer allocates depth with colour, so a depth buffer
of a different size cannot cause the triangles. A run without the glitch under `--use-angle=gl` most likely ran on
a different GL implementation (for example a GPU process fallback to software rendering, which computes in fp32);
the renderer string in `chrome://gpu` of that run would tell.

## Steps

- [x] Reproduce on the real GPU and with SwiftShader
- [x] Compare with `main`
- [x] Fix with a unit test
- [x] Changelog entry under Fixed (released bug)
