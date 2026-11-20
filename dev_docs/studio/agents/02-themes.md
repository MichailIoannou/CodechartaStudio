# 02 — Dark theme and color themes

- **Status:** draft, revised with the owner's theme decisions (dark default, editor color schemes); cited paths and symbols re-checked against the source
- **Depends on:** nothing. Works in the web build and in the desktop build. Milestone 6 is the only part that touches plan 01 and it is optional.
- **Unlocks:** every later plan can use daisyUI semantic tokens and `activeRenderPalette()` and be theme-correct for free.
- **Estimated size:** M0 S · M1 L · M2 S · M3 M · M4 M · M5 M · M6 S

All paths are relative to the repository root. `app/…` inside prose means `visualization/app/…`.

## Goal

**CodeCharta Dark is the default theme for everyone**, new and existing users. The dark theme is the most important deliverable: milestone 1 ships a complete, good dark chrome and a dark 3D map. In Settings the user can pick another theme: CodeCharta Light (the CodeCharta blue brand palette), or one of six editor color schemes (Nord, One Dark, VS Dark, VS Light, Darcula, IntelliJ Light), or "Follow system" (CodeCharta Light / CodeCharta Dark by the OS setting, tracked live; an option, never the default). The whole application follows: chrome, the 3D map, its labels, the view cube, the three ECharts views, the color-range diagram, the boot screen and exported screenshots. The choice survives restarts without a flash of the wrong theme.

The editor themes are **color schemes only**: token colors taken from the published palettes of those editor themes. No logos, icons or other trademarked assets are shipped; the labels name the palette descriptively.

**A theme is data.** Adding another theme later is exactly one `@plugin "daisyui/theme"` block in `app/tailwind.css` plus one `ThemeDefinition` entry in `util/theme/themes.ts`; no component, renderer, effect or test file changes (the registry specs and the e2e smoke test iterate over `THEMES`). This is an acceptance criterion of M5.

## Current state

Verified by opening the files unless marked UNVERIFIED.

Style pipeline
- `visualization/package.json` depends on `daisyui ^5.5.19` (Tailwind 4). `visualization/app/tailwind.css` starts with `@import "tailwindcss"; @plugin "daisyui";` (no options block, no `@plugin "daisyui/theme"`). Its `@theme` block declares `--color-cc-50…950`, then daisyUI token names (`--color-primary: #1b9cfc` … `--color-error-content`, lines 19-38), two animations and keyframes. `:root` declares `--cc-inspector-width`, `--wordCloudColorStart: #e6007e`, `--wordCloudColorEnd: #0030ff`.
- `visualization/app/index.html` line 2: `<html lang="en" data-theme="codecharta">`. No other `data-theme`, `prefers-color-scheme`, `color-scheme` or `dark:` exists in `app/`.
- Repo plan notes (`plans/2026-08-19-topbar-redesign.md` lines 68-71, `plans/metric-threshold-filter-mockup.md` line 46) record that the running app shows daisyUI's stock light palette (`primary` = `#422ad5`), not the `@theme` values. UNVERIFIED: the cascade reason (inferred: daisyUI emits its theme variables in a later layer than Tailwind's `@theme`), and which themes the built CSS contains. `node_modules` was not available.
- `visualization/angular.json`: `styles` = `app/tailwind.css`, `app/app.scss`, material-icons; `scripts: []`; `assets: [{ glob: "**/*", input: "public" }]`, so `visualization/public/codeCharta/x` ships as `codeCharta/x` next to `index.html`.
- CSP meta tag in `index.html`: `script-src 'self' 'unsafe-eval' 'sha256-LMY6…'`, `style-src 'self' 'unsafe-inline'`. The hash covers the inline script Angular's critical-CSS inlining adds. `app/app.e2e.ts` ("should not have errors in console") fails on any console error, which includes CSP violations.
- The boot placeholder in `index.html` (`#boot-loading`) has inline `background: #fff`, ring `#d1d5db` / `#1b9cfc`.

State and persistence
- `Preferences` (`app/codeCharta/model/state.model.ts`) has 13 keys, none about appearance. Slices live in `app/codeCharta/stores/preferences/store/<slice>/<slice>.actions.ts|.reducer.ts|.selector.ts|.reducer.spec.ts`; pattern: `stores/preferences/store/localSourceEnabled/`.
- Wiring a preference touches: `store/preferences.reducer.ts` (`preferences` and `defaultPreferences`), `store/preferences.actions.ts` (`preferencesActions`, consumed by `load/effects/saveCcState/actionsRequiringSaveCcState.ts` as `[...preferencesActions]`), `store/preferences.readWindow.ts` (`PreferencesReadWindow`), `preferences.write.facade.ts`, `preferences.read.facade.ts`, `load/restoredSliceActions.ts` (`preferencesRestoreActions: RestoreActions<Exclude<keyof Preferences, "sorting">>` — a missing key is a compile error), `mocks/dataMocks.ts` (`DEFAULT_STATE.preferences` is written out by hand).
- `LoadInitialFileStore.applySlice` (`load/loadInitialFile.store.ts`) iterates the current slice's keys; a key absent from the saved blob is reported in the "could not be fully restored" dialog. `applyPreferences` passes no optional keys, so a migration is mandatory.
- `stores/rootStore/indexedDB/indexedDBWriter.ts`: `DB_VERSION = 36`. Migrations: `indexedDB/migrations/migrateToV36.ts` (`migrateCcStateRecordToV36`, seeds `preferences.localSourceEnabled`), registered in `migrations/ccStateRecordMigrations.ts` as `{ version: 36, migrate: … }`.
- Preferences are restored asynchronously inside `LoadFilesUseCase.loadOnBoot()` (`await ccStatePersistence.read()`), called from `views/codeCharta.component.ts` `ngOnInit`. Until then the store holds defaults. Every boot path ends in the `filesLoaded` action (exported by `stores/fileStore/fileStore.facade.ts`).
- `SaveCcStateEffect` writes the settings record 500 ms after any allow-listed action. Dispatching a saved action before the restore has run would write defaults over the saved settings.
- `mapState.isWhiteBackground` (default `false`): slice `stores/mapState/store/isWhiteBackground/`, toggle "White Background" in `features/globalSettings/components/globalConfigurationDialog/globalConfigurationDialog.component.html`, written by `GlobalSettingsWriteStore.setWhiteBackground`, reset key `'mapState.isWhiteBackground'`, in `mapStateRestoreActions`, in `actionsRequiringRerender` and in `renderInvalidation.ts` as `{ colors: true }`. Scenarios do not capture it.
- `mapState.mapColors` defaults: `stores/mapState/store/mapColors/mapColors.reducer.ts` `defaultMapColors`. `setMapColors` uses `mergeState`. `UpdateMapColorsEffect` (`features/metricsBar/effects/updateMapColors/updateMapColors.effect.ts`) swaps `positive`/`negative` in the persisted value when the color metric's direction is 1. `features/scenarios/services/scenarios.service.ts` duplicates the three band defaults as `DEFAULT_MAP_COLORS`.

Settings UI
- `cc-setting-toggle` (`features/globalSettings/components/globalConfigurationDialog/settingToggle/`) has inputs `checked: boolean`, `label: string` and output `checkedChange`. There is no select control.
- The dialog already imports another feature through its facade (`canOpenFoldersHere` from `features/localSource/facade`).
- `features/navBar/components/navBar/navBar.component.html`: `navbar-end` holds only `<cc-settings-button>`.
- Effects are registered by hand in `visualization/app/app.config.ts` `provideEffects([...])`.

3D map
- `renderer/threeViewer/threeRenderer.service.ts`: `static BACKGROUND_COLOR = { white: 0xffffff, normal: 0xf4f4eb }`; `init()` subscribes to `isWhiteBackgroundSelector` → `setBackgroundColorToState` → `renderer.setClearColor`. `render()` schedules one `requestAnimationFrame`.
- `renderer/threeViewer/rendering/geometryGenerator.ts`: `ColorConverter.gradient("#333333", "#DDDDDD", maxDepth)` in `build`, `update` and `recolorBuildings`. `GeometryGenerator` is a plain class, not injectable.
- `features/codeMap/codeMap.render.service.ts` `render()`: `geometry` → `rebuildBuildings`; else `colors` → `threeSceneService.recolorMapMesh` (which ends in `recolorBuildings`, so floors are recolored). Floor-label textures are only rebuilt by `ThreeSceneService.initFloorLabels`, called from `setMapMesh` and `updateMapMeshInPlace` (geometry stage only).
- `renderer/threeViewer/floorLabels/floorLabelDrawer.ts`: `LABEL_OUTLINE_COLOR = "rgba(0, 0, 0, 0.5)"`, `context.fillStyle = "white"` in `writeLabelOnCanvas`.
- `renderer/threeViewer/folderLabelMaterials.ts` has `#FFFFFF` / `#7A7777`; its `materials()` returns `null` unless the mesh material is an array, and `CodeMapMesh` uses a single `ShaderMaterial`. It looks inert. UNVERIFIED at runtime; this plan does not rely on it.
- `features/codeMap/effects/renderCodeMapEffect/renderInvalidation.ts`: `RenderInvalidation { geometry, colors, labels, arrows }`, `propagate`, `mergeInvalidations`, `partialInvalidationByActionType`. An action must also be in `actionsRequiringRerender.ts` to trigger a render.
- Building labels are DOM (`CSS2DRenderer`): `features/labelSettings/services/labelElement.ts` `buildContentStyles` (`background: rgba(255, 255, 255, 0.85)`, `color: #1a1a1a`, shadow) and `setBadge` (`color: #888`). Connector line material: `features/labelSettings/services/connectorDrawing.service.ts` `initConnectors` (`color: 0xb4b4b4`), recreated after `clearConnectors()`, which `LabelSettingsFacade.clearLabels()` calls on every `labels` invalidation.
- `util/hoverTooltip.service.ts` already styles itself with `var(--color-base-100)` etc. This is the precedent for DOM created in code.
- View cube: `features/viewCube/viewCube.materials.ts` (`getBaseMaterialEdge|Face|Vertices`, each `MeshLambertMaterial({ color: 0xfc_fd_ff })`), `viewCube.component.ts` (`BoxHelper(this.cubeGroup, new Color(0x00_00_00))`, hover emissive `0xff_ff_ff` / `0x00_00_00`). Note: hex literals in this codebase use numeric separators (`0xfc_fd_ff`), so grep for both spellings.

