---
name: 02-M2 no-flash boot for non-default themes
state: complete
version: 1
---

## Goal

A user who picked a non-default theme sees it from the first frame, without a dark flash on start
(plan 02, Milestones, M2).

## Tasks

Copied from `02-themes.md`, Milestones, M2. Design: `design/02-themes.md`, `design/00-design-principles.md`
(design wins over the plan). From `02-m1-dark-by-default.md`: the mirror is already written by
`ApplyThemeEffect` and `index.html` already falls back to the cc-dark colours; only `themeBoot.js`, its
script tag and its spec remain. From `02-m0-spike.md`: a `<script src="codeCharta/themeBoot.js">` in
`<head>` passes the CSP in the web build and in Electron.

1. `public/codeCharta/themeBoot.js`, the `<script>` tag, `themeBoot.spec.ts`, the e2e "should start in the
   saved light theme without a dark frame"

## Steps

- [x] 1. No-flash boot

## Notes

- `themeBoot.js` (36 lines, ES5) reads `codeCharta.themeBoot` (shape from `themeBootMirror.repo.ts`: `{version, preference, light, dark}` with `id/background/content/track/accent`), validates id and colors, sets `data-theme` and the four `--cc-boot-*` properties. Without a valid mirror it sets the `cc-dark` values itself (plan's fallback; same as the `index.html` ones, so visually a no-op).
- `public/` is copied into the build root (`dist/bundler/browser/codeCharta/themeBoot.js`); the `<script>` is in `<head>` before `<style>`, CSP unchanged. `app.e2e.ts` and the desktop smoke stay green.
- The spec also pins the script's line count (40) and the order of script tag and `<style>`.
- Gates: format:check, npm test (658 suites), lint, tsc, build + e2e:ci (156 passed, chromium channel), test:electron (42), e2e:desktop (10).
