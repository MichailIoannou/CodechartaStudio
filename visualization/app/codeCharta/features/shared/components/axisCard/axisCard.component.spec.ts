import { render, screen } from "@testing-library/angular"
import { AxisCardComponent, SHORTEST_CARD_NAME_CHARACTERS } from "./axisCard.component"

describe("AxisCardComponent", () => {
    it("should render the label", async () => {
        // Arrange & Act
        await render(AxisCardComponent, { inputs: { label: "Area" } })

        // Assert
        expect(screen.getByText("Area")).not.toBeNull()
    })

    it("should render an interactive search button targeting the search popover", async () => {
        // Arrange & Act
        const { container } = await render(AxisCardComponent, {
            inputs: { label: "Area", metricName: "rloc", searchPopoverId: "search-pop", searchAnchorName: "area-anchor" }
        })

        // Assert
        expect(container.querySelector("button[popovertarget='search-pop']")).not.toBeNull()
        expect(screen.getByText("rloc")).not.toBeNull()
    })

    it("should not set a popovertarget on the search button when disabled", async () => {
        // Arrange & Act
        const { container } = await render(AxisCardComponent, {
            inputs: { label: "Edges", metricName: "x", searchPopoverId: "search-pop", disabled: true }
        })

        // Assert
        expect(container.querySelector("button[popovertarget='search-pop']")).toBeNull()
        expect(container.querySelector("button[disabled]")).not.toBeNull()
    })

    it("should render a non-interactive body when no search popover is provided", async () => {
        // Arrange & Act
        const { container } = await render(AxisCardComponent, {
            inputs: { label: "Color", metricName: "Settings", hasCog: true, cogPopoverId: "cog-pop", cogAnchorName: "cog-anchor" }
        })

        // Assert: the cog is the only button; the body is a plain, non-interactive div
        const buttons = container.querySelectorAll("button")
        expect(buttons.length).toBe(1)
        expect(buttons[0].getAttribute("popovertarget")).toBe("cog-pop")
        expect(screen.getByText("Settings")).not.toBeNull()
    })

    it("should expose the test id on the card container", async () => {
        // Arrange & Act
        await render(AxisCardComponent, { inputs: { label: "Area", testId: "metric-segment-area" } })

        // Assert
        expect(screen.getByTestId("metric-segment-area")).not.toBeNull()
    })

    it("should highlight the card as a rounded cell while its settings popover is open", async () => {
        // Arrange
        const { fixture } = await render(
            `<cc-axis-card label="Height" [hasCog]="true" cogPopoverId="height-settings"></cc-axis-card><div id="height-settings" popover></div>`,
            { imports: [AxisCardComponent] }
        )
        const card: HTMLElement = fixture.nativeElement.querySelector("cc-axis-card")
        const whileClosed = card.classList.contains("ring-1")

        // Act
        const opened = new Event("toggle")
        Object.defineProperty(opened, "newState", { value: "open" })
        document.getElementById("height-settings").dispatchEvent(opened)
        fixture.detectChanges()

        // Assert
        expect(whileClosed).toBe(false)
        expect(card.classList).toContain("rounded-xl")
        expect(card.classList).toContain("ring-1")
        expect(card.classList).toContain("bg-base-200")
    })

    it("should keep the cog on its settings button when given no icon", async () => {
        // Act
        await render(AxisCardComponent, { inputs: { label: "Shape", hasCog: true, cogPopoverId: "shape-settings" } })

        // Assert
        const settingsButton = screen.getByRole("button", { name: "Settings" })
        expect(settingsButton.querySelector(".fa-cog")).not.toBeNull()
    })

    it("should show the cell's icon on its settings button and name the button after the cell", async () => {
        // Act
        await render(
            `<ng-template #icon><span data-testid="cell-icon"></span></ng-template>
            <cc-axis-card label="Area" [hasCog]="true" cogPopoverId="area-settings" [cogIcon]="icon" cogTitle="Area settings"></cc-axis-card>`,
            { imports: [AxisCardComponent] }
        )

        // Assert
        const settingsButton = screen.getByRole("button", { name: "Area settings" })
        expect(settingsButton.getAttribute("title")).toBe("Area settings")
        expect(settingsButton.querySelector("[data-testid='cell-icon']")).not.toBeNull()
        expect(settingsButton.querySelector(".fa-cog")).toBeNull()
        expect(settingsButton.classList).toContain("text-base-content/70")
    })

    describe("its shortest width", () => {
        const KEEP_TWELVE_CHARACTERS = { provide: SHORTEST_CARD_NAME_CHARACTERS, useValue: 12 }

        beforeEach(() => {
            jest.spyOn(CanvasRenderingContext2D.prototype, "measureText").mockImplementation(
                text => ({ width: text.length * 7 }) as TextMetrics
            )
        })

        afterEach(() => {
            jest.restoreAllMocks()
        })

        it("should keep the first characters of the metric name plus an ellipsis in a bar that asks for it", async () => {
            // Arrange & Act
            const { fixture } = await render(AxisCardComponent, {
                inputs: { label: "Height", metricName: "sonar_complexity" },
                providers: [KEEP_TWELVE_CHARACTERS]
            })

            // Assert
            expect(fixture.nativeElement.style.minWidth).toBe(`${13 * 7}px`)
        })

        it("should keep its label row whole when it is wider than the shortened name", async () => {
            // Arrange
            const naturalWidths = new Map([["data-card-header", 120]])
            jest.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
                const width = [...naturalWidths].find(([attribute]) => this.hasAttribute(attribute))?.[1] ?? 0
                return { width } as DOMRect
            })

            // Act
            const { fixture } = await render(AxisCardComponent, {
                inputs: { label: "Height", metricName: "rloc" },
                providers: [KEEP_TWELVE_CHARACTERS]
            })

            // Assert
            expect(fixture.nativeElement.style.minWidth).toBe("120px")
        })

        it("should let other bars' cards shrink as before", async () => {
            // Arrange & Act
            const { fixture } = await render(AxisCardComponent, { inputs: { label: "Height", metricName: "sonar_complexity" } })

            // Assert
            expect(fixture.nativeElement.style.minWidth).toBe("")
        })
    })
})
