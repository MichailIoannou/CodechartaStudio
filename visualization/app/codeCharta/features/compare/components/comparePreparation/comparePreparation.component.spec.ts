import { signal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { StoreModule } from "@ngrx/store"
import { render, screen } from "@testing-library/angular"
import userEvent from "@testing-library/user-event"
import { appReducers, setStateMiddleware } from "../../../../stores/rootStore/store"
import type { AnalysisJob, CompareState, ResolvedComparison } from "../../model/compare.model"
import { ANALYSIS_GATEWAY } from "../../ports/compareGateways"
import { aCommitSnapshot, aComparedCommit, aResolvedComparison, BASE_SHA, HEAD_SHA } from "../../ports/compareGateways.mocks"
import { CompareService } from "../../services/compare.service"
import { CompareStore } from "../../stores/compare.store"
import { ComparePreparationComponent } from "./comparePreparation.component"

const NEAREST = { snapshot: aCommitSnapshot("3c4d5e6".padEnd(40, "0")), relation: "ancestor" as const, staleBy: 2, behind: 2, ahead: 0 }
const HEAD_WITH_NEAREST = {
    requested: aComparedCommit(HEAD_SHA, { kind: "branch", name: "feature/x" }),
    status: { status: "missing", nearest: NEAREST }
} as const
const BASE_WITHOUT_ANALYSIS = { requested: aComparedCommit(BASE_SHA), status: { status: "missing", nearest: null } } as const

function aRunningJob(id: string, percent: number | null): AnalysisJob {
    return {
        id,
        batchId: null,
        projectId: "p-billing",
        folderId: "f-api",
        target: { kind: "commit", sha: HEAD_SHA },
        profileHash: "01234567",
        state: percent === null ? "queued" : "running",
        progress: percent === null ? { mode: "indeterminate" } : { mode: "determinate", percent },
        queuedAt: "2026-11-19T00:00:00Z",
        startedAt: null,
        finishedAt: null,
        snapshotId: null,
        error: null
    }
}

describe("ComparePreparationComponent", () => {
    let service: { analyseMissing: jest.Mock; continueWithShownSnapshots: jest.Mock; cancelAnalyses: jest.Mock }
    const jobs = signal<readonly AnalysisJob[]>([])

    async function renderPreparation(state: Partial<CompareState>) {
        service = { analyseMissing: jest.fn(), continueWithShownSnapshots: jest.fn(), cancelAnalyses: jest.fn() }
        const goingOn = jest.fn()
        await render(ComparePreparationComponent, {
            imports: [StoreModule.forRoot(appReducers, { metaReducers: [setStateMiddleware] })],
            providers: [
                { provide: CompareService, useValue: service },
                { provide: ANALYSIS_GATEWAY, useValue: { jobs, enqueue: jest.fn(), cancel: jest.fn() } }
            ],
            on: { goingOn }
        })
        TestBed.inject(CompareStore).update(state)
        TestBed.tick()
        return { goingOn }
    }

    const decide = (resolved: ResolvedComparison) => renderPreparation({ phase: "needsDecision", resolved })
    const textOf = (testId: string) => screen.getAllByTestId(testId).map(element => element.textContent?.replace(/\s+/g, " ").trim())

    it("should list each side with its status", async () => {
        // Act
        await decide(aResolvedComparison({ head: HEAD_WITH_NEAREST }))

        // Assert
        expect(textOf("compare-preparation-side")).toEqual([
            "BASE9f8e7d6 (main) analysed",
            "HEADa1b2c3d (feature/x) not analysed · nearest: 3c4d5e6, 2 commits older"
        ])
    })

    it("should analyse the missing sides from the primary button and tell the dialog", async () => {
        // Arrange
        const { goingOn } = await decide(aResolvedComparison({ head: HEAD_WITH_NEAREST }))

        // Act
        await userEvent.click(screen.getByTestId("compare-analyse-missing"))

        // Assert
        expect(screen.getByTestId("compare-analyse-missing").className).toContain("btn-primary")
        expect(service.analyseMissing).toHaveBeenCalled()
        expect(goingOn).toHaveBeenCalled()
    })

    it("should disable Use nearest when a side has none", async () => {
        // Act
        await decide(aResolvedComparison({ base: BASE_WITHOUT_ANALYSIS, head: HEAD_WITH_NEAREST }))

        // Assert
        const useNearest = screen.getByTestId("compare-use-nearest") as HTMLButtonElement
        expect(useNearest.disabled).toBe(true)
        expect(useNearest.title).toBe("No nearest analysis for 9f8e7d6")
    })

    it("should say why an analysis of a side failed", async () => {
        // Act
        await renderPreparation({
            phase: "needsDecision",
            resolved: aResolvedComparison({ head: HEAD_WITH_NEAREST }),
            analyses: [{ side: "head", commit: HEAD_SHA, shortCommit: "a1b2c3d", jobId: "job-1", failure: "Java is too old." }]
        })

        // Assert
        expect(textOf("compare-analysis-failure")).toEqual(["The analysis of a1b2c3d failed: Java is too old."])
    })

    it("should show one progress row per running analysis and cancel the batch", async () => {
        // Arrange
        jobs.set([aRunningJob("job-base", 42), aRunningJob("job-head", null)])
        await renderPreparation({
            phase: "analysing",
            analyses: [
                { side: "base", commit: BASE_SHA, shortCommit: "9f8e7d6", jobId: "job-base", failure: null },
                { side: "head", commit: HEAD_SHA, shortCommit: "a1b2c3d", jobId: "job-head", failure: null }
            ]
        })

        // Act
        await userEvent.click(screen.getByTestId("compare-cancel-analysis"))

        // Assert
        expect(textOf("compare-analysis-row")).toEqual(["BASE9f8e7d6analysing… 42 %", "HEADa1b2c3dqueued"])
        expect((screen.getAllByRole("progressbar")[0] as HTMLProgressElement).value).toBe(42)
        expect(service.cancelAnalyses).toHaveBeenCalled()
    })

    it("should offer to compare anyway when only the size warns", async () => {
        // Arrange
        const { goingOn } = await decide(
            aResolvedComparison({ preflight: { identicalChecksums: false, profilesDiffer: false, combinedBytes: 1, sizeVerdict: "warn" } })
        )

        // Act
        await userEvent.click(screen.getByTestId("compare-anyway"))

        // Assert
        expect(screen.getByTestId("compare-size-warning").textContent).toContain("These two analyses are large")
        expect(service.continueWithShownSnapshots).toHaveBeenCalled()
        expect(goingOn).toHaveBeenCalled()
    })
})
