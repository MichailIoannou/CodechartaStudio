import { TestBed } from "@angular/core/testing"
import type { FakeDesktopSeed } from "../../../../util/desktop/desktopBridge.mocks"
import { aFolder, aPickedFolder, aProject } from "../../projects.mocks"
import { ProjectsTestBed, setUpProjects } from "../../projectsTestBed.mocks"
import { RelinkFolderComponent } from "./relinkFolder.component"

const GONE = { id: "f-gone", label: "gone" }

describe("RelinkFolderComponent", () => {
    let testBed: ProjectsTestBed

    async function createRelink(seed: FakeDesktopSeed = {}) {
        HTMLDialogElement.prototype.showModal = jest.fn()
        testBed = await setUpProjects({
            projects: [aProject("p-1", [aFolder("f-gone", { label: "gone", status: "missing" })])],
            activeProjectId: "p-1",
            ...seed
        })
        const fixture = TestBed.createComponent(RelinkFolderComponent)
        fixture.autoDetectChanges()
        return fixture.componentInstance
    }

    it("should do nothing when the pick is cancelled", async () => {
        // Arrange
        const relink = await createRelink()

        // Act
        await relink.start(GONE)

        // Assert
        expect(testBed.requestsOf("projects.relinkFolder")).toEqual([])
    })

    it("should toast a picker that fails", async () => {
        // Arrange
        const relink = await createRelink()
        testBed.bridge.failWith("projects.pickFolder", { code: "BAD_REQUEST", message: "bad title", details: {} })

        // Act
        await relink.start(GONE)

        // Assert
        expect(testBed.toastService.show).toHaveBeenCalledWith("bad title", "error")
    })

    it("should toast another refusal and not ask about the history", async () => {
        // Arrange
        const relink = await createRelink({ pickedFolders: [aPickedFolder("elsewhere")] })
        testBed.bridge.failWith("projects.relinkFolder", { code: "DUPLICATE_FOLDER", message: "duplicate", details: {} })

        // Act
        await relink.start(GONE)
        await relink.linkAnyway()

        // Assert
        expect(testBed.toastService.show).toHaveBeenCalledWith("'/work/elsewhere' is already part of this project.", "info")
        expect(HTMLDialogElement.prototype.showModal).not.toHaveBeenCalled()
        expect(testBed.requestsOf("projects.relinkFolder")).toHaveLength(1)
    })
})
