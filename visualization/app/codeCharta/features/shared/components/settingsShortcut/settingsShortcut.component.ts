import { ChangeDetectionStrategy, Component, ElementRef, inject, input } from "@angular/core"

export interface SettingsShortcut {
    readonly label: string
    readonly popoverId: string
}

/** Closes the popover it sits in and opens another from the same button, so focus returns to that button. */
@Component({
    selector: "cc-settings-shortcut",
    templateUrl: "./settingsShortcut.component.html",
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: "block border-t border-base-300 pt-1" }
})
export class SettingsShortcutComponent {
    private readonly host: HTMLElement = inject(ElementRef).nativeElement
    readonly shortcut = input.required<SettingsShortcut>()

    open() {
        const ownPopover = this.host.closest<HTMLElement>("[popover]")
        const invoker = ownPopover ? document.querySelector<HTMLElement>(`[popovertarget="${ownPopover.id}"]`) : null
        ownPopover?.hidePopover()
        document.getElementById(this.shortcut().popoverId)?.showPopover(invoker ? { source: invoker } : {})
    }
}
