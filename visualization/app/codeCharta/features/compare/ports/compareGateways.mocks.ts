import { aSnapshot } from "../../projects/projects.mocks"
import type { ComparedCommit, FolderRef, ResolvedComparison, ResolvedSide, SnapshotSummary } from "../model/compare.model"

const FOLDER: FolderRef = { projectId: "p-billing", folderId: "f-api" }
export const BASE_SHA = "9f8e7d6".padEnd(40, "0")
export const HEAD_SHA = "a1b2c3d".padEnd(40, "0")

export function aComparedCommit(sha: string, label: ComparedCommit["label"] = { kind: "commit", name: sha.slice(0, 7) }): ComparedCommit {
    return { folder: FOLDER, commit: sha, shortCommit: sha.slice(0, 7), label }
}

export function aCommitSnapshot(sha: string, checksum: string | null = `checksum-${sha.slice(0, 7)}`): SnapshotSummary {
    return aSnapshot(FOLDER.projectId, FOLDER.folderId, `s-${sha.slice(0, 7)}`, {
        commit: sha,
        shortCommit: sha.slice(0, 7),
        target: "commit",
        checksum
    })
}

function anExactSide(commit: ComparedCommit, snapshot = aCommitSnapshot(commit.commit)): ResolvedSide {
    return { requested: commit, status: { status: "exact", snapshot } }
}

export function aResolvedComparison(overrides: Partial<ResolvedComparison> = {}): ResolvedComparison {
    return {
        status: { kind: "ready" },
        baseMode: "tip",
        base: anExactSide(aComparedCommit(BASE_SHA, { kind: "branch", name: "main" })),
        head: anExactSide(aComparedCommit(HEAD_SHA, { kind: "branch", name: "feature/x" })),
        baseTip: null,
        preflight: { identicalChecksums: false, profilesDiffer: false, combinedBytes: 2048, sizeVerdict: "ok" },
        ...overrides
    }
}
