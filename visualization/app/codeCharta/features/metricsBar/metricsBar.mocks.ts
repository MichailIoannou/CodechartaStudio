import { Provider, signal } from "@angular/core"
import { CompactBarDirective } from "../shared/facade"

/** Puts the cells under test into a compact metrics bar. */
export function provideCompactBar(): Provider {
    return { provide: CompactBarDirective, useValue: { isCompact: signal(true).asReadonly() } }
}
