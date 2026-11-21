import { TestBed } from "@angular/core/testing"
import { MockStore, provideMockStore } from "@ngrx/store/testing"
import { CodeMapNode } from "../../../model/codeCharta.model"
import { selectedNodeSelector } from "../../../renderer/renderModel/selectedNode.selector"
import { ThreeRendererService, ThreeSceneService } from "../../../renderer/threeViewer/threeViewer.facade"
import { InspectorVisibilityService } from "./inspectorVisibility.service"

describe("InspectorVisibilityService", () => {
    let service: InspectorVisibilityService
    let mockStore: MockStore
    let threeSceneService: ThreeSceneService
    let threeRendererService: ThreeRendererService

    const node = { name: "invoice.ts", path: "/root/invoice.ts" } as CodeMapNode

    beforeEach(() => {
        threeSceneService = { clearSelection: jest.fn() } as unknown as ThreeSceneService
        threeRendererService = { render: jest.fn() } as unknown as ThreeRendererService

        TestBed.configureTestingModule({
            providers: [
                provideMockStore({ selectors: [{ selector: selectedNodeSelector, value: undefined }] }),
                { provide: ThreeSceneService, useValue: threeSceneService },
                { provide: ThreeRendererService, useValue: threeRendererService }
            ]
        })

        mockStore = TestBed.inject(MockStore)
        service = TestBed.inject(InspectorVisibilityService)
    })

    function selectBuilding() {
        mockStore.overrideSelector(selectedNodeSelector, node)
        mockStore.refreshState()
    }

    function deselectBuilding() {
        mockStore.overrideSelector(selectedNodeSelector, undefined)
        mockStore.refreshState()
    }

    it("should be hidden when no building is selected", () => {
        // Arrange, Act & Assert
        expect(service.isVisible()).toBe(false)
    })

    it("should become visible when a building is selected", () => {
        // Act
        selectBuilding()

        // Assert
        expect(service.isVisible()).toBe(true)
    })

    it("should hide when the building is deselected", () => {
        // Arrange
        selectBuilding()

        // Act
        deselectBuilding()

        // Assert
        expect(service.isVisible()).toBe(false)
    })

    it("should deselect the building in the scene and re-render when closing", () => {
        // Arrange
        selectBuilding()

        // Act
        service.close()

        // Assert
        expect(threeSceneService.clearSelection).toHaveBeenCalled()
        expect(threeRendererService.render).toHaveBeenCalled()
    })

    it("should stay visible but no longer expanded when collapsed", () => {
        // Arrange
        selectBuilding()

        // Act
        service.collapse()

        // Assert
        expect(service.isVisible()).toBe(true)
        expect(service.isCollapsed()).toBe(true)
        expect(service.isExpanded()).toBe(false)
    })

    it("should expand again with its building still selected", () => {
        // Arrange
        selectBuilding()
        service.collapse()

        // Act
        service.expand()

        // Assert
        expect(service.isExpanded()).toBe(true)
    })

    it("should stay collapsed while another building is selected", () => {
        // Arrange
        selectBuilding()
        service.collapse()

        // Act
        mockStore.overrideSelector(selectedNodeSelector, { name: "other.ts", path: "/root/other.ts" } as CodeMapNode)
        mockStore.refreshState()

        // Assert
        expect(service.isCollapsed()).toBe(true)
    })

    it("should open expanded for the next selection once the building was deselected", () => {
        // Arrange
        selectBuilding()
        service.collapse()
        deselectBuilding()

        // Act
        selectBuilding()

        // Assert
        expect(service.isExpanded()).toBe(true)
    })

    it("should not count as collapsed while nothing is selected", () => {
        // Act
        service.collapse()

        // Assert
        expect(service.isCollapsed()).toBe(false)
    })

    function selectOtherBuilding() {
        mockStore.overrideSelector(selectedNodeSelector, { name: "other.ts", path: "/root/other.ts" } as CodeMapNode)
        mockStore.refreshState()
    }

    it("should mark a selection made while collapsed as not yet seen", () => {
        // Arrange
        selectBuilding()
        service.collapse()

        // Act
        selectOtherBuilding()

        // Assert
        expect(service.hasUnseenSelection()).toBe(true)
    })

    it("should count the building shown when it collapsed as seen", () => {
        // Arrange
        selectBuilding()

        // Act
        service.collapse()

        // Assert
        expect(service.hasUnseenSelection()).toBe(false)
    })

    it("should count a selection as seen once the inspector is expanded", () => {
        // Arrange
        selectBuilding()
        service.collapse()
        selectOtherBuilding()

        // Act
        service.expand()

        // Assert
        expect(service.hasUnseenSelection()).toBe(false)
    })

    it("should count the selection as seen again when the building shown before is selected again", () => {
        // Arrange
        selectBuilding()
        service.collapse()
        selectOtherBuilding()

        // Act
        selectBuilding()

        // Assert
        expect(service.hasUnseenSelection()).toBe(false)
    })
})
