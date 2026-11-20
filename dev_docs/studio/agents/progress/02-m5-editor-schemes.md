---
name: 02-M5 editor color schemes
state: complete
version: 1
---

## Goal

Add the editor colour schemes as data only (Nord, VS Light, One Dark, VS Dark, Darcula, and the JetBrains
light scheme), with palette builders and a smoke test over every theme (plan 02, Milestones, M5).

## Tasks

Copied from `02-themes.md`, Milestones, M5. Design: `design/02-themes.md`, `design/00-design-principles.md`,
`design/owner-decisions.md` (design wins over the plan, including theme names and labels). **OD10: no theme
control in the nav bar — task 4 (quick toggle) is dropped.** From `02-m3`/`02-m4` progress: the builders
must supply `radial.neutralFolder`, `tintTarget`, the word-cloud stops and `dependencyGraph` (shared dark
object for dark schemes, light constants for light ones); `themes.spec.ts` already checks contrast across
the whole registry and the registry order. Do not edit `02-themes.md` (it carries an uncommitted owner edit);
record plan corrections in this file's Notes instead.

1. Builders plus Nord and VS Light
2. Visual smoke e2e over every theme
3. The remaining four (data-only acceptance: the commit touches only `tailwind.css` and `themes.ts`)
4. ~~Quick toggle~~ — dropped (OD10)
5. Eyeball pass and final changelog wording (one entry)

## Steps

- [x] 1. Builders, Nord, VS Light
- [x] 2. Smoke e2e over every theme
- [x] 3. Remaining four schemes (data only)
- [x] 4. Quick toggle — dropped by OD10
- [x] 5. Eyeball pass and changelog

## Notes

Branch `feature/studio-02-m5` from `feature/studio-integration`. `npm ci` was needed in `visualization/`.

### 1. Builders, Nord, VS Light
- `buildDarkRenderPalette` / `buildLightRenderPalette` as the plan specifies; `MapPaletteSeed` joins `theme.model.ts`.
  The dark builder spreads `darkRenderPalette` (floor label, text colours, emphasis shadow, dependency graph),
  the light builder spreads `lightRenderPalette`.
- `themes.ts` gets two private helpers (`darkEditorTheme`, `lightEditorTheme`) so each scheme is one call with
  id, label, tokens and seed; later schemes only add calls.
- New `palettes/builderInputs.fixture.ts` shared by the two builder specs.
- Registry order (= stylesheet order, checked by `themes.spec.ts`): cc-dark, cc-light, nord, one-dark, vs-dark,
  vs-light, darcula, rider-day (the picker groups by scheme, so the design's picker order results).


### 2. Smoke e2e
- `theme.e2e.ts` loops over `THEMES` (imported from `util/theme/themes`): picks the theme by label, expects
  `html[data-theme]`, the map corner pixel equal to `render.map.background`, the nav bar's computed
  background different from its text colour, then visits Domain and Dependencies; no console error in the
  whole run. `ThemePickerPageObject.navBarColors()` is new.

### 3. The remaining four (data only)
- `git diff --stat` of the commit lists only `visualization/app/tailwind.css` (+140) and
  `visualization/app/codeCharta/util/theme/themes.ts` (+108). All specs (registry, CSS sync, word cloud
  and dependency graph contrast) cover the new entries without a change.
- **Design over plan:** the light JetBrains scheme is `rider-day`, label "Rider Day" (design `02-themes.md`
  Deviations 1; the plan says `intellij-light` / "IntelliJ Light"). Its chrome tokens come from
  `RiderDay.theme.json` (Rider 2026.2): `base-100` white, `base-200` Gray13 `#f7f7f7`, `base-300` Gray10
  `#d5d5d5`, content Gray2 `#262626`, primary Blue3 `#3369d6`, secondary Purple3 `#7444d4`, accent Teal2
  `#077a7f`, neutral Gray3 `#3b3b3b`, info Blue4, success Green4, warning Yellow4, error Red4; the
  `-content` partners are white or black by the 4.5 rule. Seed: map `#f7f7f7`, floors `#333333` to `#dddddd`,
  word cloud `#871094` to `#0033b3` (the plan's values for its IntelliJ Light seed). The other five use the
  plan's token tables and seeds unchanged.
- Token values needed no change after the eyeball pass; Darcula and One Dark kept the plan's `base-300`.

### 5. Eyeball pass and changelog
Playwright (headless chromium, 1440x860, sample data, each scheme: 3D map, settings dialog, Sunburst,
Dependencies; temporary spec, not committed):
- **Nord**: blue-grey slate chrome, pale-teal accents (toggle, view tab underline); map background is a
  deeper slate than the chrome; floors step from slate to pale grey; labels dark cards with light text.
- **One Dark**: warm-neutral charcoal with a blue legend tab; the map looks like Nord with less blue.
- **VS Dark**: near-black chrome and background, blue accent; the most contrasty dark scheme.
- **Darcula**: warm dark grey chrome, muted blue-grey accent; map background a touch cooler than the chrome.
- **VS Light**: white chrome with deep-blue accents, light grey map background, near-black root floor as in
  CodeCharta Light; labels are translucent white cards (a pink cast over the red buildings, as in cc-light).
- **Rider Day**: like VS Light with a softer cobalt primary, `#f7f7f7` panels and map background.
- Sunburst: dark schemes share the cc-dark look (files in the map colours, folders tinted towards the
  surface into a dark burgundy, neutral folders in the grey of `floorRoot`); light schemes show the
  `cc-light` look with a lilac-pink tint ring. Dependencies: dark schemes use the shared slate boxes (a slight
  blue cast against the neutral Darcula and VS Dark chrome, accepted by the plan: one shared dark graph
  palette); light schemes use the white boxes of `cc-light`. Settings dialog: picker, toggles and the red
  reset buttons are readable in all schemes.
- Changelog: the dark-theme entry became "Color themes", one entry listing the dark default, CodeCharta
  Light, the editor schemes and Follow system.

### Verification
- Gates before the last code commit: format:check, `npm test` (663 suites, 5117 passed, gate met), lint, tsc.
- With a temporary `BROWSER_CHANNEL = "chromium"` (reverted): `npm run build && npm run e2e:ci` 165/165
  (includes the eight-theme smoke test), `test:electron` 42/42, `e2e:desktop` 10/10.

### Plan corrections for `02-themes.md`
- M5 retitle "Editor color schemes" and drop task 4 (OD10), already listed in `design/owner-decisions.md`.
- Replace `intellij-light` / "IntelliJ Light" by `rider-day` / "Rider Day" in the Goal, Decision 1, the token
  tables and the seeds table; the Rider Day tokens are listed above.
- Registry order is cc-dark, cc-light, nord, one-dark, vs-dark, vs-light, darcula, rider-day.
- The builders are called through two private helpers in `themes.ts`; M5 acceptance holds (task 3 touches only
  `tailwind.css` and `themes.ts`).
