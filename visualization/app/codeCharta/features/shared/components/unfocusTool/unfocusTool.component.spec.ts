import { render, screen } from "@testing-library/angular"
import userEvent from "@testing-library/user-event"
import { UnfocusToolComponent } from "./unfocusTool.component"

describe("UnfocusToolComponent", () => {
    it("should reveal the unfocus tool while something is focused and report the click", async () => {
        // Arrange
        const { fixture } = await render(UnfocusToolComponent, { inputs: { isFocused: true, testId: "bar-unfocus" } })
        const unfocused = jest.fn()
        fixture.componentInstance.unfocused.subscribe(unfocused)

        // Act
        await userEvent.click(screen.getByRole("button", { name: "Unfocus" }))

        // Assert
        expect(screen.getByTestId("bar-unfocus").closest("cc-bar-tool").hasAttribute("inert")).toBe(false)
        expect(unfocused).toHaveBeenCalledTimes(1)
    })

    it("should hide the unfocus tool while nothing is focused", async () => {
        // Act
        await render(UnfocusToolComponent, { inputs: { isFocused: false, testId: "bar-unfocus" } })

        // Assert
        expect(screen.getByTestId("bar-unfocus").closest("cc-bar-tool").hasAttribute("inert")).toBe(true)
    })

    it("should mark itself as revealed only while something is focused, so the tools make room for it", async () => {
        // Arrange
        const { fixture } = await render(UnfocusToolComponent, { inputs: { isFocused: false, testId: "bar-unfocus" } })
        const host: HTMLElement = fixture.nativeElement
        const whileUnfocused = host.hasAttribute("data-revealed")

        // Act
        fixture.componentRef.setInput("isFocused", true)
        fixture.detectChanges()

        // Assert
        expect(whileUnfocused).toBe(false)
        expect(host.hasAttribute("data-revealed")).toBe(true)
    })
})
