import { MetricGlyphKind } from "../../../shared/facade"

export type BarCellKind = MetricGlyphKind | "color" | "edges" | "folders" | "labels" | "scenarios"

export type CellWithSettings = Exclude<BarCellKind, "scenarios">

export const CELL_SETTINGS_TITLES: Record<CellWithSettings, string> = {
    area: "Area settings",
    height: "Height settings",
    color: "Color settings",
    edges: "Edge settings",
    folders: "Folder settings",
    labels: "Label settings"
}

/** Where each cell's button sits in its group of the compact bar, so the icons keep their places between maps. */
export const COMPACT_SLOT_CLASSES: Record<BarCellKind, string> = {
    area: "col-start-1 row-start-1",
    edges: "col-start-1 row-start-2",
    height: "col-start-2 row-start-1",
    folders: "col-start-2 row-start-1",
    color: "col-start-2 row-start-2",
    labels: "col-start-1 row-start-1",
    scenarios: "col-start-1 row-start-2"
}
