import type { RefPickerSnapshot, RefResolution } from "../../gitHistory/facade"
import { shortDate } from "../../projects/facade"
import type { SnapshotSummary } from "../model/compare.model"

/** A side the user picked from the "Snapshots" group: a snapshot without a commit instead of a revision. */
export interface SnapshotSideInput {
    kind: "workingTree" | "imported"
    snapshotId: string
}

const IMPORTED_DETAIL = "imported, analysis time unknown"

/** The working-tree and imported snapshots of a folder, newest first, each under a name no other one has. */
export function snapshotOptionsOf(snapshots: readonly SnapshotSummary[]): RefPickerSnapshot[] {
    const options = [...snapshots]
        .sort((first, second) => second.createdAt.localeCompare(first.createdAt))
        .flatMap(snapshot => {
            const option = snapshotOptionOf(snapshot)
            return option ? [option] : []
        })
    return options.map((option, index) => {
        const sameNameBefore = options.slice(0, index).filter(other => other.name === option.name).length
        return sameNameBefore === 0 ? option : { ...option, name: `${option.name} (${sameNameBefore + 1})` }
    })
}

/** The snapshot a picker's text names, or null when it names a revision. */
export function snapshotInputOf(resolution: RefResolution | null): SnapshotSideInput | null {
    const isSnapshot = resolution?.kind === "workingTree" || resolution?.kind === "imported"
    return isSnapshot && resolution.snapshotId
        ? { kind: resolution.kind as SnapshotSideInput["kind"], snapshotId: resolution.snapshotId }
        : null
}

function snapshotOptionOf(snapshot: SnapshotSummary): RefPickerSnapshot | null {
    const snapshotId = snapshot.ref.snapshotId
    if (snapshot.source === "imported") {
        return { snapshotId, kind: "imported", name: snapshot.originalFileName ?? snapshotId, detail: IMPORTED_DETAIL }
    }
    if (snapshot.target === "workingTree") {
        const detail = snapshot.shortCommit ? `uncommitted changes on ${snapshot.shortCommit}` : "uncommitted changes"
        return { snapshotId, kind: "workingTree", name: `Working tree (${dateAndTime(snapshot.createdAt)})`, detail }
    }
    return null
}

function dateAndTime(timestamp: string): string {
    const time = new Date(timestamp).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    return `${shortDate(timestamp)} ${time}`
}
