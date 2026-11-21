import { Component } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { provideRouter, Router } from "@angular/router"
import { HistoryNavigation } from "./historyNavigation.service"

@Component({ template: "" })
class EmptyViewComponent {}

describe("HistoryNavigation", () => {
    function createNavigation() {
        TestBed.configureTestingModule({
            providers: [
                provideRouter([
                    { path: "", component: EmptyViewComponent },
                    { path: "history", component: EmptyViewComponent }
                ])
            ]
        })
        return TestBed.inject(HistoryNavigation)
    }

    it("should open the History and know that it is shown", async () => {
        // Arrange
        const navigation = createNavigation()
        await TestBed.inject(Router).navigateByUrl("/")
        const isShownBefore = navigation.isShown()

        // Act
        await navigation.open()

        // Assert
        expect(isShownBefore).toBe(false)
        expect(TestBed.inject(Router).url).toBe("/history")
        expect(navigation.isShown()).toBe(true)
    })
})
