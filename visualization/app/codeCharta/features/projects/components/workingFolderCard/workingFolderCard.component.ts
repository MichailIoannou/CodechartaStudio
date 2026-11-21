import { ChangeDetectionStrategy, Component, computed, inject, input, output } from "@angular/core"
import type { ProjectFolder } from "../../../../model/coreApi/ProjectFolder"
import { ProjectFoldersService } from "../../services/projectFolders.service"
import { ProjectsService } from "../../services/projects.service"
import { remoteDisplay } from "../../util/folderWording"

@Component({
    selector: "cc-working-folder-card",
    templateUrl: "./workingFolderCard.component.html",
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: "flex min-w-0 flex-col gap-2 rounded-[10px] bg-base-100 p-4" }
})
export class WorkingFolderCardComponent {
    private readonly projects = inject(ProjectsService)
    private readonly projectFolders = inject(ProjectFoldersService)

    readonly folder = input.required<ProjectFolder>()
    readonly relink = output<void>()

    readonly remotes = computed(() =>
        (this.folder().git?.remotes ?? []).map(remote => ({ name: remote.name, address: remoteDisplay(remote) }))
    )

    showInFiles() {
        void this.projectFolders.revealFolder(this.folder().id)
    }
}
