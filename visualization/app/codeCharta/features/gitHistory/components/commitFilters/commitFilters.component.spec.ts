import { TestBed } from "@angular/core/testing"
import { fireEvent, render, screen } from "@testing-library/angular"
import { aFolder, aProject } from "../../../projects/projects.mocks"
import { aRefs, aRepositoryInfo, aStatusOn } from "../../services/gitApi.mocks"
import { provideGitHistory, settleGit } from "../../services/gitHistoryTestBed.mocks"
import { GitLogService } from "../../services/gitLog.service"
import { CommitFiltersComponent, FILTER_DEBOUNCE_MS } from "./commitFilters.component"

const BILLING = aProject("p-billing", [aFolder("f-api", { label: "billing-api" })])

describe("CommitFiltersComponent", () => {
    async function renderFilters() {
        provideGitHistory({ git: { "f-api": { info: aRepositoryInfo(), status: aStatusOn("main"), refs: aRefs(), commits: [] } } }, BILLING)
        const rendered = await render(CommitFiltersComponent)
        await settleGit()
        jest.useFakeTimers()
        return { ...rendered, log: TestBed.inject(GitLogService) }
    }

    afterEach(() => {
        jest.useRealTimers()
    })

    it("should filter the commit list by text, author and path after a pause in typing", async () => {
        // Arrange
        const { log } = await renderFilters()

        // Act
        fireEvent.input(screen.getByTestId("history-search"), { target: { value: "round" } })
        fireEvent.input(screen.getByTestId("history-author"), { target: { value: "mia" } })
        fireEvent.input(screen.getByTestId("history-path"), { target: { value: "src/app" } })
        const beforePause = log.filter()
        jest.advanceTimersByTime(FILTER_DEBOUNCE_MS)

        // Assert
        expect(beforePause).toEqual({ text: "", author: "", path: "" })
        expect(log.filter()).toEqual({ text: "round", author: "mia", path: "src/app" })
    })

    it("should say each input filters the commit list", async () => {
        // Arrange & Act
        await renderFilters()

        // Assert
        const inputs = [
            screen.getByTestId("history-search").closest("label"),
            screen.getByTestId("history-author"),
            screen.getByTestId("history-path")
        ]
        expect(inputs.map(input => input?.getAttribute("title"))).toEqual(Array(3).fill("Filters the commit list"))
        expect(screen.getByTestId("history-search").getAttribute("placeholder")).toBe("Search messages and hashes")
    })

    it("should offer Clear while a filter is set and clear every filter at once", async () => {
        // Arrange
        const { log, detectChanges } = await renderFilters()
        const clearBefore = screen.queryByTestId("history-clear-filters")
        fireEvent.input(screen.getByTestId("history-search"), { target: { value: "round" } })
        jest.advanceTimersByTime(FILTER_DEBOUNCE_MS)
        detectChanges()

        // Act
        fireEvent.click(screen.getByTestId("history-clear-filters"))
        detectChanges()

        // Assert
        expect(clearBefore).toBeNull()
        expect(log.filter()).toEqual({ text: "", author: "", path: "" })
        expect((screen.getByTestId("history-search") as HTMLInputElement).value).toBe("")
        expect(screen.queryByTestId("history-clear-filters")).toBeNull()
    })

    it("should say the graph is hidden while filtered", async () => {
        // Arrange
        const { log, detectChanges } = await renderFilters()

        // Act
        log.setFilter({ text: "round", author: "", path: "" })
        detectChanges()

        // Assert
        expect(screen.getByTestId("history-filtered-note").textContent.trim()).toBe("Filtered — the graph is hidden while searching.")
    })

    it("should count the author and path filters on the narrow Filters button", async () => {
        // Arrange
        const { log, detectChanges } = await renderFilters()

        // Act
        log.setFilter({ text: "", author: "mia", path: "src" })
        detectChanges()

        // Assert
        const button = screen.getByTestId("history-filters-button")
        expect(button.getAttribute("popovertarget")).toBe("commit-filters-popover")
        expect(button.textContent.replaceAll(/\s+/g, " ").trim()).toBe("Filters 2")
    })

    it("should follow a filter cleared elsewhere", async () => {
        // Arrange
        const { log, detectChanges } = await renderFilters()
        log.setFilter({ text: "round", author: "", path: "" })
        detectChanges()

        // Act
        log.clearFilter()
        detectChanges()

        // Assert
        expect((screen.getByTestId("history-search") as HTMLInputElement).value).toBe("")
    })
})
