import { signal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { Store, StoreModule } from "@ngrx/store"
import { render, screen } from "@testing-library/angular"
import userEvent from "@testing-library/user-event"
import { TEST_FILE_DATA, TEST_FILE_DATA_JAVA } from "../../../../mocks/dataMocks"
import { addFile, setDelta } from "../../../../stores/fileStore/store/files.actions"
import { appReducers, setStateMiddleware } from "../../../../stores/rootStore/store"
import { ProjectsFacade } from "../../../projects/facade"
import { aFolder, aProject } from "../../../projects/projects.mocks"
import { ToastService } from "../../../shared/facade"
import { LoadedSide, ResolvedComparison } from "../../model/compare.model"
import { aCommitSnapshot, aComparedCommit, aResolvedComparison, BASE_SHA, FOLDER, FORK, HEAD_SHA } from "../../ports/compareGateways.mocks"
import { CompareService } from "../../services/compare.service"
import { CompareStore } from "../../stores/compare.store"
import { ComparisonChipComponent } from "./comparisonChip.component"

const BASE: LoadedSide = {
    requested: aComparedCommit(BASE_SHA, { kind: "branch", name: "main" }),
    snapshot: aCommitSnapshot("3c4d5e6".padEnd(40, "0")),
    relation: "ancestor",
    staleBy: 2,
    behind: 2,
    ahead: 0,
    checksum: TEST_FILE_DATA.fileMeta.fileChecksum
}
const HEAD: LoadedSide = {
    requested: aComparedCommit(HEAD_SHA),
    snapshot: aCommitSnapshot(HEAD_SHA),
    relation: null,
    staleBy: 0,
    behind: 0,
    ahead: 0,
    checksum: TEST_FILE_DATA_JAVA.fileMeta.fileChecksum
}

const BILLING = aProject("p-billing", [aFolder("f-api", { label: "billing-api" }), aFolder("f-fork", { label: "billing-fork" })])

describe("ComparisonChipComponent", () => {
    let service: { swap: jest.Mock; exit: jest.Mock }
    let toast: jest.Mock

    async function renderChip(phase: "active" | "noDifferences" = "active", resolved: ResolvedComparison | null = null, head = HEAD) {
        service = { swap: jest.fn(), exit: jest.fn() }
        toast = jest.fn()
        await render(ComparisonChipComponent, {
            imports: [StoreModule.forRoot(appReducers, { metaReducers: [setStateMiddleware] })],
            providers: [
                { provide: CompareService, useValue: service },
                { provide: ToastService, useValue: { show: toast } },
                { provide: ProjectsFacade, useValue: { activeProject: signal(BILLING) } }
            ]
        })
        const store = TestBed.inject(Store)
        store.dispatch(addFile({ file: TEST_FILE_DATA }))
        store.dispatch(addFile({ file: TEST_FILE_DATA_JAVA }))
        store.dispatch(setDelta({ referenceFile: TEST_FILE_DATA, comparisonFile: TEST_FILE_DATA_JAVA }))
        const shownHead = phase === "noDifferences" ? { ...head, checksum: TEST_FILE_DATA.fileMeta.fileChecksum } : head
        TestBed.inject(CompareStore).set({
            phase,
            resolved,
            base: BASE,
            head: shownHead,
            error: null,
            analyses: [],
            changedFiles: null,
            changeRequest: null
        })
        await screen.findByTestId("comparison-chip")
    }

    const fullTextOf = (badge: HTMLElement) => badge.firstElementChild?.textContent?.trim()

    async function chooseAction(name: string) {
        await userEvent.click(screen.getByRole("button", { name: "Comparison actions" }))
        await userEvent.click(screen.getByRole("menuitem", { name }))
    }

    it("should show both short commits and their ref names", async () => {
        // Act
        await renderChip()

        // Assert
        expect(screen.getByTestId("comparison-base").textContent).toMatch(/base\s*9f8e7d6\s*main/)
        expect(screen.getByTestId("comparison-head").textContent).toMatch(/head\s*a1b2c3d\s*$/)
    })

    it("should show how stale each side is", async () => {
        // Arrange
        await renderChip()
        const older = screen.getByTestId("comparison-stale")
        const olderText = [fullTextOf(older), older.getAttribute("title")]

        // Act
        TestBed.inject(CompareStore).update({
            base: { ...BASE, relation: "descendant", staleBy: 3, behind: 0, ahead: 3 },
            head: { ...HEAD, relation: "diverged", staleBy: 5, behind: 3, ahead: 2 }
        })
        TestBed.tick()

        // Assert
        expect(olderText).toEqual(["stale by 2", "No analysis for 9f8e7d6. Showing 3c4d5e6, 2 commits older."])
        expect(screen.getAllByTestId("comparison-stale").map(badge => [fullTextOf(badge), badge.getAttribute("title")])).toEqual([
            ["ahead by 3", "No analysis for 9f8e7d6. Showing 3c4d5e6, which is ahead by 3 commits."],
            ["diverged 3↓ 2↑", "No analysis for a1b2c3d. Showing a1b2c3d from a diverged line: 3 behind / 2 ahead."]
        ])
    })

    it("should shorten each stale badge to a clock and its number for a narrow window", async () => {
        // Arrange
        await renderChip()

        // Act
        TestBed.inject(CompareStore).update({ head: { ...HEAD, relation: "diverged", staleBy: 5, behind: 3, ahead: 2 } })
        TestBed.tick()

        // Assert
        const shortForms = screen.getAllByTestId("comparison-stale-short")
        expect(shortForms.map(short => short.textContent?.trim())).toEqual(["2", "3↓ 2↑"])
        expect(shortForms[0].className).toContain("xl:hidden")
        expect(shortForms[0].querySelector(".fa-clock-rotate-left")).not.toBeNull()
    })

    it("should hide the captions below 2xl and name the side in its title", async () => {
        // Act
        await renderChip()

        // Assert
        expect(screen.getAllByTestId("comparison-caption").map(caption => caption.className)).toEqual([
            expect.stringContaining("hidden"),
            expect.stringContaining("hidden")
        ])
        expect(screen.getByTestId("comparison-base").getAttribute("title")).toBe("Base: 9f8e7d6 main")
        expect(screen.getByTestId("comparison-head").getAttribute("title")).toBe("Head: a1b2c3d")
    })

    it("should keep at least six characters of the branch label", async () => {
        // Act
        await renderChip()

        // Assert
        expect(screen.getByTestId("comparison-base").querySelector(".truncate")?.className).toContain("min-w-16")
    })

    it("should move the base mode into the caret menu below 2xl", async () => {
        // Arrange
        await renderChip("active", aResolvedComparison({ origin: "branches", baseMode: "tip" }))

        // Act
        await userEvent.click(screen.getByRole("button", { name: "Comparison actions" }))

        // Assert
        expect(screen.getByTestId("comparison-base-mode").className).toContain("2xl:inline-flex")
        const menuLine = screen.getByTestId("comparison-menu-base-mode")
        expect(menuLine.textContent?.trim()).toBe("Tip vs tip")
        expect(menuLine.getAttribute("title")).toBe("Everything that differs between the two tips")
        expect(menuLine.className).toContain("2xl:hidden")
    })

    it("should link the pull request and copy the range with its link", async () => {
        // Arrange
        const writeText = jest.fn().mockResolvedValue(undefined)
        Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
        await renderChip()
        const changeRequest = {
            folder: FOLDER,
            provider: "github" as const,
            number: 7,
            remote: "origin",
            baseRefName: "main",
            url: "https://github.com/mia/billing/pull/7"
        }
        TestBed.inject(CompareStore).update({ changeRequest })
        TestBed.tick()

        // Act
        await chooseAction("Copy as text")

        // Assert
        const badge = screen.getByTestId("comparison-pull-request")
        expect(badge.getAttribute("href")).toBe("https://github.com/mia/billing/pull/7")
        expect(badge.getAttribute("title")).toBe("Pull request #7")
        expect(badge.textContent?.trim()).toBe("#7")
        expect(writeText).toHaveBeenCalledWith("main..a1b2c3d https://github.com/mia/billing/pull/7")
    })

    it("should show a merge request without a link when its page is unknown", async () => {
        // Arrange
        await renderChip()

        // Act
        TestBed.inject(CompareStore).update({
            changeRequest: { folder: FOLDER, provider: "gitlab", number: 7, remote: "origin", baseRefName: "main", url: null }
        })
        TestBed.tick()

        // Assert
        const badge = screen.getByTestId("comparison-pull-request")
        expect(badge.tagName).toBe("SPAN")
        expect(badge.getAttribute("title")).toBe("Merge request !7")
    })

    it("should count the files git changed when there are no metric differences", async () => {
        // Arrange
        await renderChip("noDifferences")

        // Act
        TestBed.inject(CompareStore).update({
            changedFiles: { source: "git", files: [{ change: "modified", path: "README.md", previousPath: null }] }
        })
        TestBed.tick()

        // Assert
        expect(screen.getByTestId("comparison-git-line").textContent).toBe("1 file changed in git")
    })

    it("should say that there are no metric differences", async () => {
        // Act
        await renderChip("noDifferences")

        // Assert
        expect(screen.getByTestId("comparison-no-differences").textContent?.replace(/\s+/g, " ").trim()).toBe(
            "No metric differences between 9f8e7d6 and a1b2c3d"
        )
        expect(screen.queryByTestId("comparison-swap")).toBeNull()
    })

    it("should swap from the chip and from its menu", async () => {
        // Arrange
        await renderChip()

        // Act
        await userEvent.click(screen.getByTestId("comparison-swap"))
        await chooseAction("Swap base and head")

        // Assert
        expect(service.swap).toHaveBeenCalledTimes(2)
    })

    it("should leave the comparison from its menu", async () => {
        // Arrange
        await renderChip()

        // Act
        await chooseAction("Leave compare")

        // Assert
        expect(service.exit).toHaveBeenCalled()
        expect(screen.queryByRole("menu")).toBeNull()
    })

    it("should open the dialog with both sides when a side or Change… is clicked", async () => {
        // Arrange
        await renderChip()
        const store = TestBed.inject(CompareStore)

        // Act
        await userEvent.click(screen.getByTestId("comparison-head"))
        const prefillFromSide = store.dialogPrefill()
        store.closeDialog()
        await chooseAction("Change…")

        // Assert
        expect(prefillFromSide).toEqual({ folder: FOLDER, base: "main", head: "a1b2c3d" })
        expect(store.dialogPrefill()).toEqual(prefillFromSide)
    })

    it("should name each side's folder and keep the head folder when two folders are compared", async () => {
        // Arrange
        const forkHead = { ...HEAD, requested: aComparedCommit(HEAD_SHA, { kind: "branch", name: "main" }, FORK) }
        const resolved = aResolvedComparison({
            origin: "folders",
            head: { requested: forkHead.requested, status: { status: "exact", snapshot: HEAD.snapshot } }
        })
        await renderChip("active", resolved, forkHead)
        const store = TestBed.inject(CompareStore)

        // Act
        await chooseAction("Change…")

        // Assert
        expect(screen.getByTestId("comparison-head").getAttribute("title")).toBe("Head: a1b2c3d main in billing-fork")
        expect(screen.getByTestId("comparison-base").getAttribute("title")).toBe("Base: 9f8e7d6 main in billing-api")
        expect(store.dialogPrefill()).toEqual({ folder: FOLDER, base: "main", head: "main", headFolder: FORK })
    })

    it("should copy the range as text", async () => {
        // Arrange
        await renderChip()
        const writeText = jest.fn().mockResolvedValue(undefined)
        Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })

        // Act
        await chooseAction("Copy as text")

        // Assert
        expect(writeText).toHaveBeenCalledWith("main..a1b2c3d")
        expect(toast).toHaveBeenCalledWith("Copied main..a1b2c3d")
    })

    it("should copy a merge-base range from the branch the base came from and name the base mode", async () => {
        // Arrange
        const writeText = jest.fn().mockResolvedValue(undefined)
        Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
        const resolved = aResolvedComparison({
            origin: "branches",
            baseMode: "mergeBase",
            base: { requested: aComparedCommit(BASE_SHA), status: { status: "missing", nearest: null } },
            head: {
                requested: aComparedCommit(HEAD_SHA, { kind: "branch", name: "feature/x" }),
                status: { status: "missing", nearest: null }
            },
            baseTip: aComparedCommit("7777777".padEnd(40, "0"), { kind: "branch", name: "main" })
        })
        await renderChip("active", resolved)

        // Act
        await chooseAction("Copy as text")

        // Assert
        expect(writeText).toHaveBeenCalledWith("main...a1b2c3d")
        const badge = screen.getByTestId("comparison-base-mode")
        expect(badge.textContent?.trim()).toBe("since merge base")
        expect(badge.getAttribute("title")).toBe("Changes on 'feature/x' since it left 'main'")
    })

    it("should name tip vs tip for branches and nothing for two commits", async () => {
        // Arrange
        await renderChip("active", aResolvedComparison({ origin: "branches", baseMode: "tip" }))
        const forBranches = screen.getByTestId("comparison-base-mode").getAttribute("title")
        TestBed.inject(CompareStore).update({ resolved: aResolvedComparison() })

        // Act
        TestBed.tick()

        // Assert
        expect(forBranches).toBe("Everything that differs between the two tips")
        expect(screen.queryByTestId("comparison-base-mode")).toBeNull()
    })

    it("should close its menu on a click elsewhere", async () => {
        // Arrange
        await renderChip()
        await userEvent.click(screen.getByRole("button", { name: "Comparison actions" }))

        // Act
        await userEvent.click(document.body)

        // Assert
        expect(screen.queryByRole("menu")).toBeNull()
    })
})
