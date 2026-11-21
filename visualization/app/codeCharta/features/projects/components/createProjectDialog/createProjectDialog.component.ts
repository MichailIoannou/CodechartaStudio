import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, signal, viewChild } from "@angular/core"
import type { FolderRole } from "../../../../model/coreApi/FolderRole"
import type { PickedFolder } from "../../../../model/coreApi/PickedFolder"
import { ToastService } from "../../../shared/facade"
import { ProjectFoldersService } from "../../services/projectFolders.service"
import { ProjectsService } from "../../services/projects.service"
import { FolderListRow, firstRemote } from "../../util/folderListRows"
import { defaultRoleFor, sharesHistory } from "../../util/folderRole"
import { FolderLabelChange, FolderListEditorComponent, FolderRoleChange } from "../folderListEditor/folderListEditor.component"

const NAME_MAX_LENGTH = 80
const DESCRIPTION_MAX_LENGTH = 500

interface DraftFolder {
    picked: PickedFolder
    label: string
    role: FolderRole
}

@Component({
    selector: "cc-create-project-dialog",
    templateUrl: "./createProjectDialog.component.html",
    imports: [FolderListEditorComponent],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class CreateProjectDialogComponent {
    private readonly projects = inject(ProjectsService)
    private readonly projectFolders = inject(ProjectFoldersService)
    private readonly toastService = inject(ToastService)
    private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>("dialog")
    private readonly editor = viewChild(FolderListEditorComponent)

    readonly nameMaxLength = NAME_MAX_LENGTH
    readonly descriptionMaxLength = DESCRIPTION_MAX_LENGTH
    readonly name = signal("")
    readonly description = signal("")
    readonly isNameTyped = signal(false)
    readonly isNameTouched = signal(false)
    readonly folders = signal<DraftFolder[]>([])
    readonly isCreating = signal(false)
    readonly failure = signal<string | null>(null)

    readonly isNameMissing = computed(() => this.name().trim() === "")
    readonly canCreate = computed(() => !this.isNameMissing() && !this.isCreating() && !this.editor()?.hasProblems())
    readonly rows = computed(() => this.folders().map(folder => this.rowOf(folder)))

    open() {
        this.name.set("")
        this.description.set("")
        this.isNameTyped.set(false)
        this.isNameTouched.set(false)
        this.folders.set([])
        this.failure.set(null)
        this.dialog().nativeElement.showModal()
    }

    close() {
        this.dialog().nativeElement.close()
    }

    typeName(name: string) {
        this.name.set(name)
        this.isNameTyped.set(true)
    }

    async addFolder() {
        const picked = await this.projectFolders.pickFolder("Add folder").catch((error: unknown) => {
            this.projects.toastUnlessSilent(error, (error as Error).message)
            return null
        })
        if (!picked) {
            return
        }
        if (this.folders().some(folder => folder.picked.path === picked.path)) {
            this.toastService.show(`'${picked.path}' is already part of this project.`, "info")
            return
        }
        const role = defaultRoleFor(
            picked.git,
            this.folders().map(folder => ({ role: folder.role, git: folder.picked.git }))
        )
        this.folders.update(folders => [...folders, { picked, label: picked.suggestedLabel, role }])
        if (!this.isNameTyped() && this.folders().length === 1) {
            this.name.set(picked.suggestedLabel)
        }
    }

    changeLabel({ key, label }: FolderLabelChange) {
        this.folders.update(folders => folders.map(folder => (folder.picked.pickToken === key ? { ...folder, label } : folder)))
    }

    changeRole({ key, role }: FolderRoleChange) {
        this.folders.update(folders =>
            folders.map(folder => {
                if (folder.picked.pickToken === key) {
                    return { ...folder, role }
                }
                return role === "primary" && folder.role === "primary" ? { ...folder, role: "helper" } : folder
            })
        )
    }

    removeFolder(row: FolderListRow) {
        this.folders.update(folders => folders.filter(folder => folder.picked.pickToken !== row.key))
    }

    submitWithKeyboard(event: Event) {
        event.preventDefault()
        void this.create()
    }

    async create() {
        if (!this.canCreate()) {
            return
        }
        this.isCreating.set(true)
        this.failure.set(null)
        try {
            const folders = this.folders().map(folder => ({ pickToken: folder.picked.pickToken, label: folder.label, role: folder.role }))
            await this.projects.createProject({ name: this.name(), description: this.description(), folders })
            this.close()
        } catch (error) {
            this.failure.set((error as Error).message)
        } finally {
            this.isCreating.set(false)
        }
    }

    private rowOf(folder: DraftFolder): FolderListRow {
        const primary = this.folders().find(candidate => candidate.role === "primary")
        return {
            key: folder.picked.pickToken,
            label: folder.label,
            role: folder.role,
            kind: folder.picked.kind,
            path: folder.picked.path,
            remote: firstRemote(folder.picked.git),
            hint:
                primary && primary !== folder && sharesHistory(folder.picked.git, primary.picked.git)
                    ? `shares history with ${primary.label}`
                    : null,
            isMissing: false,
            snapshotCount: 0
        }
    }
}
