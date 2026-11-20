import { TestBed } from "@angular/core/testing"
import { screen } from "@testing-library/angular"
import userEvent from "@testing-library/user-event"
import type { FakeDesktopSeed } from "../../../../util/desktop/desktopBridge.mocks"
import { WORKING_FOLDER_SOURCE } from "../../../gitHistory/facade"
import { aLocalBranch, aLogCommit, aRefs, aRepositoryInfo, aStatusOn, aTag } from "../../../gitHistory/services/gitApi.mocks"
import { ProjectsFacade } from "../../../projects/facade"
import { aFolder, aProject, aSnapshot } from "../../../projects/projects.mocks"
import { ProjectsTestBed, settle, setUpProjects } from "../../../projects/projectsTestBed.mocks"
import { BatchAnalysisDialogService } from "../../services/batchAnalysisDialog.service"
import { SnapshotsDialogService } from "../../services/snapshotsDialog.service"
import { BatchAnalysisDialogComponent } from "./batchAnalysisDialog.component"

const PREVIEW_WAIT_MS = 350
const FOLDER = { projectId: "p-billing", folderId: "f-api" }
const BILLING = aProject("p-billing", [aFolder("f-api", { label: "billing-api" })], {
    name: "billing",
    view: { workingFolderId: "f-api", shownSnapshotIdByFolder: {} }
})
const MAIN_COMMITS = ["4", "3", "2", "1"].map((seed, index, seeds) => aLogCommit(seed, `Commit ${seed}`, seeds.slice(index + 1, index + 2)))
const FEATURE_TIP = aLogCommit("f", "Feature work", ["4"])
const ANALYSED = aSnapshot("p-billing", "f-api", "s-2", {
    target: "commit",
    commit: MAIN_COMMITS[2].sha,
    finishedAt: "2026-11-03T14:10:00Z",
    durationMs: 7 * 60_000
})
const REFS = aRefs({
    localBranches: [
        aLocalBranch("main", { isCurrent: true, commit: MAIN_COMMITS[0].sha }),
        aLocalBranch("feature/x", { commit: FEATURE_TIP.sha })
    ],
    tags: [{ ...aTag("v1"), commit: MAIN_COMMITS[3].sha }]
})

