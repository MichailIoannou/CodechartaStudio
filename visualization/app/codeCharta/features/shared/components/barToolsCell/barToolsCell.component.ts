import { ChangeDetectionStrategy, Component } from "@angular/core"

@Component({
    selector: "cc-bar-tools-cell",
    template: "<ng-content></ng-content>",
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: {
        class: "grid shrink-0 grid-cols-2 content-center gap-1 px-1 has-[cc-unfocus-tool[data-revealed]]:grid-cols-3",
        role: "toolbar",
        "aria-label": "View tools"
    }
})
export class BarToolsCellComponent {}
