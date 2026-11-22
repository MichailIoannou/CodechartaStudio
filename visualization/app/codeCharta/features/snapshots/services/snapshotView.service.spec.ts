import { TestBed } from "@angular/core/testing"
import { Router } from "@angular/router"
import { LoadFilesUseCase } from "../../../load/load.facade"
import type { GitStatus } from "../../../model/coreApi/GitStatus"
import type { SnapshotResolution } from "../../../model/coreApi/SnapshotResolution"
import type { FakeDesktopSeed } from "../../../util/desktop/desktopBridge.mocks"
import { GitRepositoryService } from "../../gitHistory/facade"
import { aFolder, aProject, aSnapshot } from "../../projects/projects.mocks"
import { settle, setUpProjects } from "../../projects/projectsTestBed.mocks"
import { aJob, COMMIT_SHA } from "../snapshots.mocks"
import { sentenceOf } from "../util/noticeText"
import { SnapshotCatalogService } from "./snapshotCatalog.service"
import { SnapshotViewService } from "./snapshotView.service"

const OLDER_SHA = "9f8e7d6".padEnd(40, "0")
const HEAD_SHA = "c0ffee1".padEnd(40, "0")
const BILLING = aProject("p-billing", [aFolder("f-api", { label: "billing-api" }), aFolder("f-web", { label: "billing-web" })])
const API = aSnapshot("p-billing", "f-api", "s-api", { shortCommit: "1111111" })
const OLDER = aSnapshot("p-billing", "f-api", "s-older", { commit: OLDER_SHA, shortCommit: "9f8e7d6", target: "commit" })
const AT_COMMIT = aSnapshot("p-billing", "f-api", "s-commit", { commit: COMMIT_SHA, shortCommit: "a1b2c3d", target: "commit" })
const FOLDER = { projectId: "p-billing", folderId: "f-api" }
const COMMIT = { kind: "commit" as const, sha: COMMIT_SHA }
const WORKING_TREE = { kind: "workingTree" as const }
const JAVA_MISSING = { code: "JAVA_NOT_FOUND" as const, severity: "error" as const, message: "Java was not found.", hint: null }
const STALE_BY_3: SnapshotResolution = {
    kind: "nearest",
    snapshot: OLDER,
    isCurrentProfile: true,
    relation: "ancestor",
    behind: 3,
    ahead: 0
}
const FIRST_JOB = "job-0000000000000001"

function statusAt(commit: string): GitStatus {
    return {
        head: { kind: "branch", name: "main", commit },
        upstream: null,
        counts: { staged: 0, unstaged: 0, untracked: 0, conflicted: 0 },
        operationInProgress: null
    }
}

async function setUp(seed: FakeDesktopSeed = {}) {
    const bed = await setUpProjects({ projects: [BILLING], snapshots: [API, OLDER, AT_COMMIT], activeProjectId: "p-billing", ...seed })
    const view = TestBed.inject(SnapshotViewService)
    await settle()
    bed.loadFilesUseCase.loadProjectSnapshots.mockClear()
    bed.toastService.show.mockClear()
    return { ...bed, view }
}

async function setUpWithHead(seed: FakeDesktopSeed = {}) {
    const bed = await setUp({ gitStatuses: { "f-api": statusAt(OLDER_SHA) }, ...seed })
    const gitRepository = TestBed.inject(GitRepositoryService)
    await gitRepository.refreshFolders([FOLDER])
    await settle()
    const gitStatusChange = async (head: string) => {
        bed.bridge.respondWith("git.status", statusAt(head))
        await gitRepository.refreshFolders([FOLDER])
        await settle()
    }
    return { ...bed, gitStatusChange }
}

function loadedSnapshotIds(loadProjectSnapshots: jest.Mock): string[] {
    return loadProjectSnapshots.mock.calls.flatMap(([toLoad]) => toLoad.map(entry => entry.origin.snapshotId))
}

