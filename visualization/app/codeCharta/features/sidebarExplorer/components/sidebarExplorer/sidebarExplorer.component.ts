import { ChangeDetectionStrategy, Component, computed, ElementRef, effect, inject, viewChild } from "@angular/core"
import { ColumnResizeHandleDirective, PANEL_ISLAND_MARGIN_PX, publishBarInset } from "../../../shared/facade"
import { EXPLORER_CAPABILITIES } from "../../explorerCapabilities"
import { EXPLORER_METRIC_RULES } from "../../explorerMetricRules.port"
import { ExplorerCollapseService } from "../../services/explorerCollapse.service"
import { ExplorerModeService } from "../../services/explorerMode.service"
import { ExplorerScrollHostService } from "../../services/explorerScrollHost.service"
import { ExplorerWidthService } from "../../services/explorerWidth.service"
import { ExplorerFocusBannerComponent } from "../explorerFocusBanner/explorerFocusBanner.component"
import { ExplorerHeaderComponent } from "../explorerHeader/explorerHeader.component"
import { ExplorerSearchBarComponent } from "../explorerSearchBar/explorerSearchBar.component"
import { ExplorerSortControlComponent } from "../explorerSortControl/explorerSortControl.component"
import { ExplorerTreeComponent } from "../explorerTree/explorerTree.component"
import { MetricRuleEditorComponent } from "../metricRuleEditor/metricRuleEditor.component"
import { RulesPopoverComponent } from "../rulesPopover/rulesPopover.component"

export const COLLAPSED_STRIP_WIDTH_PX = 300

const EXPANDED_HEIGHT =
    "calc(100vh - var(--cc-bars-height, 49px) - var(--cc-file-extension-bar-height, 0px) - var(--cc-bottom-bar-height, 32px) - 0.75rem)"

// Rebuilding a tree with thousands of open rows froze the app for seconds on every re-open, so the collapsed
// explorer keeps its content, skipped by the renderer at its expanded size, and re-opening only paints it.
// Chrome restyles every row on a class change around them or on a sibling coming or going, so the content
// is hidden by inline styles, clips itself, and whatever comes and goes sits inside wrappers that stay.
const hiddenWhileCollapsedStyle = (width: number) => ({
    position: "absolute",
    width: `${width}px`,
    height: EXPANDED_HEIGHT,
    "content-visibility": "hidden",
    "pointer-events": "none"
})

@Component({
    selector: "cc-sidebar-explorer",
    templateUrl: "./sidebarExplorer.component.html",
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        ColumnResizeHandleDirective,
        ExplorerFocusBannerComponent,
        ExplorerHeaderComponent,
        ExplorerSearchBarComponent,
        ExplorerSortControlComponent,
        ExplorerTreeComponent,
        MetricRuleEditorComponent,
        RulesPopoverComponent
    ],
    host: {
        class: "fixed left-0 z-[60] m-1.5 rounded-[10px] bg-base-100 flex flex-col shadow-lg",
        "[style.width.px]": "displayWidth()",
        "[style.top]": "'var(--cc-bars-height, 49px)'",
        "[style.height]": "isCollapsed() ? 'auto' : expandedHeight"
    }
})
export class SidebarExplorerComponent {
    private readonly collapseService = inject(ExplorerCollapseService)
    private readonly widthService = inject(ExplorerWidthService)
    private readonly scrollHostService = inject(ExplorerScrollHostService)
    private readonly modeService = inject(ExplorerModeService)

    private readonly scrollHost = viewChild<ElementRef<HTMLElement>>("scrollHost")

    readonly capabilities = inject(EXPLORER_CAPABILITIES)

    /** Only views that provide metric values can offer the metric rule editor. */
    readonly hasMetricRules = inject(EXPLORER_METRIC_RULES, { optional: true }) !== null

    readonly expandedHeight = EXPANDED_HEIGHT

    readonly isCollapsed = this.collapseService.isCollapsed
    readonly isFilesMode = this.modeService.isFilesMode
    readonly showsListTools = this.modeService.showsListTools
    readonly width = this.widthService.width
    readonly displayWidth = computed(() => (this.isCollapsed() ? COLLAPSED_STRIP_WIDTH_PX : this.width()))
    readonly contentStyle = computed(() => (this.isCollapsed() ? hiddenWhileCollapsedStyle(this.width()) : null))

    constructor() {
        effect(() => this.scrollHostService.register(this.scrollHost()?.nativeElement ?? null))
        publishBarInset("left", () => (this.isCollapsed() ? "0px" : `${this.width() + PANEL_ISLAND_MARGIN_PX}px`))
    }

    toggle() {
        this.collapseService.toggle()
    }

    setWidth(width: number) {
        this.widthService.setWidth(width)
    }

    resetWidth() {
        this.widthService.reset()
    }
}
