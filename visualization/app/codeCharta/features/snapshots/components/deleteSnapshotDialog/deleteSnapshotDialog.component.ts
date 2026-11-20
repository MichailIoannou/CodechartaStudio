import { ChangeDetectionStrategy, Component, ElementRef, inject, signal, viewChild } from "@angular/core"
import type { SnapshotSummary } from "../../../../model/coreApi/SnapshotSummary"
import { SnapshotRetentionService } from "../../services/snapshotRetention.service"
import { deleteQuestion } from "../../util/retentionWording"

/** Design S4: asks before moving one snapshot to the recycle bin. */
@Component({
    selector: "cc-delete-snapshot-dialog",
    templateUrl: "./deleteSnapshotDialog.component.html",
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class DeleteSnapshotDialogComponent {
    private readonly retention = inject(SnapshotRetentionService)
    private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>("dialog")
    private snapshot: SnapshotSummary | null = null

    readonly question = signal("")
    readonly isDeleting = signal(false)

    open(snapshot: SnapshotSummary) {
        this.snapshot = snapshot
        this.question.set(deleteQuestion(snapshot))
        this.dialog().nativeElement.showModal()
    }

    close() {
        this.dialog().nativeElement.close()
    }

    async confirm() {
        if (!this.snapshot) {
            return
        }
        this.isDeleting.set(true)
        await this.retention.delete(this.snapshot)
        this.isDeleting.set(false)
        this.close()
    }
}
