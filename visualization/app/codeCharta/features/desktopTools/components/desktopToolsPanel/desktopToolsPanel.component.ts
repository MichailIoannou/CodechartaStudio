import {
    afterRenderEffect,
    ChangeDetectionStrategy,
    Component,
    computed,
    ElementRef,
    inject,
    signal,
    untracked,
    viewChild
} from "@angular/core"
import type { ToolId } from "../../../../model/coreApi/ToolId"
import { DesktopEnvironment } from "../../../../util/desktop/desktopEnvironment.service"
import { DesktopToolsService } from "../../services/desktopTools.service"
import { describeCoreState, summarize, toToolRows } from "../../services/toolRows"

const TOOL_COUNT = 5

interface FocusRequest {
    tool?: ToolId
}

@Component({
    selector: "cc-desktop-tools-panel",
    templateUrl: "./desktopToolsPanel.component.html",
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class DesktopToolsPanelComponent {
    private readonly desktopTools = inject(DesktopToolsService)
    private readonly environment = inject(DesktopEnvironment)
    private readonly host: HTMLElement = inject(ElementRef).nativeElement
    private readonly section = viewChild.required<ElementRef<HTMLElement>>("section")
    private readonly focusRequest = signal<FocusRequest | null>(null)

    readonly placeholderRows = Array.from({ length: TOOL_COUNT }, (_, index) => index)
    readonly isChecking = this.desktopTools.isChecking
    readonly isChangingStore = this.desktopTools.isChangingStore
    readonly failure = this.desktopTools.failure
    readonly paths = this.desktopTools.paths
    readonly coreNotice = computed(() => describeCoreState(this.environment.coreState()))
    readonly rows = computed(() => {
        const report = this.desktopTools.report()
        return report ? toToolRows(report) : null
    })
    readonly summary = computed(() => {
        const report = this.desktopTools.report()
        return report ? summarize(report) : null
    })
    readonly checkingText = computed(() => {
        const progress = this.desktopTools.progress()
        return progress?.done != null && progress.total != null ? `Checking ${progress.done} of ${progress.total}…` : "Checking…"
    })

    constructor() {
        afterRenderEffect(() => {
            const request = this.focusRequest()
            this.rows()
            this.coreNotice()
            if (request) {
                untracked(() => this.focusWhenShown(request))
            }
        })
    }

    /** Brings the section into view for a link elsewhere; the tool's row may only appear with the next report. */
    reveal(tool?: ToolId) {
        this.section().nativeElement.scrollIntoView({ block: "start" })
        this.focusRequest.set({ tool })
    }

    private focusWhenShown(request: FocusRequest) {
        const target = this.host.querySelector<HTMLElement>(this.focusTargetSelector(request))
        if (target) {
            target.focus()
            this.focusRequest.set(null)
        }
    }

    /** Offline, the rows are hidden and Check again is disabled, so only the heading can take focus. */
    private focusTargetSelector(request: FocusRequest): string {
        if (this.coreNotice() !== null) {
            return "#desktop-tools-heading"
        }
        return request.tool
            ? `[data-testid="desktop-tool-${request.tool}"] [data-testid="desktop-tool-choose"]`
            : `[data-testid="desktop-tools-check-again"]`
    }

    recheck() {
        this.desktopTools.recheck()
    }

    choose(tool: ToolId) {
        this.desktopTools.chooseExecutable(tool)
    }

    useDefault(tool: ToolId) {
        this.desktopTools.useDefault(tool)
    }

    showDataFolder() {
        this.desktopTools.showDataFolder()
    }

    showStoreFolder() {
        this.desktopTools.showStoreFolder()
    }

    changeStoreFolder() {
        this.desktopTools.changeStoreFolder()
    }

    useDefaultStoreFolder() {
        this.desktopTools.useDefaultStoreFolder()
    }

    restartCore() {
        this.desktopTools.restartCore()
    }
}
