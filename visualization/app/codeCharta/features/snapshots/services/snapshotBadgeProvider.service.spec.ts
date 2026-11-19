import { signal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import type { AnalysisJob } from "../../../model/coreApi/AnalysisJob"
import type { SnapshotSummary } from "../../../model/coreApi/SnapshotSummary"
import { ProjectsFacade } from "../../projects/facade"
import { aSnapshot } from "../../projects/projects.mocks"
import { aJob, COMMIT_SHA } from "../snapshots.mocks"
import { AnalysisJobsService } from "./analysisJobs.service"
import { SnapshotBadgeProvider } from "./snapshotBadgeProvider.service"
import { SnapshotCatalogService } from "./snapshotCatalog.service"

const API = { projectId: "p-billing", folderId: "f-api" }
const OTHER_SHA = "9f8e7d6".padEnd(40, "0")
const ANALYSED_AT = "2026-11-03T14:10:00Z"

function anAnalysis(snapshotId: string, sha: string, overrides: Partial<SnapshotSummary> = {}): SnapshotSummary {
    return aSnapshot("p-billing", "f-api", snapshotId, { commit: sha, target: "commit", finishedAt: ANALYSED_AT, ...overrides })
}

describe("SnapshotBadgeProvider", () => {
    const snapshots = signal<SnapshotSummary[]>([])
    const jobs = signal<AnalysisJob[]>([])
    const shownSnapshot = signal<SnapshotSummary | null>(null)

    function markersWith(seeded: { snapshots?: SnapshotSummary[]; jobs?: AnalysisJob[]; shown?: SnapshotSummary | null }) {
        snapshots.set(seeded.snapshots ?? [])
        jobs.set(seeded.jobs ?? [])
        shownSnapshot.set(seeded.shown ?? null)
        TestBed.configureTestingModule({
            providers: [
                {
                    provide: SnapshotCatalogService,
                    useValue: { snapshots: (folderId: string) => snapshots().filter(s => s.ref.folderId === folderId) }
                },
                { provide: AnalysisJobsService, useValue: { jobs } },
                { provide: ProjectsFacade, useValue: { shownSnapshot } }
            ]
        })
        const provider = TestBed.inject(SnapshotBadgeProvider)
        return { provider, markers: provider.markersFor(API) }
    }

    it("should badge analysed commits", () => {
        // Arrange & Act
        const { markers } = markersWith({ snapshots: [anAnalysis("s-1", COMMIT_SHA)] })

        // Assert
        expect(markers().get(COMMIT_SHA)).toEqual({
            state: "analysed",
            isLoadedInMap: false,
            analysedAt: Date.parse(ANALYSED_AT) / 1000,
            note: null
        })
        expect(markers().has(OTHER_SHA)).toBe(false)
    })

    it("should badge a commit-bound import as analysed with the imported tooltip", () => {
        // Arrange
        const imported = aSnapshot("p-billing", "f-api", "s-imp", { source: "imported", commit: COMMIT_SHA })

        // Act
        const { markers } = markersWith({ snapshots: [imported] })

        // Assert
        expect(markers().get(COMMIT_SHA)).toEqual({
            state: "analysed",
            isLoadedInMap: false,
            analysedAt: null,
            note: "imported map, analysis time unknown"
        })
    })

    it("should not badge an unbound import", () => {
        // Arrange
        const unbound = aSnapshot("p-billing", "f-api", "s-imp", { source: "imported", commit: null })

        // Act
        const { markers } = markersWith({ snapshots: [unbound] })

        // Assert
        expect(markers().size).toBe(0)
    })

    it("should not badge the commit under a working-tree analysis", () => {
        // Arrange
        const workingTree = anAnalysis("s-wt", COMMIT_SHA, { target: "workingTree", dirty: true })

        // Act
        const { markers } = markersWith({ snapshots: [workingTree] })

        // Assert
        expect(markers().size).toBe(0)
    })

    it("should mark the analysis shown in the map and prefer it over another one of the same commit", () => {
        // Arrange
        const shown = anAnalysis("s-shown", COMMIT_SHA, { finishedAt: "2026-11-01T00:00:00Z" })
        const newer = anAnalysis("s-newer", COMMIT_SHA, { finishedAt: "2026-11-05T00:00:00Z" })

        // Act
        const { markers } = markersWith({ snapshots: [shown, newer], shown })

        // Assert
        expect(markers().get(COMMIT_SHA)?.isLoadedInMap).toBe(true)
    })

    it("should prefer an analysis over an import of the same commit", () => {
        // Arrange
        const imported = aSnapshot("p-billing", "f-api", "s-imp", {
            source: "imported",
            commit: COMMIT_SHA,
            createdAt: "2026-11-09T00:00:00Z"
        })

        // Act
        const { markers } = markersWith({ snapshots: [imported, anAnalysis("s-1", COMMIT_SHA)] })

        // Assert
        expect(markers().get(COMMIT_SHA)?.note).toBeNull()
    })

    it("should let a running job win over an existing snapshot", () => {
        // Arrange
        const running = aJob("job-1", { state: "running", progress: { mode: "determinate", percent: 42 } })

        // Act
        const { markers } = markersWith({
            snapshots: [anAnalysis("s-1", COMMIT_SHA)],
            jobs: [running],
            shown: anAnalysis("s-1", COMMIT_SHA)
        })

        // Assert
        expect(markers().get(COMMIT_SHA)).toEqual({ state: "running", isLoadedInMap: true, progressPercent: 42 })
    })

    it("should badge queued and failed jobs and take the latest job of a commit", () => {
        // Arrange
        const failedBefore = aJob("job-1", {
            state: "failed",
            queuedAt: "2026-11-19T07:00:00Z",
            error: { code: "ANALYSIS_FAILED", message: "ccsh exited with 1", hint: null }
        })
        const queuedNow = aJob("job-2", { state: "queued", queuedAt: "2026-11-19T08:00:00Z" })
        const failedOther = aJob("job-3", {
            state: "failed",
            target: { kind: "commit", sha: OTHER_SHA },
            error: { code: "ANALYSIS_FAILED", message: "ccsh exited with 1", hint: null }
        })

        // Act
        const { markers } = markersWith({ jobs: [queuedNow, failedBefore, failedOther] })

        // Assert
        expect(markers().get(COMMIT_SHA)).toEqual({ state: "queued", isLoadedInMap: false })
        expect(markers().get(OTHER_SHA)).toEqual({ state: "failed", isLoadedInMap: false, failureMessage: "ccsh exited with 1" })
    })

    it("should leave a commit to its snapshot once its job is done or cancelled and skip working-tree and other folders' jobs", () => {
        // Arrange
        const done = aJob("job-1", { state: "done" })
        const cancelled = aJob("job-2", { state: "cancelled", target: { kind: "commit", sha: OTHER_SHA } })
        const workingTree = aJob("job-3", { state: "running", target: { kind: "workingTree" } })
        const otherFolder = aJob("job-4", { state: "running", folderId: "f-web", target: { kind: "commit", sha: OTHER_SHA } })

        // Act
        const { markers } = markersWith({ snapshots: [anAnalysis("s-1", COMMIT_SHA)], jobs: [done, cancelled, workingTree, otherFolder] })

        // Assert
        expect([...markers().entries()].map(([sha, marker]) => [sha, marker.state])).toEqual([[COMMIT_SHA, "analysed"]])
    })

    it("should follow new snapshots and jobs and hand out one signal per folder", () => {
        // Arrange
        const { provider, markers } = markersWith({})

        // Act
        snapshots.set([anAnalysis("s-1", COMMIT_SHA)])
        const afterSnapshot = provider.markerOf(API, COMMIT_SHA)?.state
        jobs.set([aJob("job-1", { state: "failed", error: null })])

        // Assert
        expect(afterSnapshot).toBe("analysed")
        expect(provider.markerOf(API, COMMIT_SHA)).toEqual({ state: "failed", isLoadedInMap: false, failureMessage: null })
        expect(provider.markersFor(API)).toBe(markers)
    })
})
