import { NgTemplateOutlet } from "@angular/common"
import { ChangeDetectionStrategy, Component, computed, input, TemplateRef } from "@angular/core"
import { injectIsAnyPopoverOpen } from "../../util/injectIsAnyPopoverOpen"
import { BAR_CELL_CLASSES, openBarCellClasses } from "../barShell/barCell"
import { AxisCardHeaderComponent } from "./axisCardHeader.component"

@Component({
    selector: "cc-axis-card",
    templateUrl: "./axisCard.component.html",
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: {
        class: `group relative flex min-w-0 flex-col items-stretch ${BAR_CELL_CLASSES}`,
        "[class]": "openClasses()"
    },
    imports: [NgTemplateOutlet, AxisCardHeaderComponent]
})
export class AxisCardComponent {
    readonly label = input.required<string>()
    readonly metricName = input<string | null>(null)
    readonly hasCog = input(false)
    readonly cogPopoverId = input<string | null>(null)
    readonly cogAnchorName = input<string | null>(null)
    readonly cogIcon = input<TemplateRef<unknown> | null>(null)
    readonly cogTitle = input("Settings")
    readonly searchPopoverId = input<string | null>(null)
    readonly searchAnchorName = input<string | null>(null)
    readonly disabled = input(false)
    readonly dimmed = input(false)
    readonly testId = input<string | null>(null)
    readonly cogTestId = input<string | null>(null)
    readonly minWidthClass = input("")

    readonly cardClasses = "flex flex-col items-stretch gap-1 max-w-[180px] min-w-0"

    private readonly isPopoverOpen = injectIsAnyPopoverOpen(() => [this.cogPopoverId(), this.searchPopoverId()])
    protected readonly openClasses = computed(() => openBarCellClasses(this.isPopoverOpen()))

    readonly bodyAnchorStyle = computed(() => {
        const anchor = this.searchAnchorName()
        return anchor ? `--${anchor}` : null
    })

    readonly contentButtonClasses = computed(() => {
        const classes = ["flex", "flex-col", "items-stretch", "gap-1", "bg-transparent", "border-0", "p-0", "text-current"]
        if (this.disabled()) {
            classes.push("cursor-default")
        } else {
            classes.push("cursor-pointer")
        }
        return classes.join(" ")
    })
}
