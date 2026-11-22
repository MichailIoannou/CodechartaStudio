import { ChangeDetectionStrategy, Component, viewChild } from "@angular/core"
import { CcStatePersistence } from "../../../../../load/load.facade"
import { LocalSourceService } from "../../../../localSource/facade"
import { ProjectsBootService } from "../../../../projects/facade"
import { ConfirmDialogComponent } from "../../../../shared/facade"
import { MapResetStore } from "../../../stores/mapReset.store"

@Component({
    selector: "cc-confirm-reset-map-dialog",
    templateUrl: "./confirmResetMapDialog.component.html",
    imports: [ConfirmDialogComponent],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ConfirmResetMapDialogComponent {
    private readonly dialog = viewChild.required<ConfirmDialogComponent>("dialog")

    constructor(
        private readonly mapResetStore: MapResetStore,
        private readonly ccStatePersistence: CcStatePersistence,
        private readonly localSource: LocalSourceService,
        private readonly projectsBoot: ProjectsBootService
    ) {}

    open() {
        this.dialog().open()
    }

    async confirmReset() {
        await this.ccStatePersistence.delete()
        await this.localSource.forgetAllFolders()
        this.mapResetStore.resetState()
        await this.projectsBoot.reloadAfterReset()
    }
}
