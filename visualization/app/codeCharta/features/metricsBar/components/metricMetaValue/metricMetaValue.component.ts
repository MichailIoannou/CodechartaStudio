import { ChangeDetectionStrategy, Component, computed, inject, input } from "@angular/core"
import { toSignal } from "@angular/core/rxjs-interop"
import { PrimaryMetrics } from "../../../../model/codeCharta.model"
import { NodeSelectionService } from "../../services/nodeSelection.service"
import { MetricsBarReadStore } from "../../stores/metricsBar.read.store"
import { MetricChooserTypeComponent } from "./metricChooserType.component"
import { toMetricDisplay } from "./metricDisplay"

@Component({
    selector: "cc-metric-meta-value",
    templateUrl: "./metricMetaValue.component.html",
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [MetricChooserTypeComponent]
})
export class MetricMetaValueComponent {
    private readonly nodeSelectionService = inject(NodeSelectionService)
    private readonly metricsBarReadStore = inject(MetricsBarReadStore)

    readonly metricFor = input.required<keyof PrimaryMetrics>()

    readonly node = toSignal(this.nodeSelectionService.createNodeObservable())
    private readonly primaryMetricNames = toSignal(this.metricsBarReadStore.primaryMetricNames$)

    private readonly metricName = computed(() => this.primaryMetricNames()?.[this.metricFor()] ?? null)

    readonly display = computed(() => toMetricDisplay(this.node(), this.metricName(), this.metricFor()))
}