Charts
- Radial: `renderer/radialMap/util/radialChartStyle.ts` `WHITE` (piece borders, used by `radialPiecesOption.ts`, `radialTreemapOption.builder.ts`, `sunburstOption.builder.ts`), `radialColor.ts` `DARK_TEXT = "#1f2937"` in `readableTextColor`, `util/radialFolderValues.ts` `NEUTRAL_FOLDER_COLOR = "#d9dce1"` and `tintColor` (mixes towards `#ffffff`). The option is built inside an `effect` in `radialChart.component.ts` (`renderOnceTheContainerIsMeasured`).
- Dependency graph: `renderer/dependencyGraph/util/dependencyGraphStyle.ts` (19 color constants plus `seeThrough(hexColor)`, which parses 6-digit hex), `declarationKinds.ts` (8 tints, `KIND_ICON_COLORS`), `boxMarks.ts` `BADGE_CONTRAST_COLOR`. The option is built inside an `effect` in `dependencyGraph.component.ts`. `KIND_ICON_COLORS` is also used by `features/dependencyMap/components/declarationKindIcon/declarationKindIcon.component.ts`.
- Word cloud: `renderer/wordCloud/util/color.util.ts` `getWordCloudColors()` reads the two CSS variables and accepts only `^#[0-9A-Fa-f]{6}$`. `wordCloud.component.ts` skips a render when `isSameRender(previous, next)` holds (container, words, settings, maskImage, size). `wordCloudOption.builder.ts` `EMPHASIS_SHADOW_COLOR = "#333"`.
- No chart sets `backgroundColor`, tooltip colors or an ECharts theme.
- Color-range diagram: `features/metricsBar/components/colorSettingsPopover/metricColorRangeDiagram.component.ts` sets `"#888"` (6×) and `"#000"` (4×) through d3 `.attr`.

DOM stragglers (complete list)
- `bg-white/80`: `features/shared/components/bootLoadingIndicator/bootLoadingIndicator.component.html`, `features/shared/components/loadingFileProgressSpinner/loadingFileProgressSpinner.component.html`.
- `text-neutral-500` / `bg-neutral-500`: `features/viewCube/zoomSlider/zoomSlider.component.html`.
- `text-white` on `bg-primary`: `features/shared/components/actionIcon/actionIcon.component.ts`. `group-hover:bg-[#0374c9]`: `features/globalSettings/components/globalConfigurationButton/globalConfigurationButton.component.html`.
- `DEFAULT_FOLDER_COLOR = "#000000"`, `INACTIVE_ROW_COLOR = "#BDBDBD"`: `features/sidebarExplorer/components/explorerTreeItemIcon/explorerTreeItemIcon.component.ts`.
- `text-neutral` / `bg-neutral/…` used as "dark ink": `features/changelog/components/changelogDialog/changelogDialog.component.ts` (`bg-neutral/5`, `bg-neutral/10`, `text-neutral`), `features/sidebarExplorer/components/explorerRow/explorerRow.component.ts` (`bg-neutral/15`).
- Black shadows `shadow-[…rgba(0,0,0,0.15)]`: `sidebarExplorer.component.ts`, `sidebarInspector.component.ts`, `features/dependencyMap/components/dependencyInspector/dependencyInspector.component.ts`.
- `text-white` on data colors (`fileExtensionBarSegment.component.ts`, `markFolderRow.component.html`) is correct in every theme and stays.

Exports
- `features/screenshot/services/screenshot.service.ts`: clears to transparent, `html2canvas-pro` with `backgroundColor: null`, `cropTransparentMargins`. `prepareLabelsForScreenshot()` forces label `background = "white"` and a dark border but leaves the text color alone.
- `features/screenshot/services/chartScreenshot.service.ts` and `dependencyGraphHost.ts` `renderOffScreen` use `getRenderedCanvas({ backgroundColor: "transparent" })`.
- `features/3dPrint/components/export3DMapDialog/export3DMapDialog.component.ts`: `printPreviewScene.background = new Color(0xec_ed_dc)`.

Tests and tooling
- Jest: `conf/jestUnit.config.json` (`setupFilesAfterEnv: ["<rootDir>/conf/setupJestUnit.ts", "jest-canvas-mock"]`); `mocks/localStorageMock.js` makes `localStorage.getItem` return `"[]"` for every key; JSDOM has no `matchMedia`.
- `features/radialMap/components/radialMap/radialMap.e2e.ts` asserts `#d9dce1`, `#eb8319`, `#ff1d8e`; it is the only e2e file that asserts hex colors. No e2e uses screenshot comparison. Playwright's default color scheme is light. Playwright helpers (`goto`, `clearIndexedDB`, `waitForCcStatePersisted`) live in `app/playwright.helper.ts`.
- dependency-cruiser: `util/` may import only `util/`, `model/` and node_modules (`conf/dependencyCruiser/utilRules.js`); `renderer/` may not import `features/` (`rendererRules.js`). `util/` already hosts injectables and module-level state (`util/hoverTooltip.service.ts`, `util/busy/loadPhase.ts`).
- `visualization/electron/main.js` sets no `backgroundColor` and uses no `nativeTheme`.

## Design

### Decisions

