import { ChangeDetectionStrategy, Component, computed, inject } from "@angular/core"
import { sideName } from "../../services/comparisonText"
import { CompareStore } from "../../stores/compare.store"

/** Says which commit the delta colours subtract from which, during a project comparison only. */
@Component({
    selector: "cc-comparison-legend-caption",
    template: `
        @if (sides(); as sides) {
            <span class="text-xs text-base-content/70" data-testid="comparison-legend-caption"
                >Δ = head <span [class.font-mono]="sides.isHeadACommit">{{ sides.head }}</span> − base
                <span [class.font-mono]="sides.isBaseACommit">{{ sides.base }}</span></span
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
        if (!(this.store.isActive() && base && head)) {
            return null
        }
        return {
            base: sideName(base.requested),
            head: sideName(head.requested),
            isBaseACommit: base.requested.shortCommit !== null,
            isHeadACommit: head.requested.shortCommit !== null
        }
    })
}
