import { Component, signal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { CSS_VARIABLE_HOST } from "../cssVariableHost"
import { registerSidePanel, SidePanelRoom, SidePanelSide } from "./sidePanelRoom.service"

const DEFAULT_PANEL_WIDTH_PX = 326

class FakePanel {
    readonly isOpen = signal(false)
    readonly coveredWidthPx = signal(DEFAULT_PANEL_WIDTH_PX)
    readonly collapse = jest.fn(() => this.isOpen.set(false))

    constructor(readonly side: SidePanelSide) {}
}

const explorer = new FakePanel("left")
const inspector = new FakePanel("right")

@Component({ selector: "cc-test-explorer", template: "" })
class TestExplorerComponent {
    constructor() {
        registerSidePanel(explorer)
    }
}

@Component({ selector: "cc-test-inspector", template: "" })
class TestInspectorComponent {
    constructor() {
        registerSidePanel(inspector)
    }
}

@Component({
    selector: "cc-test-view",
    template: "<cc-test-explorer /><cc-test-inspector />",
    imports: [TestExplorerComponent, TestInspectorComponent],
    providers: [SidePanelRoom]
})
class TestViewComponent {}

function setWindowWidth(width: number) {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: width })
}

function resizeWindowTo(width: number) {
    setWindowWidth(width)
    window.dispatchEvent(new Event("resize"))
}

