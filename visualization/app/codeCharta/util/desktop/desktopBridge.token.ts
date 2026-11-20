import { InjectionToken } from "@angular/core"
import { CORE_PROTOCOL_VERSION } from "../../model/coreApi/coreApi"
import type { DesktopBridge } from "./desktopBridge"

interface DesktopPage {
    codeChartaDesktop?: DesktopBridge
}

export function readDesktopBridge(page: DesktopPage): DesktopBridge | null {
    const bridge = page.codeChartaDesktop
    if (!bridge) {
        return null
    }
    if (bridge.protocolVersion !== CORE_PROTOCOL_VERSION) {
        console.warn(`The desktop bridge speaks protocol ${bridge.protocolVersion}, this app needs ${CORE_PROTOCOL_VERSION}.`)
        return null
    }
    return bridge
}

export const DESKTOP_BRIDGE = new InjectionToken<DesktopBridge | null>("DESKTOP_BRIDGE", {
    providedIn: "root",
    factory: () => readDesktopBridge(window as DesktopPage)
})
