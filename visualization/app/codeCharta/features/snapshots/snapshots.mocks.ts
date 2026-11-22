import type { AnalysisJob } from "../../model/coreApi/AnalysisJob"

export const COMMIT_SHA = "a1b2c3d".padEnd(40, "0")

export function aJob(id: string, overrides: Partial<AnalysisJob> = {}): AnalysisJob {
    return {
        id,
        batchId: null,
        projectId: "p-billing",
        folderId: "f-api",
        target: { kind: "commit", sha: COMMIT_SHA },
        profileHash: "0123456789abcdef",
        state: "queued",
        progress: { mode: "indeterminate" },
        queuedAt: "2026-11-19T08:00:00Z",
        startedAt: null,
        finishedAt: null,
        snapshotId: null,
        error: null,
        ...overrides
    }
}
