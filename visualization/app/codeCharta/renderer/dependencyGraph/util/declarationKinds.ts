import { activeRenderPalette } from "../../../util/theme/activeTheme"

export interface DeclarationKindLook {
    label: string
    letter: string
    tint: string
}

export interface DeclarationKindLegendEntry extends DeclarationKindLook {
    kind: string
}

type DeclarationKindName = Omit<DeclarationKindLook, "tint">

const OTHER_KIND = "other"

const NAMES = new Map<string, DeclarationKindName>(
    Object.entries({
        class: { label: "Class", letter: "C" },
        valueclass: { label: "Value class", letter: "D" },
        interface: { label: "Interface", letter: "I" },
        enum: { label: "Enum", letter: "E" },
        annotation: { label: "Annotation", letter: "@" },
        function: { label: "Function", letter: "ƒ" },
        variable: { label: "Variable", letter: "V" },
        [OTHER_KIND]: { label: "Other", letter: "?" }
    })
)

export function kindIconColors(): { stroke: string; letter: string } {
    const { kindIconStroke, kindIconLetter } = activeRenderPalette().dependencyGraph
    return { stroke: kindIconStroke, letter: kindIconLetter }
}

export function declarationKindLegend(): readonly DeclarationKindLegendEntry[] {
    return [...NAMES.keys()].map(kind => ({ kind, ...lookOfKnownKind(kind) }))
}

/** The kinds are an open vocabulary: one this table does not know yet is drawn as any other. */
export function declarationKindLookOf(kind: string | undefined): DeclarationKindLook {
    return lookOfKnownKind(NAMES.has(kind ?? OTHER_KIND) ? (kind ?? OTHER_KIND) : OTHER_KIND)
}

/** A kind this table does not know yet is still told by the name its language gave it. */
export function declarationKindLabelOf(kind: string): string {
    return NAMES.get(kind)?.label ?? kind
}

function lookOfKnownKind(kind: string): DeclarationKindLook {
    return { ...NAMES.get(kind), tint: activeRenderPalette().dependencyGraph.kindTints[kind] }
}
