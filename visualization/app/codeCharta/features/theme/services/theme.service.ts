import { DOCUMENT, Injectable, inject } from "@angular/core"
import { ThemeDefinition } from "../../../model/theme.model"
import { setActiveTheme } from "../../../util/theme/activeTheme"

@Injectable({ providedIn: "root" })
export class ThemeService {
    private readonly document = inject(DOCUMENT)

    apply(theme: ThemeDefinition): void {
        const root = this.document.documentElement
        root.dataset["theme"] = theme.id
        root.style.colorScheme = theme.colorScheme
        setActiveTheme(theme)
    }
}
