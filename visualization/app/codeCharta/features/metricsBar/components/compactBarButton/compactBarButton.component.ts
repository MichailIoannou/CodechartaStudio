import { ChangeDetectionStrategy, Component, computed, input } from "@angular/core"
import { injectIsAnyPopoverOpen } from "../../../shared/facade"

const BUTTON_CLASSES = "btn btn-ghost btn-square min-h-0 rounded-lg text-base-content/80 hover:bg-base-200"
const SQUARE_CLASSES = "size-7"
const TALL_CLASSES = "h-full w-7 flex-col gap-0.5"
const OPEN_CLASSES = "btn-active ring-1 ring-primary/40"
const TOOLTIP_CLASSES = "tooltip tooltip-top"
const DIMMED_CLASSES = "text-base-content/40"

/** One cell of the compact metrics bar: its icon, its card in a tooltip, and the popover the card opens. */
@Component({
    selector: "cc-compact-bar-button",
    templateUrl: "./compactBarButton.component.html",
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: "flex" }
})
export class CompactBarButtonComponent {
    readonly tooltip = input.required<string>()
    readonly popoverId = input.required<string>()
    readonly anchorNames = input<readonly string[]>([])
    readonly popoverIds = input<readonly string[]>([])
    readonly isTall = input(false)
    readonly isDimmed = input(false)
    readonly testId = input<string | null>(null)

    protected readonly isOpen = injectIsAnyPopoverOpen(() => [this.popoverId(), ...this.popoverIds()])

    protected readonly anchorStyle = computed(
        () =>
            this.anchorNames()
                .map(name => `--${name}`)
                .join(", ") || null
    )
    protected readonly anchorAttribute = computed(() => this.anchorNames().join(" ") || null)

    protected readonly buttonClasses = computed(() =>
        [
            BUTTON_CLASSES,
            this.isTall() ? TALL_CLASSES : SQUARE_CLASSES,
            this.isOpen() ? OPEN_CLASSES : TOOLTIP_CLASSES,
            this.isDimmed() ? DIMMED_CLASSES : ""
        ].join(" ")
    )
}
