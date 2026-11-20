import { TestBed } from "@angular/core/testing"
import { FOLDER_ACTIONS } from "../../projects/facade"
import { aFolder } from "../../projects/projects.mocks"
import { ToastService } from "../../shared/facade"
import { HOSTING_GATEWAY } from "../ports/compareGateways"
import { FakeHostingGateway, FOLDER } from "../ports/compareGateways.mocks"
import { provideCompareForProjects } from "./provideCompareForProjects"

describe("remove fetched pull requests", () => {
    let hosting: FakeHostingGateway
    let toast: jest.Mock

    function action() {
        hosting = new FakeHostingGateway()
        toast = jest.fn()
        TestBed.configureTestingModule({
            providers: [
                ...provideCompareForProjects(),
                { provide: HOSTING_GATEWAY, useValue: hosting },
                { provide: ToastService, useValue: { show: toast } }
            ]
        })
        return TestBed.inject(FOLDER_ACTIONS)[0]
    }

    async function settle() {
        await new Promise(resolve => setTimeout(resolve))
    }

    it("should be offered for a git folder that is present only", () => {
        // Act
        const removeFetched = action()

        // Assert
        expect(removeFetched.isOfferedFor(aFolder("f-api"))).toBe(true)
        expect(removeFetched.isOfferedFor(aFolder("f-out", { kind: "plain" }))).toBe(false)
        expect(removeFetched.isOfferedFor(aFolder("f-gone", { status: "missing" }))).toBe(false)
    })

    it("should remove the fetched heads and say how many there were", async () => {
        // Arrange
        const removeFetched = action()
        hosting.removedRefs = 2

        // Act
        removeFetched.run(FOLDER, "billing-api")
        await settle()

        // Assert
        expect(hosting.cleanedFolders).toEqual([FOLDER.folderId])
        expect(toast).toHaveBeenCalledWith("Removed 2 fetched pull requests from 'billing-api'.")
    })

    it("should say when there was nothing to remove and when removing failed", async () => {
        // Arrange
        const removeFetched = action()

        // Act
        removeFetched.run(FOLDER, "billing-api")
        await settle()
        hosting.removedRefs = new Error("locked")
        removeFetched.run(FOLDER, "billing-api")
        await settle()

        // Assert
        expect(toast.mock.calls).toEqual([
            ["'billing-api' has no fetched pull requests."],
            ["The fetched pull requests could not be removed: locked", "error"]
        ])
    })
})
