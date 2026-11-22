import { afterNextRender, ChangeDetectionStrategy, Component, computed, ElementRef, Injector, inject, input, output } from "@angular/core"
import type { GitLocalBranch } from "../../../../model/coreApi/GitLocalBranch"
import type { GitRefs } from "../../../../model/coreApi/GitRefs"
import type { GitRemoteBranch } from "../../../../model/coreApi/GitRemoteBranch"
import { ContextMenuItemComponent, FloatingMenuAnchor, FloatingMenuComponent } from "../../../shared/facade"
import { BRANCH_ACTIONS, BranchAction, BranchMenuTarget as ContributedMenuTarget } from "../../ports/branchActions.port"
import { BranchActionsService } from "../../services/branchActions.service"
import { GitOperationService } from "../../services/gitOperation.service"
import { GitRepositoryService } from "../../services/gitRepository.service"
import { SyncActionsService } from "../../services/syncActions.service"
import { BranchMenuAction, BranchMenuItem, branchMenuItems } from "../../util/branchMenu"
import type { BranchRef } from "../../util/branchTree"

export interface BranchMenuTarget {
    anchor: FloatingMenuAnchor
    ref: BranchRef
    isFromKeyboard: boolean
}

const STEPS: Readonly<Record<string, number>> = { ArrowDown: 1, ArrowUp: -1 }

/** Design H10 branch menu of the branches tree. */
@Component({
    selector: "cc-branch-context-menu",
    templateUrl: "./branchContextMenu.component.html",
    imports: [FloatingMenuComponent, ContextMenuItemComponent],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class BranchContextMenuComponent {
    private readonly actions = inject(BranchActionsService)
    private readonly sync = inject(SyncActionsService)
    private readonly operations = inject(GitOperationService)
    private readonly hostElement = inject<ElementRef<HTMLElement>>(ElementRef)
    private readonly injector = inject(Injector)
    private readonly repository = inject(GitRepositoryService)
    private readonly contributedActions = inject(BRANCH_ACTIONS, { optional: true }) ?? []

    readonly target = input.required<BranchMenuTarget>()
    /** True when the tree should take the focus back. */
    readonly closed = output<boolean>()

    readonly items = computed(() =>
        branchMenuItems(this.target().ref, this.operations.isBusy(), this.sync.remotes(), this.sync.inProgress())
    )
    readonly contributedTarget = computed(() => contributedTargetOf(this.target().ref, this.repository.activeRepository()))
    /** Other features' items (plan 06: the compare entries), after the History's own. */
    readonly contributed = computed(() => {
        const target = this.contributedTarget()
        return target ? this.contributedActions.filter(action => action.isOfferedFor(target)) : []
    })

    focusFirstItemIfFromKeyboard() {
        if (this.target().isFromKeyboard) {
            afterNextRender(() => this.enabledButtons()[0]?.focus(), { injector: this.injector })
        }
    }

    run(item: BranchMenuItem) {
        const refs = this.actions.refs()
        if (refs) {
            this.runAction(item.action, this.target().ref, refs)
        }
        this.closed.emit(this.target().isFromKeyboard)
    }

    runContributed(action: BranchAction, target: ContributedMenuTarget) {
        action.run(target)
        this.closed.emit(this.target().isFromKeyboard)
    }

    dismiss() {
        this.closed.emit(false)
    }

    onKeydown(event: KeyboardEvent) {
        if (event.key === "Escape") {
            this.closed.emit(true)
        } else if (event.key in STEPS) {
            this.moveFocus(STEPS[event.key])
        } else {
            return
        }
        event.preventDefault()
        event.stopPropagation()
    }

    private runAction(action: BranchMenuAction, ref: BranchRef, refs: GitRefs) {
        const remote = refs.remoteBranches.find(branch => branch.refName === ref.refName)
        if (action === "newBranch") {
            this.openNewBranch(ref, refs)
        } else if (ref.local) {
            this.runLocal(action, ref.local)
        } else if (remote) {
            this.runRemote(action, remote)
        }
    }

    private runLocal(action: BranchMenuAction, branch: GitLocalBranch) {
        switch (action) {
            case "switch":
                void this.actions.switchTo(branch)
                break
            case "rename":
                this.actions.openDialog({ kind: "rename", branch })
                break
            case "delete":
                void this.actions.deleteLocal(branch)
                break
            case "setUpstream":
                this.actions.openDialog({ kind: "setUpstream", branch })
                break
            case "push":
                void this.sync.push(branch)
                break
            case "publish":
                void this.sync.publish(branch)
                break
            case "forcePush":
                void this.sync.forcePush(branch)
                break
        }
    }

    private runRemote(action: BranchMenuAction, remote: GitRemoteBranch) {
        if (action === "checkOutAsNew") {
            this.actions.openDialog({ kind: "checkOutRemote", remote })
        } else if (action === "deleteRemote") {
            void this.actions.deleteRemote(remote)
        }
    }

    private openNewBranch(ref: BranchRef, refs: GitRefs) {
        const commit = [...refs.localBranches, ...refs.remoteBranches, ...refs.tags].find(
            candidate => candidate.refName === ref.refName
        )?.commit
        if (commit) {
            this.actions.openDialog({ kind: "create", startPoint: commit, subject: ref.lastCommit?.subject ?? "" })
        }
    }

    private moveFocus(step: number) {
        const buttons = this.enabledButtons()
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
        const next = current < 0 ? 0 : (current + step + buttons.length) % buttons.length
        buttons[next]?.focus()
    }

    private enabledButtons(): HTMLButtonElement[] {
        return Array.from(this.hostElement.nativeElement.querySelectorAll<HTMLButtonElement>("button:not([disabled])"))
    }
}

function contributedTargetOf(ref: BranchRef, repo: ContributedMenuTarget["repo"] | null): ContributedMenuTarget | null {
    return repo ? { repo, refName: ref.refName, name: ref.fullName, kind: ref.kind, isCurrent: ref.local?.isCurrent ?? false } : null
}
