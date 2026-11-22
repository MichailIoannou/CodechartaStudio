import { signal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { provideMockActions } from "@ngrx/effects/testing"
import { Action } from "@ngrx/store"
import { MockStore, provideMockStore } from "@ngrx/store/testing"
import { Subject } from "rxjs"
import { ColorScheme, ThemePreference } from "../../../../model/theme.model"
import { filesLoaded } from "../../../../stores/fileStore/fileStore.facade"
import { themePreferenceSelector } from "../../../../stores/preferences/preferences.read.facade"
import { activeThemeChanged, setThemePreference } from "../../../../stores/preferences/preferences.write.facade"
import { createFakeDesktopBridge, FakeDesktopBridge } from "../../../../util/desktop/desktopBridge.mocks"
import { DESKTOP_BRIDGE } from "../../../../util/desktop/desktopBridge.token"
import { ThemeBootMirror, ThemeBootMirrorRepo, themeBootMirrorFor } from "../../repos/themeBootMirror.repo"
import { SystemColorSchemeService } from "../../services/systemColorScheme.service"
import { ThemeService } from "../../services/theme.service"
import { ApplyThemeEffect } from "./applyTheme.effect"

describe("ApplyThemeEffect", () => {
    let actions$: Subject<Action>
    let store: MockStore
    let systemScheme: ReturnType<typeof signal<ColorScheme>>
    let apply: jest.Mock
    let writeMirror: jest.Mock
    let dispatched: Action[]
    let bridge: FakeDesktopBridge | null

    function setup({
        storedPreference = "cc-dark",
        mirror = null,
        desktop = null
    }: {
        storedPreference?: ThemePreference
        mirror?: ThemeBootMirror | null
        desktop?: FakeDesktopBridge | null
    }) {
        bridge = desktop
        actions$ = new Subject<Action>()
        systemScheme = signal<ColorScheme>("light")
        apply = jest.fn()
        writeMirror = jest.fn()
        TestBed.configureTestingModule({
            providers: [
                ApplyThemeEffect,
                provideMockActions(() => actions$),
                provideMockStore({ selectors: [{ selector: themePreferenceSelector, value: storedPreference }] }),
                { provide: SystemColorSchemeService, useValue: { scheme: systemScheme.asReadonly() } },
                { provide: ThemeService, useValue: { apply } },
                { provide: DESKTOP_BRIDGE, useValue: desktop },
                { provide: ThemeBootMirrorRepo, useValue: { read: () => mirror, write: writeMirror } }
            ]
        })
        store = TestBed.inject(MockStore)
        dispatched = []
        TestBed.inject(ApplyThemeEffect).applyTheme$.subscribe(action => dispatched.push(action))
        TestBed.tick()
    }

    const appliedIds = () => apply.mock.calls.map(([theme]) => theme.id)

    function restoreSession(preference: ThemePreference) {
        store.overrideSelector(themePreferenceSelector, preference)
        store.refreshState()
        actions$.next(filesLoaded({ source: "indexedDB" } as Parameters<typeof filesLoaded>[0]))
    }

    it("should start in the dark theme without a saved session", () => {
        // Arrange & Act
        setup({})

        // Assert
        expect(appliedIds()).toEqual(["cc-dark"])
        expect(dispatched).toEqual([activeThemeChanged({ themeId: "cc-dark" })])
    })

    it("should keep the mirrored theme until the session is restored", () => {
        // Arrange
        setup({ mirror: themeBootMirrorFor("cc-light") })

        // Act
        restoreSession("cc-light")

        // Assert
        expect(appliedIds()).toEqual(["cc-light"])
        expect(dispatched).toEqual([activeThemeChanged({ themeId: "cc-light" })])
    })

    it("should not write the mirror before the session is restored", () => {
        // Arrange
        setup({ mirror: themeBootMirrorFor("cc-light") })
        expect(writeMirror).not.toHaveBeenCalled()

        // Act
        restoreSession("cc-light")

        // Assert
        expect(writeMirror).toHaveBeenCalledWith(themeBootMirrorFor("cc-light"))
    })

    it("should take the saved theme once the session is restored even when the mirror said otherwise", () => {
        // Arrange
        setup({ mirror: themeBootMirrorFor("cc-light") })

        // Act
        restoreSession("cc-dark")

        // Assert
        expect(appliedIds()).toEqual(["cc-light", "cc-dark"])
        expect(writeMirror).toHaveBeenLastCalledWith(themeBootMirrorFor("cc-dark"))
    })

    it("should announce the theme the system switched to while following the system", () => {
        // Arrange
        setup({ storedPreference: "system" })
        restoreSession("system")

        // Act
        systemScheme.set("dark")
        TestBed.tick()

        // Assert
        expect(appliedIds()).toEqual(["cc-light", "cc-dark"])
        expect(dispatched.at(-1)).toEqual(activeThemeChanged({ themeId: "cc-dark" }))
    })

    it("should apply a picked theme and remember it for the next start", () => {
        // Arrange
        setup({})

        // Act
        store.overrideSelector(themePreferenceSelector, "cc-light")
        store.refreshState()
        actions$.next(setThemePreference({ value: "cc-light" }))

        // Assert
        expect(appliedIds()).toEqual(["cc-dark", "cc-light"])
        expect(writeMirror).toHaveBeenLastCalledWith(themeBootMirrorFor("cc-light"))
    })

    it("should apply the theme before announcing it, so a render triggered by the announcement paints it", () => {
        // Arrange
        setup({})
        let appliedWhenAnnounced: string[] = []
        TestBed.inject(ApplyThemeEffect).applyTheme$.subscribe(() => {
            appliedWhenAnnounced = appliedIds()
        })
        TestBed.tick()

        // Act
        store.overrideSelector(themePreferenceSelector, "cc-light")
        store.refreshState()

        // Assert
        expect(appliedWhenAnnounced.at(-1)).toBe("cc-light")
    })

    it("should rewrite the mirror without announcing a theme that stayed the same", () => {
        // Arrange
        setup({})

        // Act
        restoreSession("cc-dark")

        // Assert
        expect(writeMirror).toHaveBeenCalledWith(themeBootMirrorFor("cc-dark"))
        expect(dispatched).toEqual([activeThemeChanged({ themeId: "cc-dark" })])
    })

    it("should tell the desktop shell about the theme", () => {
        // Arrange
        const desktop = createFakeDesktopBridge()
        setup({ desktop })

        // Act
        store.overrideSelector(themePreferenceSelector, "cc-light")
        store.refreshState()

        // Assert
        expect(desktop.calls.filter(call => call.name !== "subscribe")).toEqual([
            { name: "setWindowBackground", args: ["#1e2329"] },
            { name: "setColorScheme", args: ["dark"] },
            { name: "setTitleBarColors", args: [{ color: "#1e2329", symbolColor: "#e6e9ee" }] },
            { name: "setWindowBackground", args: ["#ffffff"] },
            { name: "setColorScheme", args: ["light"] },
            { name: "setTitleBarColors", args: [{ color: "#ffffff", symbolColor: expect.stringMatching(/^#[0-9a-f]{6}$/i) }] }
        ])
    })

    it("should let the desktop shell follow the system while the preference is to follow the system", () => {
        // Arrange
        const desktop = createFakeDesktopBridge()
        setup({ storedPreference: "system", desktop })

        // Act
        restoreSession("system")

        // Assert
        expect(desktop.calls.filter(call => call.name === "setColorScheme").at(-1)).toEqual({ name: "setColorScheme", args: ["system"] })
    })

    it("should ignore a desktop shell that refuses the theme", () => {
        // Arrange
        const desktop = createFakeDesktopBridge()
        desktop.failWith("setWindowBackground", { code: "BAD_REQUEST", message: "no", details: {} })
        desktop.failWith("setColorScheme", { code: "BAD_REQUEST", message: "no", details: {} })
        desktop.failWith("setTitleBarColors", { code: "BAD_REQUEST", message: "no", details: {} })

        // Act
        setup({ desktop })

        // Assert
        expect(appliedIds()).toEqual(["cc-dark"])
        expect(dispatched).toEqual([activeThemeChanged({ themeId: "cc-dark" })])
    })

    it("should work without a desktop shell", () => {
        // Arrange & Act
        setup({ desktop: null })

        // Assert
        expect(bridge).toBeNull()
        expect(appliedIds()).toEqual(["cc-dark"])
    })
})