1. **Theme set and ids (owner decision).** All themes are custom daisyUI themes; daisyUI's built-in themes are switched off. Registry order and ids: `cc-dark` "CodeCharta Dark" (**default**), `cc-light` "CodeCharta Light" (the CodeCharta blue brand palette the stylesheet declares today; today's purple stock-daisyUI look is not preserved), `nord` "Nord", `one-dark` "One Dark", `vs-dark` "VS Dark", `vs-light` "VS Light", `darcula` "Darcula", `intellij-light` "IntelliJ Light". "Follow system" maps light → `cc-light`, dark → `cc-dark`. No Midnight or High-contrast theme.
2. **Two sources, one check.** DOM chrome is styled by daisyUI themes in `app/tailwind.css`. Canvases (three.js, ECharts, 2D canvas textures) cannot resolve `var()` and daisyUI resolves tokens to `oklch()`, so every theme also carries a **render palette declared in TypeScript as 6-digit hex**. Nothing reads computed styles. A Jest spec parses `app/tailwind.css` and fails when any theme's CSS tokens and its TypeScript `chrome` tokens differ (no theme is exempt, since all are custom).
2a. **Themes are data.** `ThemeId` is a plain `string` validated against the registry (not a union type), the picker, boot mirror, specs and e2e smoke test iterate `THEMES`, and render palettes for the editor themes are produced by two builders (`buildDarkRenderPalette`, `buildLightRenderPalette`) from the theme's chrome tokens plus four map values. Adding a theme therefore touches only `app/tailwind.css` and `util/theme/themes.ts`.
3. **Where things live.** Types in `model/`, the registry and the active-theme signal in `util/theme/` (the only place both `renderer/` and `features/` may import), the preference in the `preferences` home, behaviour and UI in `features/theme/` (D8).
4. **`mapState.isWhiteBackground` stays, as a per-map override (owner default accepted).** Theme decides the scene background; `isWhiteBackground === true` forces `#ffffff` in any theme. No migration for it; it stays a per-map setting while the theme is a global preference. In `cc-light` the scene looks exactly as today (toggle off = `#f4f4eb`, on = `#ffffff`).
5. **Map data colors are not themed.** Dark themes keep the deepest floors light (`#bbbbbb`–`#d8dee9`, close to today's `#dddddd`), so `positive / neutral / negative / selected / marking / edge` colors stay tuned and `mapColors` is untouched by a theme switch. There is no per-theme map-color override mechanism.
6. **Exports (owner default accepted).** Light themes export as today (transparent PNG). Dark themes composite the cropped image onto the theme's surface color, because light text on a transparent PNG is unreadable when pasted on white. The 3D-print preview keeps its fixed background: it previews a physical object.
7. **Default preference is `"cc-dark"`** (owner decision) for new sessions **and** for migrated sessions of existing users. `"system"` is a selectable option only.
8. **Jest keeps the light constants.** The module-level active theme starts as `cc-dark` in the app, but `conf/setupJestUnit.ts` sets `cc-light` in a global `beforeEach`, so the hundreds of existing specs and snapshots that assert today's light literals (`#f4f4eb`, `#333333`, `#d9dce1`, …) stay valid; specs about dark behaviour set their theme explicitly. `cc-light`'s render palette is byte-for-byte today's constants.

### Files

```
visualization/app/codeCharta/model/theme.model.ts                         types
visualization/app/codeCharta/util/theme/themes.ts                         THEMES registry (all eight themes, inline), DEFAULT_THEME_ID, SYSTEM_THEME_BY_SCHEME
visualization/app/codeCharta/util/theme/palettes/lightRenderPalette.ts    today's constants (cc-light) + buildLightRenderPalette
visualization/app/codeCharta/util/theme/palettes/darkRenderPalette.ts     cc-dark palette + buildDarkRenderPalette
visualization/app/codeCharta/util/theme/resolveTheme.ts                   pure: preference + OS scheme -> ThemeDefinition
visualization/app/codeCharta/util/theme/activeTheme.ts                    module-level signal + accessors
visualization/app/codeCharta/util/theme/contrast.ts                       WCAG ratio helpers (used by specs and readable-text code)
visualization/app/codeCharta/stores/preferences/store/theme/theme.actions.ts | theme.reducer.ts | theme.selector.ts | theme.reducer.spec.ts
visualization/app/codeCharta/stores/rootStore/indexedDB/migrations/migrateToV37.ts (+ .spec.ts)
visualization/app/codeCharta/features/theme/facade.ts
visualization/app/codeCharta/features/theme/services/theme.service.ts            applies a theme to the document
visualization/app/codeCharta/features/theme/services/systemColorScheme.service.ts matchMedia as a signal
visualization/app/codeCharta/features/theme/repos/themeBootMirror.repo.ts        localStorage mirror
visualization/app/codeCharta/features/theme/stores/theme.read.store.ts | theme.write.store.ts
visualization/app/codeCharta/features/theme/effects/theme.effects.ts
visualization/app/codeCharta/features/theme/effects/applyTheme/applyTheme.effect.ts
visualization/app/codeCharta/features/theme/components/themePicker/themePicker.component.ts|.html|.spec.ts|.po.ts
visualization/app/codeCharta/features/theme/components/themeQuickToggle/themeQuickToggle.component.ts|.html|.spec.ts
visualization/app/codeCharta/features/theme/e2e/theme.e2e.ts
visualization/public/codeCharta/themeBoot.js                              boot script (plain ES5, no build step)
```

### Types (`model/theme.model.ts`)

```ts
export type ColorScheme = "light" | "dark"
/** A registry id such as "cc-dark" or "nord"; deliberately a string so a new theme needs no type change. Matches /^[a-z-]+$/. */
export type ThemeId = string
export const SYSTEM_THEME = "system"
export type ThemePreference = typeof SYSTEM_THEME | ThemeId

/** The daisyUI tokens of a theme as hex. For custom themes this mirrors app/tailwind.css. */
export interface ChromeTokens {
    base100: string; base200: string; base300: string; baseContent: string
    primary: string; primaryContent: string
    secondary: string; secondaryContent: string
    accent: string; accentContent: string
    neutral: string; neutralContent: string
    info: string; infoContent: string
    success: string; successContent: string
    warning: string; warningContent: string
    error: string; errorContent: string
}

export interface MapRenderPalette {
    background: string
    whiteBackground: string
    floorGradient: { root: string; deepest: string }
    floorLabel: { fill: string; outline: string }
    buildingLabel: { background: string; text: string; border: string }   // screenshots only; live labels use var()
    connector: string
}
export interface ViewCubeRenderPalette { face: string; outline: string; hoverEmissive: string }
export interface RadialRenderPalette { pieceBorder: string; neutralFolder: string; tintTarget: string; darkText: string; lightText: string }
export interface WordCloudRenderPalette { gradientStart: string; gradientEnd: string; emphasisShadow: string }
export interface ChartTooltipPalette { background: string; border: string; text: string }
export interface DependencyGraphRenderPalette {
    text: string; selected: string; hovered: string
    folderFillsByDepth: readonly string[]; folderStroke: string; closedFolderFill: string; closedFolderStroke: string
    packageFillsByDepth: readonly string[]; packageStroke: string; closedPackageFill: string; closedPackageStroke: string
    fileFill: string; declarationFill: string; fileStroke: string; openFileFill: string
    quietBadge: string; levelSeparator: string; cycleMark: string; badgeContrast: string
    kindTints: Readonly<Record<string, string>>; kindIconStroke: string; kindIconLetter: string
}
export interface RenderPalette {
    surface: string                 // hex of base-100
    text: string                    // hex of base-content
    exportBackground: string | null // null = transparent PNG
    map: MapRenderPalette
    viewCube: ViewCubeRenderPalette
    radial: RadialRenderPalette
    wordCloud: WordCloudRenderPalette
    dependencyGraph: DependencyGraphRenderPalette
    chartTooltip: ChartTooltipPalette
}
export interface ThemeDefinition {
    id: ThemeId
    label: string
    colorScheme: ColorScheme
    chrome: ChromeTokens
    render: RenderPalette
}

/** The four values a render-palette builder needs beyond the chrome tokens. */
export interface MapPaletteSeed {
    mapBackground: string
    floorRoot: string
    floorDeepest: string
    wordCloud: readonly [start: string, end: string]
}
```
`Preferences` in `model/state.model.ts` gains `theme: ThemePreference`.

### Kernel API (`util/theme/`)

```ts
// themes.ts
export const THEMES: readonly ThemeDefinition[]           // ids unique, order = picker order
export const DEFAULT_THEME_ID: ThemeId = "cc-dark"
export const SYSTEM_THEME_BY_SCHEME: Readonly<Record<ColorScheme, ThemeId>> = { light: "cc-light", dark: "cc-dark" }
export function themeById(id: string): ThemeDefinition | undefined

// palettes/darkRenderPalette.ts, palettes/lightRenderPalette.ts
export const darkRenderPalette: RenderPalette               // cc-dark
export const lightRenderPalette: RenderPalette              // cc-light = today's constants
export function buildDarkRenderPalette(chrome: ChromeTokens, seed: MapPaletteSeed): RenderPalette
export function buildLightRenderPalette(chrome: ChromeTokens, seed: MapPaletteSeed): RenderPalette

// resolveTheme.ts — an unknown or stale id behaves like DEFAULT_THEME_ID (not like "system")
export function resolveTheme(preference: string, systemScheme: ColorScheme): ThemeDefinition

// activeTheme.ts
export const activeTheme: Signal<ThemeDefinition>          // starts as themeById(DEFAULT_THEME_ID)
export function activeRenderPalette(): RenderPalette       // activeTheme().render
export function setActiveTheme(theme: ThemeDefinition): void

// contrast.ts
export function contrastRatio(foregroundHex: string, backgroundHex: string): number
export function lowestContrastAlongGradient(startHex: string, endHex: string, backgroundHex: string): number
```
`activeRenderPalette()` reads a signal. Code that calls it inside an Angular `effect` or `computed` (both chart components build their option inside an effect) re-runs on a theme change with no extra wiring. Plain classes (`GeometryGenerator`, `FloorLabelDrawer`) call it at draw time.

### State

- Slice `stores/preferences/store/theme/`: `setThemePreference = createAction("SET_THEME_PREFERENCE", props<{ value: ThemePreference }>())`; `defaultTheme: ThemePreference = DEFAULT_THEME_ID` (`"cc-dark"`); `theme = createReducer(defaultTheme, on(setThemePreference, setState(defaultTheme)))`; `themePreferenceSelector`.
- Same folder, no reducer (precedent: `filesLoaded`): `activeThemeChanged = createAction("ACTIVE_THEME_CHANGED", props<{ themeId: ThemeId }>())`. It tells renderers that the palette changed, including changes that come from the operating system. It is **not** added to `preferencesActions`.
- Wire-up: `preferences.reducer.ts` (`theme` in `combineReducers` and `defaultPreferences`), `preferences.actions.ts` (`setThemePreference` in `preferencesActions`, which covers the save allow-list), `preferences.readWindow.ts` (`readonly theme$ = this.store.select(themePreferenceSelector)`), `preferences.write.facade.ts` (export both actions), `preferences.read.facade.ts` (export `defaultTheme`, `themePreferenceSelector`), `load/restoredSliceActions.ts` (`theme: setThemePreference`), `mocks/dataMocks.ts` (`theme: "cc-dark"`).
- `migrateToV37.ts`: `migrateCcStateRecordToV37` seeds `preferences.theme = defaultTheme` (`"cc-dark"`) when absent (copy of the V36 shape). Existing users therefore switch to dark on update, by owner decision. Register `{ version: 37, migrate: migrateCcStateRecordToV37 }`; `DB_VERSION = 37`. If another plan has already taken 37, take the next free number and rename the file.
- The reset button in the dialog gets `'preferences.theme'` in its `settingsKeys`.

### Applying a theme (`features/theme/`)

`SystemColorSchemeService` (root): `readonly scheme: Signal<ColorScheme>`, backed by `matchMedia("(prefers-color-scheme: dark)")` and its `change` event; returns `"light"` when `matchMedia` is not a function. In Electron this media query already follows the OS, so no bridge is needed for following.

`ThemeBootMirrorRepo` (root, uses `LocalStorageRepo`, key `"codeCharta.themeBoot"`):
```ts
interface BootColors { id: string; background: string; content: string; track: string; accent: string }
export interface ThemeBootMirror { version: 1; preference: ThemePreference; light: BootColors; dark: BootColors }
read(): ThemeBootMirror | null     // null for missing, unparsable or wrongly shaped values (the Jest mock returns "[]")
write(mirror: ThemeBootMirror): void
```
`light` / `dark` are what to show for each OS scheme: for a fixed theme both hold that theme; for `"system"` they hold `cc-light` and `cc-dark`. The boot script therefore needs no theme table of its own beyond its `cc-dark` fallback. The boot colors are derived from the registry (`background` = `chrome.base100`, `content` = `chrome.baseContent`, `track` = `chrome.base300`, `accent` = `chrome.primary`), so a new theme needs no boot change.

`ThemeService` (root): `apply(theme: ThemeDefinition): void` sets `document.documentElement.dataset["theme"] = theme.id`, `document.documentElement.style.colorScheme = theme.colorScheme`, and calls `setActiveTheme(theme)`. Synchronous.

`ApplyThemeEffect` (in `themeEffects`, registered in `app.config.ts`):
```
bootHint      = mirror.read()?.preference                       // read once in the constructor
hintDropped$  = first of: setThemePreference | setState | filesLoaded   (startWith false)
preference$   = hintDropped ? store.select(themePreferenceSelector) : (bootHint ?? store value)
theme$        = combineLatest([preference$, toObservable(systemColorScheme.scheme)]) -> resolveTheme, distinct by id
applyTheme$   = theme$ -> themeService.apply(theme)
                       -> if hintDropped: mirror.write(mirrorFor(preference, THEMES))
                       -> map to activeThemeChanged({ themeId: theme.id })      (dispatch: true)
```
The hint exists because the store holds the default `"cc-dark"` until the IndexedDB restore has run; without it a user who picked a light theme would see the app flip dark → light, and the mirror would be overwritten with the default. No action is dispatched before the restore, so nothing is saved early. IndexedDB stays the source of truth: after `filesLoaded` the store value wins and the mirror is rewritten.

`ThemeReadStore`: `preference = toSignal(store.select(themePreferenceSelector))`, `themes = THEMES`, `activeTheme` (re-export of the util signal). `ThemeWriteStore`: `setPreference(value)` dispatches `setThemePreference`.

`facade.ts` exports `ThemePickerComponent`, `ThemeQuickToggleComponent`.

### No-flash boot

- `visualization/public/codeCharta/themeBoot.js` (classic script, ES5, no imports, under 40 lines): read `localStorage["codeCharta.themeBoot"]` in a `try`; pick `mirror[matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"]`; without a valid mirror fall back to the built-in `cc-dark` boot colors (the default); validate `id` against `/^[a-z-]+$/` and each color against `/^#[0-9a-f]{6}$/i`; set `data-theme` and the four custom properties `--cc-boot-background`, `--cc-boot-content`, `--cc-boot-track`, `--cc-boot-accent` on `document.documentElement`.
- M1 already makes the default boot dark without any script: `app/index.html` gets `<html lang="en" data-theme="cc-dark">` and the placeholder colors become `var(--cc-boot-background, #1e2329)`, `color: var(--cc-boot-content, #e6e9ee)`, `var(--cc-boot-track, #3a424d)`, `var(--cc-boot-accent, #8b9cff)` (the `cc-dark` tokens). The script (M2) is only needed for users who picked another theme.
- M2: add `<script src="codeCharta/themeBoot.js"></script>` in `<head>` before the `<style>` (render-blocking on purpose; `'self'` already allows it; the existing module bundles prove `'self'` works under `file://` in Electron). The CSP meta tag is not changed.
- A Jest spec reads `public/codeCharta/themeBoot.js` as text and asserts that its fallback equals the registry's `cc-dark` boot colors and the `index.html` fallbacks, and evaluates the script against a fake `document`/`localStorage` for the valid, missing and malformed mirror cases.
- The Electron window's own white flash before `index.html` loads is not fixable from the renderer; see M6.

### daisyUI registration (`app/tailwind.css`)

```css
@import "tailwindcss";
@plugin "daisyui" {
    themes: false;          /* no built-in daisyUI themes */
}

@plugin "daisyui/theme" {
    name: "cc-dark";
    default: true;          /* only cc-dark; every other block says false */
    prefersdark: false;
    color-scheme: dark;
    --color-base-100: #1e2329;
    /* … all 20 color tokens … */
    --radius-selector: 0.5rem;  --radius-field: 0.25rem;  --radius-box: 0.5rem;
    --size-selector: 0.25rem;   --size-field: 0.25rem;
    --border: 1px;  --depth: 1;  --noise: 0;
}
```
This is the daisyUI 5 CSS-first syntax as documented (plugin options block with `themes:`, one `@plugin "daisyui/theme"` block per custom theme with `name`, `default`, `prefersdark`, `color-scheme`, color tokens and the radius/size/border/depth/noise tokens). UNVERIFIED against the installed package (`node_modules` was not installed when this plan was written): M0 confirms the syntax, that `themes: false` removes the built-in themes while custom blocks still compile, and copies the eight non-color token values from the computed style of today's build (stock `light`) so geometry stays identical in every theme. `prefersdark` stays `false` everywhere: the app always sets `data-theme` itself. One block per theme, eight blocks in total (cc-dark first, then registry order). The daisyUI token lines in `@theme` (19-38) duplicate `cc-light` and are deleted if M0 shows that utilities such as `bg-primary`, `border-base-300` and `text-base-content/60` still compile without them; otherwise they stay (they are overridden and harmless). The two `--wordCloudColor*` variables are removed in M3.

### Token values

Contrast ratios are WCAG 2.x, computed for this plan (sRGB relative luminance). "content" = `base-content`. Source palettes: CodeCharta Dark is this project's own; CodeCharta Light is the `#1b9cfc` / `#0374c9` brand family already in `app/tailwind.css` `@theme`; the editor themes take their values from the published palettes: Nord (the 16 colors `nord0`–`nord15`), Atom One Dark, VS Code "Dark+" / "Light+" (Visual Studio's editor default schemes), JetBrains Darcula and IntelliJ Light. Where a published color failed a contrast rule, the `-content` partner was switched to black or to the theme's darkest published color; the fill itself was kept.

