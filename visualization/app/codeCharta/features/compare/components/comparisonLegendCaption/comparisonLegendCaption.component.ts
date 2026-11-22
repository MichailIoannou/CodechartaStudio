import { ChangeDetectionStrategy, Component, computed, inject } from "@angular/core"
import { CompareStore } from "../../stores/compare.store"

/** Says which commit the delta colours subtract from which, during a project comparison only. */
@Component({
    selector: "cc-comparison-legend-caption",
    template: `
        @if (sides(); as sides) {
            <span class="text-xs text-base-content/70" data-testid="comparison-legend-caption"
                >Δ = head <span class="font-mono">{{ sides.head }}</span> − base <span class="font-mono">{{ sides.base }}</span></span
            >
        }
    `,
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: "contents" }
})
export class ComparisonLegendCaptionComponent {
    private readonly store = inject(CompareStore)

    readonly sides = computed(() => {
        const { base, head } = this.store.state()
        return this.store.isActive() && base && head ? { base: base.requested.shortCommit, head: head.requested.shortCommit } : null
    })
}
