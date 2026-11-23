import { signal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { Store, StoreModule } from "@ngrx/store"
import { render, screen, within } from "@testing-library/angular"
import userEvent from "@testing-library/user-event"
import { TEST_FILE_DATA, TEST_FILE_DATA_JAVA } from "../../../../mocks/dataMocks"
import { addFile, setDelta } from "../../../../stores/fileStore/store/files.actions"
import { appReducers, setStateMiddleware } from "../../../../stores/rootStore/store"
import { ProjectsFacade } from "../../../projects/facade"
import { aFolder, aProject } from "../../../projects/projects.mocks"
import { ToastService } from "../../../shared/facade"
import type { LoadedSide, ResolvedComparison } from "../../model/compare.model"
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
        const { fixture } = await render(ComparisonChipComponent, {
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
        return fixture
    }

    const trigger = () => screen.getByTestId("comparison-trigger")
    const rowText = (side: "base" | "head") =>
        Array.from(screen.getByTestId(`comparison-${side}`).children, cell => cell.textContent?.trim())
            .filter(Boolean)
            .join(" ")

    async function openDetails() {
        await userEvent.click(trigger())
    }

    async function chooseAction(name: string) {
        await openDetails()
        await userEvent.click(within(screen.getByRole("dialog", { name: "Comparison" })).getByRole("button", { name }))
    }

    it("should show both sides' labels in one button and name them with their commits in its title", async () => {
        // Act
        await renderChip()

        // Assert
        expect(screen.getByTestId("comparison-base-label").textContent?.trim()).toBe("main")
        expect(screen.getByTestId("comparison-head-label").textContent?.trim()).toBe("a1b2c3d")
        expect(trigger().getAttribute("title")).toBe("Base: main (9f8e7d6) · Head: a1b2c3d")
        expect(trigger().getAttribute("aria-haspopup")).toBe("dialog")
    })

    it("should be as wide as its labels until the nav bar fit gives it a width", async () => {
        // Arrange
        const fixture = await renderChip()
        const naturalWidth = trigger().style.width

        // Act
        fixture.componentRef.setInput("width", 180)
        TestBed.tick()

        // Assert
        expect(naturalWidth).toBe("")
        expect(trigger().style.width).toBe("180px")
        expect(screen.getByTestId("comparison-base-label").classList).toContain("min-w-10")
    })

    it("should leave out the compare and pull request icons and let its labels get shorter in its labels-only form", async () => {
        // Arrange
        const fixture = await renderChip()
        TestBed.inject(CompareStore).update({
            changeRequest: { folder: FOLDER, provider: "github", number: 7, remote: "origin", baseRefName: "main", url: null }
        })
        TestBed.tick()
        const icons = () => [screen.getByTestId("comparison-icon"), screen.getByTestId("comparison-pull-request-icon")]
        const wereShown = icons().every(icon => !icon.classList.contains("hidden"))

        // Act
        fixture.componentRef.setInput("labelsOnly", true)
        TestBed.tick()

        // Assert
        expect(wereShown).toBe(true)
        expect(icons().every(icon => icon.classList.contains("hidden"))).toBe(true)
        expect(screen.getByTestId("comparison-head-label").classList).toContain("min-w-8")
        expect(trigger().classList).toContain("px-2")
    })

    it("should mark a stale side with a dot in the button and say in the details how stale each side is", async () => {
        // Arrange
        await renderChip()
        TestBed.inject(CompareStore).update({ head: { ...HEAD, relation: "diverged", staleBy: 5, behind: 3, ahead: 2 } })
        TestBed.tick()

        // Act
        await openDetails()

        // Assert
        expect(screen.getByTestId("comparison-stale-dot")).toBeTruthy()
        expect(screen.getAllByTestId("comparison-stale").map(badge => [badge.textContent?.trim(), badge.getAttribute("title")])).toEqual([
            ["stale by 2", "No analysis for 9f8e7d6. Showing 3c4d5e6, 2 commits older."],
            ["diverged 3↓ 2↑", "No analysis for a1b2c3d. Showing a1b2c3d from a diverged line: 3 behind / 2 ahead."]
        ])
        expect(screen.getAllByTestId("comparison-showing").map(line => line.textContent?.trim())).toEqual([
            "showing 3c4d5e6, 2 commits older",
            "showing a1b2c3d from a diverged line: 3 behind / 2 ahead"
        ])
    })

    it("should show no dot and call both sides analysed when each shows its own analysis", async () => {
        // Arrange
        await renderChip()
        TestBed.inject(CompareStore).update({ base: { ...BASE, relation: null, staleBy: 0, behind: 0 } })
        TestBed.tick()

        // Act
        await openDetails()

        // Assert
        expect(screen.queryByTestId("comparison-stale-dot")).toBeNull()
        expect(rowText("base")).toBe("Base 9f8e7d6 main analysed Change…")
        expect(rowText("head")).toBe("Head a1b2c3d analysed Change…")
    })

    it("should name the base mode at the top of the details with its explanation", async () => {
        // Arrange
        await renderChip("active", aResolvedComparison({ origin: "branches", baseMode: "tip" }))

        // Act
        await openDetails()

        // Assert
        const line = screen.getByTestId("comparison-base-mode")
        expect(line.textContent?.trim()).toBe("tip vs tip")
        expect(line.getAttribute("title")).toBe("Everything that differs between the two tips")
    })

    it("should name nothing as the base mode for two commits", async () => {
        // Arrange
        await renderChip("active", aResolvedComparison())

        // Act
        await openDetails()

        // Assert
        expect(screen.queryByTestId("comparison-base-mode")).toBeNull()
    })

    it("should link the pull request in the details and copy the range with its link", async () => {
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
        await openDetails()
        const link = within(screen.getByTestId("comparison-pull-request")).getByRole("link")
        const linkText = [link.getAttribute("href"), link.textContent?.trim()]

        // Act
        await userEvent.click(screen.getByRole("button", { name: "Copy as text" }))

        // Assert
        expect(linkText).toEqual(["https://github.com/mia/billing/pull/7", "Pull request #7"])
        expect(writeText).toHaveBeenCalledWith("main..a1b2c3d https://github.com/mia/billing/pull/7")
    })

    it("should show a merge request without a link when its page is unknown", async () => {
        // Arrange
        await renderChip()
        TestBed.inject(CompareStore).update({
            changeRequest: { folder: FOLDER, provider: "gitlab", number: 7, remote: "origin", baseRefName: "main", url: null }
        })
        TestBed.tick()

        // Act
        await openDetails()

        // Assert
        const line = screen.getByTestId("comparison-pull-request")
        expect(within(line).queryByRole("link")).toBeNull()
        expect(line.textContent?.trim()).toBe("Merge request !7")
    })

    it("should say that there are no metric differences and count the files git changed in the details", async () => {
        // Arrange
        await renderChip("noDifferences")
        TestBed.inject(CompareStore).update({
            changedFiles: { source: "git", files: [{ change: "modified", path: "README.md", previousPath: null }] }
        })
        TestBed.tick()

        // Act
        await openDetails()

        // Assert
        expect(screen.getByTestId("comparison-no-differences").textContent?.trim()).toBe("No metric differences")
        expect(screen.getByTestId("comparison-git-line").textContent?.trim()).toBe("1 file changed in git")
        expect(screen.queryByTestId("comparison-swap")).toBeNull()
    })

    it("should swap base and head from the details", async () => {
        // Arrange
        await renderChip()

        // Act
        await chooseAction("Swap base and head")

        // Assert
        expect(service.swap).toHaveBeenCalledTimes(1)
    })

    it("should leave the comparison from the details", async () => {
        // Arrange
        await renderChip()

        // Act
        await chooseAction("Leave compare")

        // Assert
        expect(service.exit).toHaveBeenCalled()
        expect(screen.queryByRole("dialog")).toBeNull()
    })

    it("should open the dialog with both sides from either side's Change…", async () => {
        // Arrange
        await renderChip()
        const store = TestBed.inject(CompareStore)

        // Act
        await chooseAction("Change head")

        // Assert
        expect(store.dialogPrefill()).toEqual({ folder: FOLDER, base: "main", head: "a1b2c3d" })
        expect(screen.queryByRole("dialog")).toBeNull()
    })

    it("should name each side's folder in the title and the details and keep the head folder when two folders are compared", async () => {
        // Arrange
        const forkHead = { ...HEAD, requested: aComparedCommit(HEAD_SHA, { kind: "branch", name: "main" }, FORK) }
        const resolved = aResolvedComparison({
            origin: "folders",
            head: { requested: forkHead.requested, status: { status: "exact", snapshot: HEAD.snapshot } }
        })
        await renderChip("active", resolved, forkHead)
        const store = TestBed.inject(CompareStore)
        await openDetails()
        const rows = [rowText("base"), rowText("head")]

        // Act
        await userEvent.click(screen.getByRole("button", { name: "Change base" }))

        // Assert
        expect(trigger().getAttribute("title")).toBe("Base: main (9f8e7d6) in billing-api · Head: main (a1b2c3d) in billing-fork")
        expect(rows).toEqual([
            "Base 9f8e7d6 main · billing-api stale by 2 Change… showing 3c4d5e6, 2 commits older",
            "Head a1b2c3d main · billing-fork analysed Change…"
        ])
        expect(store.dialogPrefill()).toEqual({ folder: FOLDER, base: "main", head: "main", headFolder: FORK })
    })

    it("should show a working-tree head by its label, without a commit", async () => {
        // Arrange
        const workingTree = {
            ...HEAD,
            requested: {
                ...HEAD.requested,
                kind: "workingTree" as const,
                commit: null,
                shortCommit: null,
                snapshotId: "s-wt",
                label: { kind: "workingTree" as const, name: "working tree" }
            }
        }
        await renderChip("active", null, workingTree)

        // Act
        await openDetails()

        // Assert
        expect(screen.getByTestId("comparison-head-label").textContent?.trim()).toBe("working tree")
        expect(trigger().getAttribute("title")).toBe("Base: main (9f8e7d6) · Head: working tree")
        expect(rowText("head")).toBe("Head working tree analysed Change…")
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
        await openDetails()
        const baseMode = screen.getByTestId("comparison-base-mode")
        const baseModeText = [baseMode.textContent?.trim(), baseMode.getAttribute("title")]

        // Act
        await userEvent.click(screen.getByRole("button", { name: "Copy as text" }))

        // Assert
        expect(writeText).toHaveBeenCalledWith("main...a1b2c3d")
        expect(baseModeText).toEqual(["since the merge base", "Changes on 'feature/x' since it left 'main'"])
    })

    it("should name a merge-base side by the branch it came from, and only while it is the base", async () => {
        // Arrange
        const mergeBase = { ...BASE, requested: aComparedCommit(BASE_SHA) }
        const resolved = aResolvedComparison({
            origin: "branches",
            baseMode: "mergeBase",
            base: { requested: mergeBase.requested, status: { status: "exact", snapshot: BASE.snapshot } },
            baseTip: aComparedCommit("7777777".padEnd(40, "0"), { kind: "branch", name: "main" })
        })
        await renderChip("active", resolved)
        const store = TestBed.inject(CompareStore)
        store.update({ base: mergeBase })
        TestBed.tick()
        const labelsBefore = [screen.getByTestId("comparison-base-label").textContent?.trim(), trigger().getAttribute("title")]

        // Act
        store.update({ base: HEAD, head: mergeBase })
        TestBed.tick()

        // Assert
        expect(labelsBefore).toEqual(["main", "Base: main (9f8e7d6) · Head: a1b2c3d"])
        expect(trigger().getAttribute("title")).toBe("Base: a1b2c3d · Head: 9f8e7d6")
    })

    it("should open the details with the arrow key and close them with Escape, back on the button", async () => {
        // Arrange
        await renderChip()
        trigger().focus()

        // Act
        await userEvent.keyboard("{ArrowDown}")
        const isOpenAfterArrow = screen.queryByRole("dialog") !== null
        await userEvent.keyboard("{Escape}")

        // Assert
        expect(isOpenAfterArrow).toBe(true)
        expect(screen.queryByRole("dialog")).toBeNull()
        expect(document.activeElement).toBe(trigger())
    })

    it("should close its details on a click elsewhere", async () => {
        // Arrange
        await renderChip()
        await openDetails()

        // Act
        await userEvent.click(document.body)

        // Assert
        expect(screen.queryByRole("dialog")).toBeNull()
    })
})