CodeCharta themes

| token | cc-dark (default) | cc-light |
|---|---|---|
| base-100 / 200 / 300 | `#1e2329` `#262c34` `#3a424d` | `#ffffff` `#f9fafb` `#d1d5db` |
| base-content | `#e6e9ee` | `#1f2937` |
| primary / content | `#8b9cff` / `#0f1433` | `#0374c9` / `#ffffff` |
| secondary / content | `#f471b5` / `#2b0a1c` | `#1b9cfc` / `#04121f` |
| accent / content | `#2dd4bf` / `#06302b` | `#fc801b` / `#2b1200` |
| neutral / content | `#2a323c` / `#d7dde4` | `#3d4451` / `#ffffff` |
| info / content | `#38bdf8` / `#04263a` | `#3abff8` / `#002b3d` |
| success / content | `#34d399` / `#032b1e` | `#36d399` / `#003320` |
| warning / content | `#fbbf24` / `#3a2a00` | `#fbbd23` / `#382800` |
| error / content | `#f87171` / `#3f0a0a` | `#f87272` / `#470000` |

Editor color schemes, dark

| token | nord | one-dark | vs-dark | darcula |
|---|---|---|---|---|
| base-100 / 200 / 300 | `#2e3440` `#3b4252` `#434c5e` (nord0–2) | `#282c34` `#2c313a` `#3e4451` | `#1e1e1e` `#252526` `#3c3c3c` | `#2b2b2b` `#3c3f41` `#45494a` |
| base-content | `#eceff4` (nord6) | `#abb2bf` | `#d4d4d4` | `#bbbbbb` |
| primary / content | `#88c0d0` / `#2e3440` (nord8) | `#61afef` / `#282c34` | `#569cd6` / `#1e1e1e` | `#6897bb` / `#2b2b2b` |
| secondary / content | `#81a1c1` / `#2e3440` (nord9) | `#c678dd` / `#282c34` | `#c586c0` / `#1e1e1e` | `#9876aa` / `#000000` |
| accent / content | `#8fbcbb` / `#2e3440` (nord7) | `#56b6c2` / `#282c34` | `#4ec9b0` / `#1e1e1e` | `#cc7832` / `#000000` |
| neutral / content | `#4c566a` / `#eceff4` (nord3) | `#21252b` / `#abb2bf` | `#333333` / `#d4d4d4` | `#313335` / `#bbbbbb` |
| info / content | `#81a1c1` / `#2e3440` | `#61afef` / `#282c34` | `#3794ff` / `#1e1e1e` | `#3592c4` / `#000000` |
| success / content | `#a3be8c` / `#2e3440` (nord14) | `#98c379` / `#282c34` | `#89d185` / `#1e1e1e` | `#6a8759` / `#000000` |
| warning / content | `#ebcb8b` / `#2e3440` (nord13) | `#e5c07b` / `#282c34` | `#cca700` / `#1e1e1e` | `#bbb529` / `#2b2b2b` |
| error / content | `#bf616a` / `#000000` (nord11) | `#e06c75` / `#181a1f` | `#f44747` / `#1e1e1e` | `#bc3f3c` / `#ffffff` |

Editor color schemes, light

| token | vs-light | intellij-light |
|---|---|---|
| base-100 / 200 / 300 | `#ffffff` `#f3f3f3` `#cccedb` | `#ffffff` `#f7f8fa` `#dfe1e5` |
| base-content | `#1e1e1e` | `#000000` |
| primary / content | `#005fb8` / `#ffffff` | `#1750eb` / `#ffffff` |
| secondary / content | `#af00db` / `#ffffff` | `#871094` / `#ffffff` |
| accent / content | `#267f99` / `#ffffff` | `#00627a` / `#ffffff` |
| neutral / content | `#3c3c3c` / `#ffffff` | `#494949` / `#ffffff` |
| info / content | `#1a85ff` / `#000000` | `#3574f0` / `#000000` |
| success / content | `#388a34` / `#000000` | `#067d17` / `#ffffff` |
| warning / content | `#bf8803` / `#000000` | `#9e880d` / `#000000` |
| error / content | `#e51400` / `#ffffff` | `#f50000` / `#000000` |

