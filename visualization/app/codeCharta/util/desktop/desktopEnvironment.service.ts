import { DestroyRef, Injectable, inject, signal } from "@angular/core"
import type { CoreState, DesktopBridge } from "./desktopBridge"
import { DESKTOP_BRIDGE } from "./desktopBridge.token"
import { DesktopBridgeError } from "./desktopResult"

const CORE_STATE_EVENT = "shell.coreState"
const WITHOUT_CORE: CoreState = { state: "stopped", message: null }
const CORE_STARTING: CoreState = { state: "starting", message: null }

@Injectable({ providedIn: "root" })
export class DesktopEnvironment {
    private readonly bridge = inject(DESKTOP_BRIDGE)
    private readonly state = signal<CoreState>(this.bridge ? CORE_STARTING : WITHOUT_CORE)

    readonly isDesktop = signal(this.bridge !== null).asReadonly()
    readonly coreState = this.state.asReadonly()

    constructor() {
        const unsubscribe = this.bridge?.subscribe(CORE_STATE_EVENT, coreState => this.state.set(coreState))
        inject(DestroyRef).onDestroy(() => unsubscribe?.())
    }

    requireBridge(): DesktopBridge {
        if (!this.bridge) {
            throw new DesktopBridgeError({ code: "NOT_ALLOWED", message: "This feature is only available in the desktop app." })
        }
        return this.bridge
    }
}
