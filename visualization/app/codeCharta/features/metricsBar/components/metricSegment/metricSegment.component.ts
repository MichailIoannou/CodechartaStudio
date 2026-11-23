import { ChangeDetectionStrategy, Component, computed, input, output } from "@angular/core"
import { PrimaryMetrics } from "../../../../model/codeCharta.model"
import { AxisCardComponent, MetricGlyphKind, SettingsShortcut } from "../../../shared/facade"
import { cellTooltip } from "../../util/cellTooltip"
import { injectIsCompactBar } from "../../util/injectIsCompactBar"
import { CELL_SETTINGS_TITLES, COMPACT_SLOT_CLASSES } from "../cellIcon/barCellKind"
import { CellIconComponent } from "../cellIcon/cellIcon.component"
import { CompactBarButtonComponent } from "../compactBarButton/compactBarButton.component"
import { MetricBarSelectPopoverComponent } from "../metricBarSelectPopover/metricBarSelectPopover.component"
import { injectMetricMetaText } from "../metricMetaValue/injectMetricMetaText"
import { MetricMetaValueComponent } from "../metricMetaValue/metricMetaValue.component"

@Component({
    selector: "cc-metric-segment",
    templateUrl: "./metricSegment.component.html",
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: "contents" },
    imports: [AxisCardComponent, CellIconComponent, CompactBarButtonComponent, MetricMetaValueComponent, MetricBarSelectPopoverComponent]
})
export class MetricSegmentComponent {
    readonly label = input.required<string>()
    readonly cell = input.required<MetricGlyphKind>()
    readonly metricName = input("")
    readonly metricFor = input.required<keyof PrimaryMetrics>()
    readonly placeholder = input("")
    readonly searchPopoverId = input.required<string>()
    readonly searchAnchorName = input.required<string>()
    readonly hasSettings = input(true)
    readonly settingsPopoverId = input.required<string>()
    readonly settingsAnchorName = input.required<string>()
    readonly testIdPrefix = input.required<string>()
    readonly metricSelected = output<string>()

    protected readonly isCompact = injectIsCompactBar()
    protected readonly settingsTitle = computed(() => CELL_SETTINGS_TITLES[this.cell()])
    protected readonly compactSlot = computed(() => COMPACT_SLOT_CLASSES[this.cell()])
    private readonly metaText = injectMetricMetaText(() => this.metricFor())
    protected readonly tooltip = computed(() => cellTooltip(this.label(), this.metricName(), this.metaText()))

    protected readonly settingsShortcut = computed<SettingsShortcut | null>(() =>
        this.isCompact() && this.hasSettings() ? { label: this.settingsTitle(), popoverId: this.settingsPopoverId() } : null
    )
}
