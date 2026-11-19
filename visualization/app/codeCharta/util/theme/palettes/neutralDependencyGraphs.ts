import { RenderPalette } from "../../../model/theme.model"

export const darculaDependencyGraph: RenderPalette["dependencyGraph"] = {
    text: "#bbbbbb",
    selected: "#589df6",
    hovered: "#bbbbbb",
    folderFillsByDepth: ["#2d2d2d", "#323232", "#373737", "#3c3c3c"],
    folderStroke: "#555555",
    closedFolderFill: "#2f3a45",
    closedFolderStroke: "#6897bb",
    packageFillsByDepth: ["#2f2b33", "#34303a", "#393541", "#3e3a48"],
    packageStroke: "#6b5a78",
    closedPackageFill: "#3a3342",
    closedPackageStroke: "#9876aa",
    fileFill: "#262626",
    declarationFill: "#2b2b2b",
    fileStroke: "#808080",
    openFileFill: "#282828",
    quietBadge: "#8c8c8c",
    levelSeparator: "#4a4a4a",
    cycleMark: "#ff6b68",
    badgeContrast: "#ffffff",
    kindTints: {
        class: "#33404d",
        valueclass: "#2f4545",
        interface: "#34443a",
        enum: "#4a4330",
        annotation: "#43384a",
        function: "#4a3534",
        variable: "#383838",
        other: "#303030"
    },
    kindIconStroke: "#8a8a8a",
    kindIconLetter: "#d4d4d4"
}

export const vsDarkDependencyGraph: RenderPalette["dependencyGraph"] = {
    text: "#d4d4d4",
    selected: "#3794ff",
    hovered: "#d4d4d4",
    folderFillsByDepth: ["#222222", "#272727", "#2c2c2c", "#313131"],
    folderStroke: "#4a4a4a",
    closedFolderFill: "#26364a",
    closedFolderStroke: "#4f86b8",
    packageFillsByDepth: ["#272329", "#2c272e", "#312c34", "#363139"],
    packageStroke: "#6d5a6b",
    closedPackageFill: "#35293a",
    closedPackageStroke: "#a46fa0",
    fileFill: "#1a1a1a",
    declarationFill: "#202020",
    fileStroke: "#6e6e6e",
    openFileFill: "#1c1c1c",
    quietBadge: "#8a8a8a",
    levelSeparator: "#3c3c3c",
    cycleMark: "#f48771",
    badgeContrast: "#ffffff",
    kindTints: {
        class: "#2a3a4a",
        valueclass: "#26403f",
        interface: "#2a4034",
        enum: "#453d28",
        annotation: "#3b3045",
        function: "#452e2c",
        variable: "#323232",
        other: "#2a2a2a"
    },
    kindIconStroke: "#858585",
    kindIconLetter: "#d4d4d4"
}
