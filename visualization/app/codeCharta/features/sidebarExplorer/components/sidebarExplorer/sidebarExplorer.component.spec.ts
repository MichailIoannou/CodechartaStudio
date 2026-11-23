import { TestBed } from "@angular/core/testing"
import { render, screen } from "@testing-library/angular"
import userEvent from "@testing-library/user-event"
import { ExplorerMode, FILES_EXPLORER_MODE } from "../../explorerModes"
import { provideExplorerPortsMock } from "../../explorerPorts.mocks"
import { ExplorerCollapseService } from "../../services/explorerCollapse.service"
import { ExplorerModeService } from "../../services/explorerMode.service"
import { EXPLORER_DEFAULT_WIDTH, ExplorerWidthService } from "../../services/explorerWidth.service"
import { COLLAPSED_STRIP_WIDTH_PX, SidebarExplorerComponent } from "./sidebarExplorer.component"

const WORDS_MODE: ExplorerMode = {
    id: "words",
    label: "Words",
    icon: "fa-solid fa-font",
    searchPlaceholder: "payment, invoice",
    searchAriaLabel: "Search words"
}

describe("SidebarExplorerComponent", () => {
    const configureWithCapabilities = (capabilities?: {
        showRules?: boolean
        showSearch?: boolean
        showCounts?: boolean
        canFlatten?: boolean
        modes?: ExplorerMode[]
    }) => {
        TestBed.configureTestingModule({
            imports: [SidebarExplorerComponent],
            providers: [...provideExplorerPortsMock({ capabilities })]
        })
    }

    beforeEach(() => {
        localStorage.clear()
        configureWithCapabilities()
    })

    it("should compose header, search bar, sort control and tree by default", async () => {
        // Arrange & Act
        const { container } = await render(SidebarExplorerComponent)

        // Assert
        expect(container.querySelector("cc-explorer-header")).not.toBe(null)
        expect(container.querySelector("cc-explorer-search-bar")).not.toBe(null)
        expect(container.querySelector("cc-explorer-sort-control")).not.toBe(null)
        expect(container.querySelector("cc-explorer-tree")).not.toBe(null)
    })

    it("should drop the search bar and the sort control while a mode that hides them is open", async () => {
        // Arrange
        TestBed.resetTestingModule()
        const hidingMode: ExplorerMode = { ...WORDS_MODE, hidesListTools: true }
        configureWithCapabilities({ modes: [FILES_EXPLORER_MODE, hidingMode] })
        const { container, fixture } = await render(SidebarExplorerComponent)

        // Act
        fixture.debugElement.injector.get(ExplorerModeService).activate(hidingMode.id)
        fixture.detectChanges()

        // Assert
        expect(container.querySelector("cc-explorer-search-bar")).toBe(null)
        expect(container.querySelector("cc-explorer-sort-control")).toBe(null)
    })

    it("should render the rules popovers and search bar by default", async () => {
        // Arrange & Act
        const { container } = await render(SidebarExplorerComponent)

        // Assert
        expect(container.querySelectorAll("cc-rules-popover").length).toBe(2)
        expect(container.querySelector("cc-explorer-search-bar")).not.toBe(null)
    })

    it("should render only the exclusion rules where the view cannot flatten", async () => {
        // Arrange
        TestBed.resetTestingModule()
        configureWithCapabilities({ canFlatten: false })

        // Act
        const { container } = await render(SidebarExplorerComponent)

        // Assert
        const kinds = [...container.querySelectorAll("cc-rules-popover")].map(popover => popover.getAttribute("kind"))
        expect(kinds).toEqual(["exclude"])
    })

    it("should hide the rules popovers when the view does not want them", async () => {
        // Arrange
        TestBed.resetTestingModule()
        configureWithCapabilities({ showRules: false })

        // Act
        const { container } = await render(SidebarExplorerComponent)

        // Assert
        expect(container.querySelectorAll("cc-rules-popover").length).toBe(0)
        expect(container.querySelector("cc-explorer-header")).not.toBe(null)
        expect(container.querySelector("cc-explorer-sort-control")).not.toBe(null)
        expect(container.querySelector("cc-explorer-tree")).not.toBe(null)
    })

    it("should hide the search bar when the view does not want it", async () => {
        // Arrange
        TestBed.resetTestingModule()
        configureWithCapabilities({ showSearch: false })

        // Act
        const { container } = await render(SidebarExplorerComponent)

        // Assert
        expect(container.querySelector("cc-explorer-search-bar")).toBe(null)
    })

    it("should hide the count chips when the view does not want them", async () => {
        // Arrange
        TestBed.resetTestingModule()
        configureWithCapabilities({ showCounts: false })

        // Act
        const { container } = await render(SidebarExplorerComponent)

        // Assert
        expect(container.querySelectorAll("cc-explorer-count-chip").length).toBe(0)
        expect(container.querySelector("cc-explorer-header")).not.toBe(null)
    })

    it("should render the count chips by default", async () => {
        // Arrange & Act
        const { container } = await render(SidebarExplorerComponent)

        // Assert
        expect(container.querySelectorAll("cc-explorer-count-chip").length).toBe(3)
    })

    it("should size the expanded explorer without a file-extension bar unless one publishes its height", async () => {
        // Arrange & Act
        const { fixture } = await render(SidebarExplorerComponent)
        const host = fixture.nativeElement as HTMLElement

        // Assert — the domain view mounts no file-extension bar, so an absent bar must contribute 0px
        expect(host.style.height).toContain("var(--cc-file-extension-bar-height, 0px)")
    })

    it("should tell the floating bars the width it covers, and nothing once collapsed to its top strip", async () => {
        // Arrange
        const { detectChanges } = await render(SidebarExplorerComponent)
        const coveredWhileOpen = document.documentElement.style.getPropertyValue("--cc-bar-inset-left")

        // Act
        TestBed.inject(ExplorerCollapseService).toggle()
        detectChanges()

        // Assert
        expect(coveredWhileOpen).toBe(`${EXPLORER_DEFAULT_WIDTH + 6}px`)
        expect(document.documentElement.style.getPropertyValue("--cc-bar-inset-left")).toBe("0px")
    })

    it("should show the expand button and hide the panel's content while collapsed", async () => {
        // Arrange
        const { detectChanges } = await render(SidebarExplorerComponent)
        const collapseService = TestBed.inject(ExplorerCollapseService)

        // Act
        collapseService.toggle()
        detectChanges()

        // Assert
        expect(screen.getByTestId("explorer-expand-button")).not.toBe(null)
        expect(screen.getByTestId("explorer-panel-content").style.getPropertyValue("content-visibility")).toBe("hidden")
    })

    it("should keep the tree it built when the explorer collapses and expands again", async () => {
        // Arrange
        const { container, detectChanges } = await render(SidebarExplorerComponent)
        const collapseService = TestBed.inject(ExplorerCollapseService)
        const treeBeforeCollapse = container.querySelector("cc-explorer-tree")

        // Act
        collapseService.toggle()
        detectChanges()
        collapseService.toggle()
        detectChanges()

        // Assert
        expect(container.querySelector("cc-explorer-tree")).toBe(treeBeforeCollapse)
        expect(screen.getByTestId("explorer-panel-content").getAttribute("style") ?? "").not.toContain("content-visibility")
    })

    it("should keep its expanded size for the hidden content so re-opening does not lay it out again", async () => {
        // Arrange
        const { detectChanges } = await render(SidebarExplorerComponent)
        TestBed.inject(ExplorerWidthService).setWidth(420)

        // Act
        TestBed.inject(ExplorerCollapseService).toggle()
        detectChanges()

        // Assert
        const content = screen.getByTestId("explorer-panel-content")
        expect(content.style.width).toBe("420px")
        expect(content.style.height).toContain("var(--cc-bars-height, 49px)")
    })

    it("should clip the open panel's content rather than its host, so collapsing keeps the content's layout", async () => {
        // Arrange & Act
        const { fixture } = await render(SidebarExplorerComponent)
        const host = fixture.nativeElement as HTMLElement

        // Assert
        expect(host.classList.contains("overflow-hidden")).toBe(false)
        expect(screen.getByTestId("explorer-panel-content").classList).toContain("overflow-hidden")
    })

    it("should keep the same elements beside the panel's content while collapsing and expanding", async () => {
        // Arrange
        const { fixture, detectChanges } = await render(SidebarExplorerComponent)
        const host = fixture.nativeElement as HTMLElement
        const content = screen.getByTestId("explorer-panel-content")
        const childrenBefore = [...host.children]
        const contentChildrenBefore = [...content.children]

        // Act
        TestBed.inject(ExplorerCollapseService).toggle()
        detectChanges()
        const childrenWhileCollapsed = [...host.children]
        const contentChildrenWhileCollapsed = [...content.children]

        // Assert
        expect(childrenWhileCollapsed).toHaveLength(childrenBefore.length)
        expect(childrenWhileCollapsed.every((child, index) => child === childrenBefore[index])).toBe(true)
        expect(contentChildrenWhileCollapsed).toHaveLength(contentChildrenBefore.length)
        expect(contentChildrenWhileCollapsed.every((child, index) => child === contentChildrenBefore[index])).toBe(true)
    })

    it("should leave the collapsed strip with a single search bar", async () => {
        // Arrange
        const { container, detectChanges } = await render(SidebarExplorerComponent)

        // Act
        TestBed.inject(ExplorerCollapseService).toggle()
        detectChanges()

        // Assert
        expect(container.querySelector("cc-explorer-search-bar")).toBe(null)
        expect(container.querySelectorAll("cc-rules-popover").length).toBe(0)
    })

    it("should not clip its children while collapsed", async () => {
        // Arrange — collapsed the host is one short row, so clipping would swallow anything taller
        const { fixture, detectChanges } = await render(SidebarExplorerComponent)
        const host = fixture.nativeElement as HTMLElement

        // Act
        TestBed.inject(ExplorerCollapseService).toggle()
        detectChanges()

        // Assert
        expect(host.classList.contains("overflow-hidden")).toBe(false)
    })

    it("should apply the explorer width from the width service to the host", async () => {
        // Arrange & Act
        const { fixture } = await render(SidebarExplorerComponent)
        const host = fixture.nativeElement as HTMLElement

        // Assert
        expect(host.style.width).toBe(`${EXPLORER_DEFAULT_WIDTH}px`)
    })

    it("should resize the explorer when dragging the resize handle", async () => {
        // Arrange
        await render(SidebarExplorerComponent)
        const widthService = TestBed.inject(ExplorerWidthService)
        const handle = screen.getByTestId("explorer-resize-handle")

        // Act
        handle.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }))
        window.dispatchEvent(new MouseEvent("pointermove", { clientX: 480 }))
        window.dispatchEvent(new MouseEvent("pointerup"))

        // Assert
        expect(widthService.width()).toBe(480)
    })

    it("should stop resizing when the pointer is released anywhere, e.g. over the top bar", async () => {
        // Arrange
        await render(SidebarExplorerComponent)
        const widthService = TestBed.inject(ExplorerWidthService)
        const handle = screen.getByTestId("explorer-resize-handle")
        handle.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }))
        window.dispatchEvent(new MouseEvent("pointermove", { clientX: 480 }))

        // Act
        window.dispatchEvent(new MouseEvent("pointerup"))
        window.dispatchEvent(new MouseEvent("pointermove", { clientX: 650 }))

        // Assert
        expect(widthService.width()).toBe(480)
    })

    it("should use a fixed collapsed width but keep the dragged width for when it expands again", async () => {
        // Arrange — a wide-dragged panel would otherwise leave a needlessly long collapsed strip
        const { fixture, detectChanges } = await render(SidebarExplorerComponent)
        const host = fixture.nativeElement as HTMLElement
        const widthService = TestBed.inject(ExplorerWidthService)
        const collapseService = TestBed.inject(ExplorerCollapseService)
        widthService.setWidth(600)
        detectChanges()

        // Act
        collapseService.toggle()
        detectChanges()

        // Assert — the strip is the fixed collapsed width, but the stored dragged width is untouched
        expect(host.style.width).toBe(`${COLLAPSED_STRIP_WIDTH_PX}px`)
        expect(widthService.width()).toBe(600)
    })

    it("should keep the collapsed width fixed regardless of the dragged width", async () => {
        // Arrange — the minimized bar must be stable, not follow how wide the user dragged the panel
        const { fixture, detectChanges } = await render(SidebarExplorerComponent)
        const host = fixture.nativeElement as HTMLElement
        const widthService = TestBed.inject(ExplorerWidthService)
        const collapseService = TestBed.inject(ExplorerCollapseService)
        collapseService.toggle()

        // Act & Assert — narrow or wide, the collapsed strip stays the fixed width
        widthService.setWidth(260)
        detectChanges()
        expect(host.style.width).toBe(`${COLLAPSED_STRIP_WIDTH_PX}px`)

        widthService.setWidth(700)
        detectChanges()
        expect(host.style.width).toBe(`${COLLAPSED_STRIP_WIDTH_PX}px`)
    })

    it("should restore the resized width when expanded again", async () => {
        // Arrange
        const { fixture, detectChanges } = await render(SidebarExplorerComponent)
        const host = fixture.nativeElement as HTMLElement
        const widthService = TestBed.inject(ExplorerWidthService)
        const collapseService = TestBed.inject(ExplorerCollapseService)
        widthService.setWidth(600)
        collapseService.toggle()
        detectChanges()

        // Act
        collapseService.toggle()
        detectChanges()

        // Assert
        expect(host.style.width).toBe("600px")
    })

    it("should ignore pointer movement when no resize is in progress", async () => {
        // Arrange
        await render(SidebarExplorerComponent)
        const widthService = TestBed.inject(ExplorerWidthService)

        // Act
        window.dispatchEvent(new MouseEvent("pointermove", { clientX: 480 }))

        // Assert
        expect(widthService.width()).toBe(EXPLORER_DEFAULT_WIDTH)
    })

    it("should reset the explorer width on double-click of the resize handle", async () => {
        // Arrange
        const { detectChanges } = await render(SidebarExplorerComponent)
        const widthService = TestBed.inject(ExplorerWidthService)
        widthService.setWidth(500)
        detectChanges()
        const handle = screen.getByTestId("explorer-resize-handle")

        // Act
        handle.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }))
        detectChanges()

        // Assert
        expect(widthService.width()).toBe(EXPLORER_DEFAULT_WIDTH)
    })

    it("should expand back to the full layout when the expand button is clicked", async () => {
        // Arrange
        const { container, detectChanges } = await render(SidebarExplorerComponent)
        const collapseService = TestBed.inject(ExplorerCollapseService)
        collapseService.toggle()
        detectChanges()

        // Act
        await userEvent.click(screen.getByTestId("explorer-expand-button"))
        detectChanges()

        // Assert
        expect(collapseService.isCollapsed()).toBe(false)
        expect(container.querySelector("cc-explorer-header")).not.toBe(null)
        expect(container.querySelector("cc-explorer-tree")).not.toBe(null)
    })

    it("should render the projected body instead of the tree while browsing another mode", async () => {
        // Arrange
        TestBed.resetTestingModule()
        configureWithCapabilities({ modes: [FILES_EXPLORER_MODE, WORDS_MODE] })
        const { container, detectChanges } = await render(SidebarExplorerComponent)

        // Act
        TestBed.inject(ExplorerModeService).activate(WORDS_MODE.id)
        detectChanges()

        // Assert — search and sort stay up, acting on whatever the active mode browses
        expect(container.querySelector("cc-explorer-tree")).toBe(null)
        expect(container.querySelector("cc-explorer-sort-control")).not.toBe(null)
        expect(container.querySelector("cc-explorer-search-bar")).not.toBe(null)
    })
})
