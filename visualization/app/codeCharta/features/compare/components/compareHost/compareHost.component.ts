import { ChangeDetectionStrategy, Component, inject } from "@angular/core"
import { GlobalConfigurationDialogComponent } from "../../../globalSettings/facade"
import { CompareStore } from "../../stores/compare.store"
import { CompareDialogComponent } from "../compareDialog/compareDialog.component"

/** Mounts the compare dialog while it is open; hosted by the nav bar so menus that unmount do not take it along. */
@Component({
    selector: "cc-compare-host",
    template: `
        @if (prefill(); as prefill) {
            <cc-compare-dialog [prefill]="prefill" (openDesktopTools)="configuration.open()" />
        }
        <cc-global-configuration-dialog #configuration />
    `,
    imports: [CompareDialogComponent, GlobalConfigurationDialogComponent],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class CompareHostComponent {
    readonly prefill = inject(CompareStore).dialogPrefill
}
