---
name: 02 follow-up — metrics bar centred on the window
state: complete
version: 1
---

## Goal

Owner change of 2026-11-22 (designer commit 5da1c2620; `design/02-themes.md` T4 "Position" and "T4 compact bar" →
"When", `open-questions.md` O7, mock-up `mockups/nav-and-bar-fit.html`): the bar is centred on the window again, as
upstream #4557 has it; its room is the width around the window centre that no open panel covers, and the compact bar
takes over below the full bar's minimum, so no panel covers the bar.

## Steps

- [x] 1. Bar shell centred on the window, capped at the room around the centre
- [x] 2. Compact switch measures that room
- [x] 3. Unit tests, e2e, changelog

## Notes

Branch `feature/studio-bar-window-centre` (from `feature/studio-next`). Plan: `plans/studio-bar-window-centre.md`.

- `ccBarShell`: `fixed left-0 right-0 mx-auto` again (no inline `left`/`right`, no `transition-[left,right]`: the bar no
  longer moves when a panel opens). `max-width` is `max(min(30rem, 100vw − 12px), min(95vw, 1200px, room))` with
  room = `100vw − 2 × max(left inset, right inset) − 12px` (the spec's `2 × min(centre − left inset, width − right
  inset − centre)` minus the 6 px island margin on each side, as the free width had before). `WIDER_PANEL_INSET`
  is exported for the probe.
- `CompactBarDirective`: the hidden probe is inset by `WIDER_PANEL_INSET` on both sides (plus the 6 px margins), so
  its `ResizeObserver` reports the room on every panel open, close or resize and window resize. Hysteresis (+32 px),
  74 px height and the 240 ms switch are unchanged. Names say "room" instead of "free width"
  (`isCompactInRoom`, test id `bar-room-probe`).
- `publishBarInset` and the panels are unchanged: they still publish their covered width.
- Domain bar and dependency bar use the same shell (T4: "use the same shell"), so they are window-centred too and
  capped at the same room. They have no compact form: below the 30rem floor they still reach under a panel, as before.
- Legend drawer (anchored to the window's right edge and the bar's height) and file extension bar (full width) do not
  depend on the bar's horizontal position; unchanged.

**Deviation 1 (consequence of the spec, worth knowing):** the Playwright project spreads `devices["Desktop Chrome"]`,
so web e2e runs at 1280 × 720, not at `E2E_VIEWPORT`. There the open explorer alone leaves 1280 − 2 × 326 − 12 =
616 px of room, so the metrics bar is compact by default (it was full with 942 px free before). E2e specs that work
with the full bar's cards (`metricsBar`, `scenarios`, `radialMap`, `loadPipeline`, one `compare` test) now widen the
window first through `MetricsBarPageObject.widenWindowForTheFullBar()` (to `E2E_VIEWPORT`, 1920 × 1080). With the
sample map the full bar needs about 800 px, i.e. a window of about 1470 px with the explorer open at 320 px.

### Verification
- Unit: `barShell.directive.spec.ts` (window-centred classes, room in `max-width`), `compactBar.directive.spec.ts`
  (probe inset by the wider panel on both sides).
- e2e: `metricsBar.e2e.ts` "MetricsBar on the window centre" — #4557's test restored (the bar keeps its box when the
  explorer collapses), now also asserting the open explorer does not cover it; both panels open → centred, covered by
  neither. `compactMetricsBar.e2e.ts` — no panel covers the bar from 1600 to 900 px with both panels open; with the
  explorer collapsed it turns compact at the same window width as with both panels.
