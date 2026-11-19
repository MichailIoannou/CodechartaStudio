import { Injectable, inject } from "@angular/core"
import { toObservable } from "@angular/core/rxjs-interop"
import { Actions, createEffect, ofType } from "@ngrx/effects"
import { Store } from "@ngrx/store"
import { combineLatest, distinctUntilChanged, first, map, Observable, of, startWith, switchMap, tap } from "rxjs"
import { SYSTEM_THEME, ThemeDefinition, ThemePreference } from "../../../../model/theme.model"
import { filesLoaded } from "../../../../stores/fileStore/fileStore.facade"
import { themePreferenceSelector } from "../../../../stores/preferences/preferences.read.facade"
import { activeThemeChanged, setThemePreference } from "../../../../stores/preferences/preferences.write.facade"
import { setState } from "../../../../stores/rootStore/state.actions"
import { DESKTOP_BRIDGE } from "../../../../util/desktop/desktopBridge.token"
import { resolveTheme } from "../../../../util/theme/resolveTheme"
import { ThemeBootMirrorRepo, themeBootMirrorFor } from "../../repos/themeBootMirror.repo"
import { SystemColorSchemeService } from "../../services/systemColorScheme.service"
import { ThemeService } from "../../services/theme.service"

interface PreferenceSource {
    preference: ThemePreference
    isSessionRestored: boolean
}

interface ResolvedTheme extends PreferenceSource {
    theme: ThemeDefinition
}

/**
 * The store holds the default theme until the saved session is restored, so until then the theme the boot mirror
 * remembers is applied instead; otherwise a reader of a light theme would see the app turn dark and back again.
 */
@Injectable()
export class ApplyThemeEffect {
    private readonly actions$ = inject(Actions)
    private readonly store = inject(Store)
    private readonly bootMirror = inject(ThemeBootMirrorRepo)
    private readonly themeService = inject(ThemeService)
    private readonly desktopBridge = inject(DESKTOP_BRIDGE)
    private readonly systemScheme$ = toObservable(inject(SystemColorSchemeService).scheme)

    private readonly bootHint = this.bootMirror.read()?.preference ?? null

    private readonly isSessionRestored$ = this.actions$.pipe(
        ofType(setThemePreference, setState, filesLoaded),
        first(),
        map(() => true),
        startWith(false)
    )

    private readonly preferenceSource$: Observable<PreferenceSource> = this.isSessionRestored$.pipe(
        switchMap(isSessionRestored => {
            const preference$ = isSessionRestored || this.bootHint === null ? this.store.select(themePreferenceSelector) : of(this.bootHint)
            return preference$.pipe(map(preference => ({ preference, isSessionRestored })))
        })
    )

    applyTheme$ = createEffect(() =>
        combineLatest([this.preferenceSource$, this.systemScheme$]).pipe(
            map(([source, systemScheme]): ResolvedTheme => ({ ...source, theme: resolveTheme(source.preference, systemScheme) })),
            distinctUntilChanged(isSameResolution),
            tap(resolved => this.rememberForNextStart(resolved)),
            tap(resolved => this.tellDesktopShell(resolved)),
            map(({ theme }) => theme),
            distinctUntilChanged((previous, next) => previous.id === next.id),
            tap(theme => this.themeService.apply(theme)),
            map(theme => activeThemeChanged({ themeId: theme.id }))
        )
    )

    private rememberForNextStart({ preference, isSessionRestored }: ResolvedTheme) {
        if (isSessionRestored) {
            this.bootMirror.write(themeBootMirrorFor(preference))
        }
    }

    private tellDesktopShell({ preference, theme }: ResolvedTheme) {
        const colorScheme = preference === SYSTEM_THEME ? SYSTEM_THEME : theme.colorScheme
        this.desktopBridge?.setWindowBackground(theme.render.surface).catch(ignoreRefusal)
        this.desktopBridge?.setColorScheme(colorScheme).catch(ignoreRefusal)
    }
}

function ignoreRefusal() {
    // The native window only mirrors the theme; the page already shows it.
}

function isSameResolution(previous: ResolvedTheme, next: ResolvedTheme): boolean {
    return (
        previous.theme.id === next.theme.id &&
        previous.preference === next.preference &&
        previous.isSessionRestored === next.isSessionRestored
    )
}
