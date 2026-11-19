import { computed, Injectable, inject, signal } from "@angular/core"
import { ComparePrefill, CompareState, IDLE_COMPARISON } from "../model/compare.model"
import { CompareReadStore } from "./compare.read.store"

/** The comparison of two project snapshots; feature-local, never persisted. */
@Injectable({ providedIn: "root" })
export class CompareStore {
    private readonly readStore = inject(CompareReadStore)
    private readonly comparison = signal<CompareState>(IDLE_COMPARISON)
    private readonly prefill = signal<ComparePrefill | null>(null)

    readonly state = this.comparison.asReadonly()
    /** Non-null while the compare dialog is open. */
    readonly dialogPrefill = this.prefill.asReadonly()
    /** True only while the store still selects exactly the compared pair, so a selection changed elsewhere ends the label. */
    readonly isActive = computed(() => {
        const { phase, base, head } = this.comparison()
        return (
            phase === "active" &&
            base?.checksum === this.readStore.referenceChecksum() &&
            head?.checksum === this.readStore.comparisonChecksum()
        )
    })
    readonly isShowingNoDifferences = computed(() => {
        const { phase, head } = this.comparison()
        return phase === "noDifferences" && head !== null && this.readStore.loadedChecksums().has(head.checksum)
    })

    set(state: CompareState): void {
        this.comparison.set(state)
    }

    update(change: Partial<CompareState>): void {
        this.comparison.update(state => ({ ...state, ...change }))
    }

    reset(): void {
        this.comparison.set(IDLE_COMPARISON)
    }

    openDialog(prefill: ComparePrefill): void {
        this.prefill.set(prefill)
    }

    closeDialog(): void {
        this.prefill.set(null)
    }
}
