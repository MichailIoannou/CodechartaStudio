import { Injectable, inject } from "@angular/core"
import { ColorScheme, ThemeDefinition, ThemePreference } from "../../../model/theme.model"
import { LocalStorageRepo } from "../../../util/persistence/localStorage.repo"
import { resolveTheme } from "../../../util/theme/resolveTheme"

const THEME_BOOT_KEY = "codeCharta.themeBoot"
const MIRROR_VERSION = 1
const SCHEMES: readonly ColorScheme[] = ["light", "dark"]
const BOOT_COLOR_KEYS = ["id", "background", "content", "track", "accent"] as const

interface BootColors {
    id: string
    background: string
    content: string
    track: string
    accent: string
}

/** What the boot screen shows before the app runs, per scheme of the operating system. IndexedDB stays the source of truth. */
export interface ThemeBootMirror {
    version: typeof MIRROR_VERSION
    preference: ThemePreference
    light: BootColors
    dark: BootColors
}

@Injectable({ providedIn: "root" })
export class ThemeBootMirrorRepo {
    private readonly localStorageRepo = inject(LocalStorageRepo)

    read(): ThemeBootMirror | null {
        const stored = this.localStorageRepo.read(THEME_BOOT_KEY)
        if (stored === null) {
            return null
        }
        try {
            const parsed: unknown = JSON.parse(stored)
            return isThemeBootMirror(parsed) ? parsed : null
        } catch {
            return null
        }
    }

    write(mirror: ThemeBootMirror): void {
        this.localStorageRepo.write(THEME_BOOT_KEY, JSON.stringify(mirror))
    }
}

export function themeBootMirrorFor(preference: ThemePreference): ThemeBootMirror {
    return {
        version: MIRROR_VERSION,
        preference,
        light: bootColorsOf(resolveTheme(preference, "light")),
        dark: bootColorsOf(resolveTheme(preference, "dark"))
    }
}

function bootColorsOf({ id, chrome }: ThemeDefinition): BootColors {
    return { id, background: chrome.base100, content: chrome.baseContent, track: chrome.base300, accent: chrome.primary }
}

function isThemeBootMirror(value: unknown): value is ThemeBootMirror {
    if (!isRecord(value) || value["version"] !== MIRROR_VERSION || typeof value["preference"] !== "string") {
        return false
    }
    return SCHEMES.every(scheme => isBootColors(value[scheme]))
}

function isBootColors(value: unknown): value is BootColors {
    return isRecord(value) && BOOT_COLOR_KEYS.every(key => typeof value[key] === "string")
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value)
}
