import { RenderPalette } from "../../../model/theme.model"
import { lightRenderPalette } from "./lightRenderPalette"

export const darkRenderPalette: RenderPalette = {
    surface: "#1e2329",
    text: "#e6e9ee",
    exportBackground: "#1e2329",
    map: {
        background: "#14171b",
        whiteBackground: "#ffffff",
        floorGradient: { root: "#4a515c", deepest: "#c9ced6" },
        floorLabel: { fill: "#ffffff", outline: "rgba(0, 0, 0, 0.5)" },
        buildingLabel: { background: "#1e2329", text: "#e6e9ee", border: "#3a424d" },
        connector: "#8a94a3"
    },
    viewCube: { face: "#3a424d", outline: "#c9ced6", hoverEmissive: "#8b9cff" },
    radial: { pieceBorder: "#1e2329", neutralFolder: "#4a515c", tintTarget: "#1e2329", darkText: "#1f2937", lightText: "#ffffff" },
    wordCloud: { gradientStart: "#ff6ab8", gradientEnd: "#7da2ff", emphasisShadow: "#000000" },
    dependencyGraph: lightRenderPalette.dependencyGraph,
    chartTooltip: { background: "#262c34", border: "#3a424d", text: "#e6e9ee" }
}
