import { ChangeDetectionStrategy, Component, HostListener, inject, signal } from "@angular/core"
import { OpenFileService } from "../../services/openFile.service"
import { ProjectsService } from "../../services/projects.service"

const FILES_TYPE = "Files"

@Component({
    selector: "cc-file-drop-overlay",
    templateUrl: "./fileDropOverlay.component.html",
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class FileDropOverlayComponent {
    private readonly openFile = inject(OpenFileService)
    private readonly projects = inject(ProjectsService)

    readonly isDraggingFile = signal(false)

    @HostListener("window:dragover", ["$event"])
    acceptDraggedFile(event: DragEvent) {
        if (this.projects.isDesktop() && carriesFiles(event)) {
            event.preventDefault()
            this.isDraggingFile.set(true)
        }
    }

    @HostListener("window:dragleave", ["$event"])
    forgetDraggedFile(event: DragEvent) {
        if (event.relatedTarget === null) {
            this.isDraggingFile.set(false)
        }
    }

    @HostListener("window:drop", ["$event"])
    openDroppedFile(event: DragEvent) {
        const file = event.dataTransfer?.files[0]
        if (!(this.projects.isDesktop() && file)) {
            return
        }
        event.preventDefault()
        this.isDraggingFile.set(false)
        void this.openFile.openDropped(file).catch(error => this.projects.toastUnlessSilent(error, (error as Error).message))
    }
}

function carriesFiles(event: DragEvent): boolean {
    return Array.from(event.dataTransfer?.types ?? []).includes(FILES_TYPE)
}
