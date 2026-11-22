import { ChangeDetectionStrategy, Component, inject } from "@angular/core"
import { SettingsPopoverShellComponent } from "../../../shared/facade"
import { ANALYSED_COMMITS } from "../../ports/analysedCommits.port"
import type { GraphRow } from "../../util/graphLayout"
import { CommitGraphCellComponent } from "../commitGraphCell/commitGraphCell.component"

const LEGEND_SHA = "legend"
const STRAIGHT = { fromLane: 0, toLane: 0, color: 0 }

/** Example rows drawn with the same pieces as the commit list. */
const COMMIT_ROW: GraphRow = { sha: LEGEND_SHA, lane: 0, color: 0, incoming: [STRAIGHT], outgoing: [STRAIGHT], passing: [], laneCount: 1 }
const HEAD_ROW: GraphRow = { ...COMMIT_ROW, incoming: [], outgoing: [] }
const MERGE_ROW: GraphRow = {
    ...COMMIT_ROW,
    outgoing: [STRAIGHT, { fromLane: 0, toLane: 1, color: 2 }],
    laneCount: 2
}

@Component({
    selector: "cc-commit-graph-legend",
    templateUrl: "./commitGraphLegend.component.html",
    imports: [SettingsPopoverShellComponent, CommitGraphCellComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: "contents" }
})
export class CommitGraphLegendComponent {
    readonly commitRow = COMMIT_ROW
    readonly headRow = HEAD_ROW
    readonly mergeRow = MERGE_ROW
    readonly isAnalysisShown = inject(ANALYSED_COMMITS, { optional: true }) !== null
}
