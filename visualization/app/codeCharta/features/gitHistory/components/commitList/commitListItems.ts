import type { GitCommitSummary } from "../../../../model/coreApi/GitCommitSummary"
import { WORKING_TREE_KEY } from "../../model/commitSelection"
import { failureOf, LoadState } from "../../model/loadState"
import type { AnalysedCommitMarker } from "../../ports/analysedCommits.port"
import { gitErrorSentence } from "../../util/gitErrorText"
import { GraphRow } from "../../util/graphLayout"
import { graphWidthFor, MAX_DRAWN_LANES } from "../../util/graphRowGeometry"
import type { RefLabel } from "../../util/refLabels"
import type { CommitRowView } from "../commitRow/commitRow.component"

/** Room for the `+n` beside the drawn lanes. */
const HIDDEN_LANES_ROOM_PX = 24
/** The column header "Graph" needs this much, even when one lane is narrower. */
const GRAPH_HEADER_MIN_PX = 52
const COMMIT_COLUMN = "minmax(0,1fr)"
const ANALYSIS_COLUMN = "6.5rem"
const AUTHOR_COLUMN = "8rem"
const DATE_COLUMN = "7rem"

export type ListItem =
    | { kind: "workingTree"; key: string; count: number; isSelected: boolean; isSecond: boolean }
    | { kind: "commit"; key: string; view: CommitRowView }
    | { kind: "loadingMore"; key: string }
    | { kind: "loadMoreFailed"; key: string; sentence: string }

type LogPage = LoadState<unknown>

export function trailingItemOf(page: LogPage, commitCount: number): ListItem | null {
    if (commitCount === 0) {
        return null
    }
    if (page.kind === "loading") {
        return { kind: "loadingMore", key: "loading-more" }
    }
    return page.kind === "failed" ? { kind: "loadMoreFailed", key: "load-more-failed", sentence: gitErrorSentence(page.error) } : null
}

export function focusedRowIndexOf(key: string | null, leadingRowCount: number, commits: readonly GitCommitSummary[]): number | null {
    if (key === null) {
        return null
    }
    if (key === WORKING_TREE_KEY) {
        return leadingRowCount === 1 ? 0 : null
    }
    const commitIndex = commits.findIndex(commit => commit.sha === key)
    return commitIndex < 0 ? null : leadingRowCount + commitIndex
}

export function gridTemplateOf(isAnalysisShown: boolean, graphColumnWidth: number | null): string {
    const columns = isAnalysisShown
        ? [COMMIT_COLUMN, ANALYSIS_COLUMN, AUTHOR_COLUMN, DATE_COLUMN]
        : [COMMIT_COLUMN, AUTHOR_COLUMN, DATE_COLUMN]
    return graphColumnWidth === null ? columns.join(" ") : [`${graphColumnWidth}px`, ...columns].join(" ")
}

export function graphColumnWidthOf(rows: readonly GraphRow[]): number {
    const laneCount = rows.reduce((max, row) => Math.max(max, row.laneCount), 0)
    const lanesWidth = graphWidthFor(Math.max(1, laneCount)) + (laneCount > MAX_DRAWN_LANES ? HIDDEN_LANES_ROOM_PX : 0)
    return Math.max(GRAPH_HEADER_MIN_PX, lanesWidth)
}

export function firstPageFailureOf(page: LogPage, commitCount: number): string | null {
    const failure = failureOf(page)
    return failure && commitCount === 0 && failure.code !== "TIMEOUT" ? gitErrorSentence(failure) : null
}

export function emptyStateOf(isEmpty: boolean, isFiltered: boolean): "noCommits" | "noMatch" | null {
    if (!isEmpty) {
        return null
    }
    return isFiltered ? "noMatch" : "noCommits"
}

export interface RowLooks {
    graphRows: readonly GraphRow[] | null
    headSha: string | null
    refLabels: ReadonlyMap<string, readonly RefLabel[]>
    markers: ReadonlyMap<string, AnalysedCommitMarker>
    selectedKeys: ReadonlySet<string>
    secondKey: string | null
}

export function commitRowViewOf(commit: GitCommitSummary, commitIndex: number, looks: RowLooks): CommitRowView {
    return {
        commit,
        graphRow: looks.graphRows?.[commitIndex] ?? null,
        isHead: commit.sha === looks.headSha,
        labels: looks.refLabels.get(commit.sha) ?? [],
        marker: looks.markers.get(commit.sha) ?? null,
        isSelected: looks.selectedKeys.has(commit.sha),
        isSecond: looks.secondKey === commit.sha
    }
}

export function workingTreeItemOf(count: number, selectedKeys: ReadonlySet<string>, secondKey: string | null): ListItem {
    const key = WORKING_TREE_KEY
    return { kind: "workingTree", key, count, isSelected: selectedKeys.has(key), isSecond: secondKey === key }
}
