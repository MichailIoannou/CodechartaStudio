import { signal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import type { CommitSelection } from "../../gitHistory/facade"
import { COMMIT_ACTIONS } from "../../gitHistory/facade"
import { aStatusOn } from "../../gitHistory/services/gitApi.mocks"
import { ProjectsFacade } from "../../projects/facade"
import { aSnapshot } from "../../projects/projects.mocks"
import { SNAPSHOT_ACTIONS } from "../../snapshots/facade"
import type { SnapshotSummary } from "../model/compare.model"
import { aCommitSnapshot, BASE_SHA, FOLDER } from "../ports/compareGateways.mocks"
import { CompareFacade } from "../services/compareFacade"
import { provideCompareForSnapshots } from "./provideCompareForSnapshots"

const COMMIT = aCommitSnapshot(BASE_SHA)
const WORKING_TREE = aSnapshot(FOLDER.projectId, FOLDER.folderId, "s-wt", { target: "workingTree", createdAt: "2026-11-04T09:12:00Z" })
const IMPORTED = aSnapshot(FOLDER.projectId, FOLDER.folderId, "s-imp", { source: "imported", originalFileName: "export.cc.json" })

describe("compare against a snapshot", () => {
    let compare: Record<string, jest.Mock>

    function actions(snapshots: SnapshotSummary[]) {
        compare = { compareWithSnapshot: jest.fn().mockResolvedValue(undefined), openDialog: jest.fn() }
        TestBed.configureTestingModule({
            providers: [
                ...provideCompareForSnapshots(),
                { provide: CompareFacade, useValue: compare },
                { provide: ProjectsFacade, useValue: { snapshotsByFolder: signal({ [FOLDER.folderId]: snapshots }) } }
            ]
        })
        return { snapshot: TestBed.inject(SNAPSHOT_ACTIONS), commit: TestBed.inject(COMMIT_ACTIONS) }
    }

    const offeredFor = (
        snapshotActions: readonly { label: string; isOfferedFor(snapshot: SnapshotSummary): boolean }[],
        snapshot: SnapshotSummary
    ) => snapshotActions.filter(action => action.isOfferedFor(snapshot)).map(action => action.label)

    it("should compare a commit's analysis with the working tree when the working tree was analysed", () => {
        // Arrange
        const { snapshot } = actions([COMMIT, WORKING_TREE])

        // Act
        snapshot.find(action => action.isOfferedFor(COMMIT))?.run(COMMIT)

        // Assert
        expect(offeredFor(snapshot, COMMIT)).toEqual(["Compare with working tree"])
        expect(compare.compareWithSnapshot).toHaveBeenCalledWith(FOLDER, BASE_SHA, { kind: "workingTree", snapshotId: "s-wt" })
    })

    it("should not offer the working tree when it was never analysed", () => {
        // Act
        const { snapshot } = actions([COMMIT, IMPORTED])

        // Assert
        expect(offeredFor(snapshot, COMMIT)).toEqual([])
    })

    it("should open the dialog with an imported or working-tree analysis as the head", () => {
        // Arrange
        const { snapshot } = actions([COMMIT, WORKING_TREE, IMPORTED])

        // Act
        snapshot.find(action => action.label === "Compare with…")?.run(IMPORTED)

        // Assert
        expect(offeredFor(snapshot, IMPORTED)).toEqual(["Compare with…"])
        expect(offeredFor(snapshot, WORKING_TREE)).toEqual(["Compare with…"])
        expect(compare.openDialog).toHaveBeenCalledWith({ folder: FOLDER, head: "export.cc.json" })
    })

    it("should compare the uncommitted changes with HEAD once the working tree was analysed", () => {
        // Arrange
        const { commit } = actions([WORKING_TREE])
        const uncommitted: CommitSelection = { repo: FOLDER, items: [{ kind: "workingTree", status: aStatusOn("main") }] }

        // Act
        const offered = commit.filter(action => action.isOfferedFor(uncommitted))
        offered[0].run(uncommitted)

        // Assert
        expect(offered.map(action => action.label)).toEqual(["Compare with HEAD"])
        expect(compare.compareWithSnapshot).toHaveBeenCalledWith(FOLDER, "HEAD", { kind: "workingTree", snapshotId: "s-wt" })
    })
})
