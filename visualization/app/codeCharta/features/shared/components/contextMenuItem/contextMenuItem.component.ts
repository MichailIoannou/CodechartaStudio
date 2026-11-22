import { ChangeDetectionStrategy, Component, computed, input, output } from "@angular/core"

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
    /** A disabled item stays listed; its hover hint says why it cannot run. */
    readonly disabled = input(false)
    /** Shown instead of the hint; the item stays in the menu but does nothing. */
    readonly disabledReason = input<string | null>(null)

    readonly isDisabled = computed(() => this.disabled() || this.disabledReason() !== null)

    readonly itemClick = output<void>()

    click(): void {
        if (!this.isDisabled()) {
            this.itemClick.emit()
        }
    }
}
