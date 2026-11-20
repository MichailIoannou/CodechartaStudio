import { ChangeDetectionStrategy, Component, computed, inject } from "@angular/core"
import {
    InspectorResizeHandleComponent,
    InspectorWidthService,
    PANEL_ISLAND_MARGIN_PX,
    publishBarInset,
    registerSidePanel
} from "../../../shared/facade"
import { InspectorVisibilityService } from "../../services/inspectorVisibility.service"
import { InspectorClustersComponent } from "../inspectorClusters/inspectorClusters.component"
import { InspectorHeaderComponent } from "../inspectorHeader/inspectorHeader.component"
import { InspectorMetricMappingComponent } from "../inspectorMetricMapping/inspectorMetricMapping.component"
import { InspectorMetricsListComponent } from "../inspectorMetricsList/inspectorMetricsList.component"

@Component({
    selector: "cc-sidebar-inspector",
    templateUrl: "./sidebarInspector.component.html",
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        InspectorClustersComponent,
        InspectorHeaderComponent,
        InspectorMetricMappingComponent,
        InspectorMetricsListComponent,
        InspectorResizeHandleComponent
    ],
    host: {
        class: "fixed right-0 z-[60] m-1.5 w-[var(--cc-inspector-width)] max-w-[90vw] rounded-[10px] bg-base-100 overflow-hidden flex flex-col shadow-lg transition-transform duration-300 [&.translate-x-full]:translate-x-[calc(100%+0.75rem)]",
        "[class.translate-x-full]": "!isVisible()",
        "[class.pointer-events-none]": "!isVisible()",
        "[attr.aria-hidden]": "!isVisible()",
        "[style.top]": "'var(--cc-bars-height, 49px)'",
        "[style.height]":
            "isCollapsed() ? 'auto' : 'calc(100vh - var(--cc-bars-height, 49px) - var(--cc-file-extension-bar-height, 17px) - var(--cc-bottom-bar-height, 32px) - 0.75rem)'"
    }
})
export class SidebarInspectorComponent {
    private readonly visibilityService = inject(InspectorVisibilityService)

    private readonly inspectorWidth = inject(InspectorWidthService).width

    readonly isVisible = this.visibilityService.isVisible
    readonly isCollapsed = this.visibilityService.isCollapsed
    readonly selectedNode = this.visibilityService.selectedNode

    constructor() {
        const isExpanded = this.visibilityService.isExpanded
        publishBarInset("right", () => (isExpanded() ? `calc(var(--cc-inspector-width) + ${PANEL_ISLAND_MARGIN_PX}px)` : "0px"))
        registerSidePanel({
            side: "right",
            isOpen: isExpanded,
            coveredWidthPx: computed(() => this.inspectorWidth() + PANEL_ISLAND_MARGIN_PX),
            collapse: () => this.visibilityService.collapse()
        })
    }

    expand() {
        this.visibilityService.expand()
    }
}
