import { inject } from "@angular/core"
import type { CommitAction, CommitSelection } from "../../gitHistory/facade"
import { ProjectsFacade } from "../../projects/facade"
import { SelectedTarget, targetKeyOf } from "../model/snapshotTarget"
import { SnapshotCatalogService } from "../services/snapshotCatalog.service"
import { SnapshotViewService } from "../services/snapshotView.service"

/**
 * Design S5 / S10: the primary commit action (Enter, double-click, first details button). It shows the commit's
 * analysis, or the nearest one, in the map; on the uncommitted changes it shows the current checkout. A folder
 * without any analysis has nothing to show, so the action is not offered there.
 */
export function showInMapAction(): CommitAction {
    const view = inject(SnapshotViewService)
    const catalog = inject(SnapshotCatalogService)
    const projects = inject(ProjectsFacade)
    return {
        id: "snapshots.showInMap",
        label: "Show in Map",
        detailsLabel: "Show in map",
        icon: "fa-solid fa-map",
        hoverHint: "",
        isPrimary: true,
        isOfferedFor: selection => selection.items.length === 1 && catalog.snapshots(selection.repo.folderId).length > 0,
        run: selection => {
            const target = targetOf(selection)
            const current = view.target()
            if (current && targetKeyOf(current) === targetKeyOf(target)) {
                showMapWhenShown(view, projects)
            } else if (target.kind === "commit") {
                view.showCommit(target.sha)
            } else {
                view.showCurrentCheckout()
            }
        }
    }
}

function targetOf({ items: [item] }: CommitSelection): SelectedTarget {
    return item.kind === "commit" ? { kind: "commit", sha: item.commit.sha } : { kind: "workingTree" }
}

/** The map already follows this target: going there is all that is left, once its analysis is on the map. */
function showMapWhenShown(view: SnapshotViewService, projects: ProjectsFacade) {
    if (view.status() === "shown") {
        projects.showMap()
    }
}
