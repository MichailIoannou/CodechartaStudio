import { ChangeDetectionStrategy, Component, computed, inject } from "@angular/core"
import { toSignal } from "@angular/core/rxjs-interop"
import { map } from "rxjs"
import { FileStoreReadWindow } from "../../../../stores/fileStore/fileStore.facade"
import { METRICS_BAR_HEIGHT_CSS_VARIABLE } from "../../../../util/barLayout"
import {
    BAR_BOTTOM_ABOVE_FILE_EXTENSION_BAR,
    BarDividerComponent,
    BarShellDirective,
    BarToolsCellComponent,
    CompactBarDirective,
    HEIGHT_CSS_VARIABLE,
    injectIsRadialLayout,
    PublishesHeightDirective,
    SHORTEST_CARD_NAME_CHARACTERS
} from "../../../shared/facade"
import { MetricsBarReadStore } from "../../stores/metricsBar.read.store"
import { AreaSegmentComponent } from "../areaSegment/areaSegment.component"
import { ColorSegmentComponent } from "../colorSegment/colorSegment.component"
import { DeltaColorSegmentComponent } from "../deltaColorSegment/deltaColorSegment.component"
import { EdgeSegmentComponent } from "../edgeSegment/edgeSegment.component"
import { FoldersSegmentComponent } from "../foldersSegment/foldersSegment.component"
import { HeightSegmentComponent } from "../heightSegment/heightSegment.component"
import { LabelsScenariosSegmentComponent } from "../labelsScenariosSegment/labelsScenariosSegment.component"
import { LayoutCellComponent } from "../layoutCell/layoutCell.component"
import { LinkColorHeightButtonComponent } from "../linkColorHeightButton/linkColorHeightButton.component"

const SHORTEST_METRIC_NAME_CHARACTERS = 12
/** Both forms are as tall, so nothing above or below the bar moves when it switches; the full cards centre their content. */
const SAME_HEIGHT_CLASSES = "h-[4.625rem] py-0 [&_cc-axis-card]:justify-center [&_cc-axis-card]:py-0"
/** The compact form has no gap between its groups; the dividers' margins space them. */
const COMPACT_SPACING_CLASSES = "gap-x-0 [&>cc-bar-divider]:mx-1"
const COMPACT_GROUP_CLASSES = "grid shrink-0 grid-rows-2 grid-flow-col gap-x-0.5 gap-y-1.5 self-center"

@Component({
    selector: "cc-metrics-bar",
    templateUrl: "./metricsBar.component.html",
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        AreaSegmentComponent,
        BarDividerComponent,
        BarToolsCellComponent,
        ColorSegmentComponent,
        DeltaColorSegmentComponent,
        EdgeSegmentComponent,
        FoldersSegmentComponent,
        HeightSegmentComponent,
        LabelsScenariosSegmentComponent,
        LayoutCellComponent,
        LinkColorHeightButtonComponent
    ],
    hostDirectives: [BarShellDirective, CompactBarDirective, PublishesHeightDirective],
    providers: [
        { provide: HEIGHT_CSS_VARIABLE, useValue: METRICS_BAR_HEIGHT_CSS_VARIABLE },
        { provide: SHORTEST_CARD_NAME_CHARACTERS, useValue: SHORTEST_METRIC_NAME_CHARACTERS }
    ],
    host: { class: SAME_HEIGHT_CLASSES, "[class]": "spacingClasses()", "[style.bottom]": "barBottom" }
})
export class MetricsBarComponent {
    readonly barBottom = BAR_BOTTOM_ABOVE_FILE_EXTENSION_BAR

    private readonly fileStoreReadWindow = inject(FileStoreReadWindow)
    private readonly metricsBarReadStore = inject(MetricsBarReadStore)

    readonly isDeltaState = toSignal(this.fileStoreReadWindow.isDeltaState$, { initialValue: false })
    readonly hasEdgeMetric = toSignal(this.metricsBarReadStore.metricData$.pipe(map(metricData => metricData.edgeMetricData.length > 0)), {
        initialValue: false
    })

    readonly isRadialLayout = injectIsRadialLayout()

    readonly showColorMetricSegment = computed(() => !this.isDeltaState())

    protected readonly isCompact = inject(CompactBarDirective).isCompact
    protected readonly metricCellsClasses = computed(() => (this.isCompact() ? COMPACT_GROUP_CLASSES : "contents"))
    protected readonly spacingClasses = computed(() => (this.isCompact() ? COMPACT_SPACING_CLASSES : ""))
}
