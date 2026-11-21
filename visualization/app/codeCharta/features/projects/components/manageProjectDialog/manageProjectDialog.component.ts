import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, signal, viewChild } from "@angular/core"
import { ConfirmDialogComponent } from "../../../shared/facade"
import { ProjectsService } from "../../services/projects.service"
import { ManageFoldersComponent } from "./manageFolders.component"
import { ManageGeneralComponent } from "./manageGeneral.component"
import { ManageProfileComponent } from "./manageProfile.component"

type Section = "general" | "folders" | "profile"

const SECTIONS: readonly { id: Section; label: string }[] = [
    { id: "general", label: "General" },
    { id: "folders", label: "Folders" },
    { id: "profile", label: "Analysis profile" }
]

@Component({
    selector: "cc-manage-project-dialog",
    templateUrl: "./manageProjectDialog.component.html",
    imports: [ManageGeneralComponent, ManageFoldersComponent, ManageProfileComponent, ConfirmDialogComponent],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ManageProjectDialogComponent {
    private readonly projects = inject(ProjectsService)
    private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>("dialog")
    private readonly tabList = viewChild.required<ElementRef<HTMLElement>>("tabList")
    private readonly general = viewChild(ManageGeneralComponent)
    private readonly profile = viewChild(ManageProfileComponent)
    private readonly discardDialog = viewChild.required(ConfirmDialogComponent)

    readonly sections = SECTIONS
    readonly section = signal<Section>("general")
    readonly project = this.projects.activeProject
    readonly hasUnsavedChanges = computed(() => Boolean(this.general()?.isDirty() || this.profile()?.isDirty()))

    open() {
        this.section.set("general")
        this.dialog().nativeElement.showModal()
    }

    close() {
        if (this.hasUnsavedChanges()) {
            this.discardDialog().open()
            return
        }
        this.closeWithoutAsking()
    }

    closeWithoutAsking() {
        this.dialog().nativeElement.close()
    }

    cancelWithEscape(event: Event) {
        event.preventDefault()
        this.close()
    }

    moveBetweenSections(event: KeyboardEvent) {
        const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key]
        if (step === undefined) {
            return
        }
        event.preventDefault()
        event.stopPropagation()
        const index = SECTIONS.findIndex(section => section.id === this.section())
        const next = SECTIONS[(index + step + SECTIONS.length) % SECTIONS.length]
        this.section.set(next.id)
        this.tabList().nativeElement.querySelector<HTMLElement>(`[data-section="${next.id}"]`)?.focus()
    }
}
