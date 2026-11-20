import { Injectable, signal } from "@angular/core"
import type { FolderRef, HostingCheck } from "../model/compare.model"

const NOT_CHECKED: HostingCheck = { kind: "checking" }

/** The core's last hosting answer per folder, kept while the app runs so the dialog paints at once when reopened. */
@Injectable({ providedIn: "root" })
export class HostingChecksStore {
    private readonly checks = signal<Readonly<Record<string, HostingCheck>>>({})

    checkOf(folder: FolderRef): HostingCheck {
        return this.checks()[keyOf(folder)] ?? NOT_CHECKED
    }

    has(folder: FolderRef): boolean {
        return keyOf(folder) in this.checks()
    }

    set(folder: FolderRef, check: HostingCheck): void {
        this.checks.update(checks => ({ ...checks, [keyOf(folder)]: check }))
    }
}

function keyOf({ projectId, folderId }: FolderRef): string {
    return `${projectId}/${folderId}`
}
