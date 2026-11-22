import { NgTemplateOutlet } from "@angular/common"
import { ChangeDetectionStrategy, Component, computed, input, TemplateRef } from "@angular/core"

const COG_BUTTON_CLASSES = "btn btn-ghost btn-xs btn-square shrink-0 rounded-lg"
const ICON_BUTTON_CLASSES = "text-base-content/70 hover:text-base-content"

@Component({
    selector: "cc-axis-card-header",
    templateUrl: "./axisCardHeader.component.html",
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: "contents" },
    imports: [NgTemplateOutlet]
})
export class AxisCardHeaderComponent {
    readonly label = input.required<string>()
    readonly hasCog = input(false)
    readonly cogPopoverId = input<string | null>(null)
    readonly cogAnchorName = input<string | null>(null)
    readonly cogTestId = input<string | null>(null)
    readonly cogIcon = input<TemplateRef<unknown> | null>(null)
    readonly cogTitle = input("Settings")

    readonly cogAnchorStyle = computed(() => {
        const anchor = this.cogAnchorName()
        return anchor ? `--${anchor}` : null
    })

    protected readonly cogButtonClasses = computed(() =>
        this.cogIcon() ? `${COG_BUTTON_CLASSES} ${ICON_BUTTON_CLASSES}` : COG_BUTTON_CLASSES
    )
}