Computed contrast (content on base-100 / 200 / 300 · primary on base-100 · lowest `x-content` on `x`):

| theme | content | primary | lowest pair |
|---|---|---|---|
| cc-dark | 13.0 / 11.6 / 8.4 | 6.25 | 6.0 (error) |
| cc-light | 14.7 / 14.0 / 10.0 | 4.83 | 4.8 (primary) |
| nord | 10.8 / 8.7 / 7.5 | 6.24 | 4.6 (secondary) |
| one-dark | 6.6 / 6.1 / 4.6 | 5.92 | 4.8 (secondary) |
| vs-dark | 11.2 / 10.3 / 7.4 | 5.65 | 4.6 (error) |
| vs-light | 16.7 / 15.0 / 10.7 | 6.31 | 4.6 (accent) |
| darcula | 7.4 / 5.5 / 4.7 | 4.54 | 4.5 (primary) |
| intellij-light | 21.0 / 19.8 / 16.0 | 6.21 | 4.9 (error) |

Notes: in the dark themes `base-200` and `base-300` are lighter than `base-100` (raised surfaces and visible borders), the reverse of daisyUI's stock dark, because this app uses `base-300` mainly as border color (83 usages). `cc-light` uses `#0374c9` as primary because white on the declared `#1b9cfc` reaches only 2.9:1. Status colors on a light `base-100` are below 3:1 as text in the light themes; they are used as fills. Darcula's `base-300` is `#45494a` (not the published `#515151` border) so `base-content` stays ≥ 4.5 on it. Darcula and One Dark are close to the 4.5 limits; the M5 eyeball pass may darken their `base-300`, but only with the spec still green.

The registry spec enforces, for every entry of `THEMES`: `baseContent` on `base100/200/300` ≥ 4.5; every `xContent` on `x` ≥ 4.5; `primary` on `base100` ≥ 3 (≥ 4.5 for dark themes); ids unique and matching `/^[a-z-]+$/`; exactly one entry with id `DEFAULT_THEME_ID`; both `SYSTEM_THEME_BY_SCHEME` targets exist and have the matching `colorScheme`.

### Render palettes

`lightRenderPalette` (= `cc-light`) holds today's constants unchanged (this keeps existing Jest specs, snapshots and the light assertions in `radialMap.e2e.ts` valid). `darkRenderPalette` (= `cc-dark`) is written out by hand. The six editor themes call a builder with their chrome tokens and a four-value seed.

| key | cc-light | cc-dark |
|---|---|---|
| `surface` / `text` | `#ffffff` / `#1f2937` | `#1e2329` / `#e6e9ee` |
| `exportBackground` | `null` | `#1e2329` |
| `map.background` | `#f4f4eb` | `#14171b` |
| `map.whiteBackground` | `#ffffff` | `#ffffff` |
| `map.floorGradient` root → deepest | `#333333` → `#dddddd` | `#4a515c` → `#c9ced6` |
| `map.floorLabel` fill / outline | `#ffffff` / `rgba(0, 0, 0, 0.5)` | same |
| `map.buildingLabel` background / text / border | `#ffffff` / `#1a1a1a` / `#b3b3b3` | `#1e2329` / `#e6e9ee` / `#3a424d` |
| `map.connector` | `#b4b4b4` | `#8a94a3` |
| `viewCube` face / outline / hoverEmissive | `#fcfdff` / `#000000` / `#ffffff` | `#3a424d` / `#c9ced6` / `#8b9cff` |
| `radial.pieceBorder` / `neutralFolder` / `tintTarget` | `#ffffff` / `#d9dce1` / `#ffffff` | `#1e2329` / `#4a515c` / `#1e2329` |
| `radial.darkText` / `lightText` | `#1f2937` / `#ffffff` | same |
| `wordCloud` start → end (lowest contrast along it on `surface`) | `#e6007e` → `#0030ff` (4.50) | `#ff6ab8` → `#7da2ff` (5.7) |
| `wordCloud.emphasisShadow` | `#333333` | `#000000` |
| `chartTooltip` background / border / text | `#ffffff` / `#d1d5db` / `#1f2937` | `#262c34` / `#3a424d` / `#e6e9ee` |

`buildDarkRenderPalette(chrome, seed)` derives: `surface` = `exportBackground` = `base100`; `text` = `baseContent`; `map.background` / `floorGradient` / `wordCloud` from the seed; `whiteBackground` `#ffffff`; `floorLabel` as cc-dark; `buildingLabel` = `base100` / `baseContent` / `base300`; `connector` = `seed.floorDeepest`; `viewCube` = `base300` / `seed.floorDeepest` / `primary`; `radial` = `base100` / `seed.floorRoot` / `base100`, `darkText #1f2937`, `lightText #ffffff`; `emphasisShadow #000000`; `chartTooltip` = `base200` / `base300` / `baseContent`; `dependencyGraph` = `darkRenderPalette.dependencyGraph` (shared). `buildLightRenderPalette(chrome, seed)` spreads `lightRenderPalette` and overrides `surface`, `text`, `map.background`, `floorGradient`, `wordCloud` start/end, `buildingLabel` (`base100` / `baseContent` / `base300`), `radial.pieceBorder` and `tintTarget` (`base100`) and `chartTooltip` (`base100` / `base300` / `baseContent`); `exportBackground` stays `null`, the dependency graph stays today's.

Seeds of the editor themes (map background · floor root → deepest · word cloud start → end, with lowest contrast along the gradient on `base-100`):

| theme | mapBackground | floor gradient | word cloud |
|---|---|---|---|
| nord | `#242933` (nord0 darkened; not one of the 16) | `#4c566a` → `#d8dee9` (nord3 → nord4) | `#ebcb8b` → `#88c0d0` (6.2) |
| one-dark | `#21252b` | `#5c6370` → `#abb2bf` | `#c678dd` → `#61afef` (4.75) |
| vs-dark | `#181818` | `#505050` → `#d4d4d4` | `#ce9178` → `#9cdcfe` (6.3) |
| darcula | `#1e1f22` | `#5a5d63` → `#bbbbbb` | `#ffc66d` → `#6897bb` (4.54) |
| vs-light | `#f3f3f3` | `#333333` → `#dddddd` | `#af00db` → `#0000ff` (5.5) |
| intellij-light | `#f7f8fa` | `#333333` → `#dddddd` | `#871094` → `#0033b3` (8.3) |

Root floor against map background in the dark themes is 2.0–2.6 (the slab is also lit and outlined by its labels); the light themes keep today's 11+.

Dependency graph, `cc-dark` (starting values; the spec requires `text` ≥ 4.5 on every fill): `text #e6e9ee`, `selected #4db2ff`, `hovered #e6e9ee`, `folderFillsByDepth [#232930, #293039, #2f3742, #353e4b]`, `folderStroke #4a5564`, `closedFolderFill #24344a`, `closedFolderStroke #5d86b8`, `packageFillsByDepth [#27243a, #2d2a44, #33304e, #393658]`, `packageStroke #5a5184`, `closedPackageFill #322c52`, `closedPackageStroke #8f7fc7`, `fileFill #1a1f25`, `declarationFill #20262d`, `fileStroke #6b7686`, `openFileFill #1c2127`, `quietBadge #8a94a3`, `levelSeparator #3d4652`, `cycleMark #f87171`, `badgeContrast #ffffff`, `kindTints { class #2a3a52, valueclass #23404a, interface #24432f, enum #4a3c17, annotation #3d2b4d, function #4d2a28, variable #333a45, other #2b3038 }`, `kindIconStroke #7d8898`, `kindIconLetter #d7dde4`. All dark themes share this object; all light themes use today's constants.

### Renderer changes

