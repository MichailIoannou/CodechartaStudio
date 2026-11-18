---
name: 02-M0 themes spike
state: progress
version: 1
---

## Goal

Answer the build-level unknowns of plan 02 (daisyUI version and theme syntax, CSP for a boot script,
screenshots with `color-mix()`) without shipping any change.

## Tasks

Copied from `02-themes.md`, Milestones, M0. Results go in this file's Notes (not in the plan file).

### 1. Today's build
- daisyUI version, existing `[data-theme=…]` blocks, the eight non-color token values.
### 2. Throw-away theme registration
- `themes: false` (or the working spelling) with `cc-dark` / `cc-light`; whether `@theme` lines 19-38 can go.
### 3. Boot script and CSP
- `<script src="codeCharta/themeBoot.js">`: no CSP error in `npm run build && npm run e2e:ci -- app/app.e2e.ts` or `npm start`.
### 4. Screenshot with `color-mix()` labels on `cc-dark`

## Steps

- [ ] 1. Today's build recorded
- [ ] 2. Theme registration spelling confirmed
- [ ] 3. Boot script and CSP checked
- [ ] 4. Screenshot with color-mix checked

## Notes

