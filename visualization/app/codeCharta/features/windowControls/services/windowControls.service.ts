import { computed, DestroyRef, Injectable, inject, signal } from "@angular/core"
import type { WindowCommand, WindowState } from "../../../util/desktop/desktopBridge"
import { DESKTOP_BRIDGE } from "../../../util/desktop/desktopBridge.token"
import { FloatingMenuAnchor, ToastService } from "../../shared/facade"

const LINUX = "linux"
const MAC_OS = "darwin"
const WINDOWS = "win32"

@Injectable({ providedIn: "root" })
export class WindowControlsService {
    private readonly bridge = inject(DESKTOP_BRIDGE)
    private readonly toastService = inject(ToastService)

    readonly state = signal<WindowState | null>(null)
    readonly menuAnchor = signal<FloatingMenuAnchor | null>(null)

    readonly usesAppTitleBar = computed(() => this.state()?.usesAppTitleBar ?? false)
    readonly isRestartNeeded = computed(() => {
        const state = this.state()
        return state !== null && state.savedUseAppTitleBar !== state.usesAppTitleBar
    })
    readonly drawsOwnButtons = computed(() => this.isAppTitleBarOn(LINUX) && !this.state()?.isFullScreen)
    readonly reservesTrafficLights = computed(() => this.isAppTitleBarOn(MAC_OS) && !this.state()?.isFullScreen)
    readonly reservesCaptionButtons = computed(() => this.isAppTitleBarOn(WINDOWS))

    constructor() {
        if (!this.bridge) {
            return
        }
        const unsubscribe = this.bridge.subscribe("shell.windowState", state => this.state.set(state))
        inject(DestroyRef).onDestroy(unsubscribe)
        void this.load()
    }

    minimize() {
        this.control("minimize")
    }

    toggleMaximize() {
        this.control("toggleMaximize")
    }

    close() {
        this.control("close")
    }

    openMenu(anchor: FloatingMenuAnchor) {
        this.menuAnchor.set(anchor)
    }

    closeMenu() {
        this.menuAnchor.set(null)
    }

    async setUseAppTitleBar(enabled: boolean) {
        const previous = this.state()
        if (!this.bridge || previous === null) {
            return
        }
        this.state.set({ ...previous, savedUseAppTitleBar: enabled })
        const result = await this.bridge.setUseAppTitleBar(enabled)
        if ("error" in result) {
            this.state.update(state => state && { ...state, savedUseAppTitleBar: previous.savedUseAppTitleBar })
            this.toastService.show(`The title bar setting could not be saved: ${result.error.message}`, "error")
        }
    }

    async reopen() {
        await this.bridge?.reopenWindow()
    }

    private isAppTitleBarOn(platform: string) {
        return this.usesAppTitleBar() && this.state()?.platform === platform
    }

    private control(command: WindowCommand) {
        void this.bridge?.controlWindow(command)
    }

    private async load() {
        const result = await this.bridge?.windowState()
        if (result && !("error" in result)) {
            this.state.set(result.value)
        }
    }
}
