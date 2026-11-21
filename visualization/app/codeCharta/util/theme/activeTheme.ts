import { Signal, signal } from "@angular/core"
import { RenderPalette, ThemeDefinition } from "../../model/theme.model"
import { defaultThemeDefinition } from "./themes"

const activeThemeSignal = signal<ThemeDefinition>(defaultThemeDefinition())

export const activeTheme: Signal<ThemeDefinition> = activeThemeSignal.asReadonly()

export function activeRenderPalette(): RenderPalette {
    return activeThemeSignal().render
}

export function setActiveTheme(theme: ThemeDefinition): void {
    activeThemeSignal.set(theme)
}
