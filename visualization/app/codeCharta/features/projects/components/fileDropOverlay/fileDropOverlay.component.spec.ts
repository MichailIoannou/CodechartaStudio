import { TestBed } from "@angular/core/testing"
import { Router } from "@angular/router"
import { screen } from "@testing-library/angular"
import { LoadFilesUseCase } from "../../../../load/load.facade"
import { DESKTOP_BRIDGE } from "../../../../util/desktop/desktopBridge.token"
import { aPickedImportFile } from "../../projects.mocks"
import { ProjectsTestBed, settle, setUpProjects } from "../../projectsTestBed.mocks"
import { OpenFileService } from "../../services/openFile.service"
import { FileDropOverlayComponent } from "./fileDropOverlay.component"

function dragEvent(type: string, files: File[], relatedTarget: EventTarget | null = document.body): DragEvent {
    const event = new Event(type, { bubbles: true, cancelable: true }) as DragEvent
    Object.defineProperty(event, "dataTransfer", { value: { types: files.length > 0 ? ["Files"] : ["text/plain"], files } })
    Object.defineProperty(event, "relatedTarget", { value: relatedTarget })
    return event
}

describe("FileDropOverlayComponent", () => {
    let testBed: ProjectsTestBed

    async function renderOverlay() {
        testBed = await setUpProjects({ pickedImportFile: aPickedImportFile("Downloads") }, { initialise: false })
        const fixture = TestBed.createComponent(FileDropOverlayComponent)
        fixture.autoDetectChanges()
        await settle()
        return fixture
    }

    it("should cover the window while a file is dragged over it", async () => {
        // Arrange
        await renderOverlay()
        const dragOver = dragEvent("dragover", [new File(["{}"], "map.cc.json")])

        // Act
        window.dispatchEvent(dragOver)
        await settle()
        const shown = screen.queryByTestId("file-drop-overlay")?.textContent?.trim()
        window.dispatchEvent(dragEvent("dragleave", [], null))
        await settle()

        // Assert
        expect(dragOver.defaultPrevented).toBe(true)
        expect(shown).toBe("Drop a cc.json file to open it")
        expect(screen.queryByTestId("file-drop-overlay")).toBeNull()
    })

    it("should ignore dragged text and a drag that stays in the window", async () => {
        // Arrange
        await renderOverlay()
        window.dispatchEvent(dragEvent("dragover", [new File(["{}"], "map.cc.json")]))
        await settle()

        // Act
        window.dispatchEvent(dragEvent("dragleave", []))
        const textOver = dragEvent("dragover", [])
        window.dispatchEvent(textOver)
        await settle()

        // Assert
        expect(textOver.defaultPrevented).toBe(false)
        expect(screen.queryByTestId("file-drop-overlay")).not.toBeNull()
    })

    it("should open the dialog for a dropped file", async () => {
        // Arrange
        await renderOverlay()

        // Act
        window.dispatchEvent(dragEvent("drop", [new File(["{}"], "Downloads.cc.json")]))
        await settle()

        // Assert
        expect(testBed.bridge.calls.filter(call => call.name === "openDroppedFile")).toHaveLength(1)
        expect(TestBed.inject(OpenFileService).pending()).toEqual(expect.objectContaining({ mode: "open", importTarget: null }))
        expect(screen.queryByTestId("file-drop-overlay")).toBeNull()
    })

    it("should only accept cc.json files", async () => {
        // Arrange
        await renderOverlay()

        // Act
        window.dispatchEvent(dragEvent("drop", [new File(["x"], "notes.txt")]))
        await settle()

        // Assert
        expect(testBed.toastService.show).toHaveBeenCalledWith("Only .cc.json and .cc.json.gz files can be opened.", "warning")
        expect(testBed.bridge.calls.filter(call => call.name === "openDroppedFile")).toEqual([])
    })

    it("should toast a dropped file the shell refuses", async () => {
        // Arrange
        await renderOverlay()
        testBed.bridge.failWith("openDroppedFile", {
            code: "BAD_REQUEST",
            message: "The dropped item is not a file that can be read.",
            details: {}
        })

        // Act
        window.dispatchEvent(dragEvent("drop", [new File(["{}"], "map.cc.json.gz")]))
        await settle()

        // Assert
        expect(testBed.toastService.show).toHaveBeenCalledWith("The dropped item is not a file that can be read.", "error")
    })

    it("should leave drags to the page in the web build", async () => {
        // Arrange
        TestBed.configureTestingModule({
            providers: [
                { provide: DESKTOP_BRIDGE, useValue: null },
                { provide: LoadFilesUseCase, useValue: {} },
                { provide: Router, useValue: {} }
            ]
        })
        const fixture = TestBed.createComponent(FileDropOverlayComponent)
        fixture.autoDetectChanges()
        const dragOver = dragEvent("dragover", [new File(["{}"], "map.cc.json")])
        const drop = dragEvent("drop", [new File(["{}"], "map.cc.json")])

        // Act
        window.dispatchEvent(dragOver)
        window.dispatchEvent(drop)
        await fixture.whenStable()

        // Assert
        expect(dragOver.defaultPrevented).toBe(false)
        expect(drop.defaultPrevented).toBe(false)
        expect(screen.queryByTestId("file-drop-overlay")).toBeNull()
    })
})
