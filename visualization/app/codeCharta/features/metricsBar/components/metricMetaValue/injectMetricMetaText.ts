import { computed, inject, Signal } from "@angular/core"
import { toObservable, toSignal } from "@angular/core/rxjs-interop"
import { switchMap } from "rxjs"
import { PrimaryMetrics } from "../../../../model/codeCharta.model"
import { isLeaf } from "../../../../util/codeMapHelper"
import { NodeSelectionService } from "../../services/nodeSelection.service"
import { MetricsBarReadStore } from "../../stores/metricsBar.read.store"
import { toMetricDisplay } from "./metricDisplay"

/** What a metric card shows under its metric name, as plain text with the delta's sign but not its colour. */
export function injectMetricMetaText(metricFor: () => keyof PrimaryMetrics): Signal<string | null> {
    const readStore = inject(MetricsBarReadStore)
    const node = toSignal(inject(NodeSelectionService).createNodeObservable())
    const primaryMetricNames = toSignal(readStore.primaryMetricNames$)
    const attributeTypeLabel = toSignal(
        toObservable(computed(metricFor)).pipe(switchMap(shownMetric => readStore.attributeTypeLabel$("nodes", shownMetric)))
    )

    return computed(() => {
        const shownNode = node()
        const shownMetric = metricFor()
        const display = toMetricDisplay(shownNode, primaryMetricNames()?.[shownMetric] ?? null, shownMetric)
        if (!display) {
            return null
        }
        const typeLabel = isLeaf(shownNode) ? null : attributeTypeLabel()
        const delta = display.delta ? `Δ${display.delta.signedLabel}` : null
        return [typeLabel, display.value, delta].filter(part => !!part).join(" ")
    })
}
