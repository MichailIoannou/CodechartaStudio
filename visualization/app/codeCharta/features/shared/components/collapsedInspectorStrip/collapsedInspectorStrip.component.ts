import { ChangeDetectionStrategy, Component, computed, input, output } from "@angular/core"

const SHOW_INSPECTOR = "Show inspector"
const SHOW_CHANGED_INSPECTOR = "Show inspector — selection changed"

@Component({
    selector: "cc-collapsed-inspector-strip",
    templateUrl: "./collapsedInspectorStrip.component.html",
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class CollapsedInspectorStripComponent {
    readonly name = input.required<string>()
    readonly path = input.required<string>()
    readonly hasUnseenSelection = input(false)
    readonly expand = output<void>()

    readonly showTitle = computed(() => (this.hasUnseenSelection() ? SHOW_CHANGED_INSPECTOR : SHOW_INSPECTOR))
}
