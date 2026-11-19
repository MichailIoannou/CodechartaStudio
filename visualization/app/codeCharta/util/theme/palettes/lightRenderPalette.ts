import { ChromeTokens, MapPaletteSeed, RenderPalette } from "../../../model/theme.model"

export const lightRenderPalette: RenderPalette = {
    surface: "#ffffff",
    text: "#1f2937",
    exportBackground: null,
    map: {
        background: "#f4f4eb",
        whiteBackground: "#ffffff",
        floorGradient: { root: "#333333", deepest: "#dddddd" },
        floorLabel: { fill: "#ffffff", outline: "rgba(0, 0, 0, 0.5)" },
        buildingLabel: { background: "#ffffff", text: "#1a1a1a", border: "#b3b3b3" },
        connector: "#b4b4b4"
    },
    viewCube: { face: "#fcfdff", outline: "#000000", hoverEmissive: "#ffffff" },
    radial: { pieceBorder: "#ffffff", neutralFolder: "#d9dce1", tintTarget: "#ffffff", darkText: "#1f2937", lightText: "#ffffff" },
    wordCloud: { gradientStart: "#e6007e", gradientEnd: "#0030ff", emphasisShadow: "#333333" },
    dependencyGraph: {
        text: "#1f2937",
        selected: "#1b9cfc",
        hovered: "#1f2937",
        folderFillsByDepth: ["#f4f6f9", "#e9edf2", "#dfe5ec", "#d5dce5"],
        folderStroke: "#b8c2cf",
        closedFolderFill: "#dbe7f5",
        closedFolderStroke: "#7a9cc6",
        packageFillsByDepth: ["#f8f6fd", "#f0ecfa", "#e9e3f7", "#e1d9f3"],
        packageStroke: "#c6bce2",
        closedPackageFill: "#e6e0f7",
        closedPackageStroke: "#8f7fc7",
        fileFill: "#ffffff",
        declarationFill: "#f7f9fc",
        fileStroke: "#9aa5b4",
        openFileFill: "#fbfcfe",
        quietBadge: "#8a94a3",
        levelSeparator: "#c3cbd6",
        cycleMark: "#dc2626",
        badgeContrast: "#ffffff",
        kindTints: {
            class: "#dbe7f5",
            valueclass: "#d8eef0",
            interface: "#dff3e4",
            enum: "#fdecc8",
            annotation: "#efe1f7",
            function: "#fde2e0",
            variable: "#e6e9ee",
            other: "#f1f2f4"
        },
        kindIconStroke: "#7d8898",
        kindIconLetter: "#374151"
    },
    chartTooltip: { background: "#ffffff", border: "#d1d5db", text: "#1f2937" }
}

export function buildLightRenderPalette(chrome: ChromeTokens, seed: MapPaletteSeed): RenderPalette {
    const [gradientStart, gradientEnd] = seed.wordCloud
    return {
        ...lightRenderPalette,
        surface: chrome.base100,
        text: chrome.baseContent,
        map: {
            ...lightRenderPalette.map,
            background: seed.mapBackground,
            floorGradient: { root: seed.floorRoot, deepest: seed.floorDeepest },
            buildingLabel: { background: chrome.base100, text: chrome.baseContent, border: chrome.base300 }
        },
        radial: { ...lightRenderPalette.radial, pieceBorder: chrome.base100, tintTarget: chrome.base100 },
        wordCloud: { ...lightRenderPalette.wordCloud, gradientStart, gradientEnd },
        chartTooltip: { background: chrome.base100, border: chrome.base300, text: chrome.baseContent }
    }
}
