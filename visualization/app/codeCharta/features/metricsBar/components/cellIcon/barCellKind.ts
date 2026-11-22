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
