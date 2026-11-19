import { ChangeDetectionStrategy, Component, inject } from "@angular/core"
import { SCREENSHOT_CAPTURE, ScreenshotButtonComponent, WordCloudScreenshotService } from "../../../screenshot/facade"
import { BarToolComponent, SharedFocusStore, UnfocusToolComponent } from "../../../shared/facade"
import { WordCloudViewStore } from "../../stores/wordCloudView.store"

@Component({
    selector: "cc-domain-toolbox",
    templateUrl: "./domainToolbox.component.html",
    imports: [BarToolComponent, ScreenshotButtonComponent, UnfocusToolComponent],
    providers: [{ provide: SCREENSHOT_CAPTURE, useExisting: WordCloudScreenshotService }],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: "contents" }
})
export class DomainToolboxComponent {
    private readonly focusStore = inject(SharedFocusStore)
    private readonly viewStore = inject(WordCloudViewStore)

    readonly isFocused = this.focusStore.isFocused

    showWholeCloud(): void {
        this.viewStore.requestFit()
    }

    unfocus(): void {
        this.focusStore.unfocus()
    }
}
