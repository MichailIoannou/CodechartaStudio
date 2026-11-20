import { signal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import type { ProjectSnapshotsLoadResult } from "../../../load/load.facade"
import type { SnapshotRef } from "../../../model/coreApi/SnapshotRef"
import { ProjectsFacade } from "../../projects/facade"
import { SNAPSHOT_GATEWAY } from "../ports/compareGateways"
import { aCommitSnapshot, BASE_SHA, HEAD_SHA } from "../ports/compareGateways.mocks"

const BASE = aCommitSnapshot(BASE_SHA)
const HEAD = aCommitSnapshot(HEAD_SHA)

describe("SnapshotGatewayAdapter", () => {
    let loadSnapshots: jest.Mock<Promise<ProjectSnapshotsLoadResult>, [SnapshotRef[]]>

    function createGateway(loadedIds: string[]) {
        loadSnapshots = jest.fn((refs: SnapshotRef[]) =>
            Promise.resolve({
                loaded: refs
                    .filter(ref => loadedIds.includes(ref.snapshotId))
                    .map(ref => ({
                        origin: { ...ref, folderLabel: "billing-api" },
                        checksum: `loaded-${ref.snapshotId}`,
                        rootName: "billing"
                    })),
                identicalContent: [],
                unreadable: []
            })
        )
        TestBed.configureTestingModule({
            providers: [{ provide: ProjectsFacade, useValue: { loadSnapshots, shownSnapshot: signal(HEAD) } }]
        })
        return TestBed.inject(SNAPSHOT_GATEWAY)
    }

    it("should load the head first, so it is kept when both maps are identical", async () => {
        // Arrange
        const gateway = createGateway([HEAD.ref.snapshotId])

        // Act
        const load = await gateway.loadPair(BASE, HEAD)

        // Assert
        expect(loadSnapshots).toHaveBeenCalledWith([HEAD.ref, BASE.ref])
        expect(load).toEqual({ base: null, head: `loaded-${HEAD.ref.snapshotId}` })
    })

    it("should report the checksums of both loaded maps", async () => {
        // Arrange
        const gateway = createGateway([HEAD.ref.snapshotId, BASE.ref.snapshotId])

        // Act
        const load = await gateway.loadPair(BASE, HEAD)

        // Assert
        expect(load).toEqual({ base: `loaded-${BASE.ref.snapshotId}`, head: `loaded-${HEAD.ref.snapshotId}` })
    })

    it("should load the head alone and tell the commit on the map", async () => {
        // Arrange
        const gateway = createGateway([])

        // Act
        const checksum = await gateway.loadAlone(HEAD)

        // Assert
        expect(checksum).toBeNull()
        expect(gateway.shownCommit()).toBe(HEAD_SHA)
    })
})
