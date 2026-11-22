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
    PublishesHeightDirective
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
    providers: [{ provide: HEIGHT_CSS_VARIABLE, useValue: METRICS_BAR_HEIGHT_CSS_VARIABLE }],
    host: { "[style.bottom]": "barBottom" }
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
    protected readonly metricCellsClasses = computed(() =>
        this.isCompact() ? "grid shrink-0 grid-rows-2 grid-flow-col gap-0.5" : "contents"
    )
}
