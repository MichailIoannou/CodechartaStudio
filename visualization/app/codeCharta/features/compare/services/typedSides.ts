import { DesktopBridgeError } from "../../../util/desktop/desktopResult"
import type { BaseMode, CompareError, CompareIntent, FolderRef, SideInput } from "../model/compare.model"
import { compareErrorOf } from "./compareErrors"
import type { SnapshotSideInput } from "./snapshotSides"

export interface ComparedFolder {
    ref: FolderRef
    label: string
}

export interface TypedSides {
    base: string
    head: string
    baseMode: BaseMode
    /** The sides no picker could name, base first: an unknown revision is blamed on the first of them. */
    unresolved: string[]
    /** The head's folder when it is another folder of the project than the base's. */
    headFolder?: ComparedFolder
    /** Set for a side picked from the "Snapshots" group: that snapshot instead of the typed text. */
    baseSnapshot?: SnapshotSideInput | null
    headSnapshot?: SnapshotSideInput | null
}

export function explicitIntent(folder: FolderRef, sides: TypedSides): CompareIntent {
    const headFolder = sides.headFolder?.ref ?? folder
    return {
        kind: "explicit",
        base: sideInputOf(folder, sides.base, sides.baseSnapshot),
        head: sideInputOf(headFolder, sides.head, sides.headSnapshot),
        baseMode: sides.baseMode
    }
}

function sideInputOf(folder: FolderRef, typed: string, snapshot: SnapshotSideInput | null | undefined): SideInput {
    return { folder, rev: snapshot ?? { kind: "rev", name: typed.trim() } }
}

/** An unknown revision names the typed side and its folder; anything else is the core's error. */
export function typedSidesErrorOf(error: unknown, folder: ComparedFolder, sides: TypedSides): CompareError {
    const isUnknown = error instanceof DesktopBridgeError && (error.code === "UNKNOWN_REVISION" || error.code === "BAD_REQUEST")
    const input = (sides.unresolved[0] ?? sides.base).trim()
    const isTheHead = sides.headFolder !== undefined && input === sides.head.trim() && input !== sides.base.trim()
    const folderLabel = isTheHead ? sides.headFolder.label : folder.label
    return isUnknown ? { kind: "refNotFound", message: "", input, folderLabel } : compareErrorOf(error)
}
