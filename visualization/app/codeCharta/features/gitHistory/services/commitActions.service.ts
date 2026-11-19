import { Injectable, inject } from "@angular/core"
import type { CommitSelection } from "../model/commitSelection"
import { COMMIT_ACTIONS, CommitAction } from "../ports/commitActions.port"

/** The contributed commit actions; without contributions there are none. */
@Injectable({ providedIn: "root" })
export class CommitActionsService {
    private readonly actions = inject(COMMIT_ACTIONS, { optional: true }) ?? []

    offeredFor(selection: CommitSelection): readonly CommitAction[] {
        return this.actions.filter(action => action.isOfferedFor(selection))
    }

    /** Buttons of the details pane: the offered actions that have a details label. */
    detailsActionsFor(selection: CommitSelection): readonly CommitAction[] {
        return this.offeredFor(selection).filter(action => action.detailsLabel !== undefined)
    }

    /** Enter and double-click; false when no primary action is offered. */
    runPrimary(selection: CommitSelection): boolean {
        const primary = this.offeredFor(selection).find(action => action.isPrimary)
        primary?.run(selection)
        return primary !== undefined
    }
}
