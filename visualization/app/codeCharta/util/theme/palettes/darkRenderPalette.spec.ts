import { BUILDER_CHROME, BUILDER_SEED } from "./builderInputs.fixture"
import { buildDarkRenderPalette, darkRenderPalette } from "./darkRenderPalette"

describe("buildDarkRenderPalette", () => {
    it("should take the surface and label colors from the chrome tokens", () => {
        // Arrange
        const palette = buildDarkRenderPalette(BUILDER_CHROME, BUILDER_SEED)

        // Act
        const { surface, text, exportBackground, map, radial, chartTooltip, viewCube } = palette

        // Assert
        expect(surface).toBe("#101010")
        expect(exportBackground).toBe("#101010")
        expect(text).toBe("#f0f0f0")
        expect(map.buildingLabel).toEqual({ background: "#101010", text: "#f0f0f0", border: "#303030" })
        expect(radial.pieceBorder).toBe("#101010")
        expect(radial.tintTarget).toBe("#101010")
        expect(chartTooltip).toEqual({ background: "#202020", border: "#303030", text: "#f0f0f0" })
        expect(viewCube).toEqual({ face: "#303030", outline: "#d0d0d0", hoverEmissive: "#aa0000" })
    })

    it("should take the map colors from the seed", () => {
        // Arrange
        const palette = buildDarkRenderPalette(BUILDER_CHROME, BUILDER_SEED)

        // Act
        const { map, radial, wordCloud } = palette

        // Assert
        expect(map.background).toBe("#050505")
        expect(map.floorGradient).toEqual({ root: "#505050", deepest: "#d0d0d0" })
        expect(map.connector).toBe("#d0d0d0")
        expect(radial.neutralFolder).toBe("#505050")
        expect(wordCloud.gradientStart).toBe("#ff0000")
        expect(wordCloud.gradientEnd).toBe("#0000ff")
    })

    it("should share the dependency graph of the dark theme", () => {
        // Arrange
        const palette = buildDarkRenderPalette(BUILDER_CHROME, BUILDER_SEED)

        // Act
        const { dependencyGraph } = palette

        // Assert
        expect(dependencyGraph).toBe(darkRenderPalette.dependencyGraph)
    })
})
