import { aSnapshot } from "../projects.mocks"
import { snapshotDisplayName, uniqueDisplayNames } from "./snapshotDisplayName"

describe("snapshotDisplayName", () => {
    it("should name a commit snapshot label@short", () => {
        // Arrange
        const snapshot = aSnapshot("p", "f", "s", { shortCommit: "a1b2c3d" })

        // Act
        const name = snapshotDisplayName("billing-api", snapshot)

        // Assert
        expect(name).toBe("billing-api@a1b2c3d")
    })

    it("should append +dirty", () => {
        // Arrange
        const snapshot = aSnapshot("p", "f", "s", { shortCommit: "a1b2c3d", dirty: true })

        // Act
        const name = snapshotDisplayName("billing-api", snapshot)

        // Assert
        expect(name).toBe("billing-api@a1b2c3d+dirty")
    })

    it("should name an imported snapshot after its file without the map extension", () => {
        // Arrange
        const snapshot = aSnapshot("p", "f", "s", { source: "imported", originalFileName: "nightly/run.cc.json.gz" })

        // Act
        const name = snapshotDisplayName("out", snapshot)

        // Assert
        expect(name).toBe("out@nightly-run")
    })

    it("should fall back to the minute the snapshot entered the store", () => {
        // Arrange
        const snapshot = aSnapshot("p", "f", "s", { createdAt: "2026-11-19T08:05:59Z" })

        // Act
        const name = snapshotDisplayName("out", snapshot)

        // Assert
        expect(name).toBe("out@2026-11-19 08-05")
    })

    it("should make two equal names unique", () => {
        // Arrange
        const names = ["api@a1b2c3d", "api@a1b2c3d", "web@a1b2c3d", "api@a1b2c3d"]

        // Act
        const unique = uniqueDisplayNames(names)

        // Assert
        expect(unique).toEqual(["api@a1b2c3d", "api@a1b2c3d (2)", "web@a1b2c3d", "api@a1b2c3d (3)"])
    })
})
