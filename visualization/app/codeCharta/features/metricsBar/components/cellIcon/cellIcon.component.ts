import { ChangeDetectionStrategy, Component, computed, input } from "@angular/core"
import { MetricGlyphComponent, MetricGlyphKind } from "../../../shared/facade"
import { BarCellKind } from "./barCellKind"

export type CellIconSize = "card" | "compact"

const FONT_AWESOME_ICONS: Record<Exclude<BarCellKind, MetricGlyphKind>, string> = {
    color: "fa-solid fa-palette",
    edges: "fa-solid fa-circle-nodes",
    folders: "fa-regular fa-folder",
    labels: "fa-solid fa-tags",
    scenarios: "fa-regular fa-bookmark"
}

const GLYPH_SIZES: Record<CellIconSize, string> = { card: "size-3.5", compact: "size-4" }
const FONT_AWESOME_SIZES: Record<CellIconSize, string> = { card: "text-[13px]", compact: "text-[15px]" }

@Component({
    selector: "cc-cell-icon",
    templateUrl: "./cellIcon.component.html",
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: "inline-flex items-center justify-center", "[attr.data-bar-icon]": "cell()" },
    imports: [MetricGlyphComponent]
})
export class CellIconComponent {
    readonly cell = input.required<BarCellKind>()
    readonly size = input<CellIconSize>("card")

    protected readonly glyph = computed(() => {
        const cell = this.cell()
        return isMetricGlyph(cell) ? cell : null
    })
    protected readonly glyphClasses = computed(() => GLYPH_SIZES[this.size()])
    protected readonly fontAwesomeClasses = computed(() => {
        const cell = this.cell()
        return isMetricGlyph(cell) ? "" : `${FONT_AWESOME_ICONS[cell]} ${FONT_AWESOME_SIZES[this.size()]}`
    })
}

function isMetricGlyph(cell: BarCellKind): cell is MetricGlyphKind {
    return cell === "area" || cell === "height"
}
