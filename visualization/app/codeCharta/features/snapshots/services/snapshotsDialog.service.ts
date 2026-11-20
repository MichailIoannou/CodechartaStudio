import { Injectable, signal } from "@angular/core"

/** Whether the snapshots dialog is open; the nav bar hosts it, the workspace status and others open it. */
@Injectable({ providedIn: "root" })
export class SnapshotsDialogService {
    private readonly open = signal(false)

    readonly isOpen = this.open.asReadonly()

    show(): void {
        this.open.set(true)
    }

    hide(): void {
        this.open.set(false)
    }
}
