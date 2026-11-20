import { Injectable, inject } from "@angular/core"
import type { BridgeMethod, BridgeParams, BridgeResult } from "../../../util/desktop/desktopBridge"
import { DesktopEnvironment } from "../../../util/desktop/desktopEnvironment.service"
import { valueOrThrow } from "../../../util/desktop/desktopResult"
import type { CompareIntent, ResolvedComparison } from "../model/compare.model"

/** `compare.resolve` through the desktop bridge. */
@Injectable({ providedIn: "root" })
export class CoreGatewayAdapter {
    private readonly environment = inject(DesktopEnvironment)

    resolve(intent: CompareIntent, shownCommit: string | null): Promise<ResolvedComparison> {
        return this.request("compare.resolve", { intent, shownCommit })
    }

    private async request<Method extends BridgeMethod>(method: Method, params: BridgeParams<Method>): Promise<BridgeResult<Method>> {
        return valueOrThrow(await this.environment.requireBridge().request(method, params))
    }
}
