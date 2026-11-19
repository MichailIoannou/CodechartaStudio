import { render, screen } from "@testing-library/angular"
import userEvent from "@testing-library/user-event"
import { BarToolComponent } from "./barTool.component"

type BarToolInputs = Partial<{
    label: string
    icon: string
    tooltip: string | null
    disabled: boolean
    pressed: boolean | null
    expanded: boolean | null
    controls: string | null
    highlighted: boolean
    revealed: boolean
    testId: string | null
}>

function renderTool(inputs: BarToolInputs = {}) {
    return render(BarToolComponent, { inputs: { label: "Center map", icon: "fa fa-compass", ...inputs } })
}

function tool(): HTMLButtonElement {
    return screen.getByRole("button", { name: "Center map" }) as HTMLButtonElement
}

describe("BarToolComponent", () => {
    it("should show only its icon in a square button named by its label", async () => {
        // Act
        await renderTool()

        // Assert
        expect(tool().textContent.trim()).toBe("")
        expect(tool().firstElementChild.className).toBe("fa fa-compass text-sm")
        expect(tool().classList).toContain("btn-square")
    })

    it("should explain itself in its tooltip by its label unless given a tooltip", async () => {
        // Act
        await renderTool()

        // Assert
        expect(tool().getAttribute("title")).toBe("Center map")
    })

    it("should emit activated when the reader clicks it", async () => {
        // Arrange
        const { fixture } = await renderTool()
        const activated = jest.fn()
        fixture.componentInstance.activated.subscribe(activated)

        // Act
        await userEvent.click(tool())

        // Assert
        expect(activated).toHaveBeenCalledTimes(1)
    })

    it("should neither emit nor accept clicks while disabled", async () => {
        // Arrange
        const { fixture } = await renderTool({ disabled: true })
        const activated = jest.fn()
        fixture.componentInstance.activated.subscribe(activated)

        // Act
        await userEvent.click(tool())

        // Assert
        expect(tool().disabled).toBe(true)
        expect(activated).not.toHaveBeenCalled()
    })

    it("should leave out the pressed and expanded states unless given", async () => {
        // Act
        await renderTool()

        // Assert
        expect(tool().hasAttribute("aria-pressed")).toBe(false)
        expect(tool().hasAttribute("aria-expanded")).toBe(false)
        expect(tool().hasAttribute("aria-controls")).toBe(false)
    })

    it("should mark a pressed toggle as pressed and tint it", async () => {
        // Act
        await renderTool({ pressed: true, tooltip: "Disable flashlight hover effect" })

        // Assert
        expect(tool().getAttribute("aria-pressed")).toBe("true")
        expect(tool().getAttribute("title")).toBe("Disable flashlight hover effect")
        expect(tool().classList).toContain("btn-active")
        expect(tool().classList).not.toContain("btn-ghost")
    })

    it("should name the panel it opens and tint it while that panel is open", async () => {
        // Act
        await renderTool({ expanded: true, controls: "legend-panel" })

        // Assert
        expect(tool().getAttribute("aria-expanded")).toBe("true")
        expect(tool().getAttribute("aria-controls")).toBe("legend-panel")
        expect(tool().classList).toContain("btn-active")
    })

    it("should color a highlighted tool without tinting its background", async () => {
        // Act
        await renderTool({ highlighted: true })

        // Assert
        expect(tool().classList).toContain("text-secondary")
        expect(tool().classList).not.toContain("btn-active")
    })

    it("should hide and make inert a tool that is not revealed", async () => {
        // Act
        const { fixture } = await renderTool({ revealed: false, testId: "center-map" })

        // Assert
        const host: HTMLElement = fixture.nativeElement
        expect(host.hasAttribute("inert")).toBe(true)
        expect(host.classList).toContain("hidden")
        expect(screen.getByTestId("center-map")).toBe(tool())
    })

    it("should show a revealed tool", async () => {
        // Act
        const { fixture } = await renderTool()

        // Assert
        const host: HTMLElement = fixture.nativeElement
        expect(host.hasAttribute("inert")).toBe(false)
        expect(host.classList).not.toContain("hidden")
    })
})
