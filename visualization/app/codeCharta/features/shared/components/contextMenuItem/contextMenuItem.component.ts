import { ChangeDetectionStrategy, Component, input, output } from "@angular/core"

@Component({
    selector: "cc-context-menu-item",
    templateUrl: "./contextMenuItem.component.html",
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: "contents" }
})
export class ContextMenuItemComponent {
    readonly icon = input.required<string>()
    readonly hoverHint = input("")
    readonly buttonId = input<string | null>(null)
    /** Shown instead of the hint; the item stays in the menu but does nothing. */
    readonly disabledReason = input<string | null>(null)

    readonly itemClick = output<void>()

    click(): void {
        if (this.disabledReason() === null) {
            this.itemClick.emit()
        }
    }
}
