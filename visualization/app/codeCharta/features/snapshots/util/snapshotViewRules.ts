import type { AnalysisJob } from "../../../model/coreApi/AnalysisJob"
import type { AnalysisTarget } from "../../../model/coreApi/AnalysisTarget"
import type { FolderRef } from "../../../model/coreApi/FolderRef"
import type { GitCommitDistance } from "../../../model/coreApi/GitCommitDistance"
import type { SnapshotRef } from "../../../model/coreApi/SnapshotRef"
import type { SnapshotRelation } from "../../../model/coreApi/SnapshotRelation"
import type { SnapshotResolution } from "../../../model/coreApi/SnapshotResolution"
import type { SnapshotSummary } from "../../../model/coreApi/SnapshotSummary"
import { analysisTargetOf, isSameAnalysisTarget, SelectedTarget, targetKeyOf } from "../model/snapshotTarget"
import { isPendingJob } from "./analysisWording"
import { Notice, NoticeBadge, noticeText } from "./noticeText"

export function refOf(projectId: string | undefined, folderId: string | undefined): FolderRef | null {
    return projectId && folderId ? { projectId, folderId } : null
}

export function folderKeyOf(folder: FolderRef): string {
    return `${folder.projectId}/${folder.folderId}`
}

export function isSameFolder(first: FolderRef | null, second: FolderRef | null): boolean {
    return first?.projectId === second?.projectId && first?.folderId === second?.folderId
}

export function folderTargetKeyOf(folder: FolderRef | null, target: SelectedTarget | null): string {
    return folder && target ? `${folderKeyOf(folder)}|${targetKeyOf(target)}` : ""
}

/** A restored folder shows its remembered snapshot; a folder without one shows its current checkout. */
export function firstTargetOf(folder: FolderRef, rememberedId: string | undefined): SelectedTarget {
    return rememberedId ? { kind: "snapshot", ref: { ...folder, snapshotId: rememberedId } } : { kind: "workingTree" }
}

export function snapshotRefOf(resolution: SnapshotResolution | null): SnapshotRef | null {
    return resolution && resolution.kind !== "none" ? resolution.snapshot.ref : null
}

export interface WorkingTarget {
    folder: FolderRef | null
    target: SelectedTarget | null
    headCommit: string | null
}

/** An analysis answers the current checkout when it maps the working tree or the commit at HEAD. */
export function answersTarget({ folder, target, headCommit }: WorkingTarget, analysedFolder: FolderRef, analysed: AnalysisTarget): boolean {
    const wanted = target ? analysisTargetOf(target) : null
    if (!(folder && wanted && isSameFolder(folder, analysedFolder))) {
        return false
    }
    const isHeadAnalysed = headCommit !== null && isSameAnalysisTarget({ kind: "commit", sha: headCommit }, analysed)
    return isSameAnalysisTarget(wanted, analysed) || (wanted.kind === "workingTree" && isHeadAnalysed)
}

/** The newest analysis of the target while it still matters: queued, running or failed. */
export function newestJobOf(jobs: readonly AnalysisJob[], folder: FolderRef | null, target: SelectedTarget | null): AnalysisJob | null {
    const wanted = target ? analysisTargetOf(target) : null
    if (!(folder && wanted)) {
        return null
    }
    const ofTarget = jobs.filter(job => isSameFolder(job, folder) && isSameAnalysisTarget(wanted, job.target))
    const newest = ofTarget.reduce<AnalysisJob | null>((latest, job) => (latest && latest.queuedAt > job.queuedAt ? latest : job), null)
    return newest && (isPendingJob(newest) || newest.state === "failed") ? newest : null
}

export function isAnsweredBy(shown: SnapshotRef, target: SelectedTarget | null, resolution: SnapshotResolution | null): boolean {
    if (target?.kind === "snapshot") {
        return target.ref.snapshotId === shown.snapshotId
    }
    return snapshotRefOf(resolution)?.snapshotId === shown.snapshotId
}

export function isNewTarget(current: SelectedTarget | null, target: SelectedTarget): boolean {
    return !(current && targetKeyOf(current) === targetKeyOf(target))
}

