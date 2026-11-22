import { ChangeDetectionStrategy, Component, input } from "@angular/core"

export type MetricGlyphKind = "area" | "height"

@Component({
    selector: "cc-metric-glyph",
    templateUrl: "./metricGlyph.component.html",
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: "inline-block shrink-0" }
})
export class MetricGlyphComponent {
    readonly kind = input.required<MetricGlyphKind>()
}
