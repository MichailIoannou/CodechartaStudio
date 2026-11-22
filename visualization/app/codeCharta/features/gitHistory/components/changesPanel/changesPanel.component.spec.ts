import { TestBed } from "@angular/core/testing"
import { fireEvent, render, screen } from "@testing-library/angular"
import type { GitEntryKind } from "../../../../model/coreApi/GitEntryKind"
import type { GitFileChange } from "../../../../model/coreApi/GitFileChange"
import type { GitWorkingTreeEntry } from "../../../../model/coreApi/GitWorkingTreeEntry"
import type { FakeDesktopBridge, FakeDesktopSeed } from "../../../../util/desktop/desktopBridge.mocks"
import { aFolder, aProject } from "../../../projects/projects.mocks"
import { anErrorPayload, aRefs, aRepositoryInfo, aStatusOn } from "../../services/gitApi.mocks"
import { GitConfirmationService } from "../../services/gitConfirmation.service"
import { provideGitHistory, settleGit } from "../../services/gitHistoryTestBed.mocks"
import { GitOperationService } from "../../services/gitOperation.service"
import { ChangesPanelComponent } from "./changesPanel.component"

const API = { projectId: "p-billing", folderId: "f-api" }
const BILLING = aProject("p-billing", [aFolder("f-api")])

function anEntry(
    path: string,
    kind: GitEntryKind,
    change: GitFileChange = "modified",
    previousPath: string | null = null
): GitWorkingTreeEntry {
    return { path, previousPath, kind, change, conflict: kind === "conflicted" ? "UU" : null }
}

const CHANGES = [
    anEntry("src/billing/invoice.ts", "conflicted"),
    anEntry("src/billing/currency.ts", "staged"),
    anEntry("src/billing/money.ts", "staged", "renamed", "src/billing/old.ts"),
    anEntry("src/app.ts", "unstaged"),
    anEntry("src/old/legacy.ts", "unstaged", "deleted"),
    anEntry("notes.md", "untracked", "added")
]

function seedWith(extra: Partial<NonNullable<FakeDesktopSeed["git"]>[string]> = {}): FakeDesktopSeed {
    return { git: { "f-api": { info: aRepositoryInfo(), status: aStatusOn("main"), refs: aRefs(), changes: CHANGES, ...extra } } }
}

