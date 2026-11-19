import { DestroyRef, effect, Injectable, inject, signal, untracked } from "@angular/core"
import type { ErrorCode } from "../../../model/coreApi/ErrorCode"
import type { ErrorPayload } from "../../../model/coreApi/ErrorPayload"
import type { PathsInfo } from "../../../model/coreApi/PathsInfo"
import type { ProgressParams } from "../../../model/coreApi/ProgressParams"
import type { ToolId } from "../../../model/coreApi/ToolId"
import type { ToolsReport } from "../../../model/coreApi/ToolsReport"
import type { CoreResult, DesktopBridge } from "../../../util/desktop/desktopBridge"
import { DesktopEnvironment } from "../../../util/desktop/desktopEnvironment.service"
import { ToastService } from "../../shared/facade"
import { StoreFolderService } from "./storeFolder.service"
import { toolName } from "./toolRows"

const SILENT_ERRORS: ErrorCode[] = ["CANCELLED", "CORE_UNAVAILABLE"]
const WINDOWS_PROGRAMS = { name: "Programs", extensions: ["exe", "cmd", "bat"] }
const OPERATION_PREFIX = "desktop-tools-check-"

@Injectable({ providedIn: "root" })
export class DesktopToolsService {
    private readonly environment = inject(DesktopEnvironment)
    private readonly toastService = inject(ToastService)
    private readonly storeFolder = inject(StoreFolderService)
    private hasStartedLoading = false
    private checkCount = 0
    private runningCheck: string | null = null

    readonly report = signal<ToolsReport | null>(null)
    readonly paths = signal<PathsInfo | null>(null)
    readonly isChecking = signal(false)
    readonly progress = signal<ProgressParams | null>(null)
    readonly failure = signal<string | null>(null)
    readonly isChangingStore = this.storeFolder.isChanging

    constructor() {
        const unsubscribe = this.bridge.subscribe("core.progress", progress => this.followProgress(progress))
        inject(DestroyRef).onDestroy(unsubscribe)
        effect(() => {
            const isCoreReady = this.environment.coreState().state === "ready"
            untracked(() => (isCoreReady ? this.load() : this.forgetLoad()))
        })
    }

    async load() {
        if (this.hasStartedLoading) {
            return
        }
        this.hasStartedLoading = true
        await this.check(this.bridge.request("tools.doctor", { refresh: false }))
    }

    async recheck() {
        if (this.isChecking()) {
            return
        }
        this.checkCount += 1
        const operationId = `${OPERATION_PREFIX}${this.checkCount}`
        this.runningCheck = operationId
        this.isChecking.set(true)
        await this.check(this.bridge.request("tools.doctor", { refresh: true }, { operationId }))
        this.runningCheck = null
        this.progress.set(null)
        this.isChecking.set(false)
    }

    async chooseExecutable(tool: ToolId) {
        const name = toolName(tool)
        const result = await this.bridge.chooseToolExecutable(tool, { title: `Choose the ${name} executable`, filters: pickerFilters() })
        if (!("error" in result)) {
            this.showReport(result.value)
            return
        }
        this.toastUnlessSilent(result.error, `The chosen file is not a working ${name}: ${result.error.message}`)
    }

    async useDefault(tool: ToolId) {
        await this.check(this.bridge.request("tools.clearPath", { tool }))
    }

    async showDataFolder() {
        await this.reveal("dataFolder")
    }

    async showStoreFolder() {
        await this.reveal("storeRoot")
    }

    async changeStoreFolder() {
        this.showPaths(await this.storeFolder.chooseFolder())
    }

    async useDefaultStoreFolder() {
        this.showPaths(await this.storeFolder.useDefaultFolder())
    }

    async restartCore() {
        await this.bridge.restartCore()
    }

    private get bridge(): DesktopBridge {
        return this.environment.requireBridge()
    }

    private async reveal(kind: "dataFolder" | "storeRoot") {
        const result = await this.bridge.reveal({ kind })
        if ("error" in result) {
            this.toastUnlessSilent(result.error, result.error.message)
        }
    }

    private showPaths(paths: PathsInfo | null) {
        if (paths) {
            this.paths.set(paths)
        }
    }

    private forgetLoad() {
        this.hasStartedLoading = false
    }

    private async check(reportRequest: Promise<CoreResult<ToolsReport>>) {
        const [report, paths] = await Promise.all([reportRequest, this.bridge.request("paths.get", {})])
        if (!("error" in paths)) {
            this.paths.set(paths.value)
        }
        if ("error" in report) {
            this.failUnlessSilent(report.error)
        } else {
            this.showReport(report.value)
        }
    }

    private showReport(report: ToolsReport | null) {
        if (report) {
            this.report.set(report)
            this.failure.set(null)
        }
    }

    private followProgress(progress: ProgressParams) {
        if (progress.requestId === this.runningCheck) {
            this.progress.set(progress)
        }
    }

    private failUnlessSilent(error: ErrorPayload) {
        if (!SILENT_ERRORS.includes(error.code)) {
            this.failure.set(error.message)
        }
    }

    private toastUnlessSilent(error: ErrorPayload, text: string) {
        if (!SILENT_ERRORS.includes(error.code)) {
            this.toastService.show(text, "error")
        }
    }
}

function pickerFilters() {
    return navigator.userAgent.includes("Windows") ? [WINDOWS_PROGRAMS] : []
}
