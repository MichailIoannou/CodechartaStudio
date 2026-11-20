import { ChangeDetectionStrategy, Component, inject, signal } from "@angular/core"
import { SCREENSHOT_CAPTURE, ScreenshotButtonComponent, ScreenshotService } from "../../../screenshot/facade"
import { FloatingMenuAnchor, UnfocusToolComponent } from "../../../shared/facade"
import { MapToolsReadStore } from "../../stores/mapTools.read.store"
import { MapToolsWriteStore } from "../../stores/mapTools.write.store"
import { CenterMapButtonComponent } from "../centerMapButton/centerMapButton.component"
import { CenterMapZoomMenuComponent } from "../centerMapZoomMenu/centerMapZoomMenu.component"
import { PresentationModeButtonComponent } from "../presentationModeButton/presentationModeButton.component"

@Component({
    selector: "cc-map-tools",
    templateUrl: "./mapTools.component.html",
    imports: [
        CenterMapButtonComponent,
        CenterMapZoomMenuComponent,
        PresentationModeButtonComponent,
        ScreenshotButtonComponent,
        UnfocusToolComponent
    ],
    providers: [{ provide: SCREENSHOT_CAPTURE, useExisting: ScreenshotService }],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: "contents" }
})
export class MapToolsComponent {
    private readonly writeStore = inject(MapToolsWriteStore)

    protected readonly isFocused = inject(MapToolsReadStore).isFocused
    protected readonly zoomMenuAnchor = signal<FloatingMenuAnchor | null>(null)

    protected unfocus() {
        this.writeStore.unfocus()
    }
}
