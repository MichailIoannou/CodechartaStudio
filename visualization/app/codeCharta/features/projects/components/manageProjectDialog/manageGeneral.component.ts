import {
    ChangeDetectionStrategy,
    Component,
    computed,
    ElementRef,
    inject,
    input,
    linkedSignal,
    output,
    signal,
    viewChild
} from "@angular/core"
import type { Project } from "../../../../model/coreApi/Project"
import { ProjectsService } from "../../services/projects.service"
import { counted } from "../../util/folderWording"

const NAME_MAX_LENGTH = 80
const DESCRIPTION_MAX_LENGTH = 500

@Component({
    selector: "cc-manage-general",
    templateUrl: "./manageGeneral.component.html",
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ManageGeneralComponent {
    private readonly projects = inject(ProjectsService)
    private readonly deleteDialog = viewChild.required<ElementRef<HTMLDialogElement>>("deleteDialog")

    readonly project = input.required<Project>()
    readonly deleted = output<void>()

    readonly nameMaxLength = NAME_MAX_LENGTH
    readonly descriptionMaxLength = DESCRIPTION_MAX_LENGTH
    readonly name = linkedSignal(() => this.project().name)
    readonly description = linkedSignal(() => this.project().description ?? "")
    readonly isSaving = signal(false)
    readonly isDeleting = signal(false)
    readonly failure = signal<string | null>(null)

    readonly isDirty = computed(() => this.name() !== this.project().name || this.description() !== (this.project().description ?? ""))
    readonly canSave = computed(() => this.isDirty() && this.name().trim() !== "" && !this.isSaving())
    readonly deleteQuestion = computed(() => {
        const project = this.project()
        const analyses = counted(
            project.folders.reduce((total, folder) => total + folder.snapshotCount, 0),
            "analysis",
            "analyses"
        )
        return `Move the project '${project.name}' and its ${analyses} to the recycle bin? Your folders are not touched.`
    })

    async save() {
        if (!this.canSave()) {
            return
        }
        this.isSaving.set(true)
        this.failure.set(null)
        try {
            await this.projects.updateProject({ name: this.name().trim(), description: this.description().trim() })
        } catch (error) {
            this.failure.set((error as Error).message)
        } finally {
            this.isSaving.set(false)
        }
    }

    askToDelete() {
        this.deleteDialog().nativeElement.showModal()
    }

    cancelDelete() {
        this.deleteDialog().nativeElement.close()
    }

    async confirmDelete() {
        this.isDeleting.set(true)
        try {
            await this.projects.deleteProject(this.project().id)
            this.deleteDialog().nativeElement.close()
            this.deleted.emit()
        } catch (error) {
            this.deleteDialog().nativeElement.close()
            this.failure.set((error as Error).message)
        } finally {
            this.isDeleting.set(false)
        }
    }
}
