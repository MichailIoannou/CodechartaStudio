import { ChangeDetectionStrategy, Component, computed } from "@angular/core"
import { toSignal } from "@angular/core/rxjs-interop"
import { MapStateReadWindow } from "../../../../stores/mapState/mapState.read.facade"
import { PreferencesReadWindow } from "../../../../stores/preferences/preferences.read.facade"
import { AxisCardComponent, injectIsRadialLayout, SettingsShortcut } from "../../../shared/facade"
import { MetricsBarWriteStore } from "../../stores/metricsBar.write.store"
import { cellTooltip } from "../../util/cellTooltip"
import { injectIsCompactBar } from "../../util/injectIsCompactBar"
import { CELL_SETTINGS_TITLES, COMPACT_SLOT_CLASSES } from "../cellIcon/barCellKind"
import { CellIconComponent } from "../cellIcon/cellIcon.component"
import { ColorSettingsPopoverComponent } from "../colorSettingsPopover/colorSettingsPopover.component"
import { CompactBarButtonComponent } from "../compactBarButton/compactBarButton.component"
import { MetricBarSelectPopoverComponent } from "../metricBarSelectPopover/metricBarSelectPopover.component"
import { injectMetricMetaText } from "../metricMetaValue/injectMetricMetaText"
import { MetricMetaValueComponent } from "../metricMetaValue/metricMetaValue.component"

@Component({
    selector: "cc-color-segment",
    templateUrl: "./colorSegment.component.html",
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: "contents" },
    imports: [
        AxisCardComponent,
        CellIconComponent,
        CompactBarButtonComponent,
        MetricBarSelectPopoverComponent,
        MetricMetaValueComponent,
        ColorSettingsPopoverComponent
    ]
})
export class ColorSegmentComponent {
    constructor(
        private readonly mapStateReadWindow: MapStateReadWindow,
        private readonly preferencesReadWindow: PreferencesReadWindow,
        private readonly metricsBarWriteStore: MetricsBarWriteStore
    ) {}

    readonly searchPopoverId = "metric-select-popover-color"
    readonly searchAnchorName = "metric-segment-color"
    readonly settingsPopoverId = "metric-settings-popover-color"
    readonly settingsAnchorName = "metric-segment-color-cog"

    readonly colorMetric = toSignal(this.mapStateReadWindow.colorMetric$, { initialValue: "" })
    private readonly isLinkedToHeight = toSignal(this.preferencesReadWindow.isColorMetricLinkedToHeightMetric$, { initialValue: false })
    private readonly isRadialLayout = injectIsRadialLayout()
    readonly isSelectionLocked = computed(() => this.isLinkedToHeight() && !this.isRadialLayout())

    protected readonly isCompact = injectIsCompactBar()
    protected readonly compactSlot = COMPACT_SLOT_CLASSES.color
    private readonly metaText = injectMetricMetaText(() => "colorMetric")
    protected readonly tooltip = computed(() => cellTooltip("Color", this.colorMetric(), this.metaText()))
    protected readonly settingsShortcut = computed<SettingsShortcut | null>(() =>
        this.isCompact() ? { label: CELL_SETTINGS_TITLES.color, popoverId: this.settingsPopoverId } : null
    )

    handleMetricSelected(value: string) {
        if (this.isLinkedToHeight()) {
            this.metricsBarWriteStore.unlinkColorMetricFromHeightMetric()
        }
        this.metricsBarWriteStore.setColorMetric(value)
    }
}
