import { ChangeDetectionStrategy, Component, computed, inject, signal } from "@angular/core"
import { ContextMenuItemComponent, FloatingMenuAnchor, FloatingMenuComponent } from "../../../shared/facade"
import { readyValueOf } from "../../model/loadState"
import { BranchActionsService } from "../../services/branchActions.service"
import { GitOperationService } from "../../services/gitOperation.service"
import { GitRepositoryService } from "../../services/gitRepository.service"
import { WAITING_FOR_OPERATION } from "../../util/branchMenu"

const FETCH_TITLE = "Fetch from all remotes"
const FETCHING_TITLE = "Fetching — progress shows in the status at the top"

/**
 * Design H5, as far as M8 goes: the main part fetches (Pull, Push and Publish arrive with M11), the caret lists the
 * fetch variants and Set Upstream…. While a fetch runs the main part reads "Fetching…" and the caret becomes Cancel;
 * the progress itself shows only in the workspace status.
 */
@Component({
    selector: "cc-sync-button",
    templateUrl: "./syncButton.component.html",
    imports: [FloatingMenuComponent, ContextMenuItemComponent],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class SyncButtonComponent {
    private readonly actions = inject(BranchActionsService)
    private readonly operations = inject(GitOperationService)
    private readonly repository = inject(GitRepositoryService)

    readonly menuAnchor = signal<FloatingMenuAnchor | null>(null)
    readonly isBusy = this.operations.isBusy
    readonly isFetching = computed(() => this.operations.running()?.kind === "fetch")
    readonly label = computed(() => (this.isFetching() ? "Fetching…" : "Fetch"))
    readonly mainTitle = computed(() => {
        if (this.isFetching()) {
            return FETCHING_TITLE
        }
        return this.isBusy() ? WAITING_FOR_OPERATION : FETCH_TITLE
    })
    readonly currentBranch = computed(() => {
        const refs = readyValueOf(this.repository.refs())
        return refs?.localBranches.find(branch => branch.isCurrent) ?? null
    })

    fetch(prune = false) {
        this.menuAnchor.set(null)
        void this.actions.fetch(prune)
    }

    cancel() {
        this.operations.cancel()
    }

    toggleMenu(event: MouseEvent) {
        const box = (event.currentTarget as HTMLElement).getBoundingClientRect()
        this.menuAnchor.set(this.menuAnchor() ? null : { x: box.left, y: box.bottom })
    }

    closeMenu() {
        this.menuAnchor.set(null)
    }

    setUpstream() {
        const branch = this.currentBranch()
        this.menuAnchor.set(null)
        if (branch) {
            this.actions.openDialog({ kind: "setUpstream", branch })
        }
    }
}
