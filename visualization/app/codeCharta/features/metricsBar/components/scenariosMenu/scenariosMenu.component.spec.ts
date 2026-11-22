import { render, screen } from "@testing-library/angular"
import userEvent from "@testing-library/user-event"
import { ScenariosMenuComponent } from "./scenariosMenu.component"

describe("ScenariosMenuComponent", () => {
    async function setup() {
        const openScenarioList = jest.fn()
        const saveScenario = jest.fn()
        await render(ScenariosMenuComponent, {
            inputs: { popoverId: "scenarios-menu", anchorName: "scenarios-anchor", scenarioCount: 7 },
            on: { openScenarioList, saveScenario }
        })
        return { openScenarioList, saveScenario }
    }

    it("should offer the saved scenarios with their count and saving the current state", async () => {
        // Act
        await setup()

        // Assert
        expect(screen.getByTestId("scenarios-menu-open").textContent.trim()).toBe("Open saved scenarios (7)")
        expect(screen.getByTestId("scenarios-menu-save").textContent.trim()).toBe("Save current state as scenario")
    })

    it("should close itself when an entry is picked", async () => {
        // Act
        await setup()

        // Assert
        for (const entry of [screen.getByTestId("scenarios-menu-open"), screen.getByTestId("scenarios-menu-save")]) {
            expect(entry.getAttribute("popovertarget")).toBe("scenarios-menu")
            expect(entry.getAttribute("popovertargetaction")).toBe("hide")
        }
    })

    it("should ask for the saved scenarios", async () => {
        // Arrange
        const { openScenarioList, saveScenario } = await setup()

        // Act
        await userEvent.click(screen.getByTestId("scenarios-menu-open"))

        // Assert
        expect(openScenarioList).toHaveBeenCalledTimes(1)
        expect(saveScenario).not.toHaveBeenCalled()
    })

    it("should ask to save the current state", async () => {
        // Arrange
        const { saveScenario } = await setup()

        // Act
        await userEvent.click(screen.getByTestId("scenarios-menu-save"))

        // Assert
        expect(saveScenario).toHaveBeenCalledTimes(1)
    })
})
