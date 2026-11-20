import { ChangeDetectionStrategy, Component, effect, inject, signal, untracked, viewChild } from "@angular/core"
import { GlobalConfigurationDialogComponent } from "../../../globalSettings/facade"
import { CompareStore } from "../../stores/compare.store"
import { CompareDialogComponent } from "../compareDialog/compareDialog.component"

/** Mounts the compare dialog while it is open; hosted by the nav bar so menus that unmount do not take it along. */
@Component({
    selector: "cc-compare-host",
    template: `
        @if (prefill(); as prefill) {
            <cc-compare-dialog [prefill]="prefill" (openDesktopTools)="openDesktopTools()" />
        }
        @if (showsDesktopTools()) {
            <cc-global-configuration-dialog />
        }
    `,
    imports: [CompareDialogComponent, GlobalConfigurationDialogComponent],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class CompareHostComponent {
    readonly prefill = inject(CompareStore).dialogPrefill
    /** Mounted only while open: another Global Configuration lives in the nav bar, and two would list every row twice. */
    readonly showsDesktopTools = signal(false)
    private readonly configuration = viewChild(GlobalConfigurationDialogComponent)

    constructor() {
        effect(() => {
            const configuration = this.configuration()
            if (configuration) {
                untracked(() => this.showUntilClosed(configuration))
            }
        })
    }

    openDesktopTools(): void {
        this.showsDesktopTools.set(true)
    }

    private showUntilClosed(configuration: GlobalConfigurationDialogComponent): void {
        configuration.dialogElement().nativeElement.addEventListener("close", () => this.showsDesktopTools.set(false), { once: true })
        configuration.open()
    }
}
