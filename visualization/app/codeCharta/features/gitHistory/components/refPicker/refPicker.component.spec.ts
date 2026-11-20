import { ChangeDetectionStrategy, Component, signal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { fireEvent, render, screen } from "@testing-library/angular"
import { aFolder, aProject } from "../../../projects/projects.mocks"
import { ANALYSED_COMMITS, AnalysedCommitMarker } from "../../ports/analysedCommits.port"
import { aLocalBranch, aLogCommit, aRefs, aRepositoryInfo, aStatusOn, aTag } from "../../services/gitApi.mocks"
import { provideGitHistory, settleGit } from "../../services/gitHistoryTestBed.mocks"
import type { RefResolution } from "../../util/refOptions"
import type { RefRange } from "../../util/refRange"
import { COMMIT_SEARCH_DELAY_MS, RefPickerComponent } from "./refPicker.component"

const REPO = { projectId: "p-billing", folderId: "f-api" }
const MAIN = aLocalBranch("main", { isCurrent: true, commit: "a".repeat(40) })
const FEATURE = aLocalBranch("feature/invoice", { commit: "b".repeat(40) })
const TAG = aTag("v2.4.0")
const INVOICE_COMMIT = aLogCommit("e", "Add the invoice table")

@Component({
    template: `<cc-ref-picker
        [repo]="repo"
        [text]="text()"
        label="Base"
        (textChange)="text.set($event)"
        (rangePasted)="ranges.push($event)"
        (resolvedChange)="resolutions.push($event)"
    />`,
    imports: [RefPickerComponent],
    changeDetection: ChangeDetectionStrategy.OnPush
})
class PickerHostComponent {
    readonly repo = REPO
    readonly text = signal("")
    readonly ranges: RefRange[] = []
    readonly resolutions: (RefResolution | null)[] = []
}

describe("RefPickerComponent", () => {
    async function renderPicker(markers = new Map<string, AnalysedCommitMarker>()) {
        provideGitHistory(
            {
                git: {
                    "f-api": {
                        info: aRepositoryInfo(),
                        status: aStatusOn("main"),
                        refs: aRefs({ localBranches: [MAIN, FEATURE], tags: [TAG] }),
                        commits: [INVOICE_COMMIT, aLogCommit("f", "Unrelated")]
                    }
                }
            },
            aProject("p-billing", [aFolder("f-api")])
        )
        TestBed.overrideProvider(ANALYSED_COMMITS, { useValue: { markersFor: () => signal(markers) } })
        const rendered = await render(PickerHostComponent)
        await settleGit()
        return { ...rendered, host: rendered.fixture.componentInstance }
    }

    const input = () => screen.getByRole("combobox")
    const optionTexts = () =>
        screen.queryAllByRole("option").map(option =>
            Array.from(option.querySelectorAll("span"), part => part.textContent?.trim())
                .filter(Boolean)
                .join(" ")
        )

    async function type(text: string) {
        fireEvent.input(input(), { target: { value: text } })
        await settleGit()
    }

    afterEach(() => {
        jest.useRealTimers()
    })

    it("should group branches, tags and commits", async () => {
        // Arrange
        await renderPicker()

        // Act
        fireEvent.click(input())
        await settleGit()

        // Assert
        expect(screen.getAllByRole("group").map(group => group.getAttribute("aria-label"))).toEqual(["Branches", "Tags"])
        expect(optionTexts()).toEqual([
            expect.stringContaining("main aaaaaaa"),
            expect.stringContaining("feature/invoice bbbbbbb"),
            expect.stringContaining("v2.4.0 ddddddd")
        ])
    })

    it("should search commits after the debounce", async () => {
        // Arrange
        await renderPicker()
        jest.useFakeTimers()

        // Act
        fireEvent.input(input(), { target: { value: "invoice" } })
        const searching = screen.queryByTestId("ref-picker-searching")
        jest.advanceTimersByTime(COMMIT_SEARCH_DELAY_MS)
        jest.useRealTimers()
        await settleGit()

        // Assert
        expect(searching).not.toBeNull()
        expect(screen.queryByTestId("ref-picker-searching")).toBeNull()
        expect(optionTexts()).toEqual([
            expect.stringContaining("feature/invoice"),
            expect.stringContaining("eeeeeee Add the invoice table")
        ])
    })

    it("should mark refs that have an analysis", async () => {
        // Arrange
        await renderPicker(new Map([[FEATURE.commit, { state: "analysed", isLoadedInMap: false }]]))

        // Act
        fireEvent.click(input())
        await settleGit()

        // Assert
        const marks = screen.getAllByRole("option").map(option => option.querySelector("[aria-label$='nalysed']")?.getAttribute("title"))
        expect(marks).toEqual(["Not analysed", "Analysed", "Not analysed"])
    })

    it("should fill both sides from a pasted range", async () => {
        // Arrange
        const { host } = await renderPicker()

        // Act
        await type("main...feature/invoice")

        // Assert
        expect(host.ranges).toEqual([{ base: "main", head: "feature/invoice", isMergeBase: true }])
        expect(host.text()).toBe("")
    })

    it("should pick the active option with the keyboard and tell what it names", async () => {
        // Arrange
        const { host } = await renderPicker()
        fireEvent.click(input())
        await settleGit()

        // Act
        fireEvent.keyDown(input(), { key: "ArrowDown" })
        fireEvent.keyDown(input(), { key: "ArrowDown" })
        fireEvent.keyDown(input(), { key: "Enter" })
        await settleGit()

        // Assert
        expect(host.text()).toBe("feature/invoice")
        expect(screen.queryByRole("listbox")).toBeNull()
        expect(host.resolutions.at(-1)).toEqual(expect.objectContaining({ kind: "branch", sha: FEATURE.commit }))
        expect(screen.getByTestId("ref-picker-resolved").textContent).toContain("not analysed")
    })

    it("should close the list on the first Escape and let the second one through", async () => {
        // Arrange
        await renderPicker()
        fireEvent.click(input())
        await settleGit()

        // Act
        const first = fireEvent.keyDown(input(), { key: "Escape" })
        await settleGit()
        const second = fireEvent.keyDown(input(), { key: "Escape" })

        // Assert
        expect(first).toBe(false)
        expect(second).toBe(true)
        expect(screen.queryByRole("listbox")).toBeNull()
    })

    it("should say when nothing matches", async () => {
        // Arrange
        await renderPicker()
        jest.useFakeTimers()

        // Act
        fireEvent.input(input(), { target: { value: "xyz" } })
        jest.advanceTimersByTime(COMMIT_SEARCH_DELAY_MS)
        jest.useRealTimers()
        await settleGit()

        // Assert
        expect(screen.getByRole("listbox").textContent).toContain("No branch, tag or commit matches 'xyz'.")
    })
})
