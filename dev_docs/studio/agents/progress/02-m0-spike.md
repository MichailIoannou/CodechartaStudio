---
name: 02-M0 themes spike
state: complete
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

- [x] 1. Today's build recorded
- [x] 2. Theme registration spelling confirmed
- [x] 3. Boot script and CSP checked
- [x] 4. Screenshot with color-mix checked

## Notes

Environment: Linux, node 26.13, npm 12. `cd visualization && npm ci && npm run build` worked. Paths re-verified:
`app/tailwind.css` (`@theme` daisy token lines are 19-38 as the plan says), `app/index.html` (`data-theme="codecharta"`, CSP
meta, `<base href>`), `dist/bundler/browser/styles-*.css`, `app/app.e2e.ts`, `screenshot.service.ts` (uses `html2canvas-pro`).
All experiments were throwaway and reverted (`git status` clean under `visualization/`).

Test-harness findings that matter for later milestones:
- The e2e config asks for `channel: "chrome"` (real Google Chrome at `/opt/google/chrome`), which is not installed here and
  cannot be installed without a system-wide change. For the spike I temporarily set `channel: "chromium"` in
  `playwright.config.ts` and installed Playwright's own chromium into the project only:
  `PLAYWRIGHT_BROWSERS_PATH=$PWD/node_modules/.cache/ms-playwright npx playwright install chromium`. Run e2e with the same
  variable. Headless WebGL needs `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader` for my own scripts
  (the e2e suite itself worked without extra flags).
- With npm 12 Electron is not downloaded on install; `node node_modules/electron/install.js` fixed it.

### 1. Today's build

- `grep -o '"version": "[^"]*"' node_modules/daisyui/package.json` -> **daisyUI 5.7.42** (package.json says `^5.5.19`).
- Built CSS `[data-theme...]` blocks: only daisyUI's two built-ins, `[data-theme=light]` and `[data-theme=dark]`, plus bare
  `[data-theme]` rules. No `codecharta` block (confirms `data-theme="codecharta"` is unknown). `color-scheme:light` appears in
  the default `:root` block, `color-scheme:dark` in the `dark` block and in `@media (prefers-color-scheme: dark){:root:not([data-theme])...}`
  (not applied while `data-theme` is set).
- Playwright script reading `getComputedStyle(document.documentElement)` on the built app:
  `data-theme=codecharta`, `color-scheme: light`, `--color-primary: oklch(45% .24 277.023)` (= daisy purple `#422ad5`, not
  `#1b9cfc`), `--color-base-100: oklch(100% 0 0)`, `--color-base-300: oklch(95% 0 0)`.
- The eight non-color tokens: `--radius-selector: .5rem`, `--radius-field: .25rem`, `--radius-box: .5rem`,
  `--size-selector: .25rem`, `--size-field: .25rem`, `--border: 1px`, `--depth: 1`, `--noise: 0`.
- Finding: plan 02 "Current state" holds and its token values (0.5rem/0.25rem/0.5rem/0.25rem/0.25rem/1px/1/0) are right.
  Side finding: `app/tailwind.css` `@theme` lines also leak into utilities, see item 2.

### 2. Throw-away theme registration

- Edited `app/tailwind.css`: `@plugin "daisyui" { themes: false; }` then two `@plugin "daisyui/theme"` blocks (`cc-dark` with
  `default: true; prefersdark: false; color-scheme: dark;` and `cc-light` with `default: false`), all 20 color tokens from the
  plan's "Token values" plus the eight non-color tokens; `index.html` `data-theme="cc-dark"`. Build compiled (only the usual
  budget and "Could not parse 56 selectors" warnings, which are unchanged).
- Built CSS now: `[data-theme]` selectors are only `[data-theme=cc-dark]` and `[data-theme=cc-light]`; no `light`/`dark`
  block, no `prefers-color-scheme` rule. The default is emitted as
  `:where(:root),:root:has(input.theme-controller[value=cc-dark]:checked),[data-theme=cc-dark]{color-scheme:dark;...}`.
  So `themes: false` is **accepted exactly as the plan spells it**, and `:root` gets `cc-dark`.
- Browser check (computed style): `data-theme=cc-dark` -> `color-scheme: dark`, `--color-primary: #8b9cff`,
  `--color-base-100: #1e2329`; with `data-theme=cc-light` set at DOMContentLoaded -> `light`, `#0374c9`, `#ffffff`, `#d1d5db`.
  The eight non-color tokens are unchanged in both. No console errors.
