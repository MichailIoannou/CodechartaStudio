import { ChangeDetectionStrategy, Component, inject } from "@angular/core"
import { GlobalConfigurationOpener } from "../../../globalSettings/facade"
import { CompareStore } from "../../stores/compare.store"
import { CompareDialogComponent } from "../compareDialog/compareDialog.component"

/** Mounts the compare dialog while it is open; hosted by the nav bar so menus that unmount do not take it along. */
@Component({
    selector: "cc-compare-host",
    template: `
        @if (prefill(); as prefill) {
            <cc-compare-dialog [prefill]="prefill" (openDesktopTools)="openDesktopTools()" />
        }
    `,
    imports: [CompareDialogComponent],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class CompareHostComponent {
    readonly prefill = inject(CompareStore).dialogPrefill
    private readonly configuration = inject(GlobalConfigurationOpener)

    openDesktopTools(): void {
        this.configuration.openGlobalConfiguration({ section: "desktopTools" })
    }
}
