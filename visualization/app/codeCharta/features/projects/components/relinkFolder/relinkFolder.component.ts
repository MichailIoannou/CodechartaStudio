import { ChangeDetectionStrategy, Component, inject, signal, viewChild } from "@angular/core"
import type { PickedFolder } from "../../../../model/coreApi/PickedFolder"
import { DesktopBridgeError } from "../../../../util/desktop/desktopResult"
import { ConfirmDialogComponent } from "../../../shared/facade"
import { ProjectsService } from "../../services/projects.service"

interface PendingRelink {
    folderId: string
    label: string
    picked: PickedFolder
}

@Component({
    selector: "cc-relink-folder",
    templateUrl: "./relinkFolder.component.html",
    imports: [ConfirmDialogComponent],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class RelinkFolderComponent {
    private readonly projects = inject(ProjectsService)
    private readonly confirmDialog = viewChild.required(ConfirmDialogComponent)
    private pending: PendingRelink | null = null

    readonly question = signal("")

    async start(folder: { id: string; label: string }) {
        const picked = await this.projects.pickFolder(`Re-link '${folder.label}'`).catch((error: unknown) => {
            this.projects.toastUnlessSilent(error, (error as Error).message)
            return null
        })
        if (picked) {
            await this.relink({ folderId: folder.id, label: folder.label, picked }, false)
        }
    }

    async linkAnyway() {
        if (this.pending) {
            await this.relink(this.pending, true)
        }
    }

    private async relink(relink: PendingRelink, acceptDifferentHistory: boolean) {
        try {
            await this.projects.relinkFolder(relink.folderId, relink.picked.pickToken, acceptDifferentHistory)
            this.pending = null
        } catch (error) {
            if (error instanceof DesktopBridgeError && error.code === "DIFFERENT_HISTORY") {
                this.askAboutDifferentHistory(relink)
            } else {
                this.projects.toastFolderRefusal(error, relink.picked.path)
            }
        }
    }

    private askAboutDifferentHistory(relink: PendingRelink) {
        this.pending = relink
        this.question.set(`'${relink.picked.path}' does not share history with the analyses of '${relink.label}'. Link it anyway?`)
        this.confirmDialog().open()
    }
}
