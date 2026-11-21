import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input, signal, viewChild } from "@angular/core"
import type { Project } from "../../../../model/coreApi/Project"
import { ProjectFoldersService } from "../../services/projectFolders.service"
import { ProjectsService } from "../../services/projects.service"
import { FolderListRow, rowOfProjectFolder } from "../../util/folderListRows"
import { counted } from "../../util/folderWording"
import { FolderLabelChange, FolderListEditorComponent, FolderRoleChange } from "../folderListEditor/folderListEditor.component"
import { RelinkFolderComponent } from "../relinkFolder/relinkFolder.component"

@Component({
    selector: "cc-manage-folders",
    templateUrl: "./manageFolders.component.html",
    imports: [FolderListEditorComponent, RelinkFolderComponent],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ManageFoldersComponent {
    private readonly projects = inject(ProjectsService)
    private readonly projectFolders = inject(ProjectFoldersService)
    private readonly removeDialog = viewChild.required<ElementRef<HTMLDialogElement>>("removeDialog")
    private readonly relinkFolder = viewChild.required(RelinkFolderComponent)

    readonly project = input.required<Project>()

    readonly failure = signal<string | null>(null)
    readonly folderToRemove = signal<FolderListRow | null>(null)
    readonly rows = computed(() => this.project().folders.map(folder => rowOfProjectFolder(folder, this.project().folders)))
    readonly removeQuestion = computed(() => {
        const row = this.folderToRemove()
        return row
            ? `Remove '${row.label}' from the project? Its ${counted(row.snapshotCount, "analysis", "analyses")} go to the recycle bin. The folder on disk is not touched.`
            : ""
    })

    addFolder() {
        this.failure.set(null)
        void this.projectFolders.addPickedFolder("Add folder")
    }

    changeLabel({ key, label }: FolderLabelChange) {
        void this.run(() => this.projectFolders.updateFolder(key, { label }))
    }

    changeRole({ key, role }: FolderRoleChange) {
        void this.run(() => this.projectFolders.updateFolder(key, { role }))
    }

    refresh(row: FolderListRow) {
        void this.run(() => this.projectFolders.refreshFolder(row.key))
    }

    relink(row: FolderListRow) {
        void this.relinkFolder().start({ id: row.key, label: row.label })
    }

    remove(row: FolderListRow) {
        if (row.snapshotCount === 0) {
            void this.run(() => this.projectFolders.removeFolder(row.key))
            return
        }
        this.folderToRemove.set(row)
        this.removeDialog().nativeElement.showModal()
    }

    cancelRemove() {
        this.removeDialog().nativeElement.close()
        this.folderToRemove.set(null)
    }

    confirmRemove() {
        const row = this.folderToRemove()
        this.cancelRemove()
        if (row) {
            void this.run(() => this.projectFolders.removeFolder(row.key))
        }
    }

    private async run(change: () => Promise<void>) {
        this.failure.set(null)
        try {
            await change()
        } catch (error) {
            this.failure.set((error as Error).message)
        }
    }
}
