import { ChangeDetectionStrategy, Component, DestroyRef, inject, viewChild } from "@angular/core"
import { GlobalConfigurationDialogComponent, GlobalConfigurationOpener } from "../../../globalSettings/facade"

@Component({
    selector: "cc-settings-button",
    templateUrl: "./settingsButton.component.html",
    imports: [GlobalConfigurationDialogComponent],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class SettingsButtonComponent {
    dialog = viewChild.required<GlobalConfigurationDialogComponent>("configDialog")

    constructor() {
        const stopServing = inject(GlobalConfigurationOpener).serve(target => this.dialog().open(target))
        inject(DestroyRef).onDestroy(stopServing)
    }

    showSettings() {
        this.dialog().open()
    }
}
