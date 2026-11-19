import { InjectionToken } from "@angular/core"
import type { CommitSelection } from "../model/commitSelection"

/** An action other features add to the commit menu and the details pane (plans 05 and 06). */
export interface CommitAction {
    id: string
    /** Title Case, as the commit menu lists it: "Analyse This Commit". */
    label: string
    /** Sentence case, as a button in the details pane: "Analyse this commit". Without it the action is only in the menu. */
    detailsLabel?: string
    /** Font Awesome classes, such as "fa-solid fa-play". */
    icon: string
    hoverHint: string
    /** Enter and double-click run the first offered primary action. */
    isPrimary: boolean
    isOfferedFor(selection: CommitSelection): boolean
    /** Why an offered action cannot run for this selection; the menu then shows it disabled with that reason. */
    disabledReasonFor?(selection: CommitSelection): string | null
    run(selection: CommitSelection): void
}

/** Multi provider: each contribution provides one action; the menu lists them in the order they are provided. */
export const COMMIT_ACTIONS = new InjectionToken<readonly CommitAction[]>("COMMIT_ACTIONS")
