import { ChangeDetectionStrategy, Component, computed, inject } from "@angular/core"
import { toSignal } from "@angular/core/rxjs-interop"
import { PreferencesReadWindow } from "../../../../stores/preferences/preferences.read.facade"
import { MetricsBarWriteStore } from "../../stores/metricsBar.write.store"
import { injectIsCompactBar } from "../../util/injectIsCompactBar"

const FULL_CLASSES = {
    linked: "btn btn-sm btn-square rounded-lg btn-soft btn-primary",
    unlinked: "btn btn-sm btn-square rounded-lg btn-ghost border border-dashed border-base-300 text-base-content/60"
}
const COMPACT_CLASSES = {
    linked: "btn btn-square w-4 h-full min-h-0 p-0 rounded-md tooltip tooltip-top btn-soft btn-primary",
    unlinked: "btn btn-square w-4 h-full min-h-0 p-0 rounded-md tooltip tooltip-top btn-ghost text-base-content/50"
}

@Component({
    selector: "cc-link-color-height-button",
    templateUrl: "./linkColorHeightButton.component.html",
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { "[class]": "isCompact() ? 'col-start-3 row-start-1 row-span-2 flex' : 'self-center'" }
})
export class LinkColorHeightButtonComponent {
    private readonly preferencesReadWindow = inject(PreferencesReadWindow)
    private readonly metricsBarWriteStore = inject(MetricsBarWriteStore)

    protected readonly isCompact = injectIsCompactBar()
    readonly isLinked = toSignal(this.preferencesReadWindow.isColorMetricLinkedToHeightMetric$, { initialValue: false })

    readonly iconClass = computed(() => `${this.isLinked() ? "fa fa-link" : "fa fa-unlink"}${this.isCompact() ? " text-[10px]" : ""}`)
    readonly title = computed(() => (this.isLinked() ? "Unlink Height and Color Metric" : "Link Height and Color Metric"))
    readonly buttonClass = computed(() => {
        const classes = this.isCompact() ? COMPACT_CLASSES : FULL_CLASSES
        return this.isLinked() ? classes.linked : classes.unlinked
    })

    toggle() {
        this.metricsBarWriteStore.toggleIsHeightAndColorMetricLinked()
    }
}
