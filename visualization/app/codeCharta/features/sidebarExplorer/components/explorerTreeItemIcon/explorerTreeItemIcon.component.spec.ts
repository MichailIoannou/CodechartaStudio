import { render } from "@testing-library/angular"
import { ExplorerTreeItemIconComponent } from "./explorerTreeItemIcon.component"

describe("ExplorerTreeItemIconComponent", () => {
    const iconOf = (container: Element) => container.querySelector("span") as HTMLElement

    it("should let an unmarked folder inherit the text color", async () => {
        // Arrange & Act
        const { container } = await render(ExplorerTreeItemIconComponent, { inputs: { isFolder: true, isOpen: false } })

        // Assert
        expect(iconOf(container).style.color).toBe("")
        expect(iconOf(container).className).toBe("fa fa-folder")
    })

    it("should paint a marked folder in its marking color", async () => {
        // Arrange & Act
        const { container } = await render(ExplorerTreeItemIconComponent, {
            inputs: { isFolder: true, isOpen: true, markingColor: "#ff0000" }
        })

        // Assert
        expect(iconOf(container).style.color).toBe("rgb(255, 0, 0)")
        expect(iconOf(container).className).toBe("fa fa-folder-open")
    })

    it("should fade the icon of an inactive row with the text color", async () => {
        // Arrange
        const inputs = { isFolder: false, isOpen: false, isInactive: true, markingColor: "#ff0000" }

        // Act
        const { container } = await render(ExplorerTreeItemIconComponent, { inputs })

        // Assert
        expect(iconOf(container).getAttribute("style")).toContain("var(--color-base-content)")
        expect(iconOf(container).className).toBe("fa fa-file-o")
    })

    it("should leave a file icon in the text color", async () => {
        // Arrange & Act
        const { container } = await render(ExplorerTreeItemIconComponent, { inputs: { isFolder: false, isOpen: false } })

        // Assert
        expect(iconOf(container).style.color).toBe("")
    })
})
