import { Injectable, signal } from "@angular/core"

export interface FolderToRelink {
    id: string
    label: string
}

/** Asks from outside the project views to re-link a folder; `cc-folder-relink-host` answers with the re-link flow (P5). */
@Injectable({ providedIn: "root" })
export class FolderRelinkRequests {
    private readonly latest = signal<{ folder: FolderToRelink } | null>(null)

    readonly request = this.latest.asReadonly()

    ask(folder: FolderToRelink): void {
        this.latest.set({ folder })
    }
}