/** The current checkout is asked for again once HEAD moves, so its key carries the commit at HEAD. */
export function resolutionKeyOf(folderTargetKey: string, target: SelectedTarget, headCommit: string | null): string {
    const head = target.kind === "workingTree" ? (headCommit ?? "") : ""
    return `${folderTargetKey}|${head}`
}

const CURRENT_CHECKOUT: SelectedTarget = { kind: "workingTree" }

/**
 * How far a snapshot target is from the current checkout, worded as the nearest snapshot of the current checkout.
 * Its profile is not compared: only the core knows the current one.
 */
export function checkoutResolutionOf(shown: SnapshotSummary, distance: GitCommitDistance | null): SnapshotResolution | null {
    if (!distance || (distance.onlyInCandidate === 0 && distance.onlyInTarget === 0)) {
        return null
    }
    const { onlyInCandidate: ahead, onlyInTarget: behind } = distance
    return { kind: "nearest", snapshot: shown, isCurrentProfile: true, relation: relationOf(distance), behind, ahead }
}

function relationOf({ onlyInCandidate, onlyInTarget }: GitCommitDistance): SnapshotRelation {
    if (onlyInCandidate === 0) {
        return "ancestor"
    }
    return onlyInTarget === 0 ? "descendant" : "diverged"
}

/** A snapshot target away from the current checkout; the notice offers an analysis only while HEAD has none. */
export interface CheckoutComparison {
    resolution: SnapshotResolution
    isHeadAnalysed: boolean
}

export function isAnalysisOf(commit: string, snapshots: readonly SnapshotSummary[]): boolean {
    return snapshots.some(snapshot => snapshot.commit === commit && !snapshot.dirty)
}

export interface NoticeSituation {
    folderLabel: string | null
    target: SelectedTarget | null
    resolution: SnapshotResolution | null
    job: AnalysisJob | null
    shownSnapshotId: string | null
    checkout: CheckoutComparison | null
}

/** The notice speaks about the resolved snapshot only while it is the one on the map. */
export function noticeTextFor(situation: NoticeSituation): { notice: Notice | null; badge: NoticeBadge | null } {
    const { folderLabel, target, job, shownSnapshotId, checkout } = situation
    if (!(target && folderLabel !== null)) {
        return { notice: null, badge: null }
    }
    if (target.kind === "snapshot" && checkout) {
        const { notice, badge } = noticeText({ folderLabel, target: CURRENT_CHECKOUT, resolution: checkout.resolution, job })
        return { notice: checkout.isHeadAnalysed ? null : notice, badge }
    }
    const resolvedId = snapshotRefOf(situation.resolution)?.snapshotId ?? null
    const resolution = resolvedId === null || shownSnapshotId === resolvedId ? situation.resolution : null
    return noticeText({ folderLabel, target, resolution, job })
}

export function visibleNoticeOf(notice: Notice | null, dismissedKey: string | null, noticeKey: string): Notice | null {
    return notice && !(notice.isDismissible && dismissedKey === noticeKey) ? notice : null
}

/** A failure the notice already names needs no toast of its own. */
export function isFailureInNotice(notice: Notice | null, targetJob: AnalysisJob | null, job: AnalysisJob): boolean {
    return notice?.kind === "failed" && targetJob?.id === job.id
}

export function analysisTargetFor(folder: FolderRef | null, target: SelectedTarget | null): AnalysisTarget | null {
    return folder && target ? analysisTargetOf(target) : null
}

const IN_FLIGHT: ReadonlySet<string> = new Set(["resolving", "loading"])

function isInFlight(status: string): boolean {
    return IN_FLIGHT.has(status)
}

/** A resolution still under way counts as done: what the map shows now is the answer. */
export function settledOf<State extends { status: string }>(state: State): State {
    return isInFlight(state.status) ? { ...state, status: "shown" } : state
}

/** A snapshot put on the map by something else becomes the target, unless a resolution is under way for a non-snapshot target. */
export function isMapChangeFollowed(target: SelectedTarget | null, status: string): boolean {
    return target?.kind === "snapshot" || !isInFlight(status)
}
