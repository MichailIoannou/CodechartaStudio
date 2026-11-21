import { Injectable, inject } from "@angular/core"
import { Store } from "@ngrx/store"
import { ThemePreference } from "../../../model/theme.model"
import { setThemePreference } from "../../../stores/preferences/preferences.write.facade"

@Injectable({ providedIn: "root" })
export class ThemeWriteStore {
    private readonly store = inject(Store)

    setPreference(value: ThemePreference): void {
        this.store.dispatch(setThemePreference({ value }))
    }
}
