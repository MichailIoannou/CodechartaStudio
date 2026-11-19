import { afterNextRender, ChangeDetectionStrategy, Component, computed, ElementRef, Injector, inject, input, output } from "@angular/core"
import type { GitCommitSummary } from "../../../../model/coreApi/GitCommitSummary"
import { ContextMenuItemComponent, FloatingMenuAnchor, FloatingMenuComponent } from "../../../shared/facade"
import type { CommitSelection, SelectionItem } from "../../model/commitSelection"
import type { CommitAction } from "../../ports/commitActions.port"
import { CommitActionsService } from "../../services/commitActions.service"
import { CommitClipboardService } from "../../services/commitClipboard.service"

export interface CommitMenuTarget {
    anchor: FloatingMenuAnchor
    /** The row the menu was opened on. */
    item: SelectionItem
    selection: CommitSelection
    isFromKeyboard: boolean
}

export interface CommitMenuClosing {
    /** True when the list should take the focus back: the menu was opened or closed from the keyboard. */
    isFocusReturned: boolean
}

const STEPS: Readonly<Record<string, number>> = { ArrowDown: 1, ArrowUp: -1 }

@Component({
    selector: "cc-commit-context-menu",
    templateUrl: "./commitContextMenu.component.html",
    imports: [FloatingMenuComponent, ContextMenuItemComponent],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class CommitContextMenuComponent {
    private readonly actionsService = inject(CommitActionsService)
    private readonly clipboard = inject(CommitClipboardService)
    private readonly hostElement = inject<ElementRef<HTMLElement>>(ElementRef)
    private readonly injector = inject(Injector)

    readonly target = input.required<CommitMenuTarget>()
    readonly closed = output<CommitMenuClosing>()

    readonly actions = computed(() => {
        const { selection } = this.target()
        return this.actionsService
            .offeredFor(selection)
            .map(action => ({ action, disabledReason: action.disabledReasonFor?.(selection) ?? null }))
    })
    readonly commit = computed(() => {
        const item = this.target().item
        return item.kind === "commit" ? item.commit : null
    })

    /** A hidden element takes no focus, so the first item is focused once the positioned menu has rendered visible. */
    focusFirstItemIfFromKeyboard() {
        if (this.target().isFromKeyboard) {
            afterNextRender(() => this.buttons()[0]?.focus(), { injector: this.injector })
        }
    }

    runAction(action: CommitAction) {
        action.run(this.target().selection)
        this.close()
    }

    copySha(commit: GitCommitSummary) {
        void this.clipboard.copySha(commit)
        this.close()
    }

    copySubject(commit: GitCommitSummary) {
        void this.clipboard.copySubject(commit)
        this.close()
    }

    dismiss() {
        this.closed.emit({ isFocusReturned: false })
    }

    onKeydown(event: KeyboardEvent) {
        if (event.key === "Escape") {
            this.closed.emit({ isFocusReturned: true })
        } else if (event.key in STEPS) {
            this.moveFocus(STEPS[event.key])
        } else {
            return
        }
        event.preventDefault()
        event.stopPropagation()
    }

    private close() {
        this.closed.emit({ isFocusReturned: this.target().isFromKeyboard })
    }

    private moveFocus(step: number) {
        const buttons = this.buttons()
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
        const next = current < 0 ? 0 : (current + step + buttons.length) % buttons.length
        buttons[next]?.focus()
    }

    private buttons(): HTMLButtonElement[] {
        return Array.from(this.hostElement.nativeElement.querySelectorAll("button"))
    }
}
