import type { AnalysisJob } from "../../../model/coreApi/AnalysisJob"
import type { GitStatus } from "../../../model/coreApi/GitStatus"
import type { ProjectFolder } from "../../../model/coreApi/ProjectFolder"
import type { SnapshotSummary } from "../../../model/coreApi/SnapshotSummary"
import { branchLabel, counted, fileDate, longDate, shortDate } from "../../projects/facade"
import { isUnboundImport, progressPercent, targetName } from "../../snapshots/facade"

/** What the trigger tells besides the folder: an analysis that just finished (for a moment) or one that failed. */
export type RecentOutcome = "none" | "finished" | "failed"

export interface TriggerInput {
    folder: ProjectFolder
    /** `undefined` while unknown, a string when git could not answer. */
    gitStatus: GitStatus | string | undefined
    shown: SnapshotSummary | null
    hasSnapshots: boolean
    activeJob: AnalysisJob | null
    outcome: RecentOutcome
    isCoreOffline: boolean
}

/** The part after the branch: the commit in the map, what runs, or a short state. */
interface MapPart {
    sha: string | null
    text: string | null
    isAnalysing: boolean
    percent: number | null
}

type BadgeTone = "error" | "warning" | "ghost"

interface TriggerBadge {
    text: string
    tone: BadgeTone
}

type FillKind = "none" | "determinate" | "indeterminate" | "finished" | "failed"

export interface TriggerView {
    icon: string
    isSpinning: boolean
    branch: string | null
    isBranchLoading: boolean
    mapPart: MapPart | null
    badge: TriggerBadge | null
    fill: FillKind
    fillPercent: number | null
    ahead: number
    behind: number
    uncommitted: number
    title: string
    ariaLabel: string
}

const IMPORTED_UNKNOWN = "imported · analysis time unknown"

export function workspaceTrigger(input: TriggerInput): TriggerView {
    const status = typeof input.gitStatus === "object" ? input.gitStatus : null
    const mapPart = mapPartOf(input)
    const badge = badgeOf(input)
    const branch = branchOf(input, status)
    return {
        icon: iconOf(input),
        isSpinning: input.activeJob !== null && !input.isCoreOffline,
        branch,
        isBranchLoading: input.folder.kind === "git" && input.gitStatus === undefined,
        mapPart,
        badge,
        fill: fillOf(input),
        fillPercent: input.activeJob ? progressPercent(input.activeJob.progress) : null,
        ahead: status?.upstream?.ahead ?? 0,
        behind: status?.upstream?.behind ?? 0,
        uncommitted: status ? uncommittedOf(status) : 0,
        title: titleOf(input, status),
        ariaLabel: [branch ? `Branch ${branch}` : input.folder.label, mapAriaOf(input, mapPart), badge?.text].filter(Boolean).join(", ")
    }
}

function iconOf(input: TriggerInput): string {
    if (input.isCoreOffline) {
        return "fa-solid fa-plug-circle-xmark"
    }
    if (input.activeJob) {
        return ""
    }
    const outcomeIcons = { finished: "fa-solid fa-check text-success", failed: "fa-solid fa-triangle-exclamation text-error", none: null }
    return outcomeIcons[input.outcome] ?? restingIconOf(input)
}

function restingIconOf(input: TriggerInput): string {
    if (typeof input.gitStatus === "string") {
        return "fa-solid fa-triangle-exclamation text-warning"
    }
    if (input.shown && isUnboundImport(input.shown)) {
        return "fa-solid fa-file-import"
    }
    return input.folder.kind === "plain" ? "fa-solid fa-folder" : "fa-solid fa-code-branch"
}

function branchOf(input: TriggerInput, status: GitStatus | null): string | null {
    return status ? branchLabel(status) : input.folder.label
}

