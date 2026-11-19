import { setActiveTheme } from "../../../util/theme/activeTheme"
import { themeById } from "../../../util/theme/themes"
import { closedFolderFill, folderFill, packageFill, seeThrough, selectedColor, textColor } from "./dependencyGraphStyle"

describe("dependencyGraphStyle", () => {
    afterEach(() => setActiveTheme(themeById("cc-dark")))

    it("should take box fills from the active theme", () => {
        // Arrange
        const fillsOf = () => [folderFill(0), packageFill(0), closedFolderFill()]
        setActiveTheme(themeById("cc-dark"))
        const darkFills = fillsOf()

        // Act
        setActiveTheme(themeById("cc-light"))
        const lightFills = fillsOf()

        // Assert
        expect(darkFills).toEqual(["#232930", "#27243a", "#24344a"])
        expect(lightFills).toEqual(["#f4f6f9", "#f8f6fd", "#dbe7f5"])
    })

    it("should deepen a fill with the depth until the palette has no deeper one", () => {
        // Arrange
        setActiveTheme(themeById("cc-dark"))

        // Act
        const fills = [0, 3, 9].map(folderFill)

        // Assert
        expect(fills).toEqual(["#232930", "#353e4b", "#353e4b"])
    })

    it("should take text and selection colors from the active theme", () => {
        // Arrange
        setActiveTheme(themeById("cc-dark"))

        // Act
        const colors = { text: textColor(), selected: selectedColor() }

        // Assert
        expect(colors).toEqual({ text: "#e6e9ee", selected: "#4db2ff" })
    })

    it("should make a hex color see-through", () => {
        // Arrange
        const hexColor = "#232930"

        // Act
        const color = seeThrough(hexColor)

        // Assert
        expect(color).toBe("rgba(35, 41, 48, 0.65)")
    })
})
