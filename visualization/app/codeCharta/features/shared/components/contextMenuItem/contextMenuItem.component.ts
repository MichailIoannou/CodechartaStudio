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
    /** A disabled item stays listed; its hover hint says why it cannot run. */
    readonly disabled = input(false)

    readonly itemClick = output<void>()
}
