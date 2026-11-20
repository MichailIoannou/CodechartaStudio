import { ChangeDetectionStrategy, Component, computed, inject } from "@angular/core"
import { SYSTEM_THEME, ThemeDefinition } from "../../../../model/theme.model"
import { DEFAULT_THEME_ID, themeById } from "../../../../util/theme/themes"
import { ThemeReadStore } from "../../stores/theme.read.store"
import { ThemeWriteStore } from "../../stores/theme.write.store"

@Component({
    selector: "cc-theme-picker",
    templateUrl: "./themePicker.component.html",
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ThemePickerComponent {
    private readonly readStore = inject(ThemeReadStore)
    private readonly writeStore = inject(ThemeWriteStore)

    protected readonly systemTheme = SYSTEM_THEME
    protected readonly darkThemes = this.themesOfScheme("dark")
    protected readonly lightThemes = this.themesOfScheme("light")
    protected readonly activeTheme = this.readStore.activeTheme
    protected readonly isFollowingSystem = computed(() => this.readStore.preference() === SYSTEM_THEME)
    protected readonly selected = computed(() => {
        const preference = this.readStore.preference()
        return preference === SYSTEM_THEME || themeById(preference) ? preference : DEFAULT_THEME_ID
    })

    protected pick(event: Event) {
        this.writeStore.setPreference((event.target as HTMLSelectElement).value)
    }

    private themesOfScheme(colorScheme: ThemeDefinition["colorScheme"]) {
        return this.readStore.themes.filter(theme => theme.colorScheme === colorScheme)
    }
}