function mapPartOf(input: TriggerInput): MapPart | null {
    if (input.isCoreOffline) {
        return textPart("Core offline")
    }
    if (input.activeJob) {
        return { sha: null, text: null, isAnalysing: true, percent: progressPercent(input.activeJob.progress) }
    }
    if (input.outcome === "failed") {
        return textPart("Analysis failed")
    }
    return input.shown ? shownPartOf(input.shown) : null
}

function shownPartOf(shown: SnapshotSummary): MapPart {
    if (isUnboundImport(shown)) {
        return textPart(IMPORTED_UNKNOWN)
    }
    return shown.shortCommit
        ? { sha: shown.shortCommit, text: null, isAnalysing: false, percent: null }
        : textPart(`snapshot from ${shortDate(shown.createdAt)}`)
}

function textPart(text: string): MapPart {
    return { sha: null, text, isAnalysing: false, percent: null }
}

function badgeOf(input: TriggerInput): TriggerBadge | null {
    if (input.outcome === "failed") {
        return { text: "failed", tone: "error" }
    }
    if (input.shown?.dirty) {
        return { text: "dirty", tone: "warning" }
    }
    if (input.shown?.source === "imported" && !isUnboundImport(input.shown)) {
        return { text: "imported", tone: "ghost" }
    }
    return input.hasSnapshots || input.activeJob ? null : { text: "not analysed", tone: "ghost" }
}

function fillOf(input: TriggerInput): FillKind {
    if (input.activeJob) {
        return progressPercent(input.activeJob.progress) === null ? "indeterminate" : "determinate"
    }
    return input.outcome
}

function titleOf(input: TriggerInput, status: GitStatus | null): string {
    const { folder } = input
    return [
        `Working folder ${folder.label} (${folder.path})`,
        status ? branchLine(status) : null,
        mapLine(input),
        activityLine(input.activeJob)
    ]
        .filter(Boolean)
        .join("\n")
}

function branchLine(status: GitStatus): string {
    const toPush = status.upstream?.ahead ?? 0
    const toPull = status.upstream?.behind ?? 0
    const uncommitted = uncommittedOf(status)
    const parts = [
        toPush > 0 ? `${toPush} to push` : null,
        toPull > 0 ? `${toPull} to pull` : null,
        uncommitted > 0 ? `${uncommitted} uncommitted` : null
    ]
    return [`Branch ${branchLabel(status)}`, ...parts].filter(Boolean).join(", ")
}

function mapLine(input: TriggerInput): string {
    const shown = input.shown
    if (!shown) {
        return input.hasSnapshots ? "" : "No analysis yet."
    }
    if (shown.source === "imported") {
        const fileDateLine = shown.fileModifiedAt ? `\nFile date: ${fileDate(shown.fileModifiedAt)}` : ""
        return `Imported snapshot — analysis time unknown${fileDateLine}\nImported ${longDate(shown.createdAt)}`
    }
    const commit = shown.shortCommit ? `${shown.shortCommit} ${shown.subject ?? ""}`.trim() : `snapshot from ${shortDate(shown.createdAt)}`
    return `Map shows ${commit}`
}

function activityLine(job: AnalysisJob | null): string | null {
    if (!job) {
        return null
    }
    const percent = progressPercent(job.progress)
    return percent === null ? `Analysing ${targetName(job.target)}` : `Analysing ${targetName(job.target)} — ${percent} %`
}

function mapAriaOf(input: TriggerInput, mapPart: MapPart | null): string | null {
    if (mapPart?.sha) {
        return `map shows ${mapPart.sha}`
    }
    if (input.activeJob) {
        const name = targetName(input.activeJob.target)
        return mapPart?.percent === null ? `analysing ${name}` : `analysing ${name} ${mapPart?.percent} percent`
    }
    return mapPart?.text ?? null
}

function uncommittedOf(status: GitStatus): number {
    const { staged, unstaged, untracked, conflicted } = status.counts
    return staged + unstaged + untracked + conflicted
}

export function uncommittedTitle(count: number): string {
    return counted(count, "uncommitted change")
}
