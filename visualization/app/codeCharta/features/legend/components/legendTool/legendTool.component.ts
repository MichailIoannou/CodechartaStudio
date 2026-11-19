import { ChangeDetectionStrategy, Component, inject } from "@angular/core"
import { BarToolComponent } from "../../../shared/facade"
import { LEGEND_PANEL_ID, LegendDrawerStore } from "../../stores/legendDrawer.store"

@Component({
    selector: "cc-legend-tool",
    template: `<cc-bar-tool
        label="Legend"
        icon="fa fa-list"
        [expanded]="isOpen()"
        [controls]="legendPanelId"
        testId="legend-panel-button"
        (activated)="toggle()"
    ></cc-bar-tool>`,
    imports: [BarToolComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: "contents" }
})
export class LegendToolComponent {
    private readonly drawerStore = inject(LegendDrawerStore)

    protected readonly legendPanelId = LEGEND_PANEL_ID
    protected readonly isOpen = this.drawerStore.isOpen

    protected toggle() {
        this.drawerStore.toggle()
    }
}
