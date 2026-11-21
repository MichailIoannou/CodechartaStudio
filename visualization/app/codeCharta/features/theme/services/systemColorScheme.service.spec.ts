import { TestBed } from "@angular/core/testing"
import { SystemColorSchemeService } from "./systemColorScheme.service"

describe("SystemColorSchemeService", () => {
    const originalMatchMedia = globalThis.matchMedia

    afterEach(() => {
        globalThis.matchMedia = originalMatchMedia
    })

    function stubMatchMedia(prefersDark: boolean) {
        const listeners: ((event: MediaQueryListEvent) => void)[] = []
        const query = {
            matches: prefersDark,
            addEventListener: jest.fn((_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.push(listener)),
            removeEventListener: jest.fn()
        }
        globalThis.matchMedia = jest.fn(() => query as unknown as MediaQueryList)
        const switchTo = (dark: boolean) => {
            for (const listener of listeners) {
                listener({ matches: dark } as MediaQueryListEvent)
            }
        }
        return { query, switchTo }
    }

    it("should report light without matchMedia", () => {
        // Arrange
        globalThis.matchMedia = undefined

        // Act
        const service = TestBed.inject(SystemColorSchemeService)

        // Assert
        expect(service.scheme()).toBe("light")
    })

    it("should start in the scheme the system reports", () => {
        // Arrange
        stubMatchMedia(true)

        // Act
        const service = TestBed.inject(SystemColorSchemeService)

        // Assert
        expect(service.scheme()).toBe("dark")
        expect(globalThis.matchMedia).toHaveBeenCalledWith("(prefers-color-scheme: dark)")
    })

    it("should follow a change of the system scheme", () => {
        // Arrange
        const { switchTo } = stubMatchMedia(false)
        const service = TestBed.inject(SystemColorSchemeService)

        // Act
        switchTo(true)

        // Assert
        expect(service.scheme()).toBe("dark")
    })

    it("should stop listening when it is destroyed", () => {
        // Arrange
        const { query } = stubMatchMedia(false)
        TestBed.inject(SystemColorSchemeService)

        // Act
        TestBed.resetTestingModule()

        // Assert
        expect(query.removeEventListener).toHaveBeenCalledWith("change", expect.any(Function))
    })
})
