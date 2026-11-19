import type { AnalysisJob } from "../../../model/coreApi/AnalysisJob"
import type { SnapshotResolution } from "../../../model/coreApi/SnapshotResolution"
import type { SnapshotSummary } from "../../../model/coreApi/SnapshotSummary"
import { counted, shortSha } from "../../../util/wording"
import type { SelectedTarget } from "../model/snapshotTarget"
import { isPendingJob, snapshotCommitLabel, targetName } from "./analysisWording"

export interface NoticeInput {
    folderLabel: string
    target: SelectedTarget
    resolution: SnapshotResolution | null
    /** The newest analysis of the target while it is pending or after it failed. */
    job: AnalysisJob | null
}

type NoticeKind = "stale" | "profile" | "none" | "unknownCommit" | "gitUnavailable" | "running" | "failed"
type NoticeTone = "info" | "warning" | "error"

export interface NoticePart {
    text: string
    isSha: boolean
}

export interface Notice {
    kind: NoticeKind
    tone: NoticeTone
    parts: NoticePart[]
    hint: string | null
    /** The label of the analyse button. */
    action: string | null
    isDismissible: boolean
}

/** What the workspace status adds to its badge: how far the shown snapshot is off, or that its profile differs. */
export interface NoticeBadge {
    text: string
    tone: "warning" | "ghost"
}

type NearestResolution = Extract<SnapshotResolution, { kind: "nearest" }>

const OTHER_PROFILE = "Analysed with a different profile."
const IMPORTED = "(imported, analysis time unknown)"

export function noticeText(input: NoticeInput): { notice: Notice | null; badge: NoticeBadge | null } {
    return { notice: jobNotice(input.job) ?? resolutionNotice(input), badge: badgeOf(input.resolution) }
}

export function sentenceOf(parts: NoticePart[]): string {
    return parts.map(part => part.text).join("")
}

function jobNotice(job: AnalysisJob | null): Notice | null {
    if (job && isPendingJob(job)) {
        const parts = [plain("Analysing "), ...nameParts(job), plain("…")]
        return { ...quiet("running", "info", parts), hint: "Progress shows in the status at the top." }
    }
    if (job?.state === "failed") {
        const parts = [plain("Analysis of "), ...nameParts(job), plain(` failed: ${job.error?.message ?? ""}`)]
        return { ...quiet("failed", "error", parts), hint: job.error?.hint ?? null, isDismissible: true }
    }
    return null
}

function resolutionNotice({ folderLabel, target, resolution }: NoticeInput): Notice | null {
    switch (resolution?.kind) {
        case "exact":
            return isOtherProfile(resolution.snapshot, resolution.isCurrentProfile)
                ? dismissible("profile", "info", [plain(OTHER_PROFILE)])
                : null
        case "nearest":
            return { ...dismissible("stale", "warning", nearestParts(target, resolution)), action: analyseLabel(target) }
        case "latest":
            return resolution.reason === "GIT_UNAVAILABLE"
                ? dismissible("gitUnavailable", "info", [plain("Git is not available — showing the newest analysis.")])
                : null
        case "none":
            return resolution.reason === "UNKNOWN_COMMIT"
                ? dismissible("unknownCommit", "warning", [plain("This commit is not in the local repository.")])
                : { ...quiet("none", "warning", [plain(`No analysis yet for '${folderLabel}'.`)]), action: "Analyse now" }
        default:
            return null
    }
}

function nearestParts(target: SelectedTarget, resolution: NearestResolution): NoticePart[] {
    const { snapshot } = resolution
    const opening =
        target.kind === "commit" ? [plain("No analysis for "), sha(shortSha(target.sha))] : [plain("No analysis of the current checkout")]
    return [
        ...opening,
        plain(" — showing "),
        snapshot.shortCommit ? sha(snapshot.shortCommit) : plain(snapshotCommitLabel(snapshot)),
        plain(snapshot.source === "imported" ? ` ${IMPORTED}` : ""),
        plain(snapshot.subject ? ` (${snapshot.subject})` : ""),
        plain(distanceSentence(resolution)),
        plain(isOtherProfile(snapshot, resolution.isCurrentProfile) ? ` ${OTHER_PROFILE}` : "")
    ].filter(part => part.text !== "")
}

function distanceSentence({ relation, behind, ahead }: NearestResolution): string {
    switch (relation) {
        case "ancestor":
            return `, stale by ${counted(behind, "commit")}.`
        case "descendant":
            return `, which is ahead by ${counted(ahead, "commit")}.`
        case "diverged":
            return ` from a diverged line: ${behind} behind / ${ahead} ahead.`
    }
}

function badgeOf(resolution: SnapshotResolution | null): NoticeBadge | null {
    if (resolution?.kind === "exact" && isOtherProfile(resolution.snapshot, resolution.isCurrentProfile)) {
        return { text: "other profile", tone: "ghost" }
    }
    if (resolution?.kind !== "nearest") {
        return null
    }
    const suffixes = [
        resolution.snapshot.source === "imported" ? "imported" : null,
        isOtherProfile(resolution.snapshot, resolution.isCurrentProfile) ? "profile" : null
    ]
    return { text: [distanceBadge(resolution), ...suffixes].filter(Boolean).join(" · "), tone: "warning" }
}

function distanceBadge({ relation, behind, ahead }: NearestResolution): string {
    switch (relation) {
        case "ancestor":
            return `stale by ${behind}`
        case "descendant":
            return `ahead by ${ahead}`
        case "diverged":
            return `diverged ${behind}↓ ${ahead}↑`
    }
}

/** An import has no profile at all, so only an analysed snapshot can be of another one. */
function isOtherProfile(snapshot: SnapshotSummary, isCurrentProfile: boolean): boolean {
    return snapshot.source === "analysed" && !isCurrentProfile
}

function analyseLabel(target: SelectedTarget): string {
    return target.kind === "commit" ? `Analyse ${shortSha(target.sha)} now` : "Analyse current checkout"
}

function nameParts(job: AnalysisJob): NoticePart[] {
    return [job.target.kind === "commit" ? sha(targetName(job.target)) : plain(targetName(job.target))]
}

function quiet(kind: NoticeKind, tone: NoticeTone, parts: NoticePart[]): Notice {
    return { kind, tone, parts, hint: null, action: null, isDismissible: false }
}

function dismissible(kind: NoticeKind, tone: NoticeTone, parts: NoticePart[]): Notice {
    return { ...quiet(kind, tone, parts), isDismissible: true }
}

function plain(text: string): NoticePart {
    return { text, isSha: false }
}

function sha(text: string): NoticePart {
    return { text, isSha: true }
}
