import { ChangeDetectionStrategy, Component, input } from "@angular/core"

const LAYOUT_CLASSES = "grid shrink-0 grid-cols-2 content-center has-[cc-unfocus-tool[data-revealed]]:grid-cols-3"
const FULL_CLASSES = `${LAYOUT_CLASSES} gap-1 px-1`
const COMPACT_CLASSES = `${LAYOUT_CLASSES} gap-x-0.5 gap-y-1.5 [&_.btn]:size-7 [&_.btn]:min-h-0`

@Component({
    selector: "cc-bar-tools-cell",
    template: "<ng-content></ng-content>",
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: {
        "[class]": "isCompact() ? compactClasses : fullClasses",
        role: "toolbar",
        "aria-label": "View tools"
    }
})
export class BarToolsCellComponent {
    readonly isCompact = input(false)

    protected readonly fullClasses = FULL_CLASSES
    protected readonly compactClasses = COMPACT_CLASSES
}
