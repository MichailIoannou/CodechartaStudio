import { ChangeDetectionStrategy, Component, computed, inject } from "@angular/core"
import type { ToolId } from "../../../../model/coreApi/ToolId"
import { DesktopEnvironment } from "../../../../util/desktop/desktopEnvironment.service"
import { DesktopToolsService } from "../../services/desktopTools.service"
import { describeCoreState, summarize, toToolRows } from "../../services/toolRows"

const TOOL_COUNT = 5

@Component({
    selector: "cc-desktop-tools-panel",
    templateUrl: "./desktopToolsPanel.component.html",
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class DesktopToolsPanelComponent {
    private readonly desktopTools = inject(DesktopToolsService)
    private readonly environment = inject(DesktopEnvironment)

    readonly placeholderRows = Array.from({ length: TOOL_COUNT }, (_, index) => index)
    readonly isChecking = this.desktopTools.isChecking
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

    restartCore() {
        this.desktopTools.restartCore()
    }
}
