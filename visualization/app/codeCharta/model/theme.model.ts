export type ColorScheme = "light" | "dark"
/** A registry id such as "cc-dark"; deliberately a string so a new theme needs no type change. */
export type ThemeId = string
export const SYSTEM_THEME = "system"
export type ThemePreference = typeof SYSTEM_THEME | ThemeId

/** The daisyUI color tokens of a theme as hex, mirroring its block in app/tailwind.css. */
export interface ChromeTokens {
    base100: string
    base200: string
    base300: string
    baseContent: string
    primary: string
    primaryContent: string
    secondary: string
    secondaryContent: string
    accent: string
    accentContent: string
    neutral: string
    neutralContent: string
    info: string
    infoContent: string
    success: string
    successContent: string
    warning: string
    warningContent: string
    error: string
    errorContent: string
}

interface MapRenderPalette {
    background: string
    whiteBackground: string
    floorGradient: { root: string; deepest: string }
    floorLabel: { fill: string; outline: string }
    /** Only for screenshots; the live labels take the chrome tokens through CSS. */
    buildingLabel: { background: string; text: string; border: string }
    connector: string
}

interface ViewCubeRenderPalette {
    face: string
    outline: string
    hoverEmissive: string
}

interface RadialRenderPalette {
    pieceBorder: string
    neutralFolder: string
    tintTarget: string
    darkText: string
    lightText: string
}

interface WordCloudRenderPalette {
    gradientStart: string
    gradientEnd: string
    emphasisShadow: string
}

interface ChartTooltipPalette {
    background: string
    border: string
    text: string
}

interface DependencyGraphRenderPalette {
    text: string
    selected: string
    hovered: string
    folderFillsByDepth: readonly string[]
    folderStroke: string
    closedFolderFill: string
    closedFolderStroke: string
    packageFillsByDepth: readonly string[]
    packageStroke: string
    closedPackageFill: string
    closedPackageStroke: string
    fileFill: string
    declarationFill: string
    fileStroke: string
    openFileFill: string
    quietBadge: string
    levelSeparator: string
    cycleMark: string
    badgeContrast: string
    kindTints: Readonly<Record<string, string>>
    kindIconStroke: string
    kindIconLetter: string
}

export interface RenderPalette {
    surface: string
    text: string
    /** Null exports a transparent image. */
    exportBackground: string | null
    map: MapRenderPalette
    viewCube: ViewCubeRenderPalette
    radial: RadialRenderPalette
    wordCloud: WordCloudRenderPalette
    dependencyGraph: DependencyGraphRenderPalette
    chartTooltip: ChartTooltipPalette
}

export interface ThemeDefinition {
    id: ThemeId
    label: string
    colorScheme: ColorScheme
    chrome: ChromeTokens
    render: RenderPalette
}
