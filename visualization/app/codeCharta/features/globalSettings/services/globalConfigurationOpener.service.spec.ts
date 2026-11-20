import { TestBed } from "@angular/core/testing"
import { GlobalConfigurationOpener } from "./globalConfigurationOpener.service"

describe("GlobalConfigurationOpener", () => {
    let opener: GlobalConfigurationOpener

    beforeEach(() => {
        opener = TestBed.inject(GlobalConfigurationOpener)
    })

    it("should hand the place to open at to the dialog that serves it", () => {
        // Arrange
        const openDialog = jest.fn()
        opener.serve(openDialog)

        // Act
        opener.openGlobalConfiguration({ section: "desktopTools", tool: "java" })

        // Assert
        expect(openDialog).toHaveBeenCalledWith({ section: "desktopTools", tool: "java" })
    })

    it("should do nothing while no dialog serves it", () => {
        // Arrange
        const openDialog = jest.fn()
        const stopServing = opener.serve(openDialog)
        stopServing()

        // Act
        opener.openGlobalConfiguration()

        // Assert
        expect(openDialog).not.toHaveBeenCalled()
    })

    it("should keep serving a newer dialog when an older one stops", () => {
        // Arrange
        const olderDialog = jest.fn()
        const newerDialog = jest.fn()
        const stopOlder = opener.serve(olderDialog)
        opener.serve(newerDialog)
        stopOlder()

        // Act
        opener.openGlobalConfiguration()

        // Assert
        expect(newerDialog).toHaveBeenCalledTimes(1)
        expect(olderDialog).not.toHaveBeenCalled()
    })
})
