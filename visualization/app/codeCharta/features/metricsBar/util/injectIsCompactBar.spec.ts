import { Component, inject } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { CompactBarDirective } from "../../shared/facade"
import { injectIsCompactBar } from "./injectIsCompactBar"

@Component({ selector: "cc-test-cell", template: "" })
class TestCellComponent {
    readonly isCompact = injectIsCompactBar()
}

@Component({ selector: "cc-test-bar", template: "<cc-test-cell />", imports: [TestCellComponent], hostDirectives: [CompactBarDirective] })
class TestBarComponent {
    readonly compactBar = inject(CompactBarDirective)
}

describe("injectIsCompactBar", () => {
    it("should be full outside a compact bar", () => {
        // Act
        const fixture = TestBed.createComponent(TestCellComponent)

        // Assert
        expect(fixture.componentInstance.isCompact()).toBe(false)
    })

    it("should follow the bar the cell sits in", () => {
        // Act
        const fixture = TestBed.createComponent(TestBarComponent)
        fixture.detectChanges()

        // Assert
        const cell = fixture.debugElement.children[0].componentInstance as TestCellComponent
        expect(cell.isCompact).toBe(fixture.componentInstance.compactBar.isCompact)
    })
})