| Surface | Change | How it re-renders |
|---|---|---|
| Scene background (`threeRenderer.service.ts`) | Delete `BACKGROUND_COLOR`. Keep the `isWhiteBackground` subscription but store only the flag. New private `syncClearColor()` computes `flag ? palette.map.whiteBackground : palette.map.background` and calls `setClearColor` when it differs from `clearColor`; call it at the top of the `requestAnimationFrame` callback in `render()` and at the end of `initGL`. | Pulled on every frame, so it cannot lag behind an action. |
| Floors (`geometryGenerator.ts`) | One private `floorGradientFor(nodes)` replaces the three literals and reads `activeRenderPalette().map.floorGradient`. | `activeThemeChanged` → `{ colors: true }`. |
| Floor labels (`floorLabelDrawer.ts`) | `fillStyle` and `strokeStyle` from `activeRenderPalette().map.floorLabel`. | New invalidation flag, below. |
| Invalidation (`renderInvalidation.ts`) | Add `floorLabels: boolean` to `RenderInvalidation`, `FULL_INVALIDATION`, `propagate` (`floorLabels = geometry \|\| invalidation.floorLabels === true`) and `mergeInvalidations`. Map `[activeThemeChanged.type, { colors: true, floorLabels: true }]`. Add `activeThemeChanged` to `actionsRequiringRerender.ts`. | — |
| `ThreeSceneService` | New public `redrawFloorLabels()` = `initFloorLabels(this.mapMesh.getNodes())` when a mesh exists. `CodeMapRenderService.render` calls it when `!invalidation.geometry && invalidation.floorLabels`. | — |
| Building labels (`labelElement.ts`) | `background: color-mix(in srgb, var(--color-base-100) 85%, transparent)`, `color: var(--color-base-content)`, metric span and badge `color: color-mix(in srgb, var(--color-base-content) 60%, transparent)`, add `border: 1px solid var(--color-base-300)`. | CSS; none needed. |
| Connectors (`connectorDrawing.service.ts`) | `color: new Color(activeRenderPalette().map.connector)`. | `colors` propagates to `labels`, which recreates the material. |
| View cube (`viewCube.materials.ts`, `viewCube.component.ts`) | Material getters take the color from `activeRenderPalette().viewCube`; the component keeps a reference to the `BoxHelper`; add `effect(() => { activeTheme(); this.recolor(); this.renderer.render(this.scene, this.camera) })`. | Signal effect. |
| Radial (`radialChartStyle.ts`, `radialColor.ts`, `util/radialFolderValues.ts`) | Replace `WHITE` by `radialPieceBorderColor()`; `readableTextColor` returns palette `darkText`/`lightText`; `NEUTRAL_FOLDER_COLOR` becomes `neutralFolderColor()`; `tintColor` mixes towards `palette.radial.tintTarget`. Add `tooltip` colors from `chartTooltip`. | Built inside the component's effect; reading the signal makes it re-run. |
| Word cloud (`color.util.ts`, `wordCloudOption.builder.ts`, `wordCloud.component.ts`) | `getWordCloudColors()` returns the palette pair (delete the CSS-variable reading and the two `:root` variables); shadow and tooltip from the palette; add `themeId` to `WordCloudRenderInputs` and to `isSameRender`. | Effect re-runs; the skip no longer swallows it. The layout animation replays once. |
| Dependency graph (`dependencyGraphStyle.ts`, `declarationKinds.ts`, `boxMarks.ts`) | Each exported color constant becomes a function of the same meaning (`textColor()`, `folderStroke()`, …) reading `activeRenderPalette().dependencyGraph`; `folderFill(depth)` / `packageFill(depth)` read the palette arrays; `declarationKindLookOf` takes `tint` from `kindTints`; `KIND_ICON_COLORS` becomes `kindIconColors()`. `seeThrough` keeps requiring 6-digit hex (the palette guarantees it). Tooltip colors added in `dependencyGraphOption.builder.ts`. | Effect re-runs. `declarationKindIcon.component.ts` wraps its lookups in `computed`. |
| Color-range diagram (`metricColorRangeDiagram.component.ts`) | `"#888"` → `"currentColor"` with `text-base-content/60` on the `<svg>`; `"#000"` handles → `.style("fill" \| "stroke", "var(--color-base-content)")`. | CSS; none needed. |
| Screenshot (`screenshot.service.ts`, `chartScreenshot.service.ts`, `canvasCrop.ts`) | `prepareLabelsForScreenshot` uses `palette.map.buildingLabel` for background, text and border. New `onExportBackground(canvas, background)` in `canvasCrop.ts` returns the canvas unchanged for `null`, else a new canvas filled with the color plus 16 px padding with the crop drawn on top; both services call it after `cropTransparentMargins`. | — |
| 3D-print preview | Unchanged. | — |
| DOM stragglers | `bg-white/80` → `bg-base-100/80`; zoom slider `neutral-500` → `base-content/60` (text) and `bg-base-content/60`; `actionIcon` `text-white` → `text-primary-content`; `group-hover:bg-[#0374c9]` → `group-hover:bg-secondary`; explorer icon: default folder color `undefined` (inherits), inactive → `"color-mix(in srgb, var(--color-base-content) 35%, transparent)"`; changelog `bg-neutral/5\|10` + `text-neutral` → `bg-base-content/5\|10` + `text-base-content`; explorer row `bg-neutral/15` → `bg-base-content/10`; the three side-panel shadows stay as they are (a black shadow is harmless on dark) and each panel gains a `border-base-300` edge on its inner side (`border-r` for the explorer, `border-l` for the two inspectors) so it separates from the map in dark themes. | CSS. |

### UI

- **Settings dialog.** `globalConfigurationDialog.component.html`: insert `<cc-theme-picker />` as the first row of the `flex flex-col gap-6` list; add `ThemePickerComponent` (from `features/theme/facade`) to the component's `imports`. The picker is a `<label class="label justify-start gap-4">` with `<select class="select select-bordered select-sm w-56" data-testid="theme-picker">` and a `label-text` "Theme". Options: `<optgroup label="Dark">` and `<optgroup label="Light">` built from `THEMES` by `colorScheme` in registry order (so CodeCharta Dark is first), then "Follow system" (`system`). When the preference is `system`, a hint `text-xs opacity-70` shows "Currently: <label of the active theme>".
- **Nav bar.** `navBar.component.html` `navbar-end`: `<cc-theme-quick-toggle />` before `<cc-settings-button>`. A `btn btn-ghost btn-sm btn-square` with `fa-solid fa-moon` (when the active scheme is light) or `fa-solid fa-sun`, `title` and `aria-label` "Switch to dark theme" / "Switch to light theme". Click sets the preference to `SYSTEM_THEME_BY_SCHEME` of the opposite scheme. It never returns to `system`; the dialog does that.
- "White Background" keeps its label and place.

### Error states and edge cases

- Unknown theme id in a restored or imported state (for example a theme removed in a later version): `resolveTheme` treats it as `DEFAULT_THEME_ID`; the picker shows "CodeCharta Dark".
- `localStorage` blocked or full: `LocalStorageRepo` swallows it; the only loss is the no-flash guarantee.
- No `matchMedia`: scheme is `light`.
- Theme changed while a non-metrics view is shown, or in a 2D layout: `RenderCodeMapEffect` keeps the pending invalidation and marks the view stale; the map is recolored on return. The clear color is synced on the next frame regardless.
- `isWhiteBackground` on in a dark theme: white scene, dark-theme floors and chips. Intended.
- WebGL context loss and restore: `syncClearColor` runs on the next frame.
- `setState` (reset, scenarios) changing `preferences.theme`: handled, the effect follows the selector.

## Milestones

Every task: write the listed tests first (names start with "should", `// Arrange` / `// Act` / `// Assert`), then the code; finish green on the checks in `00-overview-and-decisions.md` section 6.

### M0 — Spike (S, no shipped change)

1. `npm ci` and `npm run build` in `visualization/`, then inspect `dist/bundler/browser/styles-*.css`. Record in a "Notes" section at the end of this file: the installed daisyUI version, which `[data-theme=…]` blocks exist today, and the eight non-color token values of today's rendering (`getComputedStyle(document.documentElement).getPropertyValue("--radius-box")` etc.).
2. Throw-away: `@plugin "daisyui" { themes: false; }` plus the `cc-dark` block (`default: true`) and the `cc-light` block. Confirm it compiles, that no built-in theme remains in the CSS, that `:root` gets `cc-dark`, and that `data-theme="cc-light"` recolors the chrome. If `themes: false` is not accepted by the installed daisyUI, record the working spelling (fallback: `themes: light --default;` with the custom blocks, accepting the unused built-in `light` CSS). Check whether deleting lines 19-38 of `@theme` breaks any utility (search the built CSS for `.bg-primary`, `.border-base-300`, `.text-base-content\/60`).
3. Add `<script src="codeCharta/themeBoot.js">` with a one-line file; run `npm run build && npm run e2e:ci -- app/app.e2e.ts` and `npm start`; confirm no CSP error in either and that the built `index.html` keeps the tag in `<head>`.
4. With `data-theme="cc-dark"` set by hand, take a 3D-map screenshot through the app and confirm `html2canvas-pro` copes with `color-mix()` label backgrounds. If not, the label styles in M1 use the palette hex written into `cssText` and are rebuilt on the `labels` invalidation instead.
   Acceptance: Notes filled in; nothing committed except the notes. Per-milestone working notes go in `dev_docs/studio/agents/progress/` (see "Repo rules that bite here").

### M1 — Dark by default: complete dark chrome and dark 3D map (L) — first user-visible release

