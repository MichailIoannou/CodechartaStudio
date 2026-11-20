import { signal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import type { GitStatus } from "../../../model/coreApi/GitStatus"
import { ANALYSED_COMMITS, AnalysedCommitMarker, COMMIT_ACTIONS, CommitSelection, LOADED_MAP_LOCATOR } from "../../gitHistory/facade"
import { ProjectsFacade } from "../../projects/facade"
import type { SelectedTarget } from "../model/snapshotTarget"
import { BatchAnalysisDialogService } from "../services/batchAnalysisDialog.service"
import { SnapshotBadgeProvider } from "../services/snapshotBadgeProvider.service"
import { SnapshotCatalogService } from "../services/snapshotCatalog.service"
import { SnapshotMapLocator } from "../services/snapshotMapLocator.service"
import { SnapshotViewService } from "../services/snapshotView.service"
import { COMMIT_SHA } from "../snapshots.mocks"
import { provideSnapshotsForGitHistory } from "./provideSnapshotsForGitHistory"

const API = { projectId: "p-billing", folderId: "f-api" }
const STATUS = { head: { kind: "branch", name: "main", commit: COMMIT_SHA } } as GitStatus
const COMMIT = {
    sha: COMMIT_SHA,
    parents: [],
    authorName: "Mia Chen",
    authorEmail: "mia@example.com",
    authoredAt: 0,
    committedAt: 0,
    subject: "Fix invoice rounding"
}

function oneCommit(): CommitSelection {
    return { repo: API, items: [{ kind: "commit", commit: COMMIT }] }
}

describe("provideSnapshotsForGitHistory", () => {
    const markers = signal<ReadonlyMap<string, AnalysedCommitMarker>>(new Map())
    const analyse = jest.fn().mockResolvedValue(undefined)
    const showCommit = jest.fn()
    const showCurrentCheckout = jest.fn()
    const snapshots = jest.fn(() => [{}])
    const target = signal<SelectedTarget | null>(null)
    const status = signal("idle")
    const showMap = jest.fn()

    function provided() {
        markers.set(new Map())
        analyse.mockClear()
        showCommit.mockClear()
        showCurrentCheckout.mockClear()
        showMap.mockClear()
        target.set(null)
        TestBed.configureTestingModule({
            providers: [
                ...provideSnapshotsForGitHistory(),
                {
                    provide: SnapshotBadgeProvider,
                    useValue: { markersFor: () => markers, markerOf: (_repo: unknown, sha: string) => markers().get(sha) ?? null }
                },
                { provide: SnapshotMapLocator, useValue: { nodePathOf: () => null } },
                { provide: SnapshotViewService, useValue: { analyse, showCommit, showCurrentCheckout, target, status } },
                { provide: SnapshotCatalogService, useValue: { snapshots } },
                {
                    provide: ProjectsFacade,
                    useValue: { showMap, activeProject: signal({ folders: [{ id: "f-api", label: "billing-api" }] }) }
                }
            ]
        })
        const actions = TestBed.inject(COMMIT_ACTIONS)
        return {
            analyseCommit: actions.find(action => action.id === "snapshots.analyseCommit"),
            analyseWorkingTree: actions.find(action => action.id === "snapshots.analyseWorkingTree"),
            analyseLastCommits: actions.find(action => action.id === "snapshots.analyseLastCommits"),
            showInMap: actions.find(action => action.id === "snapshots.showInMap"),
            actions
        }
    }

    it("should provide the badges, the map locator and the analyse actions to the history", () => {
        // Arrange & Act
        const { actions } = provided()

        // Assert
        expect(TestBed.inject(ANALYSED_COMMITS)).toBe(TestBed.inject(SnapshotBadgeProvider))
        expect(TestBed.inject(LOADED_MAP_LOCATOR)).toBe(TestBed.inject(SnapshotMapLocator))
        expect(actions.map(action => [action.label, action.detailsLabel, action.icon, action.hoverHint, action.isPrimary])).toEqual([
            ["Show in Map", "Show in map", "fa-solid fa-map", "", true],
            ["Analyse This Commit", "Analyse this commit", "fa-solid fa-play", "Run ccsh on this commit in a temporary worktree", false],
            ["Analyse the Last Commits from Here…", undefined, "fa-solid fa-layer-group", "Analyse several commits of this line", false],
            ["Analyse Working Tree", undefined, "fa-solid fa-play", "Analyse the files as they are on disk now", false]
        ])
    })

    it('should offer "Analyse this commit" only for unanalysed commits', () => {
        // Arrange
        const { analyseCommit } = provided()
        const offeredFor = (state: AnalysedCommitMarker["state"] | null) => {
            markers.set(state ? new Map([[COMMIT_SHA, { state, isLoadedInMap: false }]]) : new Map())
            return analyseCommit?.isOfferedFor(oneCommit())
        }

        // Act
        const offers = [null, "failed", "analysed", "queued", "running"].map(state =>
            offeredFor(state as AnalysedCommitMarker["state"] | null)
        )

        // Assert
        expect(offers).toEqual([true, true, false, false, false])
    })

    it("should not offer analysing a commit for the working tree or two selected items", () => {
        // Arrange
        const { analyseCommit } = provided()
        const workingTree: CommitSelection = { repo: API, items: [{ kind: "workingTree", status: STATUS }] }
        const two: CommitSelection = {
            repo: API,
            items: [oneCommit().items[0], { kind: "commit", commit: { ...COMMIT, sha: "f".repeat(40) } }]
        }

        // Act & Assert
        expect(analyseCommit?.isOfferedFor(workingTree)).toBe(false)
        expect(analyseCommit?.isOfferedFor(two)).toBe(false)
    })

    it("should queue an analysis of the commit, with problems shown in the workspace status", () => {
        // Arrange
        const { analyseCommit } = provided()

        // Act
        analyseCommit?.run(oneCommit())
        analyseCommit?.run({ repo: API, items: [{ kind: "workingTree", status: STATUS }] })

        // Assert
        expect(analyse).toHaveBeenCalledTimes(1)
        expect(analyse).toHaveBeenCalledWith({ folder: API, target: { kind: "commit", sha: COMMIT_SHA }, surface: "status" })
    })

    it("should open the batch dialog counting back from one selected commit", () => {
        // Arrange
        const { analyseLastCommits } = provided()
        const workingTree: CommitSelection = { repo: API, items: [{ kind: "workingTree", status: STATUS }] }

        // Act
        analyseLastCommits?.run(oneCommit())

        // Assert
        expect(analyseLastCommits?.isOfferedFor(oneCommit())).toBe(true)
        expect(analyseLastCommits?.isOfferedFor(workingTree)).toBe(false)
        expect(TestBed.inject(BatchAnalysisDialogService).current()).toEqual({
            folder: API,
            folderLabel: "billing-api",
            tipSha: COMMIT_SHA
        })
    })

    it("should offer and queue an analysis of the working tree from the uncommitted changes", () => {
        // Arrange
        const { analyseWorkingTree } = provided()
        const workingTree: CommitSelection = { repo: API, items: [{ kind: "workingTree", status: STATUS }] }

        // Act
        const offeredForTree = analyseWorkingTree?.isOfferedFor(workingTree)
        const offeredForCommit = analyseWorkingTree?.isOfferedFor(oneCommit())
        analyseWorkingTree?.run(workingTree)

        // Assert
        expect([offeredForTree, offeredForCommit]).toEqual([true, false])
        expect(analyse).toHaveBeenCalledWith({ folder: API, target: { kind: "workingTree" }, surface: "status" })
    })

    it("should show the selected commit in the map, or the current checkout for the uncommitted changes", () => {
        // Arrange
        const { showInMap } = provided()
        const workingTree: CommitSelection = { repo: API, items: [{ kind: "workingTree", status: STATUS }] }

        // Act
        showInMap?.run(oneCommit())
        showInMap?.run(workingTree)

        // Assert
        expect(showCommit).toHaveBeenCalledWith(COMMIT_SHA)
        expect(showCurrentCheckout).toHaveBeenCalledTimes(1)
    })

    it('should offer "Show in map" for one item of a folder that has an analysis', () => {
        // Arrange
        const { showInMap } = provided()
        const two: CommitSelection = {
            repo: API,
            items: [oneCommit().items[0], { kind: "commit", commit: { ...COMMIT, sha: "f".repeat(40) } }]
        }

        // Act
        const withAnalysis = [showInMap?.isOfferedFor(oneCommit()), showInMap?.isOfferedFor(two)]
        snapshots.mockReturnValueOnce([])
        const withoutAnalysis = showInMap?.isOfferedFor(oneCommit())

        // Assert
        expect(withAnalysis).toEqual([true, false])
        expect(withoutAnalysis).toBe(false)
        expect(snapshots).toHaveBeenCalledWith("f-api")
    })

    it("should only go to the map when the map already follows the selected commit", () => {
        // Arrange
        const { showInMap } = provided()
        target.set({ kind: "commit", sha: COMMIT_SHA })

        // Act
        status.set("resolving")
        showInMap?.run(oneCommit())
        status.set("shown")
        showInMap?.run(oneCommit())

        // Assert
        expect(showCommit).not.toHaveBeenCalled()
        expect(showMap).toHaveBeenCalledTimes(1)
    })
})
