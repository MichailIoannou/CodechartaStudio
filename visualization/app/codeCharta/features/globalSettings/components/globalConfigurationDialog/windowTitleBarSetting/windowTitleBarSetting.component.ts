import { ChangeDetectionStrategy, Component, computed, inject } from "@angular/core"
import { WindowControlsService } from "../../../../windowControls/facade"

@Component({
    selector: "cc-window-title-bar-setting",
    templateUrl: "./windowTitleBarSetting.component.html",
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class WindowTitleBarSettingComponent {
    private readonly windowControls = inject(WindowControlsService)

    readonly isChecked = computed(() => this.windowControls.state()?.savedUseAppTitleBar ?? false)
    readonly isRestartNeeded = this.windowControls.isRestartNeeded

    handleChange(event: Event) {
        void this.windowControls.setUseAppTitleBar((event.target as HTMLInputElement).checked)
    }

    restart() {
        void this.windowControls.reopen()
    }
}
