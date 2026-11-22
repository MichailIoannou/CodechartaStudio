import type { PickedFolder } from "../../../model/coreApi/PickedFolder"
import type { PickedImportFile } from "../../../model/coreApi/PickedImportFile"
import type { Project } from "../../../model/coreApi/Project"
import type { ProjectFolder } from "../../../model/coreApi/ProjectFolder"
import type { SnapshotSummary } from "../../../model/coreApi/SnapshotSummary"
import type { BridgeMethod, DesktopBridge } from "../desktopBridge"

export const TOOL_FAILURE = { code: "TOOL_FAILED" as const, message: "git failed", details: {} }
export const NOW = "2026-11-19T08:00:00Z"

export function aPickedFolder(name: string): PickedFolder {
    return { pickToken: name.padEnd(32, "0"), path: `/work/${name}`, suggestedLabel: name, kind: "git", git: null }
}

export const HINTED_COMMIT = {
    commit: "a1b2c3d".padEnd(40, "0"),
    shortCommit: "a1b2c3d",
    subject: "Add billing",
    authorName: "Ada",
    authorDate: NOW
}

export function aPickedImportFile(overrides: Partial<PickedImportFile> = {}): PickedImportFile {
    return {
        importToken: "c".repeat(32),
        fileName: "a1b2c3d.billing.cc.json",
        sizeBytes: 42,
        fileModifiedAt: NOW,
        commitHint: null,
        containingFolder: { pickToken: "d".repeat(32), path: "/downloads/out", suggestedName: "out", kind: "plain", git: null },
        hintCommit: null,
        existingTarget: null,
        duplicateOf: null,
        ...overrides
    }
}

export async function pickImportFile(bridge: DesktopBridge) {
    const picked = await answerValue(bridge, "snapshots.pickImportFile", { title: "Open cc.json" })
    if (picked === null) {
        throw new Error("The fake picked no file")
    }
    return picked
}

export function aFolder(id: string, overrides: Partial<ProjectFolder> = {}): ProjectFolder {
    return {
        id,
        path: `/work/${id}`,
        label: id,
        role: "primary",
        kind: "git",
        git: null,
        addedAt: NOW,
        status: "ok",
        relationships: [],
        snapshotCount: 0,
        ...overrides
    }
}

export function aProject(id: string, folders: ProjectFolder[]): Project {
    return {
        id,
        name: id,
        description: null,
        createdAt: NOW,
        updatedAt: NOW,
        folders,
        analysisProfile: { exclude: [], without: [], parallel: true },
        view: { workingFolderId: folders[0]?.id ?? null, shownSnapshotIdByFolder: {} }
    }
}

export function aSnapshot(projectId: string, folderId: string, snapshotId: string, createdAt: string): SnapshotSummary {
    return {
        ref: { projectId, folderId, snapshotId },
        source: "imported",
        createdAt,
        commit: null,
        shortCommit: null,
        subject: null,
        commitDate: null,
        dirty: false,
        originalFileName: `${snapshotId}.cc.json`,
        fileModifiedAt: null,
        mapBytes: 10,
        checksum: null,
        profileHash: null,
        target: null,
        finishedAt: null,
        durationMs: null,
        notInMap: []
    }
}

export function aLogCommitOf(sha: string) {
    return { sha, parents: [], authorName: "Mia", authorEmail: "mia@example.com", authoredAt: 1, committedAt: 1, subject: sha.slice(0, 7) }
}

export async function answerValue<Method extends BridgeMethod>(
    bridge: DesktopBridge,
    method: Method,
    params: Parameters<typeof bridge.request<Method>>[1]
) {
    const answer = await bridge.request(method, params)
    if (answer.ok) {
        return answer.value
    }
    throw new Error(`${method} failed: ${JSON.stringify(answer)}`)
}

export async function pickFolder(bridge: DesktopBridge) {
    const picked = await answerValue(bridge, "projects.pickFolder", { title: "Add Folder" })
    if (picked === null) {
        throw new Error("The fake picked no folder")
    }
    return picked
}

export async function pickAndCreate(bridge: DesktopBridge, name: string) {
    const picked = await pickFolder(bridge)
    return answerValue(bridge, "projects.create", {
        name,
        folders: [{ pickToken: picked.pickToken, label: picked.suggestedLabel, role: "helper" }]
    })
}