describe("BatchAnalysisDialogComponent", () => {
    let testBed: ProjectsTestBed

    async function openDialog(tipSha: string | null = null, seed: FakeDesktopSeed = {}) {
        HTMLDialogElement.prototype.showModal = jest.fn()
        HTMLDialogElement.prototype.close = jest.fn(function (this: HTMLDialogElement) {
            this.dispatchEvent(new Event("close"))
        })
        testBed = await setUpProjects(
            {
                projects: [BILLING],
                activeProjectId: "p-billing",
                snapshots: [ANALYSED],
                git: {
                    "f-api": {
                        info: aRepositoryInfo(),
                        status: aStatusOn("main", { head: { kind: "branch", name: "main", commit: MAIN_COMMITS[0].sha } }),
                        refs: REFS
                    }
                },
                gitLogs: { "f-api": [FEATURE_TIP, ...MAIN_COMMITS] },
                ...seed
            },
            { providers: [{ provide: WORKING_FOLDER_SOURCE, useExisting: ProjectsFacade }] }
        )
        await testBed.projects.showWorkingFolder()
        TestBed.inject(BatchAnalysisDialogService).show({ folder: FOLDER, folderLabel: "billing-api", tipSha })
        const fixture = TestBed.createComponent(BatchAnalysisDialogComponent)
        fixture.autoDetectChanges()
        await settle()
        await waitForPreview()
        return fixture
    }

    async function waitForPreview() {
        await new Promise(resolve => setTimeout(resolve, PREVIEW_WAIT_MS))
        await settle()
    }

    async function typeCount(count: string) {
        const input = screen.getByTestId("batch-count")
        await userEvent.clear(input)
        if (count) {
            await userEvent.type(input, count)
        }
        await waitForPreview()
    }

    function startButton() {
        return screen.getByTestId("batch-start") as HTMLButtonElement
    }

    it("should show counts and estimate", async () => {
        // Arrange & Act
        await openDialog()
        await typeCount("4")

        // Assert
        expect(screen.getByTestId("batch-folder").textContent).toBe("billing-api")
        expect(screen.getByTestId("batch-summary").textContent).toContain("4 commits: 3 to analyse, 1 already analysed.")
        expect(screen.getByTestId("batch-summary").textContent).toContain("About 21 minutes (based on earlier analyses of this folder).")
        expect(startButton().textContent?.trim()).toBe("Analyse 3 commits")
        expect(startButton().disabled).toBe(false)
        expect(testBed.requestsOf("analysis.enqueueBatch").at(-1)).toEqual({
            ...FOLDER,
            selection: { kind: "lastCommits", tipSha: MAIN_COMMITS[0].sha, count: 4, firstParentOnly: true },
            dryRun: true
        })
    })

    it("should enqueue on confirm and hand the batch to the workspace status", async () => {
        // Arrange
        await openDialog()
        await typeCount("2")
        const started: string[] = []
        TestBed.inject(BatchAnalysisDialogService).batchStarted$.subscribe(batchId => started.push(batchId))
        TestBed.inject(SnapshotsDialogService).show()

        // Act
        await userEvent.click(startButton())
        await settle()

        // Assert
        expect(testBed.requestsOf("analysis.enqueueBatch").at(-1)).toEqual({
            ...FOLDER,
            selection: { kind: "lastCommits", tipSha: MAIN_COMMITS[0].sha, count: 2, firstParentOnly: true },
            dryRun: false
        })
        expect(started).toEqual([expect.stringMatching(/^batch-/)])
        expect(TestBed.inject(BatchAnalysisDialogService).current()).toBeNull()
        expect(TestBed.inject(SnapshotsDialogService).isOpen()).toBe(false)
    })

    it("should count back from the chosen branch without the first-parent limit", async () => {
        // Arrange
        await openDialog()

        // Act
        await userEvent.selectOptions(screen.getByTestId("batch-branch"), "refs/heads/feature/x")
        await userEvent.click(screen.getByTestId("batch-first-parent"))
        await typeCount("1")

        // Assert
        expect(testBed.requestsOf("analysis.enqueueBatch").at(-1)).toEqual({
            ...FOLDER,
            selection: { kind: "lastCommits", tipSha: FEATURE_TIP.sha, count: 1, firstParentOnly: false },
            dryRun: true
        })
        expect(screen.getByTestId("batch-summary").textContent).toContain("1 commit: 1 to analyse, 0 already analysed.")
    })

    it("should refuse more than 200 commits and an empty count without asking the core", async () => {
        // Arrange
        await openDialog()
        const asked = testBed.requestsOf("analysis.enqueueBatch").length

        // Act
        await typeCount("201")
        const tooMany = screen.getByTestId("batch-count-error").textContent
        await typeCount("")

        // Assert
        expect(tooMany).toBe("At most 200 commits per batch.")
        expect(screen.getByTestId("batch-count-error").textContent).toBe("Enter a number from 1 to 200.")
        expect(testBed.requestsOf("analysis.enqueueBatch")).toHaveLength(asked)
        expect(startButton().disabled).toBe(true)
    })

    it("should analyse every tag", async () => {
        // Arrange
        await openDialog()

        // Act
        await userEvent.click(screen.getByTestId("batch-mode-tags"))
        await waitForPreview()

        // Assert
        expect(testBed.requestsOf("analysis.enqueueBatch").at(-1)).toEqual({ ...FOLDER, selection: { kind: "tags" }, dryRun: true })
        expect(screen.getByTestId("batch-summary").textContent).toContain("1 tagged commit: 1 to analyse, 0 already analysed.")
        expect((screen.getByTestId("batch-count") as HTMLInputElement).disabled).toBe(true)
    })

    it("should count back from the commit it was opened for", async () => {
        // Arrange & Act
        await openDialog(MAIN_COMMITS[1].sha)

        // Assert
        expect(screen.getByTestId("batch-tip").textContent).toBe(MAIN_COMMITS[1].sha.slice(0, 7))
        expect(screen.queryByTestId("batch-branch")).toBeNull()
        expect(testBed.requestsOf("analysis.enqueueBatch").at(-1)).toMatchObject({ selection: { tipSha: MAIN_COMMITS[1].sha, count: 20 } })
        expect(screen.getByTestId("batch-summary").textContent).toContain("3 commits: 2 to analyse, 1 already analysed.")
    })

    it("should say when there is nothing to analyse", async () => {
        // Arrange & Act
        await openDialog(MAIN_COMMITS[2].sha)
        await typeCount("1")

        // Assert
        expect(screen.getByTestId("batch-summary").textContent).toContain("Nothing to analyse — all commits are analysed.")
        expect(startButton().disabled).toBe(true)
        expect(startButton().textContent?.trim()).toBe("Analyse")
    })

    it("should show blocking preflight problems and start nothing", async () => {
        // Arrange
        const problem = { code: "JAVA_NOT_FOUND" as const, severity: "error" as const, message: "Java was not found.", hint: null }
        const blocked = {
            batchId: null,
            toAnalyse: [],
            alreadyAnalysed: [],
            leftOut: 0,
            jobs: [],
            estimatedDurationMs: null,
            problems: [problem]
        }

        // Act
        await openDialog(null, { responses: { "analysis.enqueueBatch": blocked } })

        // Assert
        expect(screen.getByTestId("preflight-problems").textContent).toContain("Java was not found.")
        expect(screen.getByTestId("batch-summary").textContent?.trim()).toBe("")
        expect(startButton().disabled).toBe(true)
    })

    it("should show a preview that failed", async () => {
        // Arrange & Act
        await openDialog(null, { failures: { "analysis.enqueueBatch": { code: "IO", message: "store unreadable", details: {} } } })

        // Assert
        expect(screen.getByTestId("batch-preview-failure").textContent).toContain("store unreadable")
    })

    it("should keep the dialog open with the problems of a refused start", async () => {
        // Arrange
        await openDialog()
        const problem = { code: "FOLDER_MISSING" as const, severity: "error" as const, message: "The folder is gone.", hint: null }
        testBed.bridge.respondWith("analysis.enqueueBatch", {
            batchId: null,
            toAnalyse: [],
            alreadyAnalysed: [],
            leftOut: 0,
            jobs: [],
            estimatedDurationMs: null,
            problems: [problem]
        })

        // Act
        await userEvent.click(startButton())
        await settle()

        // Assert
        expect(screen.getByTestId("preflight-problems").textContent).toContain("The folder is gone.")
        expect(TestBed.inject(BatchAnalysisDialogService).current()).not.toBeNull()
    })

    it("should close on cancel", async () => {
        // Arrange
        await openDialog()

        // Act
        await userEvent.click(screen.getByTestId("batch-cancel"))

        // Assert
        expect(TestBed.inject(BatchAnalysisDialogService).current()).toBeNull()
    })
})
