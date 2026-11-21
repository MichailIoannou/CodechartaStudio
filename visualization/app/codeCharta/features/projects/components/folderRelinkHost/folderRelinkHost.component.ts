import { ChangeDetectionStrategy, Component, effect, inject, untracked, viewChild } from "@angular/core"
import { FolderRelinkRequests } from "../../services/folderRelinkRequests.service"
import { RelinkFolderComponent } from "../relinkFolder/relinkFolder.component"

@Component({
    selector: "cc-folder-relink-host",
    template: "<cc-relink-folder />",
    imports: [RelinkFolderComponent],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class FolderRelinkHostComponent {
    private readonly relink = viewChild.required(RelinkFolderComponent)

    constructor() {
        const requests = inject(FolderRelinkRequests)
        effect(() => {
            const request = requests.request()
            if (request) {
                untracked(() => void this.relink().start(request.folder))
            }
        })
    }
}
