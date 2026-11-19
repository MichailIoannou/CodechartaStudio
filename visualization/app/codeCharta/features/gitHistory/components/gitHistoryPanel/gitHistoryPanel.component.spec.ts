import { TestBed } from "@angular/core/testing"
import { fireEvent, render, screen } from "@testing-library/angular"
import type { FakeDesktopSeed } from "../../../../util/desktop/desktopBridge.mocks"
import { aFolder, aProject } from "../../../projects/projects.mocks"
import { anErrorPayload, aRefs, aRepositoryInfo, aStatusOn } from "../../services/gitApi.mocks"
import { provideGitHistory, settleGit } from "../../services/gitHistoryTestBed.mocks"
import { GitLogService } from "../../services/gitLog.service"
import { WIDE_WINDOW_PX } from "../../services/historyLayout.service"
import { GitHistoryPanelComponent } from "./gitHistoryPanel.component"

const API_FOLDER = aFolder("f-api", { label: "billing-api" })
const BILLING = aProject("p-billing", [API_FOLDER])
const HEALTHY: FakeDesktopSeed = { git: { "f-api": { info: aRepositoryInfo(), status: aStatusOn("main"), refs: aRefs() } } }

describe("GitHistoryPanelComponent", () => {
    const originalWidth = globalThis.innerWidth

    async function renderPanel(seed: FakeDesktopSeed = HEALTHY) {
        const testBed = provideGitHistory(seed, BILLING)
        const rendered = await render(GitHistoryPanelComponent)
        await settleGit()
        rendered.detectChanges()
        return { ...testBed, ...rendered }
    }

    beforeEach(() => {
        Object.defineProperty(globalThis, "innerWidth", { configurable: true, value: WIDE_WINDOW_PX })
    })

    afterEach(() => {
        localStorage.clear()
        Object.defineProperty(globalThis, "innerWidth", { configurable: true, value: originalWidth })
    })

    it("should lay out the branches, commits and details panes as islands", async () => {
        // Arrange & Act
        await renderPanel()

        // Assert
        const panes = ["Branches", "Commits", "Details"].map(name => screen.getByRole("region", { name }))
        expect(panes.every(pane => pane.classList.contains("rounded-[10px]") && pane.classList.contains("bg-base-100"))).toBe(true)
        expect(screen.getByTestId("history-branches-pane").style.width).toBe("260px")
        expect(screen.getByTestId("history-details-pane").style.width).toBe("380px")
        expect(screen.getByTestId("commit-scope-chip").textContent.trim()).toBe("All branches")
        expect(screen.getByText("Select a commit to see its details.")).not.toBeNull()
        expect(screen.queryByTestId("git-problem-notice")).toBeNull()
    })

    it("should replace the three panes by the changes and the diff on the Changes tab", async () => {
        // Arrange
        const { detectChanges } = await renderPanel()

        // Act
        fireEvent.click(screen.getByTestId("history-tab-changes"))
        await settleGit()
        detectChanges()

        // Assert
        expect(screen.queryByRole("region", { name: "Commits" })).toBeNull()
        expect(screen.getByRole("region", { name: "Changes" }).style.width).toBe("360px")
        expect(screen.getByTestId("changes-empty")).not.toBeNull()
        expect(screen.getByText("Select a file to see its changes.")).not.toBeNull()
    })

    it("should restore remembered pane widths within their bounds", async () => {
        // Arrange
        localStorage.setItem("codeChartaHistoryLayout", JSON.stringify({ branchesWidth: 100, detailsWidth: 500 }))

        // Act
        await renderPanel()

        // Assert
        expect(screen.getByTestId("history-branches-pane").style.width).toBe("180px")
        expect(screen.getByTestId("history-details-pane").style.width).toBe("500px")
    })

    it("should collapse a side pane to a strip and expand it again", async () => {
        // Arrange
        const { detectChanges } = await renderPanel()

        // Act
        fireEvent.click(screen.getByRole("button", { name: "Collapse branches" }))
        detectChanges()
        const isCollapsed = screen.queryByTestId("history-branches-pane") === null
        fireEvent.click(screen.getByRole("button", { name: "Expand branches" }))
        detectChanges()

        // Assert
        expect(isCollapsed).toBe(true)
        expect(screen.getByTestId("history-branches-pane")).not.toBeNull()
    })

    it("should collapse and expand the details pane", async () => {
        // Arrange
        const { detectChanges } = await renderPanel()

        // Act
        fireEvent.click(screen.getByRole("button", { name: "Collapse details" }))
        detectChanges()

        // Assert
        expect(screen.queryByTestId("history-details-pane")).toBeNull()
        expect(screen.getByRole("button", { name: "Expand details" })).not.toBeNull()
    })

    it.each([
        ["TOOL_NOT_FOUND", "Git was not found. CodeCharta uses the git installed on this computer."],
        ["GIT_TOO_OLD", "Git 2.30.9 is too old. CodeCharta needs git 2.31 or newer."],
        ["NOT_A_REPOSITORY", "'billing-api' is not a git repository."],
        ["FOLDER_UNAVAILABLE", "'billing-api' was not found on disk."],
        ["DUBIOUS_OWNERSHIP", "Git does not trust '/work/f-api' because another user owns it. If you trust it, run this in a terminal:"],
        ["BARE_REPOSITORY", "Bare repositories are not supported."]
    ] as const)("should replace the panes with the notice for %s", async (code, sentence) => {
        // Arrange
        const failure = anErrorPayload(code, "git 2.30.9 is older than the minimum 2.31.0.")

        // Act
        await renderPanel({ git: { "f-api": { failures: { "git.repositoryInfo": failure } } } })

        // Assert
        expect(screen.getByTestId("git-problem-notice").textContent).toContain(sentence)
        expect(screen.queryByRole("region", { name: "Commits" })).toBeNull()
    })

    it("should keep the panes for a failure that does not concern the whole repository", async () => {
        // Arrange & Act
        await renderPanel({ git: { "f-api": { info: aRepositoryInfo(), failures: { "git.status": anErrorPayload("INDEX_LOCKED") } } } })

        // Assert
        expect(screen.queryByTestId("git-problem-notice")).toBeNull()
        expect(screen.getByRole("region", { name: "Commits" })).not.toBeNull()
    })

    it("should hand the working folder over for re-linking", async () => {
        // Arrange
        const { fixture } = await renderPanel({ git: { "f-api": { failures: { "git.repositoryInfo": anErrorPayload("NOT_FOUND") } } } })
        const relink = jest.fn()
        fixture.componentInstance.relinkFolder.subscribe(relink)

        // Act
        fireEvent.click(screen.getByRole("button", { name: "Re-link folder…" }))

        // Assert
        expect(relink).toHaveBeenCalledWith({ id: "f-api", label: "billing-api" })
    })

    it("should pass on the request for the desktop tools", async () => {
        // Arrange
        const { fixture } = await renderPanel({
            git: { "f-api": { failures: { "git.repositoryInfo": anErrorPayload("TOOL_NOT_FOUND") } } }
        })
        const openDesktopTools = jest.fn()
        fixture.componentInstance.openDesktopTools.subscribe(openDesktopTools)

        // Act
        fireEvent.click(screen.getByRole("button", { name: "Open desktop tools" }))

        // Assert
        expect(openDesktopTools).toHaveBeenCalled()
    })

    it("should note a shallow clone until it is dismissed", async () => {
        // Arrange
        const { detectChanges } = await renderPanel({
            git: { "f-api": { info: aRepositoryInfo({ isShallow: true }), status: aStatusOn("main"), refs: aRefs() } }
        })
        const noticeText = screen.getByTestId("history-shallow-notice").textContent

        // Act
        fireEvent.click(screen.getByRole("button", { name: "Dismiss" }))
        detectChanges()

        // Assert
        expect(noticeText).toContain("Shallow clone: history is cut off, counts are lower bounds.")
        expect(screen.queryByTestId("history-shallow-notice")).toBeNull()
    })

    it("should refresh on F5 inside the history without letting the key through", async () => {
        // Arrange
        const { bridge, fixture } = await renderPanel()
        const infoReadsBefore = bridge.calls.filter(call => call.args[0] === "git.repositoryInfo").length
        const event = new KeyboardEvent("keydown", { key: "F5", bubbles: true, cancelable: true })
        const stopPropagation = jest.spyOn(event, "stopPropagation")

        // Act
        fixture.nativeElement.dispatchEvent(event)
        await settleGit()

        // Assert
        expect(event.defaultPrevented).toBe(true)
        expect(stopPropagation).toHaveBeenCalled()
        expect(bridge.calls.filter(call => call.args[0] === "git.repositoryInfo")).toHaveLength(infoReadsBefore + 1)
    })

    it("should focus the commit search on Ctrl+F or slash in the commit list", async () => {
        // Arrange
        await renderPanel()
        const list = screen.getByTestId("commit-list")
        const search = screen.getByTestId("history-search")

        // Act
        fireEvent.keyDown(list, { key: "f", ctrlKey: true })
        const afterCtrlF = document.activeElement
        list.focus()
        fireEvent.keyDown(list, { key: "/" })

        // Assert
        expect(afterCtrlF).toBe(search)
        expect(document.activeElement).toBe(search)
    })

    it("should refresh on F5 pressed in the commit list", async () => {
        // Arrange
        const { bridge } = await renderPanel()
        const infoReadsBefore = bridge.calls.filter(call => call.args[0] === "git.repositoryInfo").length

        // Act
        fireEvent.keyDown(screen.getByTestId("commit-list"), { key: "F5" })
        await settleGit()

        // Assert
        expect(bridge.calls.filter(call => call.args[0] === "git.repositoryInfo")).toHaveLength(infoReadsBefore + 1)
    })

    it("should show the scope next to the commit list and lift it again", async () => {
        // Arrange
        const { detectChanges } = await renderPanel()
        TestBed.inject(GitLogService).scopeTo("refs/heads/feature/invoice-rounding")
        detectChanges()
        const scopedChip = screen.getByTestId("commit-scope-chip")
        const scopedText = scopedChip.textContent.trim()
        const scopedTitle = scopedChip.getAttribute("title")

        // Act
        fireEvent.click(screen.getByRole("button", { name: "Show all branches" }))
        detectChanges()

        // Assert
        expect(scopedText).toBe("feature/invoice-rounding")
        expect(scopedTitle).toBe("refs/heads/feature/invoice-rounding")
        expect(screen.getByTestId("commit-scope-chip").textContent.trim()).toBe("All branches")
    })

    it("should explain a first page that took too long, copy the speed-up command and retry", async () => {
        // Arrange
        const writeText = jest.fn().mockResolvedValue(undefined)
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
        const timeout = anErrorPayload("TIMEOUT", "Git did not answer in time.")
        const seed: FakeDesktopSeed = { git: { "f-api": { ...HEALTHY.git?.["f-api"], failures: { "git.log": timeout } } } }
        const { bridge, detectChanges } = await renderPanel(seed)
        const notice = screen.getByTestId("history-slow-notice").querySelector("span")?.textContent.replaceAll(/\s+/g, " ").trim()

        // Act
        fireEvent.click(screen.getByTestId("history-slow-copy-command"))
        fireEvent.click(screen.getByRole("button", { name: "Retry" }))
        await settleGit()
        detectChanges()

        // Assert
        expect(notice).toBe(
            "The history took too long to load. Running git commit-graph write --reachable in the repository makes it faster."
        )
        expect(writeText).toHaveBeenCalledWith("git commit-graph write --reachable")
        expect(bridge.calls.filter(call => call.args[0] === "git.log")).toHaveLength(2)
    })
})
