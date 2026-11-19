import { aSnapshot } from "../../projects/projects.mocks"
import type {
    ComparedCommit,
    CompareIntent,
    FolderRef,
    PairLoad,
    ResolvedComparison,
    ResolvedSide,
    SnapshotSummary
} from "../model/compare.model"
import type { CoreGateway, SnapshotGateway } from "./compareGateways"

export const FOLDER: FolderRef = { projectId: "p-billing", folderId: "f-api" }
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

export class FakeSnapshotGateway implements SnapshotGateway {
    readonly calls: string[] = []
    pairLoad: PairLoad = { base: `checksum-${BASE_SHA.slice(0, 7)}`, head: `checksum-${HEAD_SHA.slice(0, 7)}` }
    aloneChecksum: string | null = `checksum-${HEAD_SHA.slice(0, 7)}`
    commitOnMap: string | null = null
    beforeLoad: () => void = () => undefined

    loadPair(base: SnapshotSummary, head: SnapshotSummary): Promise<PairLoad> {
        this.calls.push(`loadPair ${base.ref.snapshotId} ${head.ref.snapshotId}`)
        this.beforeLoad()
        return Promise.resolve(this.pairLoad)
    }

    loadAlone(head: SnapshotSummary): Promise<string | null> {
        this.calls.push(`loadAlone ${head.ref.snapshotId}`)
        this.beforeLoad()
        return Promise.resolve(this.aloneChecksum)
    }

    shownCommit(): string | null {
        return this.commitOnMap
    }
}

export class FakeCoreGateway implements CoreGateway {
    readonly intents: CompareIntent[] = []
    resolution: ResolvedComparison | Error = aResolvedComparison()
    revisions: Record<string, string> = { main: "refs/heads/main", "feature/x": "refs/heads/feature/x" }

    resolve(intent: CompareIntent): Promise<ResolvedComparison> {
        this.intents.push(intent)
        return this.resolution instanceof Error ? Promise.reject(this.resolution) : Promise.resolve(this.resolution)
    }

    toRevision(_folder: FolderRef, input: string): Promise<string | null> {
        return Promise.resolve(this.revisions[input] ?? null)
    }
}
