import { ChangeDetectionStrategy, Component, computed, inject } from "@angular/core"
import { toSignal } from "@angular/core/rxjs-interop"
import { PreferencesReadWindow } from "../../../../stores/preferences/preferences.read.facade"
import { MetricsBarWriteStore } from "../../stores/metricsBar.write.store"

@Component({
    selector: "cc-link-color-height-button",
    templateUrl: "./linkColorHeightButton.component.html",
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: "self-center" }
})
export class LinkColorHeightButtonComponent {
    private readonly preferencesReadWindow = inject(PreferencesReadWindow)
    private readonly metricsBarWriteStore = inject(MetricsBarWriteStore)

    readonly isLinked = toSignal(this.preferencesReadWindow.isColorMetricLinkedToHeightMetric$, { initialValue: false })

    readonly iconClass = computed(() => (this.isLinked() ? "fa fa-link" : "fa fa-unlink"))
    readonly title = computed(() => (this.isLinked() ? "Unlink Height and Color Metric" : "Link Height and Color Metric"))
    readonly buttonClass = computed(() =>
        this.isLinked()
            ? "btn btn-sm btn-square rounded-lg btn-soft btn-primary"
            : "btn btn-sm btn-square rounded-lg btn-ghost border border-dashed border-base-300 text-base-content/60"
    )

    toggle() {
        this.metricsBarWriteStore.toggleIsHeightAndColorMetricLinked()
    }
}
