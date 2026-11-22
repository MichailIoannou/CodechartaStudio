---
name: 02/03/05/06 follow-up — nav bar and metrics bar fit
state: complete
version: 1
---

## Goal

Owner follow-ups of 2026-11-22 (`design/00-design-principles.md` §3 "Narrow window", `03-projects.md` P1,
`05-snapshots.md` W1, `06-compare.md` C2, `02-themes.md` T4 "Layout", "Narrow map", "T4 compact bar"; mock-up
`mockups/nav-and-bar-fit.html`).

## Steps

- [x] 1. Nav bar: folder-only project menu, no commit in W1, fixed logo, `NavBarFit`
- [x] 2. Metrics bar: layout glyph only, card minimums, measured compact threshold, 74 px, switch animation
- [x] 3. Unit tests, e2e, changelog

## Notes

Branch `feature/studio-nav-and-bar-fit` from `feature/studio-next`. Plan: `plans/studio-nav-and-bar-fit.md`.

### 1. Nav bar
- `cc-project-switcher` shows only the working folder (`data-fit-label`), `shrink-0`; inputs `labelMaxWidth` and
  `iconOnly` replace `isIconOnlyBelowXl`. In the icon-only form the label stays as `sr-only`, so the trigger keeps its
  accessible name.
- W1: no `@ sha` (the commit stays in the `title` and the dropdown; it also left the `aria-label`), a fixed `18rem`
  set as an inline width, `width` input from the fit, ↑↓ counts only at the full width, branch and dirty dot at every
  width (no breakpoints any more), badge as a `size-2` dot on the icon in the icon-only form (also during a
  comparison). Its host declares its widths for the fit: `data-fit-full="18"`, `data-fit-narrowest="9"`,
  `data-fit-compact="3.25"` (rem).
- Comparison chip: sized by its content; `width` and `labelsOnly` inputs from the fit; labels `min-w-10 flex-auto`
  (`flex: 1 1 auto`, so a content-sized chip gets its labels' natural width and they share a narrowed one); the compare
  and PR icons are `fa-fw` in a wrapper that is `hidden` in the labels-only form (`hidden` on the icon itself loses
  against Font Awesome's `display`).

**Deviation 0 (needs the designer):** at 1024 px during a comparison, logo, divider, the icon-only project menu, the
icon-only W1 and a labels-only chip whose labels keep `min-w-10` do not fit beside the view tabs (about 15 px short with
the stale dot). The labels-only form therefore lets its labels shorten to `min-w-8` (the old below-1280 value) and uses
`gap-1 px-2`. While it shows that form, the fit decides by the widths last measured in the full form, so the two forms
cannot alternate.
- Logo: host and link `shrink-0`, image `h-8 w-11 max-w-none`.
- `NavBarFit` (`features/navBar/services`, provided by `cc-nav-bar`): a `ResizeObserver` on `navbar-start` plus a
  `MutationObserver` on its content (folder renamed, comparison started, map slot changed, fonts loaded) schedule one
  fit per animation frame. `measureNavBarRoom` measures so that the result does not depend on the step shown (chrome =
  trigger minus label, or icon-only plus gap; the room in whole pixels from the exact width, since `clientWidth` rounds
  up), and the pure `fitNavBar`
  picks the first step that fits: folder name down to 6 characters + "…" (canvas text measurement, shared
  `measureTextWidth`), project icon-only, map slot between 18rem and 9rem, map slot compact. During a comparison the
  icon-only W1 counts as a fixed part and the chip is the map slot. Widths transition over 200 ms
  (`motion-reduce:transition-none`). The web build has no `data-fit-project`, so the fit leaves it as it is.

### 2. Metrics bar
- Layout cell: label "LAYOUT", the current layout's glyph (`size-5`) and a caret; `title` = `aria-label` = "Layout ·
  <layout>".
- Card minimums: the metrics bar provides `SHORTEST_CARD_NAME_CHARACTERS` (12); an axis card that gets it sets its
  inline `min-width` after each render where the metric name or label changed (and once the web fonts are loaded) to the
  widest of its label row, its meta value (both read at `max-content`) and the first 12 characters of the name plus
  "…" (canvas). The domain and dependency bars do not provide it and stay as they were. The labels/scenarios cell keeps
  its two label rows whole the same way; its scenario count is the only thing in it that shortens. Link button and
  tools are `shrink-0`; the tools grid stays 2 × 2.
- `CompactBarDirective`: compact when the free width (same probe as before; *superseded 2026-11-22: the room around the window centre, see `02-bar-window-centre.md`*) is below the full bar's minimum, full again
  at minimum + 32 px. `measureFullBarMinimum` only reads: padding, border and gaps plus every flex item (`display:
  contents` flattened, fixed/absolute left out) at its inline minimum if it can shrink, else at its width. It is
  measured on every free-width change and, through a `MutationObserver` (children, text, `class`, `data-revealed`),
  when the cells change, while the full form shows; the compact form keeps the last value.
- 74 px: the metrics bar host is `h-[4.625rem] py-0` in both forms, its axis cards `py-0` and centred; compact groups
  `self-center` with `gap-x-0.5 gap-y-1.5`, the compact layout button 62 px tall, no gap between items in the compact
  form and `mx-1` on the dividers.
- Switch animation (`barSwitchAnimation.ts`, Web Animations API, id `bar-switch`): before the swap it records the bar's
  width and each `[data-bar-icon]` / tool button's rect and clones the old form into an inert ghost (no popovers,
  dialogs, ids, test ids, anchor names; icons hidden); after the next render the ghost fades out in 85 ms, the bar's
  width animates from old to new (overflow clipped meanwhile), every icon translates from its old centre (FLIP) and
  every `[data-bar-text]` fades in from 40 % of the 240 ms. A switch during a running one finishes it first. Reduced
  motion, or no `Element.animate`, swaps instantly.

**Deviation 1:** the animation runs from the shared `CompactBarDirective` (a host directive of `cc-metrics-bar`, the
only bar that uses it), not from the metrics bar component class: the directive is where the switch is decided, so it
can record the old form before the swap.

**Deviation 2:** while compact, the full bar's minimum is the one last measured in the full form. A metric picked in
the compact bar whose name makes the full bar wider can make the bar return to the full form at the old threshold and
turn compact again once.

**Deviation 3:** to fit the full form into 74 px, the labels/scenarios cell lost its separator line, its rows are packed
(`gap-0.5`) and the scenario count is `text-xs`.

**Deviation 4:** with the sample map the full bar's minimum is about 800 px in the app (the mock-up says 732): the app's
cells keep `px-3` and the shell its `gap-1`.

Known: while the window is dragged narrower the triggers' 200 ms width transition can reach a few pixels under the view
tabs until it ends; once settled they never do (e2e checks this from 1600 to 760 px).

### 3. Verification
- e2e: `features/navBar/e2e/navBarFit.e2e.ts` (give-way order 1600 → 760 px, no overlap with the view tabs once settled,
  logo 44 × 32 px at every width; folder only and no commit in W1), `e2e/compactMetricsBar.e2e.ts` (compact between the
  panels; still compact at 24 px above the switch width, full at 40 px above it; 74 px in both forms; switch animates,
  instant with reduced motion).
- Gate results: see the round report.
