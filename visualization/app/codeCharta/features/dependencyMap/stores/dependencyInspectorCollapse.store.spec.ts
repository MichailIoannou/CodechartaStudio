import { computed, signal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { DependencyInspectorStore } from "./dependencyInspector.store"
import { DependencyInspectorCollapseStore } from "./dependencyInspectorCollapse.store"

describe("DependencyInspectorCollapseStore", () => {
    const subjectId = signal<string | null>(null)
    let store: DependencyInspectorCollapseStore

    beforeEach(() => {
        subjectId.set("box /root/view.ts")
        TestBed.configureTestingModule({
            providers: [
                {
                    provide: DependencyInspectorStore,
                    useValue: { subjectId, isShown: computed(() => subjectId() !== null) } satisfies Partial<DependencyInspectorStore>
                }
            ]
        })
        store = TestBed.inject(DependencyInspectorCollapseStore)
    })

    it("should be expanded while the inspector shows something", () => {
        // Arrange, Act & Assert
        expect(store.isExpanded()).toBe(true)
        expect(store.isCollapsed()).toBe(false)
    })

    it("should stay shown as a strip when collapsed", () => {
        // Act
        store.collapse()

        // Assert
        expect(store.isCollapsed()).toBe(true)
        expect(store.isExpanded()).toBe(false)
    })

    it("should stay collapsed while another subject is selected, and mark it as not yet seen", () => {
        // Arrange
        store.collapse()

        // Act
        subjectId.set("box /root/model.ts")

        // Assert
        expect(store.isCollapsed()).toBe(true)
        expect(store.hasUnseenSelection()).toBe(true)
    })

    it("should count the subject shown when it collapsed as seen", () => {
        // Act
        store.collapse()

        // Assert
        expect(store.hasUnseenSelection()).toBe(false)
    })

    it("should expand again and count nothing as unseen", () => {
        // Arrange
        store.collapse()
        subjectId.set("box /root/model.ts")

        // Act
        store.expand()

        // Assert
        expect(store.isExpanded()).toBe(true)
        expect(store.hasUnseenSelection()).toBe(false)
    })

    it("should open expanded for the next subject once the inspector showed nothing", () => {
        // Arrange
        store.collapse()
        subjectId.set(null)
        TestBed.tick()

        // Act
        subjectId.set("box /root/model.ts")

        // Assert
        expect(store.isExpanded()).toBe(true)
    })

    it("should not count as collapsed while the inspector shows nothing", () => {
        // Arrange
        subjectId.set(null)

        // Act
        store.collapse()

        // Assert
        expect(store.isCollapsed()).toBe(false)
        expect(store.isExpanded()).toBe(false)
    })
})
