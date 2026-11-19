import { NgTemplateOutlet } from "@angular/common"
import {
    ChangeDetectionStrategy,
    Component,
    computed,
    contentChild,
    ElementRef,
    inject,
    input,
    OnDestroy,
    OnInit,
    TemplateRef
} from "@angular/core"
import { LEGEND_ABOVE_FLOATING_BAR } from "../../models/legendPosition"
import { LEGEND_PANEL_ID, LegendDrawerStore } from "../../stores/legendDrawer.store"

const CONTROLS_OF_THE_PANEL = `[aria-controls='${LEGEND_PANEL_ID}']`

/**
 * The panel the Legend tool in the view's bar opens. Each view puts its own legend inside as an
 * `<ng-template>`, so the legend is only created while the panel is open instead of following every
 * state change behind a closed panel.
 */
@Component({
    selector: "cc-legend-drawer",
    templateUrl: "./legendDrawer.component.html",
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [NgTemplateOutlet]
})
export class LegendDrawerComponent implements OnInit, OnDestroy {
    private readonly elementReference = inject(ElementRef<HTMLElement>)
    private readonly drawerStore = inject(LegendDrawerStore)

    /** Whether the view shows its inspector, which takes the right edge. */
    readonly isMovedAsideByInspector = input(false)

    readonly legendContent = contentChild.required(TemplateRef)

    readonly isOpen = this.drawerStore.isOpen
    readonly legendPanelId = LEGEND_PANEL_ID

    readonly panelBottom = LEGEND_ABOVE_FLOATING_BAR
    readonly panelRight = computed(() => (this.isMovedAsideByInspector() ? "calc(var(--cc-inspector-width) + 40px)" : "40px"))

    private readonly mouseDownListener = (event: MouseEvent) => this.closeOnOutsideClick(event)

    ngOnInit(): void {
        document.addEventListener("mousedown", this.mouseDownListener)
    }

    ngOnDestroy(): void {
        document.removeEventListener("mousedown", this.mouseDownListener)
    }

    private closeOnOutsideClick(event: MouseEvent) {
        if (this.isOpen() && event.target instanceof Element && !this.isInsideOrControlling(event.target)) {
            this.drawerStore.close()
        }
    }

    private isInsideOrControlling(target: Element) {
        return this.elementReference.nativeElement.contains(target) || target.closest(CONTROLS_OF_THE_PANEL) !== null
    }
}
