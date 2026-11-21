import { Injectable, inject, signal } from "@angular/core"
import type { ErrorCode } from "../../../model/coreApi/ErrorCode"
import type { ErrorPayload } from "../../../model/coreApi/ErrorPayload"
import type { PathsInfo } from "../../../model/coreApi/PathsInfo"
import type { CoreResult } from "../../../util/desktop/desktopBridge"
import { DesktopEnvironment } from "../../../util/desktop/desktopEnvironment.service"
import { ToastService } from "../../shared/facade"

const PICKER_TITLE = "Choose the store folder"
const SILENT_ERRORS: ReadonlySet<ErrorCode> = new Set(["CANCELLED", "CORE_UNAVAILABLE"])

@Injectable({ providedIn: "root" })
export class StoreFolderService {
    private readonly environment = inject(DesktopEnvironment)
    private readonly toastService = inject(ToastService)
    private readonly changing = signal(false)
    private readonly changeCount = signal(0)

    readonly isChanging = this.changing.asReadonly()
    readonly changes = this.changeCount.asReadonly()

    chooseFolder(): Promise<PathsInfo | null> {
        return this.change(() => this.environment.requireBridge().chooseStoreRoot({ title: PICKER_TITLE }))
    }

    useDefaultFolder(): Promise<PathsInfo | null> {
        return this.change(() => this.environment.requireBridge().request("paths.resetStoreRoot", {}))
    }

    private async change(run: () => Promise<CoreResult<PathsInfo | null>>): Promise<PathsInfo | null> {
        if (this.changing()) {
            return null
        }
        this.changing.set(true)
        try {
            const result = await run()
            if ("error" in result) {
                this.toastRefusal(result.error)
                return null
            }
            if (result.value) {
                this.toastService.show(`Analyses are now kept in '${result.value.storeRoot}'.`, "success")
                this.changeCount.update(count => count + 1)
            }
            return result.value
        } finally {
            this.changing.set(false)
        }
    }

    private toastRefusal(error: ErrorPayload) {
        const chosenPath = typeof error.details.path === "string" ? error.details.path : null
        if (error.code === "BAD_REQUEST" && chosenPath) {
            this.toastService.show(`'${chosenPath}' is not empty and holds no CodeCharta store. Choose an empty folder.`, "error")
            return
        }
        if (!SILENT_ERRORS.has(error.code)) {
            this.toastService.show(error.code === "IO" ? `The store could not be copied: ${error.message}` : error.message, "error")
        }
    }
}
