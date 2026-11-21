import { TestBed } from "@angular/core/testing"
import { MockStore, provideMockStore } from "@ngrx/store/testing"
import { render, screen } from "@testing-library/angular"
import userEvent from "@testing-library/user-event"
import { ThemePreference } from "../../../../model/theme.model"
import { setThemePreference } from "../../../../stores/preferences/preferences.write.facade"
import { setActiveTheme } from "../../../../util/theme/activeTheme"
import { resolveTheme } from "../../../../util/theme/resolveTheme"
import { THEMES } from "../../../../util/theme/themes"
import { ThemePickerComponent } from "./themePicker.component"

describe("ThemePickerComponent", () => {
    async function setup(preference: ThemePreference) {
        await render(ThemePickerComponent, {
            providers: [provideMockStore({ initialState: { preferences: { theme: preference } } })]
        })
        const store = TestBed.inject(MockStore)
        const dispatchSpy = jest.spyOn(store, "dispatch")
        return { dispatchSpy, picker: screen.getByLabelText("Theme") as HTMLSelectElement }
    }

    it("should offer every theme and following the system", async () => {
        // Arrange & Act
        const { picker } = await setup("cc-dark")

        // Assert
        const groups = [...picker.querySelectorAll("optgroup")].map(group => group.label)
        const options = [...picker.options].map(option => option.value)
        expect(groups).toEqual(["Dark", "Light"])
        expect(options).toEqual([
            ...THEMES.filter(theme => theme.colorScheme === "dark").map(theme => theme.id),
            ...THEMES.filter(theme => theme.colorScheme === "light").map(theme => theme.id),
            "system"
        ])
        expect(picker.options[options.length - 1].textContent?.trim()).toBe("Follow system")
        expect(picker.value).toBe("cc-dark")
    })

    it("should save the picked theme", async () => {
        // Arrange
        const { picker, dispatchSpy } = await setup("cc-dark")

        // Act
        await userEvent.selectOptions(picker, "cc-light")

        // Assert
        expect(dispatchSpy).toHaveBeenCalledWith(setThemePreference({ value: "cc-light" }))
    })

    it("should name the theme the system resolves to", async () => {
        // Arrange
        setActiveTheme(resolveTheme("cc-light", "light"))

        // Act
        const { picker } = await setup("system")

        // Assert
        expect(picker.value).toBe("system")
        expect(screen.getByTestId("theme-picker-current").textContent?.trim()).toBe("Currently: CodeCharta Light")
    })

    it("should give no hint while a theme is picked", async () => {
        // Arrange & Act
        await setup("cc-light")

        // Assert
        expect(screen.queryByTestId("theme-picker-current")).toBeNull()
    })

    it("should show the default theme for a theme this version does not know", async () => {
        // Arrange & Act
        const { picker } = await setup("midnight")

        // Assert
        expect(picker.value).toBe("cc-dark")
    })
})
