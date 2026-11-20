import { ChangeDetectionStrategy, Component } from "@angular/core"

@Component({
    selector: "cc-bar-divider",
    template: "",
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: "my-2 w-px shrink-0 bg-base-300", "aria-hidden": "true" }
})
export class BarDividerComponent {}
