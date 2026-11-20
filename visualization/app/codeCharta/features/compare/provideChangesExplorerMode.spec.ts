import { computed, signal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { EXPLORER_CONDITIONAL_MODES } from "../sidebarExplorer/facade"
import { provideChangesExplorerMode } from "./provideChangesExplorerMode"
import { CompareStore } from "./stores/compare.store"

describe("provideChangesExplorerMode", () => {
    it("should offer the Changes mode only during a project comparison", () => {
        // Arrange
        const isActive = signal(false)
        const isShowingNoDifferences = signal(false)
        TestBed.configureTestingModule({
            providers: [
                provideChangesExplorerMode(),
                {
                    provide: CompareStore,
                    useValue: { isActive: computed(isActive), isShowingNoDifferences: computed(isShowingNoDifferences) }
                }
            ]
        })
        const [modes] = TestBed.inject(EXPLORER_CONDITIONAL_MODES)

        // Act
        const withoutComparison = modes()
        isActive.set(true)
        const whileComparing = modes()
        isActive.set(false)
        isShowingNoDifferences.set(true)
        const withoutDifferences = modes()

        // Assert
        expect(withoutComparison).toEqual([])
        expect(whileComparing.map(mode => mode.id)).toEqual(["changes"])
        expect(whileComparing[0].hidesListTools).toBe(true)
        expect(withoutDifferences.map(mode => mode.id)).toEqual(["changes"])
    })
})
