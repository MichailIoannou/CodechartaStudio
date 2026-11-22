import type { AnalysisJob } from "../../../model/coreApi/AnalysisJob"
import type { FolderRef } from "../../../model/coreApi/FolderRef"
import type { GitStatus } from "../../../model/coreApi/GitStatus"
import type { ProjectFolder } from "../../../model/coreApi/ProjectFolder"
import type { SnapshotSummary } from "../../../model/coreApi/SnapshotSummary"
import type { RunningGitOperation } from "../../gitHistory/facade"
import { branchLabel, counted, fileDate, longDate, shortDate } from "../../projects/facade"
import { isUnboundImport, progressPercent, targetName } from "../../snapshots/facade"
import { badgeOf, lowerFirst, Staleness, TriggerBadge } from "./triggerBadge"

/** A git operation of the working folder that the trigger shows instead of an analysis (design W1). */
export interface GitActivity {
    /** "Fetching", as the map part words it. */
    label: string
    icon: string
    percent: number | null
    /** git's own progress line, for the title. */
    message: string | null
}

const GIT_ACTIVITIES: Partial<Record<RunningGitOperation["kind"], { label: string; icon: string }>> = {
    fetch: { label: "Fetching", icon: "fa-solid fa-cloud-arrow-down motion-safe:animate-pulse" },
    pull: { label: "Pulling", icon: "fa-solid fa-arrow-down motion-safe:animate-pulse" },
    push: { label: "Pushing", icon: "fa-solid fa-arrow-up motion-safe:animate-pulse" }
}
const FULL_PERCENT = 100

/** Only the network operations design W1 words show here; quick local writes would only flicker. */
export function gitActivityOf(running: RunningGitOperation | null, folder: FolderRef | null): GitActivity | null {
    const activity = running ? GIT_ACTIVITIES[running.kind] : undefined
    if (!running || !activity || running.repo.projectId !== folder?.projectId || running.repo.folderId !== folder.folderId) {
        return null
    }
    const { done, total, message } = running.progress ?? { done: null, total: null, message: null }
    const percent = done !== null && total ? Math.round((done / total) * FULL_PERCENT) : null
    return { ...activity, percent, message: message || null }
}

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
    staleness: Staleness | null
    /** Shown instead of a running analysis: the user waits for it. */
    gitActivity?: GitActivity | null
}

/** The part after the branch: what runs, or a short state; the commit in the map is only in the title and the dropdown. */
interface MapPart {
    text: string | null
    isAnalysing: boolean
    percent: number | null
    /** The running git operation, worded ("Fetching"). */
    activity?: string
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
    const badge = badgeOf({
        isFailed: input.outcome === "failed",
        isGitActivityBesideAnalysis: Boolean(input.gitActivity && input.activeJob),
        isAnalysing: input.activeJob !== null,
        staleness: input.staleness,
        shown: input.shown,
        hasSnapshots: input.hasSnapshots
    })
    const branch = branchOf(input, status)
    return {
        icon: iconOf(input),
        isSpinning: input.activeJob !== null && !input.isCoreOffline && !input.gitActivity,
        branch,
        isBranchLoading: input.folder.kind === "git" && input.gitStatus === undefined,
        mapPart,
        badge,
        fill: fillOf(input),
        fillPercent: fillPercentOf(input),
        ahead: status?.upstream?.ahead ?? 0,
        behind: status?.upstream?.behind ?? 0,
        uncommitted: status ? uncommittedOf(status) : 0,
        title: titleOf(input, status),
        ariaLabel: [branch ? `Branch ${branch}` : input.folder.label, mapAriaOf(input, mapPart), badge && lowerFirst(badge.hint)]
            .filter(Boolean)
            .join(", ")
    }
}

function iconOf(input: TriggerInput): string {
    if (input.isCoreOffline) {
        return "fa-solid fa-plug-circle-xmark"
    }
    if (input.gitActivity) {
        return input.gitActivity.icon
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
    if (input.gitActivity) {
        return { text: null, isAnalysing: false, percent: input.gitActivity.percent, activity: input.gitActivity.label }
    }
    if (input.activeJob) {
        return { text: null, isAnalysing: true, percent: progressPercent(input.activeJob.progress) }
    }
    if (input.outcome === "failed") {
        return textPart("Analysis failed")
    }
    return input.shown ? shownPartOf(input.shown) : null
}

function shownPartOf(shown: SnapshotSummary): MapPart | null {
    if (isUnboundImport(shown)) {
        return textPart(IMPORTED_UNKNOWN)
    }
    return shown.shortCommit ? null : textPart(`snapshot from ${shortDate(shown.createdAt)}`)
}

function textPart(text: string): MapPart {
    return { text, isAnalysing: false, percent: null }
}

function fillOf(input: TriggerInput): FillKind {
    if (input.gitActivity) {
        return input.gitActivity.percent === null ? "indeterminate" : "determinate"
    }
    if (input.activeJob) {
        return progressPercent(input.activeJob.progress) === null ? "indeterminate" : "determinate"
    }
    return input.outcome
}

function fillPercentOf(input: TriggerInput): number | null {
    if (input.gitActivity) {
        return input.gitActivity.percent
    }
    return input.activeJob ? progressPercent(input.activeJob.progress) : null
}

function titleOf(input: TriggerInput, status: GitStatus | null): string {
    const { folder } = input
    return [
        `Working folder ${folder.label} (${folder.path})`,
        status ? branchLine(status) : null,
        mapLine(input),
        gitActivityLine(input.gitActivity ?? null),
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
    const uncommitted = shown.dirty ? " with uncommitted changes" : ""
    return input.staleness ? `Map shows ${commit}${uncommitted}, ${input.staleness.phrase}` : `Map shows ${commit}${uncommitted}`
}

function gitActivityLine(activity: GitActivity | null): string | null {
    if (!activity) {
        return null
    }
    return activity.message ? `${activity.label} — ${activity.message}` : `${activity.label}…`
}

function activityLine(job: AnalysisJob | null): string | null {
    if (!job) {
        return null
    }
    const percent = progressPercent(job.progress)
    return percent === null ? `Analysing ${targetName(job.target)}` : `Analysing ${targetName(job.target)} — ${percent} %`
}

function mapAriaOf(input: TriggerInput, mapPart: MapPart | null): string | null {
    if (mapPart?.activity) {
        const label = mapPart.activity.toLowerCase()
        return mapPart.percent === null ? label : `${label} ${mapPart.percent} percent`
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
