import { render, screen } from "@testing-library/angular"
import userEvent from "@testing-library/user-event"
import { CollapsedInspectorStripComponent } from "./collapsedInspectorStrip.component"

describe("CollapsedInspectorStripComponent", () => {
    async function renderStrip(hasUnseenSelection = false) {
        const expand = jest.fn()
        await render(CollapsedInspectorStripComponent, {
            inputs: { name: "invoice.ts", path: "/root/invoice.ts", hasUnseenSelection },
            on: { expand }
        })
        return { expand }
    }

    it("should show the selected name with its full path as title", async () => {
        // Act
        await renderStrip()

        // Assert
        const name = screen.getByTestId("inspector-collapsed-name")
        expect(name.textContent.trim()).toBe("invoice.ts")
        expect(name.getAttribute("title")).toBe("/root/invoice.ts")
    })

    it("should put the Show inspector button on the side facing the map, before the name", async () => {
        // Act
        await renderStrip()

        // Assert
        const button = screen.getByRole("button", { name: "Show inspector" })
        const nameFollowsButton =
            button.compareDocumentPosition(screen.getByTestId("inspector-collapsed-name")) & Node.DOCUMENT_POSITION_FOLLOWING
        expect(nameFollowsButton).toBeTruthy()
        expect(button.querySelector(".fa-circle-info")).not.toBe(null)
        expect(button.getAttribute("title")).toBe("Show inspector")
    })

    it("should ask to expand when the button is clicked", async () => {
        // Arrange
        const { expand } = await renderStrip()

        // Act
        await userEvent.click(screen.getByRole("button", { name: "Show inspector" }))

        // Assert
        expect(expand).toHaveBeenCalledTimes(1)
    })

    it("should show no dot while the selection shown is the one seen", async () => {
        // Act
        await renderStrip(false)

        // Assert
        expect(screen.queryByTestId("inspector-selection-changed")).toBe(null)
    })

    it("should show a dot and say so in the title while the selection changed unseen", async () => {
        // Act
        await renderStrip(true)

        // Assert
        const dot = screen.getByTestId("inspector-selection-changed")
        expect(dot.classList).toContain("badge-primary")
        expect(dot.classList).toContain("badge-xs")
        const button = screen.getByRole("button", { name: "Show inspector — selection changed" })
        expect(button.getAttribute("title")).toBe("Show inspector — selection changed")
    })
})
