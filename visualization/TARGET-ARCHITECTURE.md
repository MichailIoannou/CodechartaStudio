# Target architecture (visualization)

The layering `.dependency-cruiser.js` enforces. Rule names are quoted so a violation message
leads back here. This file is referenced from `.dependency-cruiser.js` ("Open questions" below).

## Tiers

Top to bottom. An import may point **down**, never up.

| Tier | Path | Holds |
| --- | --- | --- |
| Views | `views/` | Routes and page composition. Owns no logic. |
| Load | `load/` | Startup orchestrator: hydrates state from a persisted/URL cc.json. |
| Features | `features/<f>/` | UI. `components/` → `stores/*.read\|write.store.ts` → home facades. |
| Renderer | `renderer/` | The rendering engines plus the derived read-model they consume. |
| Lenses | `lenses/` | Pure cc.json projections (metrics, dependency, domain). Data, never view state. |
| Stores | `stores/<home>/` | ngrx state homes and the cc.json source stores. Leaves. |
| Kernel | `model/`, `util/` | Types and pure helpers. Imported by everyone, imports nothing. |

## Access rules

- **Nothing imports `views/`** — `nothing-imports-views`.
- **A feature is reached only through `facade.ts`** (or its `effects/<f>.effects.ts` manifest) —
  `feature-no-external-access-to-internals`, `feature-cross-feature-only-via-public-api`.
  `components/` is not a public surface.
- **Only a feature's `stores/`, `selectors/`, `effects/` may import `@ngrx/store`** —
  `feature-only-stores-can-import-ngrx-store`. No component touches ngrx directly.
- **A state home is a leaf** — `state-home-is-leaf`. It reads the kernel and its own `store/`,
  nothing else. External code goes through its read/write facade
  (`feature-reaches-state-home-only-via-facade`), and only the write facade may hand out actions
  (`state-home-write-facade-is-sole-dispatch-surface`).
- **A home's root selector stays in its home** — `home-selectors-are-declared-in-their-home`.
  Consumers get a *named derived* selector, never `state => state.<home>`.
- **A lens never reads view state** — `lens-no-view-state`. Selection, blacklist and edge
  visibility arrive as explicit parameters from the composing layer.
- **`renderer/` never imports up** — `renderer-does-not-import-up`. It sits below the features
  that drive it and the views that host them.

## State homes

A home is named after **the state it holds**, not after the UI that edits it.

| Home | Holds |
| --- | --- |
| `mapState` | The 3D map renderer's settings: metric selection, layout, colors, labels, scaling. |
| `domainState` | The word-cloud renderer's settings: shape, size/rotation range, grid, top-N. |
| `sharedView` | Focus, search, blacklist, marked packages. |
| `preferences` | Durable global preferences. |
| `metricsLensSource`, `dependencyLensSource`, `domainLensSource` | cc.json-derived source data. |
| `fileStore` | Loaded files. The source; sits below every view layer. |
| `rootStore` | The sole composer — `root-store-is-sole-composer`. |

`domainState` was called `domainBar` until the v19 IndexedDB migration. It was named after the
settings bar that edits it, which made it look like feature state; it is the peer of `mapState`.
The renaming pitfall: `features/domainBar/` is a genuine bar and keeps its name.

Renaming a home's slice key changes the persisted `CcState` shape and **requires a numbered
migration** in `stores/rootStore/indexedDB/indexedDBWriter.ts` plus a `DB_VERSION` bump. Existing
migrations are never rewritten — each `vN` reshapes blobs written before `vN`, so it keeps
referring to the key names that were current at the time.

## Renderers

A **rendering engine belongs in `renderer/`**, behind a facade, below the features that drive it.
`renderer/renderModel/` is the shared derived read-model both engines read
(`render-model-external-access-only-via-facade`).

- `renderer/threeViewer/` — Three.js: scene, camera, mesh, shaders, layout algorithms.
- `renderer/wordCloud/` — ECharts + `echarts-wordcloud` (2D canvas).

A second engine living under `features/` is a deviation, not a pattern. The word cloud sat in
`features/wordCloud/` while being ported from DomainLanguageCharta as-is
(`plans/2026-07-18-domain-view-word-cloud.md`) and was promoted afterwards.

The split that makes an engine movable: keep option/geometry construction **pure** (the word
cloud's `wordCloudOption.builder.ts`, the map's `geometryGenerator`) and keep the component a
thin host that owns only the canvas, the resize observer and the render debounce.

## Desktop shell and core

The desktop app is three processes: this Angular bundle (the renderer), the Electron main process in
`electron/` (the shell) and the headless Rust core in `core/` at the repository root. Everything that is
not presentation — projects, the managed store, git, `ccsh` runs, snapshots, comparisons — belongs in the
core, which knows nothing about Electron or Angular. The shell only starts the core, relays between it and
the renderer, and does what needs Electron (window, native dialogs, reveal in the file manager); it holds
no domain logic. The renderer reaches the core only through the shell, never directly.

The contract between them is generated from the core: `model/coreApi/` (TypeScript types and the method
map, a Kernel-tier leaf that imports only itself) and `electron/coreMethods.generated.json` (the shell's
allow-list of methods the renderer may call). Both are regenerated with `npm run contract` and never edited
by hand. The web build does not use any of it and must keep working without a core.

## Open questions

- `features/shared/` is reached directly by sibling features (`publishesHeight`), which
  `feature-cross-feature-only-via-public-api` rejects. Either `shared/` gets a `facade.ts` or the
  rule gains a `shared/` exemption.
- `load/` is still top-level and unplaced; it behaves as a top tier but is not a view.
