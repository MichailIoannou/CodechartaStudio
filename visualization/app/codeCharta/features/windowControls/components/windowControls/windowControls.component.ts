import { ChangeDetectionStrategy, Component, computed, inject } from "@angular/core"
import type { WindowButton } from "../../../../util/desktop/desktopBridge"
import { ContextMenuItemComponent, FloatingMenuComponent } from "../../../shared/facade"
import { WindowControlsService } from "../../services/windowControls.service"

const DEFAULT_BUTTON_ORDER: WindowButton[] = ["minimize", "maximize", "close"]
const BUTTON_CLASSES = [
    "relative grid size-7 place-items-center rounded-full outline-primary focus-visible:outline-2",
    "before:absolute before:size-[22px] before:rounded-full disabled:opacity-40",
    "[&>svg]:relative [&>svg]:size-3"
].join(" ")
const HIGHLIGHT_CLASSES = "enabled:hover:before:bg-base-content/15 enabled:active:before:bg-base-content/25"
const FOCUSED_GLYPH_CLASS = "text-base-content/80"
const UNFOCUSED_GLYPH_CLASS = "text-base-content/45"
const CLOSE_BUTTON_CLASSES = "enabled:hover:text-white enabled:hover:before:bg-[#da4453] enabled:active:before:bg-[#b8323f]"

@Component({
    selector: "cc-window-controls",
    templateUrl: "./windowControls.component.html",
    imports: [FloatingMenuComponent, ContextMenuItemComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: "flex items-center gap-1 pr-1.5" }
})
export class WindowControlsComponent {
    private readonly windowControls = inject(WindowControlsService)

    readonly buttons = computed(() => this.windowControls.state()?.buttonOrder ?? DEFAULT_BUTTON_ORDER)
    readonly isMaximized = computed(() => this.windowControls.state()?.isMaximized ?? false)
    readonly canMaximize = computed(() => this.isMaximized() || (this.windowControls.state()?.isMaximizable ?? true))
    readonly isFocused = computed(() => this.windowControls.state()?.isFocused ?? true)
    readonly maximizeLabel = computed(() => (this.isMaximized() ? "Restore" : "Maximize"))
    readonly menuAnchor = this.windowControls.menuAnchor
    private readonly glyphClasses = computed(() => `${BUTTON_CLASSES} ${this.isFocused() ? FOCUSED_GLYPH_CLASS : UNFOCUSED_GLYPH_CLASS}`)
    readonly buttonClasses = computed(() => `${this.glyphClasses()} ${HIGHLIGHT_CLASSES}`)
    readonly closeButtonClasses = computed(() => `${this.glyphClasses()} ${CLOSE_BUTTON_CLASSES}`)

    minimize() {
        this.windowControls.closeMenu()
        this.windowControls.minimize()
    }

    toggleMaximize() {
        this.windowControls.closeMenu()
        this.windowControls.toggleMaximize()
    }

    close() {
        this.windowControls.closeMenu()
        this.windowControls.close()
    }

    closeMenu() {
        this.windowControls.closeMenu()
    }
}