describe("SnapshotViewService", () => {
    describe("resolution", () => {
        it("should load the exact snapshot for a selected commit", async () => {
            // Arrange
            const { view, loadFilesUseCase, router } = await setUp()

            // Act
            view.showCommit(COMMIT_SHA)
            await settle()

            // Assert
            expect(loadedSnapshotIds(loadFilesUseCase.loadProjectSnapshots)).toEqual(["s-commit"])
            expect(view.resolution()).toMatchObject({ kind: "exact" })
            expect(view.status()).toBe("shown")
            expect(view.notice()).toBeNull()
            expect(router.navigateByUrl).toHaveBeenCalled()
        })

        it("should load the nearest and keep the resolution", async () => {
            // Arrange
            const { view, bridge, loadFilesUseCase } = await setUp()
            bridge.setResolution(FOLDER, COMMIT, STALE_BY_3)

            // Act
            view.showCommit(COMMIT_SHA)
            await settle()

            // Assert
            expect(loadedSnapshotIds(loadFilesUseCase.loadProjectSnapshots)).toEqual(["s-older"])
            expect(view.resolution()).toEqual(STALE_BY_3)
            expect(view.notice()).toMatchObject({ kind: "stale", action: "Analyse a1b2c3d now" })
            expect(view.noticeText().badge).toEqual({ text: "stale by 3", tone: "warning" })
        })

        it("should not reload when the shown snapshot is already the resolved one", async () => {
            // Arrange
            const { view, bridge, loadFilesUseCase, projects } = await setUp()
            bridge.setResolution(FOLDER, COMMIT, STALE_BY_3)
            await projects.loadSnapshot(OLDER.ref)
            loadFilesUseCase.loadProjectSnapshots.mockClear()

            // Act
            view.showCommit(COMMIT_SHA)
            await settle()

            // Assert
            expect(loadFilesUseCase.loadProjectSnapshots).not.toHaveBeenCalled()
            expect(view.status()).toBe("shown")
        })

        it("should not leave the current view later when the shown target is asked for again", async () => {
            // Arrange
            const { view, router, gitStatusChange } = await setUpWithHead()
            view.showCurrentCheckout()
            await settle()

            // Act
            await gitStatusChange(HEAD_SHA)

            // Assert
            expect(router.navigateByUrl).not.toHaveBeenCalled()
        })

        it("should ignore a late response for an earlier selection", async () => {
            // Arrange
            const { view, loadFilesUseCase } = await setUp()
            const catalog = TestBed.inject(SnapshotCatalogService)
            let answerEarlier: (resolution: SnapshotResolution) => void = () => undefined
            jest.spyOn(catalog, "resolve")
                .mockImplementationOnce(() => new Promise(resolve => (answerEarlier = resolve)))
                .mockResolvedValueOnce({ kind: "exact", snapshot: AT_COMMIT, isCurrentProfile: true })
            view.showCommit(OLDER_SHA)
            await settle()

            // Act
            view.showCommit(COMMIT_SHA)
            await settle()
            answerEarlier({ kind: "exact", snapshot: OLDER, isCurrentProfile: true })
            await settle()

            // Assert
            expect(loadedSnapshotIds(loadFilesUseCase.loadProjectSnapshots)).toEqual(["s-commit"])
            expect(view.resolution()).toMatchObject({ snapshot: { ref: AT_COMMIT.ref } })
        })

        it("should drop a resolution in flight when a comparison holds the map", async () => {
            // Arrange
            const { view, loadFilesUseCase, projects } = await setUp()
            await projects.loadSnapshot(API.ref)
            await settle()
            loadFilesUseCase.loadProjectSnapshots.mockClear()
            const catalog = TestBed.inject(SnapshotCatalogService)
            let answer: (resolution: SnapshotResolution) => void = () => undefined
            jest.spyOn(catalog, "resolve").mockImplementationOnce(() => new Promise(resolve => (answer = resolve)))
            view.showCommit(COMMIT_SHA)
            await settle()

            // Act
            view.holdShownSnapshot()
            answer({ kind: "exact", snapshot: AT_COMMIT, isCurrentProfile: true })
            await settle()

            // Assert
            expect(loadFilesUseCase.loadProjectSnapshots).not.toHaveBeenCalled()
            expect(view.target()).toEqual({ kind: "snapshot", ref: API.ref })
            expect(view.status()).toBe("shown")
        })

        it("should go empty without snapshots", async () => {
            // Arrange
            const { view, loadFilesUseCase } = await setUp({ snapshots: [] })

            // Act
            const status = view.status()

            // Assert
            expect(view.target()).toEqual(WORKING_TREE)
            expect(status).toBe("empty")
            expect(loadFilesUseCase.loadProjectSnapshots).not.toHaveBeenCalled()
            expect(view.notice()).toMatchObject({ kind: "none", isDismissible: false })
        })

        it("should take the remembered snapshot of a restored folder as the target without resolving it", async () => {
            // Arrange
            const remembering = { ...BILLING, view: { workingFolderId: "f-api", shownSnapshotIdByFolder: { "f-api": "s-api" } } }

            // Act
            const { view, requestsOf } = await setUp({ projects: [remembering] })

            // Assert
            expect(view.target()).toEqual({ kind: "snapshot", ref: API.ref })
            expect(requestsOf("snapshots.resolveForCommit")).toEqual([])
            expect(view.notice()).toBeNull()
        })

        it("should compare a restored snapshot with the current checkout once HEAD moved away from it", async () => {
            // Arrange
            const remembering = { ...BILLING, view: { workingFolderId: "f-api", shownSnapshotIdByFolder: { "f-api": "s-older" } } }
            const { view, bridge, projects, gitStatusChange } = await setUpWithHead({ projects: [remembering] })
            await projects.loadSnapshot(OLDER.ref)
            bridge.respondWith("git.measureDistances", { distances: [{ sha: OLDER_SHA, onlyInCandidate: 0, onlyInTarget: 2 }] })

            // Act
            await gitStatusChange(HEAD_SHA)

            // Assert
            expect(view.target()).toEqual({ kind: "snapshot", ref: OLDER.ref })
            expect(view.noticeText().badge).toEqual({ text: "stale by 2", tone: "warning" })
            expect(sentenceOf(view.notice()?.parts ?? [])).toBe(
                "No analysis of the current checkout — showing 9f8e7d6, stale by 2 commits."
            )
            expect(view.notice()?.action).toBe("Analyse current checkout")
        })

        it("should keep the distance but offer no analysis when the current checkout has an analysis of its own", async () => {
            // Arrange
            const remembering = { ...BILLING, view: { workingFolderId: "f-api", shownSnapshotIdByFolder: { "f-api": "s-older" } } }
            const atHead = aSnapshot("p-billing", "f-api", "s-head", { commit: HEAD_SHA, shortCommit: "c0ffee1", target: "commit" })
            const { view, bridge, projects, gitStatusChange } = await setUpWithHead({ projects: [remembering], snapshots: [OLDER, atHead] })
            await projects.loadSnapshot(OLDER.ref)
            bridge.respondWith("git.measureDistances", { distances: [{ sha: OLDER_SHA, onlyInCandidate: 1, onlyInTarget: 2 }] })

            // Act
            await gitStatusChange(HEAD_SHA)

            // Assert
            expect(view.comparedResolution()).toMatchObject({ kind: "nearest", relation: "diverged", behind: 2, ahead: 1 })
            expect(view.noticeText().badge).toEqual({ text: "diverged 2↓ 1↑", tone: "warning" })
            expect(view.notice()).toBeNull()
        })

        it("should not measure a snapshot target at HEAD", async () => {
            // Arrange
            const { view, requestsOf } = await setUpWithHead()

            // Act
            await view.open(OLDER.ref)
            await settle()

            // Assert
            expect(view.target()).toEqual({ kind: "snapshot", ref: OLDER.ref })
            expect(requestsOf("git.measureDistances")).toEqual([])
            expect(view.comparedResolution()).toBeNull()
        })

        it("should follow a snapshot that something else put on the map", async () => {
            // Arrange
            const { view, projects } = await setUp()
            const before = view.target()

            // Act
            await projects.loadSnapshot(API.ref)
            await settle()

            // Assert
            expect(before).toEqual(WORKING_TREE)
            expect(view.target()).toEqual({ kind: "snapshot", ref: API.ref })
        })

        it("should re-resolve without enqueueing when the repository-changed signal reports a new HEAD", async () => {
            // Arrange
            const { view, bridge, requestsOf, gitStatusChange } = await setUpWithHead()
            bridge.setResolution(FOLDER, WORKING_TREE, STALE_BY_3)

            // Act
            await gitStatusChange(HEAD_SHA)

            // Assert
            expect(view.headCommit()).toBe(HEAD_SHA)
            expect(view.resolution()).toEqual(STALE_BY_3)
            expect(
                view
                    .notice()
                    ?.parts.map(part => part.text)
                    .join("")
            ).toBe("No analysis of the current checkout — showing 9f8e7d6, stale by 3 commits.")
            expect(requestsOf("analysis.enqueue")).toEqual([])
        })

        it("should hide a dismissed notice until the target changes", async () => {
            // Arrange
            const { view, bridge } = await setUp()
            bridge.setResolution(FOLDER, COMMIT, STALE_BY_3)
            bridge.setResolution(FOLDER, { kind: "commit", sha: HEAD_SHA }, STALE_BY_3)
            view.showCommit(COMMIT_SHA)
            await settle()

            // Act
            view.dismissNotice()
            const afterDismiss = view.notice()
            view.showCommit(HEAD_SHA)
            await settle()

            // Assert
            expect(afterDismiss).toBeNull()
            expect(view.notice()).toMatchObject({ kind: "stale", action: "Analyse c0ffee1 now" })
        })

        it("should toast when the core cannot resolve", async () => {
            // Arrange
            const { view, bridge, toastService } = await setUp()
            bridge.failWith("snapshots.resolveForCommit", { code: "IO", message: "store unreadable", details: {} })

            // Act
            view.showCommit(COMMIT_SHA)
            await settle()

            // Assert
            expect(view.status()).toBe("error")
            expect(toastService.show).toHaveBeenCalledWith("store unreadable", "error")
        })
    })

    describe("analyses", () => {
        it("should re-resolve and switch when the pending job finishes for the current target", async () => {
            // Arrange
            const { view, bridge, loadFilesUseCase, toastService } = await setUp({ snapshots: [API] })
            bridge.setResolution(FOLDER, COMMIT, {
                kind: "nearest",
                snapshot: API,
                isCurrentProfile: true,
                relation: "ancestor",
                behind: 1,
                ahead: 0
            })
            view.showCommit(COMMIT_SHA)
            await settle()
            await view.analyseTarget("notice")
            const whileRunning = view.notice()

            // Act
            bridge.completeJob(FIRST_JOB)
            await settle()

            // Assert
            expect(whileRunning).toMatchObject({ kind: "running" })
            expect(loadedSnapshotIds(loadFilesUseCase.loadProjectSnapshots)).toEqual(["s-api", `${COMMIT_SHA}-01234567`])
            expect(view.resolution()).toMatchObject({ kind: "exact" })
            expect(view.notice()).toBeNull()
            expect(toastService.show).toHaveBeenCalledWith("Showing the analysis of a1b2c3d", "success")
        })

        it("should make the current checkout the target when analysing it from a snapshot away from HEAD", async () => {
            // Arrange
            const { view, bridge, requestsOf, gitStatusChange } = await setUpWithHead()
            await view.open(OLDER.ref)
            bridge.respondWith("git.measureDistances", { distances: [{ sha: OLDER_SHA, onlyInCandidate: 0, onlyInTarget: 2 }] })
            await gitStatusChange(HEAD_SHA)
            const away = view.checkoutResolution()

            // Act
            await view.analyseTarget("notice")
            await settle()

            // Assert
            expect(away).toMatchObject({ kind: "nearest", behind: 2 })
            expect(view.target()).toEqual(WORKING_TREE)
            expect(requestsOf("analysis.enqueue")).toEqual([expect.objectContaining({ target: WORKING_TREE })])
            expect(view.notice()).toMatchObject({ kind: "running" })
        })

        it("should switch the current checkout to a finished analysis of the commit at HEAD", async () => {
            // Arrange
            const { view, bridge, loadFilesUseCase } = await setUp({ snapshots: [], gitStatuses: { "f-api": statusAt(COMMIT_SHA) } })
            await TestBed.inject(GitRepositoryService).refreshFolders([FOLDER])
            await settle()
            await view.analyse({ folder: FOLDER, target: COMMIT, surface: "dialog" })

            // Act
            bridge.completeJob(FIRST_JOB)
            await settle()

            // Assert
            expect(view.target()).toEqual(WORKING_TREE)
            expect(loadedSnapshotIds(loadFilesUseCase.loadProjectSnapshots)).toEqual([`${COMMIT_SHA}-01234567`])
        })

        it("should only toast when the user moved on", async () => {
            // Arrange
            const { view, bridge, loadFilesUseCase, toastService } = await setUp()
            view.showCommit(COMMIT_SHA)
            await settle()
            await view.analyse({ folder: { ...FOLDER, folderId: "f-web" }, target: WORKING_TREE, surface: "dialog" })
            loadFilesUseCase.loadProjectSnapshots.mockClear()

            // Act
            bridge.completeJob(FIRST_JOB)
            await settle()

            // Assert
            expect(loadFilesUseCase.loadProjectSnapshots).not.toHaveBeenCalled()
            expect(toastService.show).toHaveBeenCalledWith("Analysis of the working tree finished", "success")
        })

        it("should surface a rejected enqueue", async () => {
            // Arrange
            const { view, bridge } = await setUp()
            bridge.respondWith("analysis.enqueue", { status: "rejected", problems: [JAVA_MISSING] })

            // Act
            await view.analyseTarget("notice")
            const rejected = view.rejectedRun()
            view.dismissProblems()

            // Assert
            expect(rejected).toEqual({ surface: "notice", problems: [JAVA_MISSING] })
            expect(view.rejectedRun()).toBeNull()
        })

        it("should leave a failure of the target to the notice and toast any other", async () => {
            // Arrange
            const { view, bridge, toastService } = await setUp({ snapshots: [] })
            await view.analyseTarget("notice")
            await view.retry(aJob("job-old", { state: "failed" }))
            const error = { code: "JAVA_TOO_OLD" as const, message: "Java 21 is too old.", hint: null }

            // Act
            bridge.failJob(FIRST_JOB, error)
            bridge.failJob("job-0000000000000002", error)
            await settle()

            // Assert
            expect(view.notice()).toMatchObject({ kind: "failed" })
            expect(toastService.show).toHaveBeenCalledTimes(1)
            expect(toastService.show).toHaveBeenCalledWith("Analysis of a1b2c3d failed: Java 21 is too old.", "error")
        })

        it("should say when an analysis is already queued", async () => {
            // Arrange
            const { view, toastService } = await setUp()
            await view.analyse({ folder: FOLDER, target: COMMIT, surface: "dialog" })

            // Act
            await view.analyse({ folder: FOLDER, target: COMMIT, surface: "dialog" })

            // Assert
            expect(toastService.show).toHaveBeenCalledWith("This analysis is already queued.", "info")
        })

        it("should open an already analysed snapshot only when it answers the target", async () => {
            // Arrange
            const { view, bridge, loadFilesUseCase, toastService } = await setUp({ snapshots: [API] })
            bridge.respondWith("analysis.enqueue", { status: "alreadyAnalysed", snapshotId: "s-api" })

            // Act
            await view.analyse({ folder: FOLDER, target: COMMIT, surface: "dialog", force: false })
            const loadedForCommit = loadedSnapshotIds(loadFilesUseCase.loadProjectSnapshots)
            await view.analyseTarget("notice")

            // Assert
            expect(toastService.show).toHaveBeenCalledWith("Already analysed", "info")
            expect(loadedForCommit).toEqual([])
            expect(loadedSnapshotIds(loadFilesUseCase.loadProjectSnapshots)).toEqual(["s-api"])
        })
    })

    it("should open a snapshot as the target and show it on the map", async () => {
        // Arrange
        const { view, loadFilesUseCase, router } = await setUp()

        // Act
        await view.open(API.ref)
        await settle()

        // Assert
        expect(view.target()).toEqual({ kind: "snapshot", ref: API.ref })
        expect(loadedSnapshotIds(loadFilesUseCase.loadProjectSnapshots)).toEqual(["s-api"])
        expect(router.navigateByUrl).toHaveBeenCalled()
    })

    it("should toast a request the core refuses", async () => {
        // Arrange
        const { view, bridge, toastService } = await setUp()
        bridge.failWith("analysis.enqueue", { code: "NOT_FOUND", message: "No such folder.", details: {} })
        bridge.failWith("projects.setActive", { code: "IO", message: "store gone", details: {} })

        // Act
        await view.analyse({ folder: FOLDER, target: COMMIT, surface: "dialog" })
        await view.open(API.ref)

        // Assert
        expect(toastService.show).toHaveBeenCalledWith("No such folder.", "error")
        expect(toastService.show).toHaveBeenCalledWith("store gone", "error")
    })

    it("should stay idle in the web build", async () => {
        // Arrange
        TestBed.configureTestingModule({
            providers: [
                { provide: LoadFilesUseCase, useValue: {} },
                { provide: Router, useValue: { navigateByUrl: jest.fn() } }
            ]
        })

        // Act
        const view = TestBed.inject(SnapshotViewService)
        await settle()

        // Assert
        expect(view.status()).toBe("idle")
        expect(view.target()).toBeNull()
    })
})
