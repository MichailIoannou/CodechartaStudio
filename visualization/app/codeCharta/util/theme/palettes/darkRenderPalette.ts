import { ChromeTokens, MapPaletteSeed, RenderPalette } from "../../../model/theme.model"

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
    dependencyGraph: {
        text: "#e6e9ee",
        selected: "#4db2ff",
        hovered: "#e6e9ee",
        folderFillsByDepth: ["#232930", "#293039", "#2f3742", "#353e4b"],
        folderStroke: "#4a5564",
        closedFolderFill: "#24344a",
        closedFolderStroke: "#5d86b8",
        packageFillsByDepth: ["#27243a", "#2d2a44", "#33304e", "#393658"],
        packageStroke: "#5a5184",
        closedPackageFill: "#322c52",
        closedPackageStroke: "#8f7fc7",
        fileFill: "#1a1f25",
        declarationFill: "#20262d",
        fileStroke: "#6b7686",
        openFileFill: "#1c2127",
        quietBadge: "#8a94a3",
        levelSeparator: "#3d4652",
        cycleMark: "#f87171",
        badgeContrast: "#ffffff",
        kindTints: {
            class: "#2a3a52",
            valueclass: "#23404a",
            interface: "#24432f",
            enum: "#4a3c17",
            annotation: "#3d2b4d",
            function: "#4d2a28",
            variable: "#333a45",
            other: "#2b3038"
        },
        kindIconStroke: "#7d8898",
        kindIconLetter: "#d7dde4"
    },
    chartTooltip: { background: "#262c34", border: "#3a424d", text: "#e6e9ee" }
}

export function buildDarkRenderPalette(
    chrome: ChromeTokens,
    seed: MapPaletteSeed,
    dependencyGraph: RenderPalette["dependencyGraph"] = darkRenderPalette.dependencyGraph
): RenderPalette {
    const [gradientStart, gradientEnd] = seed.wordCloud
    return {
        ...darkRenderPalette,
        surface: chrome.base100,
        text: chrome.baseContent,
        exportBackground: chrome.base100,
        map: {
            ...darkRenderPalette.map,
            background: seed.mapBackground,
            floorGradient: { root: seed.floorRoot, deepest: seed.floorDeepest },
            buildingLabel: { background: chrome.base100, text: chrome.baseContent, border: chrome.base300 },
            connector: seed.floorDeepest
        },
        viewCube: { face: chrome.base300, outline: seed.floorDeepest, hoverEmissive: chrome.primary },
        radial: { ...darkRenderPalette.radial, pieceBorder: chrome.base100, neutralFolder: seed.floorRoot, tintTarget: chrome.base100 },
        wordCloud: { ...darkRenderPalette.wordCloud, gradientStart, gradientEnd },
        dependencyGraph,
        chartTooltip: { background: chrome.base200, border: chrome.base300, text: chrome.baseContent }
    }
}
