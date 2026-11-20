import { afterNextRender, ChangeDetectionStrategy, Component, computed, ElementRef, Injector, inject, input, output } from "@angular/core"
import type { GitCommitSummary } from "../../../../model/coreApi/GitCommitSummary"
import type { GitLocalBranch } from "../../../../model/coreApi/GitLocalBranch"
import type { GitRemoteBranch } from "../../../../model/coreApi/GitRemoteBranch"
import { ContextMenuItemComponent, FloatingMenuAnchor, FloatingMenuComponent } from "../../../shared/facade"
import type { CommitSelection, SelectionItem } from "../../model/commitSelection"
import type { CommitAction } from "../../ports/commitActions.port"
import { BranchActionsService } from "../../services/branchActions.service"
import { CommitActionsService } from "../../services/commitActions.service"
import { CommitClipboardService } from "../../services/commitClipboard.service"
import { GitOperationService } from "../../services/gitOperation.service"
import { WAITING_FOR_OPERATION } from "../../util/branchMenu"

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
/** Design H10 lists at most this many "Check Out" entries of each kind. */
const MAX_CHECK_OUT_ENTRIES = 3

@Component({
    selector: "cc-commit-context-menu",
    templateUrl: "./commitContextMenu.component.html",
    imports: [FloatingMenuComponent, ContextMenuItemComponent],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class CommitContextMenuComponent {
    private readonly actionsService = inject(CommitActionsService)
    private readonly clipboard = inject(CommitClipboardService)
    private readonly branchActions = inject(BranchActionsService)
    private readonly operations = inject(GitOperationService)
    private readonly hostElement = inject<ElementRef<HTMLElement>>(ElementRef)
    private readonly injector = inject(Injector)

    readonly target = input.required<CommitMenuTarget>()
    readonly closed = output<CommitMenuClosing>()

    readonly actions = computed(() => this.actionsService.offeredFor(this.target().selection))
    readonly commit = computed(() => {
        const item = this.target().item
        return item.kind === "commit" ? item.commit : null
    })

    readonly localBranches = computed(() => {
        const sha = this.commit()?.sha
        const branches = this.branchActions.refs()?.localBranches ?? []
        return branches.filter(branch => branch.commit === sha && !branch.isCurrent).slice(0, MAX_CHECK_OUT_ENTRIES)
    })
    readonly remoteBranches = computed(() => {
        const sha = this.commit()?.sha
        const branches = this.branchActions.refs()?.remoteBranches ?? []
        return branches.filter(branch => branch.commit === sha).slice(0, MAX_CHECK_OUT_ENTRIES)
    })
    readonly writeHint = computed(() => (this.operations.isBusy() ? WAITING_FOR_OPERATION : null))

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

    checkOut(branch: GitLocalBranch) {
        void this.branchActions.switchTo(branch)
        this.close()
    }

    checkOutAsNew(remote: GitRemoteBranch) {
        this.branchActions.openDialog({ kind: "checkOutRemote", remote })
        this.close()
    }

    newBranchHere(commit: GitCommitSummary) {
        this.branchActions.openDialog({ kind: "create", startPoint: commit.sha, subject: commit.subject })
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
        return Array.from(this.hostElement.nativeElement.querySelectorAll<HTMLButtonElement>("button:not([disabled])"))
    }
}
