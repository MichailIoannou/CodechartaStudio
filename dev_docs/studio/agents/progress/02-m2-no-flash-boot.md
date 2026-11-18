---
name: 02-M2 no-flash boot for non-default themes
state: progress
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

- [ ] 1. No-flash boot

## Notes

