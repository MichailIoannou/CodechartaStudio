import { NgTemplateOutlet } from "@angular/common"
import { ChangeDetectionStrategy, Component, computed, ElementRef, effect, inject, untracked, viewChild } from "@angular/core"
import { DependencyLeafEdge } from "../../../../model/codeCharta.model"
import { EDGE_TYPE_LABELS } from "../../../../renderer/dependencyGraph/dependencyGraph.facade"
import { CopyToClipboardService } from "../../../../util/copyToClipboard.service"
import {
    COLLAPSED_STRIP_WIDTH_PX,
    CollapsedInspectorStripComponent,
    InspectorResizeHandleComponent,
    InspectorWidthService,
    PANEL_ISLAND_MARGIN_PX,
    publishBarInset,
    registerSidePanel
} from "../../../shared/facade"
import { InspectorCycle } from "../../inspector/inspectorCycles"
import {
    INSPECTOR_SECTION_TITLES,
    InspectorActionKind,
    InspectorSectionId,
    InspectorUpwardDependency
} from "../../inspector/inspectorModel"
import { InspectorReference } from "../../inspector/inspectorReferences"
import { DependencyInspectorStore } from "../../stores/dependencyInspector.store"
import { DependencyInspectorCollapseStore } from "../../stores/dependencyInspectorCollapse.store"
import { DeclarationKindIconComponent } from "../declarationKindIcon/declarationKindIcon.component"
import { LineStyleSampleComponent } from "../lineStyleSample/lineStyleSample.component"
import { PointingDirective } from "../pointing/pointing.directive"

const ACTION_LABELS: Record<InspectorActionKind, string> = {
    open: "Open in graph",
    close: "Close in graph",
    unfold: "Unfold in graph"
}

const REFERENCE_ICONS: Record<"folder" | "file", string> = { folder: "fa fa-folder-o", file: "fa fa-file-o" }

@Component({
    selector: "cc-dependency-inspector",
    templateUrl: "./dependencyInspector.component.html",
    imports: [
        NgTemplateOutlet,
        CollapsedInspectorStripComponent,
        DeclarationKindIconComponent,
        InspectorResizeHandleComponent,
        LineStyleSampleComponent,
        PointingDirective
    ],
    providers: [CopyToClipboardService],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: {
        class: "absolute inset-y-1.5 right-1.5 flex w-[var(--cc-inspector-width)] max-w-[90vw] flex-col overflow-hidden rounded-[10px] bg-base-100 shadow-lg transition-transform duration-300 [&.translate-x-full]:translate-x-[calc(100%+0.75rem)]",
        "[class.translate-x-full]": "model() === null",
        "[class.pointer-events-none]": "model() === null",
        "[attr.aria-hidden]": "model() === null",
        "[style.bottom]": "isCollapsed() ? 'auto' : null",
        "[style.width.px]": "isCollapsed() ? collapsedStripWidthPx : null"
    }
})
export class DependencyInspectorComponent {
    private readonly store = inject(DependencyInspectorStore)
    private readonly collapseStore = inject(DependencyInspectorCollapseStore)
    private readonly inspectorWidth = inject(InspectorWidthService).width

    protected readonly model = this.store.model
    protected readonly edgeColors = this.store.edgeColors
    protected readonly isCollapsed = this.collapseStore.isCollapsed
    protected readonly hasUnseenSelection = this.collapseStore.hasUnseenSelection
    protected readonly collapsedStripWidthPx = COLLAPSED_STRIP_WIDTH_PX

    private readonly cyclesSection = viewChild<ElementRef<HTMLElement>>("cyclesSection")
    private readonly upwardSection = viewChild<ElementRef<HTMLElement>>("upwardSection")
    private readonly shownPath = computed(() => this.model()?.path)
    private readonly clipboard = inject(CopyToClipboardService)

    readonly actionLabels = ACTION_LABELS
    readonly edgeTypeLabels = EDGE_TYPE_LABELS
    readonly copied = this.clipboard.copied

    constructor() {
        const isExpanded = this.collapseStore.isExpanded
        publishBarInset("right", () => (isExpanded() ? `calc(var(--cc-inspector-width) + ${PANEL_ISLAND_MARGIN_PX}px)` : "0px"))
        registerSidePanel({
            side: "right",
            isOpen: isExpanded,
            coveredWidthPx: computed(() => this.inspectorWidth() + PANEL_ISLAND_MARGIN_PX),
            collapse: () => this.collapseStore.collapse()
        })
        effect(() => {
            const request = this.store.sectionRequest()
            const badgeSections = { cycles: this.cyclesSection(), upward: this.upwardSection() }
            const section = request && badgeSections[request.sectionId]?.nativeElement
            if (section) {
                section.scrollIntoView({ block: "start" })
                untracked(() => this.store.answerSectionRequest())
            }
        })
        effect(() => {
            this.shownPath()
            untracked(() => this.clipboard.reset())
        })
    }

    /** Without a clipboard to write to, as on a page served over plain http, nothing is copied and nothing says so. */
    async copyPath(): Promise<void> {
        const text = this.model()?.copyText
        if (text) {
            await this.clipboard.copy(text).catch(() => undefined)
        }
    }

    readonly icons = REFERENCE_ICONS
    protected readonly sectionTitles = INSPECTOR_SECTION_TITLES
    /** An edge has one section and nothing else to tell, so it is not folded away. */
    protected readonly foldsItsSections = computed(() => this.model()?.kind !== "edge")

    protected isOpen(sectionId: InspectorSectionId): boolean {
        return this.store.openSections().has(sectionId)
    }

    protected showsBodyOf(sectionId: InspectorSectionId): boolean {
        return !this.foldsItsSections() || this.isOpen(sectionId)
    }

    protected toggleSection(sectionId: InspectorSectionId): void {
        this.store.toggleSection(sectionId)
    }

    protected goTo(reference: InspectorReference): void {
        this.store.goTo(reference)
    }

    protected pointAtEdges(declarationEdges: readonly DependencyLeafEdge[] | null): void {
        this.store.pointAtEdges(declarationEdges)
    }

    protected pointAtNode(path: string | null): void {
        this.store.pointAtNode(path)
    }

    protected perform(action: InspectorActionKind): void {
        this.store.perform(action)
    }

    protected showCycle(cycle: InspectorCycle): void {
        this.store.showCycle(cycle)
    }

    protected showUpwardDependency(upward: InspectorUpwardDependency): void {
        this.store.showUpwardDependency(upward)
    }

    protected showAllRows(): void {
        this.store.showAllRows()
    }

    protected expand(): void {
        this.collapseStore.expand()
    }

    protected dismiss(): void {
        this.store.dismiss()
    }
}
