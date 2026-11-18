import { DestroyRef, Injectable, inject, signal } from "@angular/core"
import { ColorScheme } from "../../../model/theme.model"

const DARK_SCHEME_QUERY = "(prefers-color-scheme: dark)"

/** The color scheme of the operating system, tracked live. Electron's renderer follows the OS through the same query. */
@Injectable({ providedIn: "root" })
export class SystemColorSchemeService {
    private readonly darkSchemeQuery = typeof globalThis.matchMedia === "function" ? globalThis.matchMedia(DARK_SCHEME_QUERY) : null
    private readonly schemeSignal = signal<ColorScheme>(schemeOf(this.darkSchemeQuery?.matches === true))

    readonly scheme = this.schemeSignal.asReadonly()

    constructor() {
        const onChange = (event: MediaQueryListEvent) => this.schemeSignal.set(schemeOf(event.matches))
        this.darkSchemeQuery?.addEventListener("change", onChange)
        inject(DestroyRef).onDestroy(() => this.darkSchemeQuery?.removeEventListener("change", onChange))
    }
}

function schemeOf(prefersDark: boolean): ColorScheme {
    return prefersDark ? "dark" : "light"
}
