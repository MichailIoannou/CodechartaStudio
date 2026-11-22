import { byteSize, counted, fileDate, longDate, remoteDisplay, shortDate, shortSha } from "./folderWording"

describe("folderWording", () => {
    it("should pluralise counts", () => {
        // Arrange & Act
        const words = [counted(1, "folder"), counted(4, "folder"), counted(0, "analysis", "analyses")]

        // Assert
        expect(words).toEqual(["1 folder", "4 folders", "0 analyses"])
    })

    it("should shorten a sha to seven characters", () => {
        // Arrange & Act
        const short = shortSha("a1b2c3d4e5f6")

        // Assert
        expect(short).toBe("a1b2c3d")
    })

    it("should show a remote as host and path without credentials or .git", () => {
        // Arrange
        const urls = ["https://token@github.com/acme/billing-api.git", "git@github.com:acme/billing-api.git", "ssh://git@host:22/repo/"]

        // Act
        const shown = urls.map(url => remoteDisplay({ name: "origin", url }))

        // Assert
        expect(shown).toEqual(["github.com/acme/billing-api", "github.com/acme/billing-api", "host:22/repo"])
    })

    it("should write a byte size with one decimal", () => {
        // Arrange & Act
        const sizes = [512, 61_200_000, 4_200].map(byteSize)

        // Assert
        expect(sizes).toEqual(["512 B", "61.2 MB", "4.2 kB"])
    })

    it("should write a date as day and month", () => {
        // Arrange & Act
        const date = shortDate("2026-10-28T09:30:00Z")

        // Assert
        expect(date).toBe("28 Oct")
    })

    it("should write a date with the year and a file date with the time", () => {
        // Arrange & Act
        const date = longDate("2026-11-12T12:00:00Z")
        const withTime = fileDate("2026-11-12T12:00:00Z")

        // Assert
        expect(date).toBe("12 Nov 2026")
        expect(withTime).toMatch(/^12 Nov 2026, \d{2}:\d{2}$/)
    })
})
