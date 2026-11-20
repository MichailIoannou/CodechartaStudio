import { createFakeDesktopBridge } from "../../../util/desktop/desktopBridge.mocks"
import { MAP_CHUNK_BYTES, readSnapshotBytes } from "./snapshotBytes"

const REF = { projectId: "p-1", folderId: "f-1", snapshotId: "s-1" }

describe("readSnapshotBytes", () => {
    it("should assemble chunks into one byte array", async () => {
        // Arrange
        const bridge = createFakeDesktopBridge()
        const chunks = [
            { bytes: new Uint8Array([1, 2]), offset: 0, totalBytes: 5 },
            { bytes: new Uint8Array([3, 4, 5]), offset: 2, totalBytes: 5 }
        ]
        bridge.request = jest.fn().mockImplementation(() => Promise.resolve({ ok: true, value: chunks.shift() }))

        // Act
        const bytes = await readSnapshotBytes(bridge, REF)

        // Assert
        expect([...bytes]).toEqual([1, 2, 3, 4, 5])
        expect(bridge.request).toHaveBeenNthCalledWith(2, "snapshots.readMapChunk", { ...REF, offset: 2, length: MAP_CHUNK_BYTES })
    })

    it("should read a seeded map of the fake bridge", async () => {
        // Arrange
        const bridge = createFakeDesktopBridge({ snapshotMaps: { "s-1": [9, 8, 7] } })

        // Act
        const bytes = await readSnapshotBytes(bridge, REF)

        // Assert
        expect([...bytes]).toEqual([9, 8, 7])
    })

    it("should fail when the stored map ends early", async () => {
        // Arrange
        const bridge = createFakeDesktopBridge()
        const chunks = [
            { bytes: new Uint8Array([1]), offset: 0, totalBytes: 3 },
            { bytes: new Uint8Array([]), offset: 1, totalBytes: 3 }
        ]
        bridge.request = jest.fn().mockImplementation(() => Promise.resolve({ ok: true, value: chunks.shift() }))

        // Act
        const reading = readSnapshotBytes(bridge, REF)

        // Assert
        await expect(reading).rejects.toThrow("The stored map ended early.")
    })

    it("should fail with the bridge error when a chunk cannot be read", async () => {
        // Arrange
        const bridge = createFakeDesktopBridge()

        // Act
        const reading = readSnapshotBytes(bridge, REF)

        // Assert
        await expect(reading).rejects.toMatchObject({ code: "NOT_FOUND" })
    })
})
