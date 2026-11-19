import { BUILDER_CHROME, BUILDER_SEED } from "./builderInputs.fixture"
import { buildLightRenderPalette, lightRenderPalette } from "./lightRenderPalette"

describe("buildLightRenderPalette", () => {
    it("should take the surface and label colors from the chrome tokens", () => {
        // Arrange
        const palette = buildLightRenderPalette(BUILDER_CHROME, BUILDER_SEED)

        // Act
        const { surface, text, map, radial, chartTooltip } = palette

        // Assert
        expect(surface).toBe("#101010")
        expect(text).toBe("#f0f0f0")
        expect(map.buildingLabel).toEqual({ background: "#101010", text: "#f0f0f0", border: "#303030" })
        expect(radial.pieceBorder).toBe("#101010")
        expect(radial.tintTarget).toBe("#101010")
        expect(chartTooltip).toEqual({ background: "#101010", border: "#303030", text: "#f0f0f0" })
    })

    it("should take the map colors from the seed", () => {
        // Arrange
        const palette = buildLightRenderPalette(BUILDER_CHROME, BUILDER_SEED)

        // Act
        const { map, wordCloud } = palette

        // Assert
        expect(map.background).toBe("#050505")
        expect(map.floorGradient).toEqual({ root: "#505050", deepest: "#d0d0d0" })
        expect(wordCloud.gradientStart).toBe("#ff0000")
        expect(wordCloud.gradientEnd).toBe("#0000ff")
    })

    it("should keep the transparent export and the dependency graph of the light theme", () => {
        // Arrange
        const palette = buildLightRenderPalette(BUILDER_CHROME, BUILDER_SEED)

        // Act
        const { exportBackground, dependencyGraph } = palette

        // Assert
        expect(exportBackground).toBeNull()
        expect(dependencyGraph).toBe(lightRenderPalette.dependencyGraph)
    })
})
