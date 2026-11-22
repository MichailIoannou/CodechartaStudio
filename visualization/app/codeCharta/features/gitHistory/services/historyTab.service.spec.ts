import { TestBed } from "@angular/core/testing"
import { aFolder, aProject } from "../../projects/projects.mocks"
import { provideGitHistory } from "./gitHistoryTestBed.mocks"
import { HistoryTabService } from "./historyTab.service"

const BILLING = aProject("p-billing", [aFolder("f-api")])
const SHOP = aProject("p-shop", [aFolder("f-shop")])

describe("HistoryTabService", () => {
    beforeEach(() => {
        localStorage.clear()
    })

    it("should remember the tab per project", () => {
        // Arrange
        const { activeProject } = provideGitHistory({}, BILLING)
        const tabs = TestBed.inject(HistoryTabService)

        // Act
        tabs.select("changes")
        activeProject.set(SHOP)
        const shopTab = tabs.tab()
        activeProject.set(BILLING)

        // Assert
        expect(shopTab).toBe("log")
        expect(tabs.tab()).toBe("changes")
        expect(localStorage.getItem("codeChartaHistoryTab.p-billing")).toBe("changes")
    })

    it("should open the tab a project had last time", () => {
        // Arrange
        localStorage.setItem("codeChartaHistoryTab.p-billing", "changes")
        provideGitHistory({}, BILLING)

        // Act
        const tab = TestBed.inject(HistoryTabService).tab()

        // Assert
        expect(tab).toBe("changes")
    })

    it("should show the log and remember nothing without a project", () => {
        // Arrange
        provideGitHistory({}, null)
        const tabs = TestBed.inject(HistoryTabService)

        // Act
        tabs.select("changes")

        // Assert
        expect(tabs.tab()).toBe("log")
        expect(localStorage.length).toBe(0)
    })
})