describe("ChangesPanelComponent", () => {
    let bridge: FakeDesktopBridge
    let confirmations: GitConfirmationService

    beforeEach(() => {
        localStorage.clear()
    })

    async function renderPanel(seed = seedWith()) {
        bridge = provideGitHistory(seed, BILLING).bridge
        localStorage.setItem("codeChartaHistoryTab.p-billing", "changes")
        const rendered = await render(ChangesPanelComponent)
        confirmations = TestBed.inject(GitConfirmationService)
        jest.spyOn(confirmations, "ask").mockResolvedValue(true)
        await settle(rendered)
        return rendered
    }

    async function settle(rendered: { detectChanges: () => void }) {
        await settleGit()
        rendered.detectChanges()
    }

    const paramsOf = (method: string) =>
        bridge.calls.filter(call => call.name === "request" && call.args[0] === method).map(call => call.args[1])
    const row = (key: string) => document.querySelector(`[data-row-key="${key}"]`) as HTMLElement
    const groupHeaders = () =>
        screen
            .getAllByTestId("changes-group-toggle")
            .map(header => [...header.querySelectorAll("span")].map(part => part.textContent.trim()).join(" "))
    const groupActions = () => screen.getAllByTestId("changes-group-action").map(action => action.textContent.trim())

    it("should show the four groups with worded badges, names and folders", async () => {
        // Arrange & Act
        await renderPanel()

        // Assert
        expect(groupHeaders()).toEqual(["Conflicted 1", "Staged (2)", "Changes (2)", "Untracked (1)"])
        const rowTexts = screen.getAllByTestId("change-row").map(element =>
            [...element.children]
                .slice(0, 3)
                .map(part => part.textContent.trim())
                .filter(Boolean)
                .join(" ")
        )
        expect(rowTexts).toEqual([
            "conflict invoice.ts src/billing",
            "modified currency.ts src/billing",
            "renamed old.ts → money.ts src/billing",
            "modified app.ts src",
            "deleted legacy.ts src/old",
            "untracked notes.md"
        ])
        const softBadges = screen
            .getAllByTestId("change-row")
            .map(element => element.querySelector(".badge")?.classList.contains("badge-soft"))
        expect(softBadges).toEqual([false, true, true, true, true, true])
        expect(groupActions()).toEqual(["Unstage all", "Stage all"])
    })

    it("should stage and unstage a file from its row and discard it after the confirmation", async () => {
        // Arrange
        const rendered = await renderPanel()

        // Act
        fireEvent.click(row("unstaged:src/app.ts").querySelector("[data-testid=change-row-stage]") as HTMLElement)
        await settle(rendered)
        fireEvent.click(row("staged:src/billing/currency.ts").querySelector("[data-testid=change-row-unstage]") as HTMLElement)
        await settle(rendered)
        fireEvent.click(row("untracked:notes.md").querySelector("[data-testid=change-row-discard]") as HTMLElement)
        await settle(rendered)

        // Assert
        expect(paramsOf("git.stage")).toEqual([{ repo: API, target: { kind: "paths", paths: ["src/app.ts"] } }])
        expect(paramsOf("git.unstage")).toEqual([{ repo: API, paths: ["src/billing/currency.ts"] }])
        expect(paramsOf("git.discard")).toEqual([{ repo: API, entries: [{ path: "notes.md", kind: "untracked", change: "added" }] }])
        expect(row("untracked:notes.md")).toBeNull()
    })

    it("should word the row buttons with the file and offer no discard on staged or conflicted rows", async () => {
        // Arrange & Act
        await renderPanel()

        // Assert
        expect(row("unstaged:src/app.ts").querySelector("[data-testid=change-row-discard]")?.getAttribute("title")).toBe(
            "Discard changes to app.ts"
        )
        expect(row("unstaged:src/app.ts").querySelector("[data-testid=change-row-stage]")?.getAttribute("aria-label")).toBe("Stage app.ts")
        expect(row("staged:src/billing/currency.ts").querySelector("[data-testid=change-row-discard]")).toBeNull()
        const conflictDiscard = row("conflicted:src/billing/invoice.ts").querySelector(
            "[data-testid=change-row-discard]"
        ) as HTMLButtonElement
        expect(conflictDiscard.disabled).toBe(true)
        expect(conflictDiscard.parentElement?.getAttribute("title")).toBe("Use Abort to undo a merge")
    })

    it("should stage and unstage whole groups, and everything from the header", async () => {
        // Arrange
        const rendered = await renderPanel()

        // Act
        fireEvent.click(screen.getByRole("button", { name: "Unstage all" }))
        await settle(rendered)
        fireEvent.click(screen.getByTestId("changes-stage-all"))
        await settle(rendered)

        // Assert
        expect(paramsOf("git.unstage")).toEqual([{ repo: API, paths: ["src/billing/currency.ts", "src/billing/money.ts"] }])
        expect(paramsOf("git.stage")).toEqual([{ repo: API, target: { kind: "all" } }])
        expect(groupHeaders()).toEqual(["Staged (6)"])
    })

    it("should outline a selected row like a selected commit", async () => {
        // Arrange
        const rendered = await renderPanel()

        // Act
        fireEvent.click(row("unstaged:src/app.ts"))
        rendered.detectChanges()

        // Assert
        expect(row("unstaged:src/app.ts").className).toContain("outline-primary/60")
        expect(row("untracked:notes.md").className).not.toContain("outline-primary/60")
    })

    it("should let the group buttons act on several selected rows", async () => {
        // Arrange
        const rendered = await renderPanel()

        // Act
        fireEvent.click(row("unstaged:src/app.ts"))
        fireEvent.click(row("untracked:notes.md"), { shiftKey: true })
        fireEvent.click(row("unstaged:src/old/legacy.ts"), { ctrlKey: true })
        rendered.detectChanges()
        const labelsWithTwo = groupActions()
        fireEvent.click(row("unstaged:src/old/legacy.ts"), { ctrlKey: true })
        rendered.detectChanges()
        fireEvent.click(screen.getByRole("button", { name: "Stage 2 selected" }))
        await settle(rendered)

        // Assert
        expect(labelsWithTwo).toEqual(["Unstage all", "Stage 1 selected"])
        expect(paramsOf("git.stage")).toEqual([{ repo: API, target: { kind: "paths", paths: ["src/app.ts", "src/old/legacy.ts"] } }])
    })

    it("should select with the arrow keys, stage with Space, show the diff with Enter and discard with Delete", async () => {
        // Arrange
        const rendered = await renderPanel()
        const list = screen.getByTestId("changes-list")

        // Act
        fireEvent.keyDown(list, { key: "End" })
        fireEvent.keyDown(list, { key: "ArrowUp" })
        fireEvent.keyDown(list, { key: "ArrowUp" })
        rendered.detectChanges()
        const active = list.getAttribute("aria-activedescendant")
        fireEvent.keyDown(list, { key: " " })
        await settle(rendered)
        fireEvent.keyDown(list, { key: "Home" })
        fireEvent.keyDown(list, { key: "ArrowDown" })
        fireEvent.keyDown(list, { key: "ArrowDown" })
        fireEvent.keyDown(list, { key: "Enter" })
        await settle(rendered)
        fireEvent.keyDown(list, { key: "End" })
        const deleteEvent = new KeyboardEvent("keydown", { key: "Delete", bubbles: true, cancelable: true })
        list.dispatchEvent(deleteEvent)
        await settle(rendered)

        // Assert
        expect(active).toBe("change-option-unstaged:src/app.ts")
        expect(paramsOf("git.stage")).toEqual([{ repo: API, target: { kind: "paths", paths: ["src/app.ts"] } }])
        expect(paramsOf("git.diffFile")).toContainEqual({ repo: API, path: "src/billing/currency.ts", kind: "staged" })
        expect(paramsOf("git.discard")).toEqual([{ repo: API, entries: [{ path: "notes.md", kind: "untracked", change: "added" }] }])
        expect(deleteEvent.defaultPrevented).toBe(true)
    })

    it("should unstage the focused staged row with Space and leave other keys to the page", async () => {
        // Arrange
        const rendered = await renderPanel()
        const list = screen.getByTestId("changes-list")
        fireEvent.keyDown(list, { key: "ArrowDown" })
        fireEvent.keyDown(list, { key: "ArrowDown" })

        // Act
        fireEvent.keyDown(list, { key: " " })
        await settle(rendered)
        const other = new KeyboardEvent("keydown", { key: "a", bubbles: true, cancelable: true })
        list.dispatchEvent(other)

        // Assert
        expect(paramsOf("git.unstage")).toEqual([{ repo: API, paths: ["src/billing/currency.ts"] }])
        expect(other.defaultPrevented).toBe(false)
    })

    it("should ignore Space, Enter and Delete without a focused row", async () => {
        // Arrange
        await renderPanel()
        const list = screen.getByTestId("changes-list")
        const keys = [" ", "Enter", "Delete"].map(key => new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }))

        // Act
        for (const event of keys) {
            list.dispatchEvent(event)
        }

        // Assert
        expect(keys.map(event => event.defaultPrevented)).toEqual([false, false, false])
    })

    it("should hide a group's rows when its header is clicked", async () => {
        // Arrange
        const rendered = await renderPanel()

        // Act
        fireEvent.click(screen.getAllByTestId("changes-group-toggle")[1])
        rendered.detectChanges()

        // Assert
        expect(row("staged:src/billing/currency.ts")).toBeNull()
        expect(screen.getAllByTestId("changes-group-toggle")[1].getAttribute("aria-expanded")).toBe("false")
    })

    it("should disable every write while an operation runs", async () => {
        // Arrange
        const rendered = await renderPanel()
        const operations = TestBed.inject(GitOperationService)
        const held = operations.run({ kind: "fetch", repo: API, send: () => new Promise(() => undefined) })

        // Act
        await settle(rendered)

        // Assert
        expect((screen.getByTestId("changes-stage-all") as HTMLButtonElement).disabled).toBe(true)
        expect(screen.getByTestId("changes-stage-all").getAttribute("title")).toBe("Waiting for the previous git operation…")
        expect((row("unstaged:src/app.ts").querySelector("[data-testid=change-row-stage]") as HTMLButtonElement).disabled).toBe(true)
        expect(held).toBeInstanceOf(Promise)
    })

    it("should say when there are no changes", async () => {
        // Arrange & Act
        await renderPanel(seedWith({ changes: [] }))

        // Assert
        expect(screen.getByTestId("changes-empty").textContent.trim()).toBe("No changes. The working tree matches the last commit.")
        expect((screen.getByTestId("changes-stage-all") as HTMLButtonElement).disabled).toBe(true)
    })

    it("should say when the list is cut off", async () => {
        // Arrange & Act
        await renderPanel(seedWith({ areChangesTruncated: true }))

        // Assert
        expect(screen.getByTestId("changes-truncated").textContent.trim()).toBe("Showing the first 5 000 changes.")
    })

    it("should show a failed listing with its sentence and read it again on retry", async () => {
        // Arrange
        const rendered = await renderPanel(seedWith({ failures: { "git.workingTree": anErrorPayload("INDEX_LOCKED") } }))
        const reads = paramsOf("git.workingTree").length

        // Act
        fireEvent.click(screen.getByRole("button", { name: "Retry" }))
        await settle(rendered)

        // Assert
        expect(screen.getByTestId("changes-failure").textContent).toContain("Another git process is using this repository.")
        expect(paramsOf("git.workingTree").length).toBe(reads + 1)
    })
})
