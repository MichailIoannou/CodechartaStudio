import { signal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { createEvent, fireEvent, render, screen } from "@testing-library/angular"
import type { GitCommitSummary } from "../../../../model/coreApi/GitCommitSummary"
import type { GitStatus } from "../../../../model/coreApi/GitStatus"
import type { FakeDesktopSeed } from "../../../../util/desktop/desktopBridge.mocks"
import { aFolder, aProject } from "../../../projects/projects.mocks"
import { ToastService } from "../../../shared/facade"
import { ANALYSED_COMMITS, AnalysedCommitMarker } from "../../ports/analysedCommits.port"
import { COMMIT_ACTIONS, CommitAction } from "../../ports/commitActions.port"
import { CommitSelectionService } from "../../services/commitSelection.service"
import {
    aLocalBranch,
    aLogCommit,
    anErrorPayload,
    aRefs,
    aRemoteBranch,
    aRepositoryInfo,
    aStatusOn,
    aTag
} from "../../services/gitApi.mocks"
import { provideGitHistory, settleGit } from "../../services/gitHistoryTestBed.mocks"
import { GitLogService } from "../../services/gitLog.service"
import { CommitListComponent } from "./commitList.component"

const BILLING = aProject("p-billing", [aFolder("f-api", { label: "billing-api" })])
const NOW_SECONDS = Math.floor(Date.now() / 1000)
const TWO_HOURS = 2 * 3600

/** A linear history of `count` commits, newest first. */
function history(count: number): GitCommitSummary[] {
    return Array.from({ length: count }, (_, index) => {
        const seed = (count - index).toString(16)
        const parent = count - index - 1
        return {
            ...aLogCommit("0", `Commit ${count - index}`),
            sha: seed.padStart(40, "0"),
            parents: parent > 0 ? [parent.toString(16).padStart(40, "0")] : []
        }
    })
}

const RELEASE = aLogCommit("2", "Release 2.4.0", ["1"], {
    authorName: "Jo Park",
    authorEmail: "jo@example.com",
    authoredAt: NOW_SECONDS - TWO_HOURS
})
const START = aLogCommit("1", "Start the invoice module")

function seedOf(
    commits: GitCommitSummary[],
    status: GitStatus = aStatusOn("main", { head: { kind: "branch", name: "main", commit: commits[0]?.sha ?? null } })
): FakeDesktopSeed {
    const refs = aRefs({
        head: status.head,
        localBranches: [
            aLocalBranch("main", { isCurrent: true, commit: RELEASE.sha }),
            aLocalBranch("release/2.4", { commit: RELEASE.sha })
        ],
        remoteBranches: [{ ...aRemoteBranch("origin", "main"), commit: RELEASE.sha }],
        tags: [{ ...aTag("v2.4.0"), commit: RELEASE.sha }]
    })
    return { git: { "f-api": { info: aRepositoryInfo(), status, refs, commits } } }
}

function sizeViewport({ width, height }: { width: number; height: number }) {
    jest.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(width)
    jest.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(height)
}

describe("CommitListComponent", () => {
    async function renderList(seed: FakeDesktopSeed, markers?: ReadonlyMap<string, AnalysedCommitMarker>, actions: CommitAction[] = []) {
        const testBed = provideGitHistory(seed, BILLING)
        if (markers) {
            TestBed.configureTestingModule({ providers: [{ provide: ANALYSED_COMMITS, useValue: { markersFor: () => signal(markers) } }] })
        }
        if (actions.length > 0) {
            TestBed.configureTestingModule({
                providers: actions.map(action => ({ provide: COMMIT_ACTIONS, multi: true, useValue: action }))
            })
        }
        const rendered = await render(CommitListComponent)
        await settleGit()
        rendered.detectChanges()
        return { ...testBed, ...rendered }
    }

    beforeEach(() => {
        jest.spyOn(globalThis, "requestAnimationFrame").mockImplementation(callback => Number(setTimeout(() => callback(0))))
        jest.spyOn(globalThis, "cancelAnimationFrame").mockImplementation(id => clearTimeout(id))
        sizeViewport({ width: 1000, height: 280 })
    })

    afterEach(() => {
        jest.restoreAllMocks()
    })

    it("should render only the rows inside the window", async () => {
        // Arrange & Act
        await renderList(seedOf(history(600)))

        // Assert
        const rows = screen.getAllByTestId("commit-row")
        expect(rows.length).toBe(20)
        expect(rows[0].textContent).toContain("Commit 600")
        expect(screen.getByTestId("commit-list").firstElementChild?.getAttribute("style")).toContain("height: 14000px")
    })

    it("should request the next page near the end of the list", async () => {
        // Arrange
        const { bridge, detectChanges } = await renderList(seedOf(history(600)))
        const viewport = screen.getByTestId("commit-list")

        // Act
        viewport.scrollTop = 420 * 28
        fireEvent.scroll(viewport)
        await settleGit()
        detectChanges()

        // Assert
        const logCalls = bridge.calls.filter(call => call.args[0] === "git.log")
        expect(logCalls).toHaveLength(2)
        expect(TestBed.inject(GitLogService).commits()).toHaveLength(600)
        expect(screen.getByTestId("commit-list").firstElementChild?.getAttribute("style")).toContain("height: 16800px")
    })

    it("should show the subject, ref labels, author and date of a commit", async () => {
        // Arrange & Act
        await renderList(seedOf([RELEASE, START]))

        // Assert
        const row = screen.getAllByTestId("commit-row")[0]
        const labels = [...row.querySelectorAll("[data-testid=ref-label]")]
        expect(row.querySelector("[data-testid=commit-subject]")?.textContent).toBe("Release 2.4.0")
        expect(labels.map(label => label.textContent?.trim())).toEqual(["main", "release/2.4", "origin/main"])
        expect(labels.map(label => label.getAttribute("title"))).toEqual([
            "refs/heads/main",
            "refs/heads/release/2.4",
            "refs/remotes/origin/main"
        ])
        expect(labels[0].classList).toContain("badge-primary")
        expect(labels[0].querySelector(".fa-check")).not.toBeNull()
        expect(labels[1].classList).toContain("badge-outline")
        expect(labels[2].querySelector(".fa-cloud")).not.toBeNull()
        expect(row.querySelector("[data-testid=ref-label-overflow]")?.textContent).toBe("+1")
        expect(row.querySelector("[data-testid=ref-label-overflow]")?.getAttribute("title")).toContain("refs/tags/v2.4.0")
        expect(row.querySelector("[data-testid=commit-author]")?.getAttribute("title")).toBe("Jo Park <jo@example.com>")
        expect(row.querySelector("[data-testid=commit-date]")?.textContent).toBe("2 hours ago")
    })

    it("should draw the graph and mark HEAD with a ring", async () => {
        // Arrange & Act
        const { container } = await renderList(seedOf([RELEASE, START]))

        // Assert
        expect(screen.getByTestId("commit-list-header").textContent).toContain("Graph")
        expect(container.querySelectorAll("cc-commit-graph-cell")).toHaveLength(2)
        expect(screen.getAllByTestId("graph-head-ring")).toHaveLength(1)
    })

    it("should show one label and the rest as a count in a narrow pane", async () => {
        // Arrange
        sizeViewport({ width: 500, height: 280 })

        // Act
        await renderList(seedOf([RELEASE, START]))

        // Assert
        const row = screen.getAllByTestId("commit-row")[0]
        expect(row.querySelectorAll("[data-testid=ref-label]")).toHaveLength(1)
        expect(row.querySelector("[data-testid=ref-label-overflow]")?.textContent).toBe("+3")
    })

    it("should offer a retry when the next page fails", async () => {
        // Arrange
        const seed = seedOf(history(600))
        const { bridge, detectChanges } = await renderList(seed)
        bridge.failWith("git.log", anErrorPayload("TIMEOUT"))
        const viewport = screen.getByTestId("commit-list")

        // Act
        viewport.scrollTop = 600 * 28
        fireEvent.scroll(viewport)
        await settleGit()
        detectChanges()

        // Assert
        expect(screen.getByTestId("commit-list-load-more-failed").textContent).toContain("Could not load more commits.")
        bridge.respondWith("git.log", { commits: history(600).slice(500), nextCursor: null, isGraphAvailable: true })
        fireEvent.click(screen.getByRole("button", { name: "Retry" }))
        await settleGit()
        detectChanges()
        expect(screen.queryByTestId("commit-list-load-more-failed")).toBeNull()
    })

    it("should say so when there are no commits yet", async () => {
        // Arrange & Act
        await renderList(seedOf([], aStatusOn("main", { head: { kind: "branch", name: "main", commit: null } })))

        // Assert
        expect(screen.getByTestId("commit-list-empty").textContent.trim()).toBe("No commits yet.")
    })

    it("should say so when no commit matches the filter and clear it on request", async () => {
        // Arrange
        const { detectChanges } = await renderList(seedOf([RELEASE, START]))
        const log = TestBed.inject(GitLogService)
        log.setFilter({ text: "nothing like this", author: "", path: "" })
        await settleGit()
        detectChanges()
        const emptyText = screen.getByTestId("commit-list-empty").textContent

        // Act
        fireEvent.click(screen.getByRole("button", { name: "Clear filters" }))
        await settleGit()
        detectChanges()

        // Assert
        expect(emptyText).toContain("No commit matches the filter.")
        expect(screen.getByTestId("commit-list-header").textContent).toContain("Graph")
        expect(screen.getAllByTestId("commit-row")).toHaveLength(2)
    })

    it("should hide the graph column while filtered", async () => {
        // Arrange
        const { detectChanges, container } = await renderList(seedOf([RELEASE, START]))

        // Act
        TestBed.inject(GitLogService).setFilter({ text: "release", author: "", path: "" })
        await settleGit()
        detectChanges()

        // Assert
        expect(screen.getByTestId("commit-list-header").textContent).not.toContain("Graph")
        expect(container.querySelectorAll("cc-commit-graph-cell")).toHaveLength(0)
        expect(screen.getAllByTestId("commit-row")).toHaveLength(1)
    })

    it("should show skeleton rows while the first page loads", async () => {
        // Arrange
        const { bridge } = provideGitHistory(seedOf([RELEASE]), BILLING)
        const answer = bridge.request.bind(bridge)
        bridge.request = ((method: string, ...rest: unknown[]) =>
            method === "git.log"
                ? new Promise(() => undefined)
                : answer(method as "git.status", ...(rest as [never]))) as typeof bridge.request

        // Act
        const { detectChanges } = await render(CommitListComponent)
        await settleGit()
        detectChanges()

        // Assert
        expect(screen.getByTestId("commit-list-skeleton").querySelectorAll(".skeleton")).toHaveLength(8)
    })

    it("should show a failed first page with its sentence and retry", async () => {
        // Arrange
        const seed = seedOf([RELEASE])
        const { bridge } = await renderList({
            git: { "f-api": { ...seed.git?.["f-api"], failures: { "git.log": anErrorPayload("INDEX_LOCKED") } } }
        })

        // Act
        fireEvent.click(screen.getByRole("button", { name: "Retry" }))
        await settleGit()

        // Assert
        expect(bridge.calls.filter(call => call.args[0] === "git.log")).toHaveLength(2)
    })

    it("should show the uncommitted changes as the first row only while the working tree is dirty", async () => {
        // Arrange
        const dirty = aStatusOn("main", {
            head: { kind: "branch", name: "main", commit: RELEASE.sha },
            counts: { staged: 1, unstaged: 2, untracked: 0, conflicted: 0 }
        })

        // Act
        await renderList(seedOf([RELEASE, START], dirty))

        // Assert
        const row = screen.getByTestId("commit-row-working-tree")
        expect(row.textContent.trim()).toBe("Uncommitted changes (3)")
        expect(row.querySelector("[data-testid=graph-working-tree-dot]")).not.toBeNull()
        expect(screen.getByTestId("commit-list").querySelector("[role=option]")).toBe(row)
    })

    it("should show no uncommitted changes row for a clean working tree", async () => {
        // Arrange & Act
        await renderList(seedOf([RELEASE, START]))

        // Assert
        expect(screen.queryByTestId("commit-row-working-tree")).toBeNull()
    })

    it("should select a commit or the uncommitted changes on click", async () => {
        // Arrange
        const dirty = aStatusOn("main", {
            head: { kind: "branch", name: "main", commit: RELEASE.sha },
            counts: { staged: 0, unstaged: 1, untracked: 0, conflicted: 0 }
        })
        const { detectChanges } = await renderList(seedOf([RELEASE, START], dirty))
        const selection = TestBed.inject(CommitSelectionService)

        // Act
        fireEvent.click(screen.getAllByTestId("commit-row")[1])
        detectChanges()
        const commitSelected = selection.selectedSha()
        const rowClass = screen.getAllByTestId("commit-row")[1].className
        fireEvent.click(screen.getByTestId("commit-row-working-tree"))
        detectChanges()

        // Assert
        expect(commitSelected).toBe(START.sha)
        expect(rowClass).toContain("bg-primary/20")
        expect(["outline", "outline-1", "-outline-offset-1", "outline-primary/60"].every(name => rowClass.split(" ").includes(name))).toBe(
            true
        )
        expect(selection.selection()?.items).toEqual([{ kind: "workingTree", status: dirty }])
        expect(screen.getByTestId("commit-row-working-tree").getAttribute("aria-selected")).toBe("true")
    })

    it("should add a second commit on ctrl+click and mark it with a left border", async () => {
        // Arrange
        const { detectChanges } = await renderList(seedOf([RELEASE, START]))
        const selection = TestBed.inject(CommitSelectionService)

        // Act
        fireEvent.click(screen.getAllByTestId("commit-row")[1])
        fireEvent.click(screen.getAllByTestId("commit-row")[0], { ctrlKey: true })
        detectChanges()

        // Assert
        const [release, start] = screen.getAllByTestId("commit-row")
        expect(selection.selection()?.items.map(item => (item.kind === "commit" ? item.commit.sha : item.kind))).toEqual([
            RELEASE.sha,
            START.sha
        ])
        expect(["border-l-2", "border-primary", "pl-1.5"].every(name => release.classList.contains(name))).toBe(true)
        expect(start.className).toContain("bg-primary/20")
        expect(start.className).not.toContain("border-l-2")
        expect(release.getAttribute("aria-selected")).toBe("true")
    })

    it("should add the uncommitted changes as the second item on ctrl+click", async () => {
        // Arrange
        const dirty = aStatusOn("main", {
            head: { kind: "branch", name: "main", commit: RELEASE.sha },
            counts: { staged: 0, unstaged: 1, untracked: 0, conflicted: 0 }
        })
        const { detectChanges } = await renderList(seedOf([RELEASE, START], dirty))

        // Act
        fireEvent.click(screen.getAllByTestId("commit-row")[0])
        fireEvent.click(screen.getByTestId("commit-row-working-tree"), { metaKey: true })
        detectChanges()

        // Assert
        expect(TestBed.inject(CommitSelectionService).selection()?.items[0]).toEqual({ kind: "workingTree", status: dirty })
        expect(screen.getByTestId("commit-row-working-tree").className).toContain("border-l-2 border-primary")
    })

    describe("keyboard", () => {
        const DIRTY = aStatusOn("main", {
            head: { kind: "branch", name: "main", commit: `${"0".repeat(39)}a` },
            counts: { staged: 0, unstaged: 1, untracked: 0, conflicted: 0 }
        })

        function press(key: string, modifiers: Partial<KeyboardEventInit> = {}) {
            const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...modifiers })
            const stopPropagation = jest.spyOn(event, "stopPropagation")
            screen.getByTestId("commit-list").dispatchEvent(event)
            return { event, stopPropagation }
        }

        function selectedKeys() {
            return TestBed.inject(CommitSelectionService)
                .selection()
                ?.items.map(item => (item.kind === "commit" ? item.commit.subject : "working tree"))
        }

        it("should select the next and previous row with the arrow keys and keep the key from the map", async () => {
            // Arrange
            await renderList(seedOf(history(10)))

            // Act
            press("ArrowDown")
            press("ArrowDown")
            const afterTwoDowns = selectedKeys()
            const { event, stopPropagation } = press("ArrowUp")

            // Assert
            expect(afterTwoDowns).toEqual(["Commit 9"])
            expect(selectedKeys()).toEqual(["Commit 10"])
            expect(event.defaultPrevented).toBe(true)
            expect(stopPropagation).toHaveBeenCalled()
        })

        it("should start at the uncommitted changes row when it is shown", async () => {
            // Arrange
            await renderList(seedOf(history(10), DIRTY))

            // Act
            press("ArrowDown")
            const first = selectedKeys()
            press("ArrowDown")

            // Assert
            expect(first).toEqual(["working tree"])
            expect(selectedKeys()).toEqual(["Commit 10"])
        })

        it("should set the second selection with Shift and the arrows and drop it on Escape", async () => {
            // Arrange
            await renderList(seedOf(history(10)))
            press("ArrowDown")

            // Act
            press("ArrowDown", { shiftKey: true })
            press("ArrowDown", { shiftKey: true })
            const extended = selectedKeys()
            press("Escape")

            // Assert
            expect(extended).toEqual(["Commit 10", "Commit 8"])
            expect(selectedKeys()).toEqual(["Commit 10"])
        })

        it("should jump with Home and End and page with PageUp and PageDown", async () => {
            // Arrange
            await renderList(seedOf(history(30)))

            // Act
            press("End")
            const atEnd = selectedKeys()
            press("PageUp")
            const pagedUp = selectedKeys()
            press("Home")
            const atHome = selectedKeys()
            press("PageDown")

            // Assert
            expect(atEnd).toEqual(["Commit 1"])
            expect(pagedUp).toEqual(["Commit 11"])
            expect(atHome).toEqual(["Commit 30"])
            expect(selectedKeys()).toEqual(["Commit 20"])
        })

        it("should scroll the focused row into the window", async () => {
            // Arrange
            const { detectChanges } = await renderList(seedOf(history(100)))
            const viewport = screen.getByTestId("commit-list")

            // Act
            press("End")
            detectChanges()
            const scrolledDown = viewport.scrollTop
            press("Home")
            detectChanges()

            // Assert
            expect(scrolledDown).toBe(100 * 28 - 280)
            expect(viewport.scrollTop).toBe(0)
            expect(screen.getAllByTestId("commit-row")[0].textContent).toContain("Commit 100")
        })

        it("should name the focused row as the active descendant", async () => {
            // Arrange
            const commits = history(10)
            const { detectChanges } = await renderList(seedOf(commits, DIRTY))

            // Act
            press("ArrowDown")
            detectChanges()
            const onWorkingTree = screen.getByTestId("commit-list").getAttribute("aria-activedescendant")
            press("ArrowDown")
            detectChanges()

            // Assert
            const activeId = screen.getByTestId("commit-list").getAttribute("aria-activedescendant")
            expect(onWorkingTree).toBe(screen.getByTestId("commit-row-working-tree").id)
            expect(activeId).toBe(`commit-option-${commits[0].sha}`)
            expect(document.getElementById(activeId ?? "")?.textContent).toContain("Commit 10")
        })

        it("should copy the full sha of the focused commit on Ctrl+C and say so", async () => {
            // Arrange
            const writeText = jest.fn().mockResolvedValue(undefined)
            Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
            const commits = history(3)
            await renderList(seedOf(commits))
            press("ArrowDown")

            // Act
            const { stopPropagation } = press("c", { ctrlKey: true })
            await settleGit()

            // Assert
            expect(writeText).toHaveBeenCalledWith(commits[0].sha)
            expect(
                TestBed.inject(ToastService)
                    .messages()
                    .map(message => message.text)
            ).toEqual([`Copied ${commits[0].sha.slice(0, 7)}`])
            expect(stopPropagation).toHaveBeenCalled()
        })

        it("should let Ctrl+C through while no commit is focused", async () => {
            // Arrange
            await renderList(seedOf(history(3)))

            // Act
            const { event } = press("c", { ctrlKey: true })

            // Assert
            expect(event.defaultPrevented).toBe(false)
        })

        it("should leave F5 to the history panel", async () => {
            // Arrange
            await renderList(seedOf(history(3)))

            // Act
            const { event, stopPropagation } = press("F5")

            // Assert
            expect(event.defaultPrevented).toBe(false)
            expect(stopPropagation).not.toHaveBeenCalled()
        })
    })

    describe("actions and context menu", () => {
        function anAction(id: string, overrides: Partial<CommitAction> = {}): CommitAction {
            return {
                id,
                label: id,
                icon: "fa-solid fa-map",
                hoverHint: id,
                isPrimary: false,
                isOfferedFor: () => true,
                run: jest.fn(),
                ...overrides
            }
        }

        function press(key: string, modifiers: Partial<KeyboardEventInit> = {}) {
            const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...modifiers })
            screen.getByTestId("commit-list").dispatchEvent(event)
            return event
        }

        function menuLabels(): string[] {
            return screen.getAllByRole("button", { hidden: true }).map(button => button.textContent?.trim() ?? "")
        }

        it("should run the primary action on Enter and on double-click", async () => {
            // Arrange
            const show = anAction("show", { isPrimary: true })
            await renderList(seedOf([RELEASE, START]), undefined, [anAction("analyse"), show])
            press("ArrowDown")

            // Act
            const enter = press("Enter")
            fireEvent.click(screen.getAllByTestId("commit-row")[1])
            fireEvent.dblClick(screen.getAllByTestId("commit-row")[1])

            // Assert
            expect(enter.defaultPrevented).toBe(true)
            expect(show.run).toHaveBeenNthCalledWith(1, expect.objectContaining({ items: [{ kind: "commit", commit: RELEASE }] }))
            expect(show.run).toHaveBeenNthCalledWith(2, expect.objectContaining({ items: [{ kind: "commit", commit: START }] }))
        })

        it("should do nothing on Enter without a primary action", async () => {
            // Arrange
            const analyse = anAction("analyse")
            await renderList(seedOf([RELEASE, START]), undefined, [analyse])
            press("ArrowDown")

            // Act
            const enter = press("Enter")

            // Assert
            expect(enter.defaultPrevented).toBe(false)
            expect(analyse.run).not.toHaveBeenCalled()
        })

        it("should select a row outside the selection on right-click and open the menu at the pointer", async () => {
            // Arrange
            const { detectChanges } = await renderList(seedOf([RELEASE, START]), undefined, [anAction("Analyse This Commit")])
            fireEvent.click(screen.getAllByTestId("commit-row")[0])

            // Act
            fireEvent.contextMenu(screen.getAllByTestId("commit-row")[1], { clientX: 40, clientY: 60 })
            detectChanges()

            // Assert
            const menu = screen.getByTestId("commit-context-menu")
            expect(TestBed.inject(CommitSelectionService).selectedSha()).toBe(START.sha)
            expect(menu.style.left).toBe("40px")
            expect(menu.style.top).toBe("60px")
            expect(menuLabels()).toEqual(["Analyse This Commit", "Copy SHA", "Copy Subject", "New Branch Here…"])
        })

        it("should keep two selected commits on a right-click inside the selection", async () => {
            // Arrange
            const compare = anAction("Compare", { isOfferedFor: selection => selection.items.length === 2 })
            const { detectChanges } = await renderList(seedOf([RELEASE, START]), undefined, [compare])
            fireEvent.click(screen.getAllByTestId("commit-row")[0])
            fireEvent.click(screen.getAllByTestId("commit-row")[1], { ctrlKey: true })

            // Act
            fireEvent.contextMenu(screen.getAllByTestId("commit-row")[1])
            detectChanges()

            // Assert
            expect(TestBed.inject(CommitSelectionService).selection()?.items).toHaveLength(2)
            expect(menuLabels()).toEqual(["Compare", "Copy SHA", "Copy Subject", "New Branch Here…"])
        })

        it("should open the menu at the focused row from the keyboard and give the focus back on Escape", async () => {
            // Arrange
            const { detectChanges } = await renderList(seedOf([RELEASE, START]))
            const list = screen.getByTestId("commit-list")
            press("ArrowDown")
            press("ArrowDown")

            // Act
            const menuKey = press("ContextMenu")
            detectChanges()
            await new Promise(resolve => setTimeout(resolve))
            detectChanges()
            const menu = screen.getByTestId("commit-context-menu")
            const focusedInMenu = document.activeElement?.textContent?.trim()
            fireEvent.keyDown(menu, { key: "Escape" })
            detectChanges()

            // Assert
            expect(menuKey.defaultPrevented).toBe(true)
            expect(menu.style.top).toBe(`${2 * 28}px`)
            expect(focusedInMenu).toBe("Copy SHA")
            expect(screen.queryByTestId("commit-context-menu")).toBeNull()
            expect(document.activeElement).toBe(list)
        })

        it("should open the menu with Shift+F10 too and let the key through while nothing is focused", async () => {
            // Arrange
            const { detectChanges } = await renderList(seedOf([RELEASE, START]))

            // Act
            const unfocused = press("F10", { shiftKey: true })
            press("ArrowDown")
            press("F10", { shiftKey: true })
            detectChanges()

            // Assert
            expect(unfocused.defaultPrevented).toBe(false)
            expect(screen.getByTestId("commit-context-menu")).not.toBeNull()
        })

        it("should open no menu on the uncommitted changes while nothing is offered for them", async () => {
            // Arrange
            const dirty = aStatusOn("main", {
                head: { kind: "branch", name: "main", commit: RELEASE.sha },
                counts: { staged: 0, unstaged: 1, untracked: 0, conflicted: 0 }
            })
            const { detectChanges } = await renderList(seedOf([RELEASE, START], dirty))

            // Act
            const event = createEvent.contextMenu(screen.getByTestId("commit-row-working-tree"))
            fireEvent(screen.getByTestId("commit-row-working-tree"), event)
            detectChanges()

            // Assert
            expect(event.defaultPrevented).toBe(true)
            expect(screen.queryByTestId("commit-context-menu")).toBeNull()
        })

        it("should open the menu on the uncommitted changes with an action offered for them", async () => {
            // Arrange
            const dirty = aStatusOn("main", {
                head: { kind: "branch", name: "main", commit: RELEASE.sha },
                counts: { staged: 0, unstaged: 1, untracked: 0, conflicted: 0 }
            })
            const analyseTree = anAction("Analyse Working Tree", { isOfferedFor: selection => selection.items[0].kind === "workingTree" })
            const { detectChanges } = await renderList(seedOf([RELEASE, START], dirty), undefined, [analyseTree])

            // Act
            fireEvent.contextMenu(screen.getByTestId("commit-row-working-tree"))
            detectChanges()

            // Assert
            expect(menuLabels()).toEqual(["Analyse Working Tree"])
        })

        it("should close the menu after a click outside without moving the focus", async () => {
            // Arrange
            const { detectChanges } = await renderList(seedOf([RELEASE, START]))
            fireEvent.contextMenu(screen.getAllByTestId("commit-row")[0])
            detectChanges()

            // Act
            fireEvent.pointerDown(document.body)
            detectChanges()

            // Assert
            expect(screen.queryByTestId("commit-context-menu")).toBeNull()
            expect(document.activeElement).not.toBe(screen.getByTestId("commit-list"))
        })
    })

    it("should have no Analysis column without a provider", async () => {
        // Arrange & Act
        await renderList(seedOf([RELEASE, START]))

        // Assert
        expect(screen.getByTestId("commit-list-header").textContent).not.toContain("Analysis")
        expect(screen.queryAllByTestId("commit-analysis")).toHaveLength(0)
    })

    it("should word each analysis state with a provider", async () => {
        // Arrange
        const commits = history(6)
        const states: AnalysedCommitMarker[] = [
            { state: "analysed", isLoadedInMap: false, analysedAt: null, note: "imported map, analysis time unknown" },
            { state: "analysed", isLoadedInMap: true },
            { state: "queued", isLoadedInMap: false },
            { state: "running", isLoadedInMap: false, progressPercent: 42 },
            { state: "failed", isLoadedInMap: false, failureMessage: "ccsh exited with 1" }
        ]
        const markers = new Map(states.map((marker, index) => [commits[index].sha, marker]))

        // Act
        await renderList(seedOf(commits), markers)

        // Assert
        const badges = screen.getAllByTestId("commit-analysis").map(cell => cell.querySelector(".badge"))
        expect(screen.getByTestId("commit-list-header").textContent).toContain("Analysis")
        expect(badges.map(badge => badge?.textContent ?? null)).toEqual(["analysed", "in map", "queued", "42 %", "failed", null])
        expect(badges.map(badge => badge?.getAttribute("title") ?? null)).toEqual([
            "Analysed — imported map, analysis time unknown",
            "This analysis is shown in the map",
            "Waiting for another analysis to finish",
            "Analysis running",
            "Analysis failed: ccsh exited with 1",
            null
        ])
        expect(badges[0]?.classList).toContain("badge-success")
    })
})
