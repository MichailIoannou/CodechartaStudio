import { booleanAttribute, ChangeDetectionStrategy, Component, computed, input, output } from "@angular/core"

const BUTTON_CLASSES = "btn btn-sm btn-square rounded-lg"
const IDLE_CLASSES = "btn-ghost"
const ACTIVE_CLASSES = "btn-soft btn-primary btn-active"
const HIGHLIGHTED_CLASSES = "btn-ghost text-secondary"

@Component({
    selector: "cc-bar-tool",
    templateUrl: "./barTool.component.html",
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: {
        "[class.hidden]": "!revealed()",
        "[attr.inert]": "revealed() ? null : ''"
    }
})
export class BarToolComponent {
    readonly label = input.required<string>()
    readonly icon = input.required<string>()
    readonly tooltip = input<string | null>(null)
    readonly disabled = input(false, { transform: booleanAttribute })
    readonly pressed = input<boolean | null>(null)
    readonly expanded = input<boolean | null>(null)
    readonly controls = input<string | null>(null)
    readonly highlighted = input(false, { transform: booleanAttribute })
    readonly revealed = input(true)
    readonly testId = input<string | null>(null)

    readonly activated = output<void>()

    protected readonly buttonClasses = computed(() => `${BUTTON_CLASSES} ${this.stateClasses()}`)

    private stateClasses() {
        if (this.pressed() || this.expanded()) {
            return ACTIVE_CLASSES
        }
        return this.highlighted() ? HIGHLIGHTED_CLASSES : IDLE_CLASSES
    }
}
