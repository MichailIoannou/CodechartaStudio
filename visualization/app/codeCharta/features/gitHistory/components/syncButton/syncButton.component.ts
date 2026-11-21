import { ChangeDetectionStrategy, Component, computed, inject, signal } from "@angular/core"
import { ContextMenuItemComponent, FloatingMenuAnchor, FloatingMenuComponent } from "../../../shared/facade"
import { BranchActionsService } from "../../services/branchActions.service"
import { GitOperationKind, GitOperationService } from "../../services/gitOperation.service"
import { SyncActionsService } from "../../services/syncActions.service"
import { WAITING_FOR_OPERATION } from "../../util/branchMenu"
import { mainSyncAction, SyncActionKind, SyncMenuAction, SyncMenuItem, syncMenuItems } from "../../util/syncState"

/** How the main part reads while a sync operation runs, and what its Cancel button names. */
const RUNNING: Partial<Record<GitOperationKind, { label: string; noun: string }>> = {
    fetch: { label: "Fetching", noun: "fetch" },
    pull: { label: "Pulling", noun: "pull" },
    push: { label: "Pushing", noun: "push" }
}

/**
 * Design H5: the main part does what the branch needs now (Publish, Pull, Push or Fetch), the caret lists the rest.
 * While a sync operation runs the main part reads "Pulling…" and the caret becomes Cancel; the progress itself shows
 * only in the workspace status.
 */
@Component({
    selector: "cc-sync-button",
    templateUrl: "./syncButton.component.html",
    imports: [FloatingMenuComponent, ContextMenuItemComponent],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class SyncButtonComponent {
    private readonly branchActions = inject(BranchActionsService)
    private readonly sync = inject(SyncActionsService)
    private readonly operations = inject(GitOperationService)
    private readonly context = computed(() => ({
        branch: this.sync.currentBranch(),
        remotes: this.sync.remotes(),
        inProgress: this.sync.inProgress()
    }))

    readonly menuAnchor = signal<FloatingMenuAnchor | null>(null)
    readonly isBusy = this.operations.isBusy
    readonly action = computed(() => mainSyncAction(this.context()))
    readonly menuItems = computed(() => syncMenuItems(this.context()))
    readonly running = computed(() => {
        const kind = this.operations.running()?.kind
        return kind ? (RUNNING[kind] ?? null) : null
    })
    readonly label = computed(() => {
        const running = this.running()
        return running ? `${running.label}…` : this.action().label
    })
    readonly isMainDisabled = computed(() => this.isBusy() || this.action().disabledReason !== null)
    readonly mainTitle = computed(() => {
        const running = this.running()
        if (running) {
            return `${running.label} — progress shows in the status at the top`
        }
        return this.isBusy() ? WAITING_FOR_OPERATION : (this.action().disabledReason ?? this.action().title)
    })

    runMain() {
        this.runAction(this.action().kind)
    }

    runMenuItem(item: SyncMenuItem) {
        this.menuAnchor.set(null)
        this.runAction(item.action)
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

    private runAction(action: SyncActionKind | SyncMenuAction) {
        const branch = this.sync.currentBranch()
        const runs: Record<SyncMenuAction, () => unknown> = {
            fetch: () => this.branchActions.fetch(false),
            fetchPrune: () => this.branchActions.fetch(true),
            pull: () => this.sync.pull(),
            push: () => this.sync.push(),
            publish: () => this.sync.publish(),
            forcePush: () => this.sync.forcePush(),
            setUpstream: () => branch && this.branchActions.openDialog({ kind: "setUpstream", branch })
        }
        void runs[action]()
    }
}