The most important milestone. The branch is merged and released as a whole; individual commits stay green but the app only turns dark at task 9, after the chrome and the map are ready for it. Until M3/M4 land, the Domain and Dependencies views and the radial layouts keep their light chart colors on the dark chrome (readable: the radial and dependency charts draw their own fills; the word cloud's `#0030ff` end is dim on dark). Prefer shipping M3 and M4 in the same release; if M1 ships alone, the changelog says so.

1. Types, registry, render palettes. Create `model/theme.model.ts`, `util/theme/contrast.ts`, `util/theme/palettes/lightRenderPalette.ts`, `util/theme/palettes/darkRenderPalette.ts` (no builders yet; they arrive with their first consumer in M5), `util/theme/themes.ts` (`cc-dark` and `cc-light`), `util/theme/resolveTheme.ts`, `util/theme/activeTheme.ts`. In `conf/setupJestUnit.ts` add a global `beforeEach(() => setActiveTheme(themeById("cc-light")))` (Decision 8). Tests: `contrast.spec.ts` ("should rate black on white 21"), `resolveTheme.spec.ts` ("should follow the system scheme for the system preference", "should fall back to the default theme for an unknown id"), `themes.spec.ts` (the registry rules listed under "Token values", "should keep every render palette color a six digit hex"), `activeTheme.spec.ts` ("should start in the default theme" — reset the signal inside the spec, since the setup file switches it).
   Commit: `feat(visualization): add theme model, registry and render palettes`
2. Register both themes in CSS. `app/tailwind.css`: options block `themes: false;` (or the M0-recorded spelling), the `cc-light` block with `default: true` **for now**, the `cc-dark` block with `default: false`; delete `@theme` lines 19-38 if M0 allowed it. `app/index.html`: `data-theme="cc-light"`. Tests: `themes.spec.ts` "should keep the css tokens of every theme equal to its registry tokens" (reads `app/tailwind.css` with `fs`, parses each `@plugin "daisyui/theme"` block). Acceptance: the app shows the CodeCharta blue light look; `app.e2e.ts` green.
   Commit: `feat(visualization): register the CodeCharta light and dark daisyUI themes`
3. DOM stragglers (the last row of the renderer table). Tests: adjust the existing component specs that assert classes; `explorerTreeItemIcon.component.spec.ts` "should let an unmarked folder inherit the text color".
   Commit: `fix(visualization): replace hard coded chrome colors with tokens`
4. Scene background. `threeRenderer.service.ts` as designed. Tests in `threeRenderer.service.spec.ts`: "should clear to the theme background", "should clear to white while the white background is on", "should pick up a new theme on the next frame".
   Commit: `feat(visualization): take the map background from the theme`
5. Floors and floor labels. `geometryGenerator.ts`, `floorLabelDrawer.ts`, `renderInvalidation.ts`, `actionsRequiringRerender.ts`, `threeSceneService.ts`, `codeMap.render.service.ts`. Tests: `renderInvalidation.spec.ts` ("should recolor and redraw the floor labels when the theme changes", "should redraw the floor labels with the geometry"), `codeMap.render.service.spec.ts` ("should redraw floor labels without rebuilding the buildings"), `floorLabelDrawer.spec.ts` ("should write labels in the theme's label color").
   Commit: `feat(visualization): recolor floors and floor labels with the theme`
6. Building labels, connectors, view cube. Tests: `labelElement` spec ("should style the label with theme tokens"), `connectorDrawing.service.spec.ts`, `viewCube.component.spec.ts` ("should recolor the cube when the theme changes").
   Commit: `feat(visualization): theme map labels, connectors and the view cube`
7. Map screenshot. `screenshot.service.ts`, `canvasCrop.ts`. Tests: `canvasCrop.spec.ts` ("should leave the image transparent without an export background", "should lay the image on the export background"), `screenshot.service.spec.ts` ("should give labels the theme's label colors while capturing").
   Commit: `feat(visualization): keep dark map screenshots readable`
8. Preference slice and migration. Create `stores/preferences/store/theme/*` (default `"cc-dark"`); edit `state.model.ts`, `preferences.reducer.ts`, `preferences.actions.ts`, `preferences.readWindow.ts`, both facades, `load/restoredSliceActions.ts`, `mocks/dataMocks.ts`; create `migrateToV37.ts` + spec (two cases mirroring `migrateToV36.spec.ts`: seeds `"cc-dark"` when absent, keeps an existing value), register it, bump `DB_VERSION` to 37. Tests: `theme.reducer.spec.ts` ("should start in the dark theme", "should keep the picked theme"); extend the save allow-list spec if one enumerates actions. Review snapshot diffs: only an added `theme: "cc-dark"` is acceptable. Acceptance: a v36 profile opens without the "could not be fully restored" dialog. (Nothing reads the preference yet, so no visible change.)
   Commits: `feat(visualization): persist the theme preference`, then `feat(visualization): migrate saved sessions to the dark theme`
9. Applying, and the flip to dark. Create `features/theme/services/*`, `repos/themeBootMirror.repo.ts`, `effects/*`, `stores/*`, `facade.ts`; register `...themeEffects` in `app/app.config.ts`. In `app/tailwind.css` move `default: true` from `cc-light` to `cc-dark`; `app/index.html` gets `data-theme="cc-dark"` and the dark boot-placeholder fallbacks from "No-flash boot". Tests: `systemColorScheme.service.spec.ts` (stub `window.matchMedia`; "should report light without matchMedia", "should follow a change of the system scheme"), `themeBootMirror.repo.spec.ts` ("should ignore a mirror of the wrong shape"), `theme.service.spec.ts` ("should name the theme on the document and set its color scheme"), `applyTheme.effect.spec.ts` ("should start in the dark theme without a saved session", "should keep the mirrored theme until the session is restored", "should not write the mirror before the session is restored", "should announce the theme the system switched to while following the system"). Acceptance: a fresh profile and a migrated v36 profile both open dark; `app.e2e.ts` green; `radialMap.e2e.ts` still green (the radial colors are not themed until M3).
   Commit: `feat(visualization): make the dark theme the default`
10. Picker. `features/theme/components/themePicker/*`; edit the dialog template, its `imports` and the reset `settingsKeys`. Tests: `themePicker.component.spec.ts` ("should offer every theme and following the system", "should save the picked theme", "should name the theme the system resolves to"). e2e `features/theme/e2e/theme.e2e.ts` with `themePicker.po.ts`: "should start a fresh profile in the dark theme" (expect `html[data-theme="cc-dark"]`; read the top-left pixel of `#codeMapScene` via `drawImage` into a 2D canvas and expect `#14171b`), "should switch the chrome and the map to the light theme" (pick CodeCharta Light; expect `cc-light` and `#f4f4eb`), "should keep the theme after a reload" (`waitForCcStatePersisted`), "should follow the system when asked to" (`page.emulateMedia({ colorScheme: "light" })` then pick Follow system; expect `cc-light`).
   Commit: `feat(visualization): let the user pick a theme in the settings`
11. Check the nav-bar logo, attribution logo, toasts, dialogs and the ngx-color popover on dark by eye; fix what is a token mistake, file the rest in Notes. Changelog entry in `visualization/CHANGELOG.md` under Added: `- **Dark theme**: CodeCharta now starts in a dark theme; pick CodeCharta Light or Follow system in the settings.` (if M3/M4 are not in the same release, add "the charts of the Domain and Dependencies views follow in a later release"; rewrite this one entry in later milestones, do not append).
   Commit: `docs(visualization): announce the dark theme in the changelog`

### M2 — No-flash boot for non-default themes (S)

1. `public/codeCharta/themeBoot.js`, the `<script>` tag in `index.html`, mirror already written by `ApplyThemeEffect` (M1). Tests: `themeBoot.spec.ts` under `features/theme/` as described; e2e "should start in the saved light theme without a dark frame" (pick CodeCharta Light, reload with `page.addInitScript` recording `document.documentElement.dataset.theme` at `DOMContentLoaded`, expect `cc-light`). `app.e2e.ts` must stay green.
   Commit: `feat(visualization): start in the saved theme without a flash`

### M3 — Radial map and word cloud (M)

1. Radial: files and tests as in the table (`radialColor.spec.ts` "should write dark text on a light piece in every theme", option-builder specs "should outline pieces in the theme surface"). `radialMap.e2e.ts` now runs in the dark default: make it pick CodeCharta Light through `themePicker.po.ts` in its `beforeEach` so its light assertions (`#d9dce1`, …) stay valid, and add one case asserting the `cc-dark` `neutralFolder` (`#4a515c`).
   Commit: `feat(visualization): theme the radial map`
2. Word cloud: remove the CSS variables. Tests: `color.util.spec.ts` rewritten ("should take the gradient from the active theme"), `themes.spec.ts` "should keep every word cloud gradient stop readable on its surface" (≥ 4.5 via `lowestContrastAlongGradient`), `wordCloud.component.spec.ts` "should draw the cloud again when the theme changes".
   Commit: `feat(visualization): theme the word cloud`
3. Chart tooltips and chart screenshots (`chartScreenshot.service.ts`, `dependencyGraphHost.renderOffScreen` callers) use `chartTooltip` and `onExportBackground`.
   Commit: `feat(visualization): theme chart tooltips and chart screenshots`

### M4 — Dependency graph and color-range diagram (M)

1. Tidy first: turn the constants of `dependencyGraphStyle.ts`, `declarationKinds.ts`, `boxMarks.ts` into functions returning the same literals; update the importing files and `dependencyGraph.facade.ts`. No behaviour change.
   Commit: `refactor(visualization): read dependency graph colors through functions`
2. Read them from the palette; fill `darkRenderPalette.dependencyGraph` with the `cc-dark` values above (until now it held the light constants as a placeholder). Tests: `dependencyGraphStyle.spec.ts` ("should take box fills from the active theme"), `themes.spec.ts` "should keep dependency graph text readable on every fill", `declarationKindIcon.component.spec.ts`.
   Commit: `feat(visualization): theme the dependency graph`
3. d3 diagram. Test: `metricColorRangeDiagram.component.spec.ts` "should draw axes in the current text color".
   Commit: `feat(visualization): theme the color range diagram`

### M5 — Editor color schemes and quick toggle (M)

1. Builders plus the first two editor themes. Add `buildDarkRenderPalette` / `buildLightRenderPalette` as specified under "Render palettes", and the `nord` and `vs-light` entries (CSS block + registry entry each). Tests: `darkRenderPalette.spec.ts` / `lightRenderPalette.spec.ts` ("should take the surface and label colors from the chrome tokens", "should take the map colors from the seed"); the registry, CSS-sync and word-cloud contrast specs cover the new entries automatically.
   Commit: `feat(visualization): add the Nord and VS Light color schemes`
2. Visual smoke e2e, parametrised over `THEMES` in `theme.e2e.ts`: pick the theme, visit the three views, expect no console error, `html[data-theme]`, the nav bar's computed `background-color` different from its text color, and the map corner pixel equal to `map.background`.
   Commit: `test(visualization): smoke test every theme across the views`
3. The remaining four: `one-dark`, `vs-dark`, `darcula`, `intellij-light`. **Acceptance (themes are data):** `git diff --stat` of this commit lists only `visualization/app/tailwind.css` and `visualization/app/codeCharta/util/theme/themes.ts`, and all Jest and e2e checks are green, the smoke test now covering eight themes. If anything else had to change, fix the design so it would not, in a separate commit before this one.
   Commit: `feat(visualization): add the One Dark, VS Dark, Darcula and IntelliJ Light color schemes`
4. Quick toggle in the nav bar. Tests: "should offer the dark theme while a light one is active", "should switch to the light theme from a dark one".
   Commit: `feat(visualization): add a theme toggle to the top bar`
5. Eyeball pass of each editor scheme (Manual verification 3-6); adjust token values only in the two data files, with the specs green. Final changelog wording (one entry: dark default, CodeCharta Light, six editor color schemes, Follow system).
   Commit: `docs(visualization): describe the color themes in the changelog`

### M6 — Native window appearance (S, optional, after plan 01)

1. `features/theme/services/nativeAppearance.port.ts`: `export interface NativeAppearance { setAppearance(request: { colorScheme: ColorScheme | "system"; windowBackground: string }): Promise<void> }` and `NATIVE_APPEARANCE = new InjectionToken<NativeAppearance | null>(…, { factory: () => globalThis.codeChartaDesktop?.appearance ?? null })`. `ApplyThemeEffect` calls it after `apply` when present and ignores rejections. Main-process side (owned by plan 01's code, one `ipcMain.handle` channel declared in the plan-01 contract file): validate the sender as plan 01 requires, accept only `colorScheme` ∈ {`light`, `dark`, `system`} and `windowBackground` matching `/^#[0-9a-f]{6}$/i` (reject anything else), set `nativeTheme.themeSource = colorScheme`, persist `windowBackground` in a small JSON under `userData`, and pass it as `backgroundColor` to `new BrowserWindow` (default `#1e2329`, the `cc-dark` surface, when nothing is persisted). Tests: effect spec with a fake port ("should tell the desktop shell about the theme", "should work without a desktop shell").
   Commit: `feat(visualization): pass the theme to the desktop window`

## Repo rules that bite here

- **dependency-cruiser.** `util/theme/**` may import only `util/`, `model/`, `@angular/core`. `renderer/**` must take the palette from `util/theme/activeTheme`, never from `features/theme`. `features/navBar` and `features/globalSettings` import only `features/theme/facade`. `themePicker.component.ts` must not import `preferences.write.facade` (rule `display-components-cannot-dispatch`): it goes through `ThemeWriteStore`. `@ngrx/store` only in `features/theme/stores|effects`. The migration imports `defaultTheme` from `preferences.read.facade`, like V36.
- **Biome.** `State` from `@ngrx/store` is banned outside `stores/**`; use `store.select`. No `forEach`, no non-null assertions, block statements everywhere, no `console.log`. `**/public` is ignored, so `themeBoot.js` is not formatted or linted: keep it tiny and covered by its spec.
- **knip.** Every export needs a consumer in the same commit. Add palette files and facade exports together with their first use; do not pre-export M5 symbols (the palette builders) in M1. If `npm run lint:deadcode` flags an M1.1 export whose consumer only arrives in M1.4–M1.10, move that export into the consumer's commit. `public/` is outside the knip project.
- **`lint:styles`.** No stylesheet under `app/codeCharta/`; all CSS goes into `app/tailwind.css`.
- **Coverage.** Global 80 % gate: the effect, the mirror repo and the system-scheme service each need their branch cases (no `matchMedia`, malformed mirror, hint dropped or not).
- **Persistence.** Never edit an existing migration. One new numbered migration plus the `DB_VERSION` bump. `activeThemeChanged` must not enter the save allow-list.
- **Zoneless / OnPush.** `matchMedia` callbacks set a signal. No `fakeAsync`; specs use `await fixture.whenStable()`.
- **Clean code.** Hex values live only in `util/theme/palettes/*` and `app/tailwind.css`; no new literals elsewhere. Methods under 25 lines: `ApplyThemeEffect` splits stream construction into private members.
- **Changelog.** One entry for the whole feature, rewritten as milestones land; user wording only.
- **Changelog file.** `visualization/CHANGELOG.md`.
- **Commits.** Conventional commits with scope `visualization` (commitlint `scope-enum`: analysis, visualization, docker, gh-pages, docs, readme, stg, config). Tidy-first: structural commits (M1.2, M4.1) are separate from behavioural ones. Branch name e.g. `feature/dark-theme`.
- **Working plan files.** Do **not** write into the repo's `plans/` folder and do not rely on `.claude/` or local agent memory: the work moves between machines through git only. Per milestone, create `dev_docs/studio/agents/progress/02-themes-M<n>.md` (state, decisions taken, deviations, what is left) that links back to this file, keep its state current, and commit it with the milestone. M0 findings go in this file's Notes section.

## Manual verification

On Windows, `npm run build && npm run package:local` in `visualization/`, then start the packaged app.

1. Fresh profile, Windows in light mode: the app starts in CodeCharta Dark. Pick Follow system: the app turns light; switch Windows to dark: the app follows within a second without reload.
2. Settings → Theme → CodeCharta Light, close and reopen the app: boot spinner and first frame are light, no dark Angular frame (after M2; the native window flash before M6 is expected).
3. Each theme: nav bar, explorer, inspector, metrics bar, legend, context menu, dialogs, toasts, source viewer are readable; borders visible.
4. 3D map in each theme: background, floors by depth, folder names, building labels, connectors, view cube, hover tooltip. Toggle "White Background" on and off.
5. Switch theme while on the Domain view, return to Metrics: the map is recolored. Switch while the Sunburst layout is active, return to the 3D layout.
6. Domain view (word cloud), Dependencies view, radial layouts in each theme, including tooltips.
7. Screenshot to file in CodeCharta Light (transparent) and CodeCharta Dark (opaque, labels readable); paste both into a white document.
8. Load a session saved by 2.11.0: no "could not be fully restored" dialog, and the app is in CodeCharta Dark.
9. "Reset global settings" returns the theme to CodeCharta Dark.
10. Color settings popover: axes and handles of the range diagram visible in dark.

## Out of scope

- User-defined themes, a theme editor, or importing daisyUI's other built-in themes.
- Midnight and High-contrast themes (dropped by the owner); per-theme map data colors.
- Editor-theme logos, icons, fonts or syntax-token mapping beyond the daisyUI color tokens.
- Theming the 3D-print preview and print colors.
- Restyling the ngx-color picker popover.
- Changing light sources or the building shader for dark themes.
- Theme capture in scenarios or in the URL.
- A themed radial folder swatch in the folder-style popover (`radialFolderSwatchSelector` lives in the store and cannot read the active theme; it keeps tinting towards white).
- The native window background before M6; any other Electron change.

## Risks and unknowns

| Risk | Resolution |
|---|---|
| daisyUI 5 plugin syntax, `themes: false` or token names differ from what is written here. | M0 task 2; adjust the CSS blocks and the tailwind.css parsing spec. |
| Dark default exposes hard-coded light colors not listed under "DOM stragglers" (a third-party popover, a toast, an SVG icon). | M1.11 eyeball pass; token fix where possible, else Notes. |
| Editor-scheme values are close to the 4.5:1 limit (Darcula, One Dark). | The registry spec gates every value; adjust only the data files. |
| Users dislike being switched to dark on update. | Owner decision; one click in Settings or the quick toggle (M5) returns to light. |
| External boot script trips CSP under `file://` or changes the inlined critical-CSS script hash. | M0 task 3. Fallback: drop the script, keep only the `prefers-color-scheme` media query in the inline `<style>` (covers "system", not fixed themes). |
| `html2canvas-pro` cannot parse `color-mix()` computed values. | M0 task 4; fallback described there. |
| `toObservable`/signal timing: a render runs before the palette is set. | By design `ThemeService.apply` is synchronous and precedes the action; the clear color is pulled per frame. Covered by the effect spec's ordering assertion. |
| Word cloud re-layout on theme change is slow on large clouds. | Accepted; it happens once per switch. |
| Recoloring a very large map on theme change blocks for the duration of one `recolorBuildings`. | Same cost as changing a map color today; accepted. |
| Dark dependency-graph and view-cube values are untested by eye. | M4.2 / M1.6 acceptance includes a visual pass; values are data, changing them is one file. |
| Another plan bumps `DB_VERSION` to 37 first. | Renumber at merge time. |
| Unhashed `themeBoot.js` cached by a web server after an update. | The mirror format is versioned (`version: 1`); an old script ignores a newer mirror and falls back. |
| `FolderLabelMaterials` turns out to be live. | It only tints towards white/grey/selected; if live, move its two literals into `map.floorLabel` in M1.5. |

## Owner decisions (settled)

- Default theme: **CodeCharta Dark for everyone**, new and existing users (migration V37 seeds it). Follow system is an option, not the default.
- Light theme: CodeCharta Light uses the CodeCharta blue brand palette; today's purple stock-daisyUI look is not kept.
- Theme set: CodeCharta Dark, CodeCharta Light, Nord, One Dark, VS Dark, VS Light, Darcula, IntelliJ Light — color schemes only, no logos. Midnight and High contrast dropped.
- Themes are data (one CSS block + one registry entry).
- Dark screenshots are composited on the theme surface; light ones stay transparent.
- "White Background" stays a per-map override.

## Open questions for the owner

1. ~~**Quick toggle in the top bar?** Assumed: yes, added in M5.4 (toggles between CodeCharta Light and CodeCharta Dark); drop that task if the bar should stay minimal.~~ Decided by the owner (2026-11-18): see OD10.
