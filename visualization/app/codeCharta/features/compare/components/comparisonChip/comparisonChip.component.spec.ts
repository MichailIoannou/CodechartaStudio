import { TestBed } from "@angular/core/testing"
import { Store, StoreModule } from "@ngrx/store"
import { render, screen } from "@testing-library/angular"
import userEvent from "@testing-library/user-event"
import { TEST_FILE_DATA, TEST_FILE_DATA_JAVA } from "../../../../mocks/dataMocks"
import { addFile, setDelta } from "../../../../stores/fileStore/store/files.actions"
import { appReducers, setStateMiddleware } from "../../../../stores/rootStore/store"
import { ToastService } from "../../../shared/facade"
import { LoadedSide, ResolvedComparison } from "../../model/compare.model"
import { aCommitSnapshot, aComparedCommit, aResolvedComparison, BASE_SHA, FOLDER, HEAD_SHA } from "../../ports/compareGateways.mocks"
import { CompareService } from "../../services/compare.service"
import { CompareStore } from "../../stores/compare.store"
import { ComparisonChipComponent } from "./comparisonChip.component"

const BASE: LoadedSide = {
    requested: aComparedCommit(BASE_SHA, { kind: "branch", name: "main" }),
    snapshot: aCommitSnapshot("3c4d5e6".padEnd(40, "0")),
    relation: "ancestor",
    staleBy: 2,
    checksum: TEST_FILE_DATA.fileMeta.fileChecksum
}
const HEAD: LoadedSide = {
    requested: aComparedCommit(HEAD_SHA),
    snapshot: aCommitSnapshot(HEAD_SHA),
    relation: null,
    staleBy: 0,
    checksum: TEST_FILE_DATA_JAVA.fileMeta.fileChecksum
}

describe("ComparisonChipComponent", () => {
    let service: { swap: jest.Mock; exit: jest.Mock }
    let toast: jest.Mock

    async function renderChip(phase: "active" | "noDifferences" = "active", resolved: ResolvedComparison | null = null) {
        service = { swap: jest.fn(), exit: jest.fn() }
        toast = jest.fn()
        await render(ComparisonChipComponent, {
            imports: [StoreModule.forRoot(appReducers, { metaReducers: [setStateMiddleware] })],
            providers: [
                { provide: CompareService, useValue: service },
                { provide: ToastService, useValue: { show: toast } }
            ]
        })
        const store = TestBed.inject(Store)
        store.dispatch(addFile({ file: TEST_FILE_DATA }))
        store.dispatch(addFile({ file: TEST_FILE_DATA_JAVA }))
        store.dispatch(setDelta({ referenceFile: TEST_FILE_DATA, comparisonFile: TEST_FILE_DATA_JAVA }))
        const head = phase === "noDifferences" ? { ...HEAD, checksum: TEST_FILE_DATA.fileMeta.fileChecksum } : HEAD
        TestBed.inject(CompareStore).set({ phase, resolved, base: BASE, head, error: null })
        await screen.findByTestId("comparison-chip")
    }

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

    it("should show how stale a side is", async () => {
        // Act
        await renderChip()

        // Assert
        const badge = screen.getByText("stale by 2")
        expect(badge.getAttribute("title")).toBe("No analysis for 9f8e7d6. Showing 3c4d5e6, 2 commits older.")
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
