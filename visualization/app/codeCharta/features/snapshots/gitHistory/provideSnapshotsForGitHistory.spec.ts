import { signal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import type { GitStatus } from "../../../model/coreApi/GitStatus"
import { ANALYSED_COMMITS, AnalysedCommitMarker, COMMIT_ACTIONS, CommitSelection, LOADED_MAP_LOCATOR } from "../../gitHistory/facade"
import { SnapshotBadgeProvider } from "../services/snapshotBadgeProvider.service"
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

    function provided() {
        markers.set(new Map())
        analyse.mockClear()
        TestBed.configureTestingModule({
            providers: [
                ...provideSnapshotsForGitHistory(),
                {
                    provide: SnapshotBadgeProvider,
                    useValue: { markersFor: () => markers, markerOf: (_repo: unknown, sha: string) => markers().get(sha) ?? null }
                },
                { provide: SnapshotMapLocator, useValue: { nodePathOf: () => null } },
                { provide: SnapshotViewService, useValue: { analyse } }
            ]
        })
        const actions = TestBed.inject(COMMIT_ACTIONS)
        return {
            analyseCommit: actions.find(action => action.id === "snapshots.analyseCommit"),
            analyseWorkingTree: actions.find(action => action.id === "snapshots.analyseWorkingTree"),
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
            ["Analyse This Commit", "Analyse this commit", "fa-solid fa-play", "Run ccsh on this commit in a temporary worktree", false],
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
})
