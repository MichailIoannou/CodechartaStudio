import { CodeMapNode, PrimaryMetrics } from "../../../../model/codeCharta.model"

export type DeltaDisplay = {
    label: string
    styleClass: string
}

export type MetricDisplay = {
    value: string
    delta: DeltaDisplay | null
}

export function toMetricDisplay(
    node: CodeMapNode | undefined,
    metricName: string | null,
    metricFor: keyof PrimaryMetrics
): MetricDisplay | null {
    if (!node || !metricName) {
        return null
    }
    return {
        value: formatMetricValue(node, metricName),
        delta: toDeltaDisplay(node, metricName, metricFor)
    }
}

function formatMetricValue(node: CodeMapNode, metricName: string): string {
    const value = node.attributes?.[metricName]
    return typeof value === "number" ? value.toLocaleString() : "—"
}

function toDeltaDisplay(node: CodeMapNode, metricName: string, metricFor: keyof PrimaryMetrics): DeltaDisplay | null {
    const delta = node.deltas?.[metricName]
    if (typeof delta !== "number") {
        return null
    }
    return { label: delta.toLocaleString(), styleClass: deltaStyleClass(delta, metricFor) }
}

function deltaStyleClass(delta: number, metricFor: keyof PrimaryMetrics): string {
    if (metricFor === "heightMetric" && delta > 0) {
        return "text-success"
    }
    if (delta < 0) {
        return "text-error"
    }
    return "text-base-content"
}
