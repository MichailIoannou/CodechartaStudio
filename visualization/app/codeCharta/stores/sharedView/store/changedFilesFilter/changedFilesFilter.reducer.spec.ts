import { setChangedFilesFilter } from "./changedFilesFilter.actions"
import { changedFilesFilter } from "./changedFilesFilter.reducer"

describe("changedFilesFilter", () => {
    it("should start without a filter", () => {
        // Arrange & Act
        const result = changedFilesFilter(undefined, { type: "INIT" })

        // Assert
        expect(result).toBeNull()
    })

    it("should set the filter to the paths git reports", () => {
        // Arrange
        const filter = { source: "git" as const, paths: ["/root/a.ts"] }

        // Act
        const result = changedFilesFilter(null, setChangedFilesFilter({ value: filter }))

        // Assert
        expect(result).toEqual(filter)
    })

    it("should clear the filter", () => {
        // Arrange
        const filter = { source: "metrics" as const }

        // Act
        const result = changedFilesFilter(filter, setChangedFilesFilter({ value: null }))

        // Assert
        expect(result).toBeNull()
    })
})
