import { signal } from "@angular/core"
import { render } from "@testing-library/angular"
import { GlobalConfigurationOpener } from "../../../globalSettings/facade"
import { CompareStore } from "../../stores/compare.store"
import { CompareHostComponent } from "./compareHost.component"

describe("CompareHostComponent", () => {
    it("should open the shared settings dialog at the desktop tools", async () => {
        // Arrange
        const openGlobalConfiguration = jest.fn()
        const { fixture } = await render(CompareHostComponent, {
            providers: [
                { provide: CompareStore, useValue: { dialogPrefill: signal(null) } },
                { provide: GlobalConfigurationOpener, useValue: { openGlobalConfiguration } }
            ]
        })

        // Act
        fixture.componentInstance.openDesktopTools()

        // Assert
        expect(openGlobalConfiguration).toHaveBeenCalledWith({ section: "desktopTools" })
    })

    it("should mount no settings dialog of its own", async () => {
        // Arrange & Act
        await render(CompareHostComponent, {
            providers: [
                { provide: CompareStore, useValue: { dialogPrefill: signal(null) } },
                { provide: GlobalConfigurationOpener, useValue: { openGlobalConfiguration: jest.fn() } }
            ]
        })

        // Assert
        expect(document.querySelector("cc-global-configuration-dialog")).toBeNull()
    })
})
