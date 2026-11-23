import { render, screen } from "@testing-library/angular"
import userEvent from "@testing-library/user-event"
import { SettingsShortcutComponent } from "./settingsShortcut.component"

describe("SettingsShortcutComponent", () => {
    const hidePopover = jest.fn()
    const showPopover = jest.fn()

    beforeEach(() => {
        hidePopover.mockClear()
        showPopover.mockClear()
        HTMLElement.prototype.hidePopover = hidePopover
        HTMLElement.prototype.showPopover = showPopover
    })

    async function renderInChooser() {
        await render(
            `<button type="button" popovertarget="area-chooser" data-testid="area-button">Area</button>
            <div id="area-chooser" popover data-testid="area-chooser">
                <cc-settings-shortcut [shortcut]="{ label: 'Area settings', popoverId: 'area-settings' }" />
            </div>
            <div id="area-settings" popover data-testid="area-settings"></div>`,
            { imports: [SettingsShortcutComponent] }
        )
    }

    it("should name the settings it opens", async () => {
        // Act
        await renderInChooser()

        // Assert
        expect(screen.getByTestId("settings-shortcut").textContent.trim()).toBe("Area settings")
    })

    it("should close its own popover and open the settings from the same button", async () => {
        // Arrange
        await renderInChooser()

        // Act
        await userEvent.click(screen.getByTestId("settings-shortcut"))

        // Assert
        expect(hidePopover.mock.contexts[0]).toBe(screen.getByTestId("area-chooser"))
        expect(showPopover.mock.contexts[0]).toBe(screen.getByTestId("area-settings"))
        expect(showPopover).toHaveBeenCalledWith({ source: screen.getByTestId("area-button") })
    })

    it("should open the settings without a source when nothing opened its popover", async () => {
        // Arrange
        await render(
            `<cc-settings-shortcut [shortcut]="{ label: 'Area settings', popoverId: 'area-settings' }" /><div id="area-settings" popover></div>`,
            {
                imports: [SettingsShortcutComponent]
            }
        )

        // Act
        await userEvent.click(screen.getByTestId("settings-shortcut"))

        // Assert
        expect(hidePopover).not.toHaveBeenCalled()
        expect(showPopover).toHaveBeenCalledWith({})
    })
})
