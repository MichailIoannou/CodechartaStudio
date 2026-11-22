import { ChangeDetectionStrategy, Component, computed, inject } from "@angular/core"
import { toSignal } from "@angular/core/rxjs-interop"
import { MapStateReadWindow } from "../../../../stores/mapState/mapState.read.facade"
import { AxisCardComponent, SettingsShortcut } from "../../../shared/facade"
import { NodeSelectionService } from "../../services/nodeSelection.service"
import { MetricsBarWriteStore } from "../../stores/metricsBar.write.store"
import { cellTooltip } from "../../util/cellTooltip"
import { injectIsCompactBar } from "../../util/injectIsCompactBar"
import { CELL_SETTINGS_TITLES, COMPACT_SLOT_CLASSES } from "../cellIcon/barCellKind"
import { CellIconComponent } from "../cellIcon/cellIcon.component"
import { CompactBarButtonComponent } from "../compactBarButton/compactBarButton.component"
import { EdgeSettingsPopoverComponent } from "../edgeSettingsPopover/edgeSettingsPopover.component"
import { MetricBarSelectPopoverComponent } from "../metricBarSelectPopover/metricBarSelectPopover.component"
import { MetricChooserTypeComponent } from "../metricMetaValue/metricChooserType.component"

@Component({
    selector: "cc-edge-segment",
    templateUrl: "./edgeSegment.component.html",
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: "contents" },
    imports: [
        AxisCardComponent,
        CellIconComponent,
        CompactBarButtonComponent,
        MetricChooserTypeComponent,
        MetricBarSelectPopoverComponent,
        EdgeSettingsPopoverComponent
    ]
})
export class EdgeSegmentComponent {
    private readonly mapStateReadWindow = inject(MapStateReadWindow)
    private readonly metricsBarWriteStore = inject(MetricsBarWriteStore)
    private readonly nodeSelectionService = inject(NodeSelectionService)

    readonly searchPopoverId = "metric-select-popover-edge"
    readonly searchAnchorName = "metric-segment-edges"
    readonly settingsPopoverId = "metric-settings-popover-edge"
    readonly settingsAnchorName = "metric-segment-edges-cog"

    readonly edgeMetric = toSignal(this.mapStateReadWindow.edgeMetric$, { initialValue: "" })
    readonly isEdgeMetricVisible = toSignal(this.mapStateReadWindow.isEdgeMetricVisible$, { initialValue: true })
    protected readonly isCompact = injectIsCompactBar()
    protected readonly compactSlot = COMPACT_SLOT_CLASSES.edges
    protected readonly tooltip = computed(() => cellTooltip("Edges", this.edgeMetric(), this.isEdgeMetricVisible() ? null : "hidden"))
    protected readonly settingsShortcut = computed<SettingsShortcut | null>(() =>
        this.isCompact() ? { label: CELL_SETTINGS_TITLES.edges, popoverId: this.settingsPopoverId } : null
    )

    readonly hoveredNode = toSignal(this.nodeSelectionService.createNodeObservable())

    readonly hoveredEdgeValue = computed(() => {
        const node = this.hoveredNode()
        const metric = this.edgeMetric()
        if (!node || !metric) {
            return null
        }
        const edgeValues = node.edgeAttributes?.[metric]
        if (!edgeValues) {
            return null
        }
        return `${formatValue(edgeValues.incoming)} / ${formatValue(edgeValues.outgoing)}`
    })

    handleMetricSelected(value: string) {
        this.metricsBarWriteStore.setEdgeMetric(value)
    }
}

function formatValue(value?: number): string {
    return typeof value === "number" ? value.toLocaleString() : "-"
}
