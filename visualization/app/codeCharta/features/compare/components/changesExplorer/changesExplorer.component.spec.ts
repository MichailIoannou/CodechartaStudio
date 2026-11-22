import { signal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { StoreModule } from "@ngrx/store"
import { render, screen } from "@testing-library/angular"
import userEvent from "@testing-library/user-event"
import { ChangedFilesFilter, CodeMapNode, NodeType } from "../../../../model/codeCharta.model"
import { appReducers, setStateMiddleware } from "../../../../stores/rootStore/store"
import { ExplorerMode, ExplorerModeService, ExplorerScrollHostService } from "../../../sidebarExplorer/facade"
import type { ChangedFilesState } from "../../model/compare.model"
import { ChangedFilesService } from "../../services/changedFiles.service"
import { ChangesReadStore } from "../../stores/changes.read.store"
import { CompareStore } from "../../stores/compare.store"
import { CompareWriteStore } from "../../stores/compare.write.store"
import { ChangesExplorerComponent } from "./changesExplorer.component"

const INVOICE: CodeMapNode = {
    name: "invoice.ts",
    path: "/root/src/billing/invoice.ts",
    type: NodeType.FILE,
    attributes: {},
    deltas: { rloc: 12 },
    fileCount: { added: 0, removed: 0, changed: 1 }
}
const ROOT: CodeMapNode = {
    name: "root",
    path: "/root",
    type: NodeType.FOLDER,
    attributes: {},
    fileCount: { added: 0, removed: 0, changed: 1 },
    deltas: { rloc: 12 },
    children: [{ name: "src", path: "/root/src", type: NodeType.FOLDER, attributes: {}, children: [INVOICE] }]
}
const GIT_LIST: ChangedFilesState = {
    source: "git",
    files: [
        { change: "modified", path: "src/billing/invoice.ts", previousPath: null },
        { change: "deleted", path: "README.md", previousPath: null }
    ]
}

describe("ChangesExplorerComponent", () => {
    const activeMode = signal<Pick<ExplorerMode, "id">>({ id: "changes" })
    const changedFilesFilter = signal<ChangedFilesFilter | null>(null)
    const selectedNodePath = signal<string | null>(null)
    const areDeltaColorsInverted = signal(false)
    const writeStore = { selectNode: jest.fn(), focusFolder: jest.fn() }
    const changedFilesService = { setOnlyChangedFiles: jest.fn() }

    async function setup(changedFiles: ChangedFilesState) {
        jest.clearAllMocks()
        activeMode.set({ id: "changes" })
        changedFilesFilter.set(null)
        selectedNodePath.set(null)
        areDeltaColorsInverted.set(false)
        const rendered = await render(ChangesExplorerComponent, {
            imports: [StoreModule.forRoot(appReducers, { metaReducers: [setStateMiddleware] })],
            providers: [
                { provide: ExplorerModeService, useValue: { activeMode } },
                ExplorerScrollHostService,
                {
                    provide: ChangesReadStore,
                    useValue: {
                        accumulatedData: signal({ unifiedMapNode: ROOT, unifiedFileMeta: undefined }),
                        pathToNode: signal(new Map([[INVOICE.path, INVOICE]])),
                        areaMetric: signal("rloc"),
                        heightMetric: signal("rloc"),
                        changedFilesFilter,
                        selectedNodePath,
                        areDeltaColorsInverted
                    }
                },
                { provide: CompareWriteStore, useValue: writeStore },
                { provide: ChangedFilesService, useValue: changedFilesService }
            ]
        })
        TestBed.inject(CompareStore).update({ changedFiles })
        rendered.fixture.detectChanges()
        return rendered
    }

    it("should sum up the comparison", async () => {
        // Act
        await setup(GIT_LIST)

        // Assert
        expect(screen.getByTestId("changes-counts").textContent).toContain("+0 added · −0 removed · 1 changed")
        expect(screen.getByTestId("changes-metric-deltas").textContent?.trim()).toBe("rloc +12")
        expect(screen.getByTestId("changes-git-line").textContent).toBe("2 files changed in git")
    })

    it("should show which source the list comes from", async () => {
        // Act
        await setup({ source: "unavailable", files: [] })

        // Assert
        expect(screen.getByTestId("changes-source").textContent).toBe("Files with metric changes")
        expect(screen.getByTestId("changes-source").title).toContain("No clone has both commits")
        expect(screen.getAllByTestId("changes-row").map(row => row.textContent)).toEqual([expect.stringContaining("invoice.ts")])
    })

    it("should list the files git changed with worded badges", async () => {
        // Act
        await setup(GIT_LIST)

        // Assert
        expect(screen.getByTestId("changes-source").textContent).toBe("Files changed in git")
        const rows = screen.getAllByTestId("changes-row")
        expect(rows.map(row => row.querySelector(".badge")?.textContent)).toEqual(["modified", "deleted"])
        expect(rows[0].textContent).toContain("src/billing")
        expect(rows[0].textContent).toContain("+12")
    })

    it("should colour a height delta as the map does and follow inverted delta colours", async () => {
        // Arrange
        const { fixture } = await setup(GIT_LIST)
        const delta = () => screen.getAllByTestId("changes-row")[0].querySelector(".tabular-nums") as HTMLElement
        const defaultClasses = [delta().classList.contains("text-success"), delta().classList.contains("text-error")]

        // Act
        areDeltaColorsInverted.set(true)
        fixture.detectChanges()

        // Assert
        expect(defaultClasses).toEqual([true, false])
        expect([delta().classList.contains("text-success"), delta().classList.contains("text-error")]).toEqual([false, true])
    })

    it("should grey a path that is not part of the analysis and not select it", async () => {
        // Arrange
        await setup(GIT_LIST)
        const readme = screen.getAllByTestId("changes-row")[1]

        // Act
        await userEvent.click(readme)

        // Assert
        expect(readme.className).toContain("opacity-50")
        expect(readme.title).toBe("Not part of the analysis")
        expect(writeStore.selectNode).not.toHaveBeenCalled()
    })

    it("should select the node when a row is clicked", async () => {
        // Arrange
        await setup(GIT_LIST)

        // Act
        await userEvent.click(screen.getAllByTestId("changes-row")[0])

        // Assert
        expect(writeStore.selectNode).toHaveBeenCalledWith("/root/src/billing/invoice.ts")
    })

    it("should focus the parent folder", async () => {
        // Arrange
        await setup(GIT_LIST)

        // Act
        await userEvent.click(screen.getByRole("button", { name: "Focus folder src/billing" }))

        // Assert
        expect(writeStore.focusFolder).toHaveBeenCalledWith("/root/src/billing")
        expect(writeStore.selectNode).not.toHaveBeenCalled()
    })

    it("should move through the rows with the arrow keys and focus the folder on Enter", async () => {
        // Arrange
        await setup(GIT_LIST)
        const list = screen.getByTestId("changes-list")
        const onWindow = jest.fn()
        window.addEventListener("keydown", onWindow)

        // Act
        list.focus()
        await userEvent.keyboard("{ArrowDown}{Enter}")
        window.removeEventListener("keydown", onWindow)

        // Assert
        expect(writeStore.selectNode).toHaveBeenCalledWith("/root/src/billing/invoice.ts")
        expect(writeStore.focusFolder).toHaveBeenCalledWith("/root/src/billing")
        expect(onWindow).not.toHaveBeenCalled()
    })

    it("should turn the filter on from the toggle", async () => {
        // Arrange
        await setup(GIT_LIST)

        // Act
        await userEvent.click(screen.getByTestId("changes-only-changed"))

        // Assert
        expect(changedFilesService.setOnlyChangedFiles).toHaveBeenCalledWith(true)
    })

    it("should show the loading dots and no metric fallback while git lists the files", async () => {
        // Act
        await setup("loading")

        // Assert
        expect(screen.getByTestId("changes-loading")).toBeTruthy()
        expect(screen.queryAllByTestId("changes-row")).toEqual([])
        expect(screen.queryByTestId("changes-empty")).toBeNull()
    })

    it("should say when no file changed", async () => {
        // Act
        await setup({ source: "git", files: [] })

        // Assert
        expect(screen.getByTestId("changes-empty").textContent).toBe("No files changed.")
    })

    it("should render nothing while another explorer mode is open", async () => {
        // Arrange
        const { fixture } = await setup(GIT_LIST)

        // Act
        activeMode.set({ id: "files" })
        fixture.detectChanges()

        // Assert
        expect(screen.queryByTestId("changes-list")).toBeNull()
    })
})
