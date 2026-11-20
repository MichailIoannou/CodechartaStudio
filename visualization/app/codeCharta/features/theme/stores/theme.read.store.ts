import { Injectable, inject } from "@angular/core"
import { toSignal } from "@angular/core/rxjs-interop"
import { Store } from "@ngrx/store"
import { themePreferenceSelector } from "../../../stores/preferences/preferences.read.facade"
import { activeTheme } from "../../../util/theme/activeTheme"
import { THEMES } from "../../../util/theme/themes"

@Injectable({ providedIn: "root" })
export class ThemeReadStore {
    readonly preference = toSignal(inject(Store).select(themePreferenceSelector), { requireSync: true })
    readonly themes = THEMES
    readonly activeTheme = activeTheme
}
