import type { CodeMapNode } from "../../../model/codeCharta.model"
import type { ChangedFile } from "../../../model/coreApi/ChangedFile"
import { counted } from "../../../util/wording"

interface MetricDelta {
    metric: string
    /** "+1,240", "−35" or "±0". */
    text: string
}

export interface DeltaChangeSummary {
    added: number
    removed: number
    changed: number
    metricDeltas: MetricDelta[]
}

/** The counts and root deltas of the delta tree, for the current area and height metrics (each once). */
export function deltaChangeSummaryOf(root: CodeMapNode | undefined, metrics: readonly string[]): DeltaChangeSummary {
    const fileCount = root?.fileCount
    return {
        added: fileCount?.added ?? 0,
        removed: fileCount?.removed ?? 0,
        changed: fileCount?.changed ?? 0,
        metricDeltas: [...new Set(metrics)].map(metric => ({ metric, text: signedNumber(root?.deltas?.[metric] ?? 0) }))
    }
}

/** "58 files changed in git (4 renamed)". */
export function gitChangeLine(files: readonly ChangedFile[]): string {
    const renamed = files.filter(file => file.change === "renamed").length
    const line = `${counted(files.length, "file")} changed in git`
    return renamed > 0 ? `${line} (${renamed} renamed)` : line
}

export function signedNumber(value: number): string {
    const magnitude = Math.abs(value).toLocaleString("en-US")
    if (value > 0) {
        return `+${magnitude}`
    }
    return value < 0 ? `−${magnitude}` : `±${magnitude}`
}
