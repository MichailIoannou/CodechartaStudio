import { ChangeDetectionStrategy, Component, ElementRef, effect, inject, viewChild } from "@angular/core"
import { GitConfirmationService } from "../../services/gitConfirmation.service"

/**
 * Design H15: a destructive confirmation in the `deleteConfirmDialog` layout (Cancel focused, the verb in
 * `btn-error`), every other one in the `ConfirmDialogComponent` layout (No / Yes). Escape and the backdrop decline.
 */
@Component({
    selector: "cc-git-confirm-dialog",
    templateUrl: "./gitConfirmDialog.component.html",
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class GitConfirmDialogComponent {
    private readonly confirmations = inject(GitConfirmationService)
    private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>("dialog")
    private readonly firstButton = viewChild<ElementRef<HTMLButtonElement>>("firstButton")

    readonly confirmation = this.confirmations.current

    constructor() {
        effect(() => this.showOrClose(this.confirmation() !== null))
    }

    answer(isConfirmed: boolean) {
        this.confirmations.answer(isConfirmed)
    }

    /** Escape and the backdrop close the native dialog without an answer. */
    onClosed() {
        if (this.confirmation()) {
            this.answer(false)
        }
    }

    private showOrClose(isAsking: boolean) {
        const dialog = this.dialog().nativeElement
        if (isAsking && !dialog.open) {
            dialog.showModal()
            setTimeout(() => this.firstButton()?.nativeElement.focus())
        } else if (!isAsking && dialog.open) {
            dialog.close()
        }
    }
}
