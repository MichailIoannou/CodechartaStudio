import { State } from "@ngrx/store"
import { provideMockStore } from "@ngrx/store/testing"
import { render, screen } from "@testing-library/angular"
import { defaultState } from "../../../../stores/rootStore/state.manager"
import { provideCompactBar } from "../../metricsBar.mocks"
import { DeltaColorSegmentComponent } from "./deltaColorSegment.component"

describe("DeltaColorSegmentComponent", () => {
    async function setup(isCompact = false) {
        await render(DeltaColorSegmentComponent, {
            providers: [
                provideMockStore({ initialState: defaultState }),
                { provide: State, useValue: { getValue: () => defaultState } },
                ...(isCompact ? [provideCompactBar()] : [])
            ]
        })
    }

    it("should open the delta colours from the palette on its card", async () => {
        // Act
        await setup()

        // Assert
        const settingsButton = screen.getByRole("button", { name: "Color settings" })
        expect(settingsButton.getAttribute("popovertarget")).toBe("metric-settings-popover-color-delta")
        expect(settingsButton.querySelector(".fa-palette")).not.toBeNull()
    })

    it("should open the delta colours straight from the compact bar's Color button", async () => {
        // Act
        await setup(true)

        // Assert
        const button = screen.getByRole("button", { name: "Color · delta colours" })
        expect(button.getAttribute("popovertarget")).toBe("metric-settings-popover-color-delta")
        expect(screen.queryByTestId("metric-segment-color-settings")).toBeNull()
    })
})