describe("SidePanelRoom", () => {
    const originalWidth = window.innerWidth

    function renderView({ isExplorerOpen, isInspectorOpen }: { isExplorerOpen: boolean; isInspectorOpen: boolean }) {
        explorer.isOpen.set(isExplorerOpen)
        inspector.isOpen.set(isInspectorOpen)
        const fixture = TestBed.createComponent(TestViewComponent)
        fixture.detectChanges()
        return fixture
    }

    function open(panel: FakePanel) {
        panel.isOpen.set(true)
        TestBed.tick()
    }

    beforeEach(() => {
        jest.clearAllMocks()
        explorer.coveredWidthPx.set(DEFAULT_PANEL_WIDTH_PX)
        inspector.coveredWidthPx.set(DEFAULT_PANEL_WIDTH_PX)
        TestBed.configureTestingModule({ providers: [{ provide: CSS_VARIABLE_HOST, useValue: document.body }] })
    })

    afterEach(() => setWindowWidth(originalWidth))

    it("should collapse the explorer when opening the inspector leaves less than 30rem of map", () => {
        // Arrange
        setWindowWidth(900)
        renderView({ isExplorerOpen: true, isInspectorOpen: false })

        // Act
        open(inspector)

        // Assert
        expect(explorer.collapse).toHaveBeenCalledTimes(1)
        expect(inspector.collapse).not.toHaveBeenCalled()
    })

    it("should collapse the inspector when opening the explorer leaves less than 30rem of map", () => {
        // Arrange
        setWindowWidth(900)
        renderView({ isExplorerOpen: false, isInspectorOpen: true })

        // Act
        open(explorer)

        // Assert
        expect(inspector.collapse).toHaveBeenCalledTimes(1)
        expect(explorer.collapse).not.toHaveBeenCalled()
    })

    it("should let the opening inspector give way itself when the reader clicked inside the explorer", () => {
        // Arrange
        setWindowWidth(900)
        const fixture = renderView({ isExplorerOpen: true, isInspectorOpen: false })
        const explorerElement: HTMLElement = fixture.nativeElement.querySelector("cc-test-explorer")
        explorerElement.dispatchEvent(new Event("pointerdown", { bubbles: true }))

        // Act
        open(inspector)

        // Assert
        expect(inspector.collapse).toHaveBeenCalledTimes(1)
        expect(explorer.collapse).not.toHaveBeenCalled()
    })

    it("should let the opening inspector give way itself while the focus is inside the explorer", () => {
        // Arrange
        setWindowWidth(900)
        const fixture = renderView({ isExplorerOpen: true, isInspectorOpen: false })
        const explorerElement: HTMLElement = fixture.nativeElement.querySelector("cc-test-explorer")
        explorerElement.dispatchEvent(new FocusEvent("focusin", { bubbles: true }))

        // Act
        open(inspector)

        // Assert
        expect(inspector.collapse).toHaveBeenCalledTimes(1)
    })

    it("should collapse the explorer once the reader clicked elsewhere after working in it", () => {
        // Arrange
        setWindowWidth(900)
        const fixture = renderView({ isExplorerOpen: true, isInspectorOpen: false })
        fixture.nativeElement.querySelector("cc-test-explorer").dispatchEvent(new Event("pointerdown", { bubbles: true }))
        document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }))

        // Act
        open(inspector)

        // Assert
        expect(explorer.collapse).toHaveBeenCalledTimes(1)
        expect(inspector.collapse).not.toHaveBeenCalled()
    })

    it("should keep both panels open when at least 30rem of map stay free", () => {
        // Arrange
        setWindowWidth(1150)
        renderView({ isExplorerOpen: true, isInspectorOpen: false })

        // Act
        open(inspector)

        // Assert
        expect(explorer.collapse).not.toHaveBeenCalled()
    })

    it("should count the width a panel was dragged to", () => {
        // Arrange
        setWindowWidth(1150)
        explorer.coveredWidthPx.set(500)
        renderView({ isExplorerOpen: true, isInspectorOpen: false })

        // Act
        open(inspector)

        // Assert
        expect(explorer.collapse).toHaveBeenCalledTimes(1)
    })

    it("should collapse nothing when only the opened panel is open, however narrow the window", () => {
        // Arrange
        setWindowWidth(600)
        renderView({ isExplorerOpen: false, isInspectorOpen: false })

        // Act
        open(inspector)

        // Assert
        expect(explorer.collapse).not.toHaveBeenCalled()
        expect(inspector.collapse).not.toHaveBeenCalled()
    })

    it("should collapse the inspector first when a resize leaves too little map", () => {
        // Arrange
        setWindowWidth(1280)
        renderView({ isExplorerOpen: true, isInspectorOpen: true })

        // Act
        resizeWindowTo(900)

        // Assert
        expect(inspector.collapse).toHaveBeenCalledTimes(1)
        expect(explorer.collapse).not.toHaveBeenCalled()
    })

    it("should collapse nothing on a resize that leaves enough map", () => {
        // Arrange
        setWindowWidth(1280)
        renderView({ isExplorerOpen: true, isInspectorOpen: true })

        // Act
        resizeWindowTo(1200)

        // Assert
        expect(inspector.collapse).not.toHaveBeenCalled()
    })

    it("should collapse nothing on a resize while one side is closed", () => {
        // Arrange
        setWindowWidth(1280)
        renderView({ isExplorerOpen: true, isInspectorOpen: false })

        // Act
        resizeWindowTo(700)

        // Assert
        expect(explorer.collapse).not.toHaveBeenCalled()
    })

    it("should ignore a resize while its view is detached", () => {
        // Arrange
        TestBed.overrideProvider(CSS_VARIABLE_HOST, { useValue: document.createElement("div") })
        setWindowWidth(1280)
        renderView({ isExplorerOpen: true, isInspectorOpen: true })

        // Act
        resizeWindowTo(900)

        // Assert
        expect(inspector.collapse).not.toHaveBeenCalled()
    })

    it("should forget a panel once it is gone", () => {
        // Arrange
        setWindowWidth(1280)
        const fixture = renderView({ isExplorerOpen: true, isInspectorOpen: true })
        fixture.destroy()

        // Act
        resizeWindowTo(900)

        // Assert
        expect(inspector.collapse).not.toHaveBeenCalled()
    })

    it("should let a panel outside any room open without effect", () => {
        // Arrange
        setWindowWidth(900)
        explorer.isOpen.set(true)
        TestBed.createComponent(TestInspectorComponent).detectChanges()

        // Act
        open(inspector)

        // Assert
        expect(explorer.collapse).not.toHaveBeenCalled()
    })
})