- Deleting `@theme` lines 19-38 (also removed the "DaisyUI theme colors" comment): build fine, `.bg-primary`,
  `.border-base-300`, `.text-primary` still compile (`background-color:var(--color-primary)` etc.), and the `/N` opacity
  variants too (`.bg-primary\/10`, `.border-base-300\/50`, `.text-base-content\/60`). So **the lines can go**.
  Difference worth knowing: with the lines present, Tailwind inlines the `@theme` hex as the `color-mix(in srgb,#1b9cfc 10%,transparent)`
  fallback of every `/N` utility (light-theme colors baked in, only used by browsers without `color-mix(in lab,...)`); without
  them the fallback is the plain `var(--color-primary)`. Deleting is strictly better for theming.
- Design check: "daisyUI registration" and "Token values" hold unchanged. No fallback spelling needed.

### 3. Boot script and CSP

- Added `public/codeCharta/themeBoot.js` (one line) and `<script src="codeCharta/themeBoot.js"></script>` right after
  `<base href="./" />` in `<head>` (before the `<style>`). To prove the script really runs I made it set `data-theme=cc-light`
  while `index.html` says `cc-dark`.
- Built `index.html` keeps the tag: line 13 `<script src="codeCharta/themeBoot.js"></script>`, inside `<head>` (line 3), before the
  `<style>`; the file is copied to `dist/bundler/browser/codeCharta/themeBoot.js`. The CSP meta tag was not changed.
- `npm run build && PLAYWRIGHT_BROWSERS_PATH=... npm run e2e:ci -- app/app.e2e.ts --reporter=list` (with the throwaway channel
  change): `1 passed` ("should not have errors in console"). A page load over HTTP showed `data-theme=cc-light`, i.e. the script ran.
- `npm start` equivalent: `electron --no-sandbox --remote-debugging-port=9333 dist/bundler/browser` (file:// origin, display
  :1), attached with Playwright `connectOverCDP`: `data-theme` = `cc-light` and `--color-primary` = `#0374c9` after boot, the
  script tag present, no CSP message in Electron's output. A blocked script would not have run, so `'self'` covers it under `file://`.
- Finding: plan 02 "No-flash boot" holds, including "CSP meta tag is not changed". Placing it before `<style>` works.

### 4. Screenshot with `color-mix()` labels on `cc-dark`

- Throwaway Playwright script (web build, headless chromium with swiftshader): load the sample map, set
  `document.documentElement.dataset.theme="cc-dark"` by hand, inject two labels into `#codeMapLabels` styled like the planned
  M1 label (`background: color-mix(in srgb, var(--color-base-100) 85%, transparent)`, `color: var(--color-base-content)`,
  `border: 1px solid color-mix(in srgb, var(--color-base-content) 30%, transparent)`), one plain and one with
  `backdrop-filter`, then click the real "Screenshot" button in the metrics bar and save the download
  (`sample1_sample2_map.png`, 600x530). No console errors.
- Image, looked at: the plain `color-mix` label renders correctly as a dark rounded pill (about `#1e2329` at 85%) with light
  text and a visible light border, identical to the live DOM label in a page screenshot. So **`html2canvas-pro` copes with
  `color-mix(in srgb, var(...) N%, transparent)`** including inside `border`. The existing real labels (backdrop-filter) came
  out white with dark text, because `prepareLabelsForScreenshot` forces `background: white` and a dark border. The injected
  backdrop-filter label came out white with **light grey text that is unreadable**: the service overrides only the background,
  not the text color, so under a dark theme every live label would be unreadable in the screenshot. The floor/folder names
  ("root", "sample2.cc.json") are drawn in the canvas as light text and the PNG background is transparent (the dark map background
  is not in the image, as the plan expects).
- Design check: the fallback (palette hex in `cssText`) is **not needed** for `color-mix()`. Plan 02 M1 task 7 / "Renderer changes"
  must keep the screenshot-time override, and it must set `color` (and `border`) from `buildingLabel` (background, text, border),
  not just the background, as the plan's `buildingLabel` palette field already implies. Light themes need no change. The hover
  tooltip (`hoverTooltip.service.ts`) also uses `color-mix` and `backdrop-filter`, but is not part of the screenshot.

### Summary for M1

No design change is required. Confirmed: daisyUI 5.7.42, `themes: false` works as written, `@theme` lines 19-38 can be deleted
(and should, to drop the baked light hex fallbacks), `themeBoot.js` passes CSP in web and Electron, `html2canvas-pro` handles
`color-mix()`. Points to carry into M1: (a) the screenshot override must also set the label text color; (b) the e2e suite needs real
Chrome (`channel: "chrome"`); without it use the throwaway override above; (c) the `/N` utilities' hex fallback disappears with
the `@theme` lines.
