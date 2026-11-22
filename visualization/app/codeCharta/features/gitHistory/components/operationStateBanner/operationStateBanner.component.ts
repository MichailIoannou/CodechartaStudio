import { ChangeDetectionStrategy, Component, computed, inject } from "@angular/core"
import { readyValueOf } from "../../model/loadState"
import { GitOperationService } from "../../services/gitOperation.service"
import { GitRepositoryService } from "../../services/gitRepository.service"
import { SyncActionsService } from "../../services/syncActions.service"
import { WAITING_FOR_OPERATION } from "../../util/branchMenu"
import { operationNoticeOf } from "../../util/operationNotice"

/** Design H6: the warning that stays while git is in the middle of a merge, rebase or other operation. */
@Component({
    selector: "cc-operation-state-banner",
    templateUrl: "./operationStateBanner.component.html",
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class OperationStateBannerComponent {
    private readonly repository = inject(GitRepositoryService)
    private readonly operations = inject(GitOperationService)
    private readonly sync = inject(SyncActionsService)

    readonly notice = computed(() => {
        const status = readyValueOf(this.repository.status())
        return status ? operationNoticeOf(status) : null
    })
    readonly isBusy = this.operations.isBusy
    readonly waitingTitle = WAITING_FOR_OPERATION

    abort() {
        void this.sync.abort()
    }

    refresh() {
        void this.repository.refresh("manual")
    }
}
