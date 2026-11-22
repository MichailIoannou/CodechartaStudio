import { signal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { StoreModule } from "@ngrx/store"
import { render, screen } from "@testing-library/angular"
import userEvent from "@testing-library/user-event"
import { appReducers, setStateMiddleware } from "../../../../stores/rootStore/store"
import { createFakeDesktopBridge } from "../../../../util/desktop/desktopBridge.mocks"
import { DESKTOP_BRIDGE } from "../../../../util/desktop/desktopBridge.token"
import { ProjectsFacade } from "../../../projects/facade"
import { aFolder, aProject } from "../../../projects/projects.mocks"
import type { CompareState } from "../../model/compare.model"
import { aCommitSnapshot, aComparedCommit, aResolvedComparison, BASE_SHA, HEAD_SHA } from "../../ports/compareGateways.mocks"
import { CompareService } from "../../services/compare.service"
import { CompareStore } from "../../stores/compare.store"
import { CompareHostComponent } from "../compareHost/compareHost.component"

const BILLING = aProject("p-billing", [
    aFolder("f-api", { label: "billing-api" }),
    aFolder("f-fork", { label: "billing-fork", role: "fork" }),
    aFolder("f-docs", { label: "docs", kind: "plain" })
])
const BRANCH = { isCurrent: false, upstream: null, checkedOutInOtherWorktree: null, lastCommit: { subject: "Work", committedAt: 0 } }
const REFS = {
    fingerprint: "f",
    head: { kind: "branch" as const, name: "main", commit: BASE_SHA },
    localBranches: [
        { ...BRANCH, refName: "refs/heads/main", name: "main", commit: BASE_SHA, isCurrent: true },
        { ...BRANCH, refName: "refs/heads/feature/x", name: "feature/x", commit: HEAD_SHA }
    ],
    remoteBranches: [],
    tags: [],
    remotes: []
}

describe("CompareDialogComponent", () => {
    let service: { compareSides: jest.Mock; continueWithShownSnapshots: jest.Mock; cancel: jest.Mock }
    let store: CompareStore

    beforeEach(() => {
        localStorage.clear()
    })

    async function renderDialog(prefill = {}, state: Partial<CompareState> = {}) {
        service = { compareSides: jest.fn().mockResolvedValue(undefined), continueWithShownSnapshots: jest.fn(), cancel: jest.fn() }
        const bridge = createFakeDesktopBridge({ git: { "f-api": { refs: REFS }, "f-fork": { refs: REFS } } })
        HTMLDialogElement.prototype.showModal = jest.fn()
        HTMLDialogElement.prototype.close = jest.fn(function (this: HTMLDialogElement) {
            this.dispatchEvent(new Event("close"))
        })
        await render(CompareHostComponent, {
            imports: [StoreModule.forRoot(appReducers, { metaReducers: [setStateMiddleware] })],
            providers: [
                { provide: CompareService, useValue: service },
                { provide: DESKTOP_BRIDGE, useValue: bridge },
                { provide: ProjectsFacade, useValue: { activeProject: signal(BILLING), workingFolder: signal(BILLING.folders[1]) } }
            ]
        })
        store = TestBed.inject(CompareStore)
        store.update(state)
        store.openDialog(prefill)
        await screen.findByTestId("compare-dialog")
        await settle()
    }

    async function settle() {
        for (let round = 0; round < 3; round++) {
            TestBed.tick()
            await new Promise(resolve => setTimeout(resolve))
        }
    }

    function input(testId: string) {
        return screen.getByTestId(testId) as HTMLInputElement
    }

    it("should start the comparison of the typed sides in the working folder", async () => {
        // Arrange
        await renderDialog()

        // Act
        await userEvent.type(input("compare-base"), "main")
        await userEvent.type(input("compare-head"), "a1b2")
        await settle()
        await userEvent.click(screen.getByTestId("compare-submit"))

        // Assert
        expect(service.compareSides).toHaveBeenCalledWith(
            { ref: { projectId: "p-billing", folderId: "f-fork" }, label: "billing-fork" },
            { base: "main", head: "a1b2", baseMode: "mergeBase", unresolved: ["a1b2"] }
        )
    })

    it("should fill both sides from a recent comparison", async () => {
        // Arrange
        localStorage.setItem(
            "codeChartaRecentComparisons",
            JSON.stringify({
                "p-billing": [{ folderId: "f-api", base: "main", head: "feature/x", baseMode: "tip", comparedAt: Date.now() }]
            })
        )
        await renderDialog()

        // Act
        await userEvent.click(screen.getByTestId("compare-recent-row"))

        // Assert
        expect(screen.getByTestId("compare-recent-row").textContent).toContain("main..feature/x")
        expect(screen.getByTestId("compare-recent-row").textContent).toContain("billing-api")
        expect([input("compare-base").value, input("compare-head").value]).toEqual(["main", "feature/x"])
        expect((screen.getByTestId("compare-folder") as HTMLSelectElement).value).toBe("f-api")
    })

    it("should say when there are no comparisons yet", async () => {
        // Act
        await renderDialog()

        // Assert
        expect(screen.getByTestId("compare-recent").textContent?.trim()).toBe("No comparisons yet.")
    })

    it("should offer only git folders", async () => {
        // Act
        await renderDialog()

        // Assert
        const folders = Array.from(screen.getByTestId("compare-folder").querySelectorAll("option"), option => option.textContent)
        expect(folders).toEqual(["billing-api", "billing-fork"])
    })

    it("should show the base mode toggle for a branch base and remember the choice", async () => {
        // Arrange
        await renderDialog({ base: "main", head: "feature/x" })

        // Act
        await userEvent.click(screen.getByTestId("compare-mode-tip"))
        await userEvent.click(screen.getByTestId("compare-submit"))
        const forBranch = screen.queryByTestId("compare-base-mode")
        await userEvent.clear(input("compare-base"))
        await userEvent.type(input("compare-base"), "9f8e7d6")
        await settle()

        // Assert
        expect(forBranch).not.toBeNull()
        expect(service.compareSides.mock.calls[0][1]).toEqual(expect.objectContaining({ baseMode: "tip", unresolved: [] }))
        expect(screen.queryByTestId("compare-base-mode")).toBeNull()
        expect(JSON.parse(localStorage.getItem("codeChartaCompareBaseMode") ?? "{}")).toEqual({ "p-billing": "tip" })
    })

    it("should ask for both sides before comparing", async () => {
        // Arrange
        await renderDialog({ base: "main" })

        // Act
        const button = screen.getByTestId("compare-submit") as HTMLButtonElement

        // Assert
        expect(button.disabled).toBe(true)
        expect(button.title).toBe("Choose a base and a head")
        expect(document.activeElement).toBe(input("compare-head"))
    })

    it("should fill both sides from a pasted range and swap them", async () => {
        // Arrange
        await renderDialog()
        await userEvent.click(input("compare-base"))
        await userEvent.paste("main...feature/x")

        // Act
        await userEvent.click(screen.getByRole("button", { name: "Swap base and head", hidden: true }))

        // Assert
        expect([input("compare-base").value, input("compare-head").value]).toEqual(["feature/x", "main"])
        expect(localStorage.getItem("codeChartaCompareBaseMode")).toBe(JSON.stringify({ "p-billing": "mergeBase" }))
    })

    it("should compare in the chosen folder", async () => {
        // Arrange
        await renderDialog({ base: "a", head: "b" })

        // Act
        await userEvent.selectOptions(screen.getByTestId("compare-folder"), "f-api")
        await userEvent.keyboard("{Control>}{Enter}{/Control}")

        // Assert
        expect(service.compareSides.mock.calls[0][0].ref.folderId).toBe("f-api")
    })

    it("should close after the comparison it started is shown", async () => {
        // Arrange
        await renderDialog({ base: "a", head: "b" })
        await userEvent.click(screen.getByTestId("compare-submit"))

        // Act
        store.update({ phase: "active" })
        TestBed.tick()

        // Assert
        expect(store.dialogPrefill()).toBeNull()
        expect(service.cancel).not.toHaveBeenCalled()
    })

    it("should cancel what is running when it is closed", async () => {
        // Arrange
        await renderDialog({}, { phase: "resolving" })

        // Act
        await userEvent.click(screen.getByTestId("compare-cancel"))

        // Assert
        expect(service.cancel).toHaveBeenCalled()
        expect(store.dialogPrefill()).toBeNull()
    })

    it("should show a stop status with its sides filled in", async () => {
        // Act
        await renderDialog({}, { phase: "stopped", resolved: aResolvedComparison({ status: { kind: "noCommonAncestor" } }) })
        await userEvent.click(screen.getByRole("button", { name: "Compare tip vs tip", hidden: true }))

        // Assert
        expect(screen.getByTestId("compare-outcome").textContent).toContain("'main' and 'feature/x' share no history.")
        expect([input("compare-base").value, input("compare-head").value]).toEqual(["main", "feature/x"])
        expect(service.continueWithShownSnapshots).toHaveBeenCalled()
    })

    it("should list each side with its status and go on with the nearest analysis", async () => {
        // Arrange
        const nearest = {
            snapshot: aCommitSnapshot("3c4d5e6".padEnd(40, "0")),
            relation: "ancestor" as const,
            staleBy: 2,
            behind: 2,
            ahead: 0
        }
        const resolved = aResolvedComparison({
            head: { requested: aComparedCommit(HEAD_SHA, { kind: "branch", name: "feature/x" }), status: { status: "missing", nearest } },
            preflight: { identicalChecksums: false, profilesDiffer: true, combinedBytes: 1, sizeVerdict: "warn" }
        })

        // Act
        await renderDialog({}, { phase: "needsDecision", resolved })
        await userEvent.click(screen.getByTestId("compare-use-nearest"))

        // Assert
        const preparation = screen.getByTestId("compare-preparation").textContent?.replace(/\s+/g, " ")
        expect(preparation).toContain("BASE9f8e7d6 (main) analysed")
        expect(preparation).toContain("HEADa1b2c3d (feature/x) not analysed · nearest: 3c4d5e6, 2 commits older")
        expect(preparation).toContain("The two analyses used different profiles")
        expect(preparation).toContain("These two analyses are large")
        expect(service.continueWithShownSnapshots).toHaveBeenCalled()
    })

    it("should block a comparison above the size limit", async () => {
        // Arrange
        const resolved = aResolvedComparison({
            base: { requested: aComparedCommit(BASE_SHA), status: { status: "missing", nearest: null } },
            preflight: { identicalChecksums: false, profilesDiffer: false, combinedBytes: 1, sizeVerdict: "block" }
        })

        // Act
        await renderDialog({}, { phase: "needsDecision", resolved })

        // Assert
        expect(screen.getByText("Too large to compare in memory. Analyse with a lighter profile or compare a sub-folder.")).toBeTruthy()
        expect(screen.queryByTestId("compare-use-nearest")).toBeNull()
        expect(screen.getByTestId("compare-preparation").textContent).toContain("not analysed")
    })

    it("should offer to compare anyway when only the analyses differ", async () => {
        // Arrange
        const resolved = aResolvedComparison({
            preflight: { identicalChecksums: false, profilesDiffer: true, combinedBytes: 1, sizeVerdict: "ok" }
        })
        await renderDialog({}, { phase: "needsDecision", resolved })

        // Act
        await userEvent.click(screen.getByTestId("compare-anyway"))

        // Assert
        expect(service.continueWithShownSnapshots).toHaveBeenCalled()
    })

    it("should show an error and retry when the core was not running", async () => {
        // Arrange
        await renderDialog({ base: "a", head: "b" }, { phase: "failed", error: { kind: "coreUnavailable", message: "" } })

        // Act
        await userEvent.click(screen.getByRole("button", { name: "Retry", hidden: true }))

        // Assert
        expect(screen.getByTestId("compare-error").textContent).toContain("The CodeCharta core is not running.")
        expect(service.compareSides).toHaveBeenCalled()
    })

    it("should say that maps are loading", async () => {
        // Act
        await renderDialog({ base: "a", head: "b" }, { phase: "loading" })

        // Assert
        const button = screen.getByTestId("compare-submit") as HTMLButtonElement
        expect(button.textContent?.trim()).toBe("Loading maps…")
        expect(button.disabled).toBe(true)
    })
})
