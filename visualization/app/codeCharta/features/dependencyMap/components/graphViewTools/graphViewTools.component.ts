import { ChangeDetectionStrategy, Component, computed, inject } from "@angular/core"
import { toSignal } from "@angular/core/rxjs-interop"
import { DependencyGraphScreenshotService, SCREENSHOT_CAPTURE, ScreenshotButtonComponent } from "../../../screenshot/facade"
import { BarToolComponent, UnfocusToolComponent } from "../../../shared/facade"
import { DependencyMapReadStore } from "../../stores/dependencyMap.read.store"
import { DependencyMapWriteStore } from "../../stores/dependencyMap.write.store"
import { DependencyMapViewStore } from "../../stores/dependencyMapView.store"

@Component({
    selector: "cc-graph-view-tools",
    templateUrl: "./graphViewTools.component.html",
    imports: [BarToolComponent, ScreenshotButtonComponent, UnfocusToolComponent],
    providers: [{ provide: SCREENSHOT_CAPTURE, useExisting: DependencyGraphScreenshotService }],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: "contents" }
})
export class GraphViewToolsComponent {
    private readonly writeStore = inject(DependencyMapWriteStore)
    private readonly viewStore = inject(DependencyMapViewStore)

    readonly isFocused = toSignal(inject(DependencyMapReadStore).isFocused$, { requireSync: true })
    readonly hasMovedBoxes = computed(() => this.viewStore.boxOffsets().size > 0)

    showWholeGraph(): void {
        this.viewStore.requestFit()
    }

    resetLayout(): void {
        this.viewStore.resetLayout()
    }

    unfocus(): void {
        this.writeStore.unfocus()
    }
}
