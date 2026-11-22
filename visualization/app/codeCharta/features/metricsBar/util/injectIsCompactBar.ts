import { inject, Signal, signal } from "@angular/core"
import { CompactBarDirective } from "../../shared/facade"

/** Whether the metrics bar a cell sits in shows its compact form; outside the bar a cell is always full. */
export function injectIsCompactBar(): Signal<boolean> {
    return inject(CompactBarDirective, { optional: true })?.isCompact ?? signal(false).asReadonly()
}
