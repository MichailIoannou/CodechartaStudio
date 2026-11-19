import { TestBed } from "@angular/core/testing"
import { fireEvent, render, screen } from "@testing-library/angular"
import type { GitRefs } from "../../../../model/coreApi/GitRefs"
import type { FakeDesktopSeed } from "../../../../util/desktop/desktopBridge.mocks"
import { aFolder, aProject } from "../../../projects/projects.mocks"
import {
    aLocalBranch,
    anErrorPayload,
    anUpstream,
    aRefs,
    aRemoteBranch,
    aRepositoryInfo,
    aStatusOn,
    aTag
} from "../../services/gitApi.mocks"
import { provideGitHistory, settleGit } from "../../services/gitHistoryTestBed.mocks"
import { GitLogService } from "../../services/gitLog.service"
import { GROUP_ROW_CAP } from "../../util/branchTree"
import { BranchesTreeComponent } from "./branchesTree.component"

const BILLING = aProject("p-billing", [aFolder("f-api", { label: "billing-api" })])
const NOW_SECONDS = 1_763_600_000

const REFS = aRefs({
    localBranches: [
        aLocalBranch("feature/invoice-rounding", {
            isCurrent: true,
            upstream: anUpstream("origin/feature/invoice-rounding", { ahead: 2, behind: 1 }),
            lastCommit: { subject: "Fix invoice rounding", committedAt: NOW_SECONDS - 7200 }
        }),
        aLocalBranch("main", { upstream: anUpstream("origin/main", { behind: 4 }), checkedOutInOtherWorktree: "/work/billing-main" }),
        aLocalBranch("old-experiment", { upstream: anUpstream("origin/old-experiment", { ahead: null, behind: null, isGone: true }) })
    ],
    remoteBranches: [aRemoteBranch("origin", "main"), aRemoteBranch("origin", "feature/invoice-rounding")],
    tags: [aTag("v2.4.0")]
})

describe("BranchesTreeComponent", () => {
    async function renderTree(refs: GitRefs = REFS, seed?: FakeDesktopSeed) {
        jest.spyOn(Date, "now").mockReturnValue(NOW_SECONDS * 1000)
        const testBed = provideGitHistory(
            seed ?? { git: { "f-api": { info: aRepositoryInfo(), status: aStatusOn("main"), refs } } },
            BILLING
        )
        const rendered = await render(BranchesTreeComponent)
        await settleGit()
        rendered.detectChanges()
        return { ...testBed, ...rendered }
    }

    const rowOf = (id: string) => document.querySelector<HTMLElement>(`[data-row-id="${id}"]`)
    const scope = () => TestBed.inject(GitLogService).scope()

    afterEach(() => {
        jest.restoreAllMocks()
        localStorage.clear()
    })

    it("should mark the current branch with a check and in bold", async () => {
        // Arrange & Act
        await renderTree()

        // Assert
        const current = rowOf("refs/heads/feature/invoice-rounding")
        expect(current.querySelector(".fa-check.text-primary")).not.toBeNull()
        expect(current.querySelector(".font-semibold").textContent.trim()).toBe("feature/invoice-rounding")
        expect(rowOf("refs/heads/main").querySelector(".fa-check")).toBeNull()
    })

    it("should show how far each branch is ahead of and behind its upstream", async () => {
        // Arrange & Act
        await renderTree()

        // Assert
        expect(rowOf("refs/heads/feature/invoice-rounding").textContent.replaceAll(/\s+/g, " ")).toContain("2 1")
        expect(rowOf("refs/heads/feature/invoice-rounding").querySelector(".fa-arrow-up")).not.toBeNull()
        expect(rowOf("refs/heads/main").querySelector(".fa-arrow-up")).toBeNull()
        expect(rowOf("refs/heads/main").querySelector(".fa-arrow-down")).not.toBeNull()
    })

    it("should flag a branch whose upstream is gone", async () => {
        // Arrange & Act
        await renderTree()

        // Assert
        const gone = rowOf("refs/heads/old-experiment").querySelector(".badge-warning")
        expect(gone.textContent.trim()).toBe("gone")
    })

    it("should mark a branch checked out in another worktree", async () => {
        // Arrange & Act
        await renderTree()

        // Assert
        expect(rowOf("refs/heads/main").querySelector(".fa-folder-open").getAttribute("title")).toBe("Checked out in /work/billing-main")
    })

    it("should name the full ref and its last commit in the title", async () => {
        // Arrange & Act
        await renderTree()

        // Assert
        expect(rowOf("refs/heads/feature/invoice-rounding").querySelector("[title]").getAttribute("title")).toBe(
            "refs/heads/feature/invoice-rounding\nLast commit: Fix invoice rounding, 2 hours ago"
        )
        expect(screen.queryByText("v2.4.0")).toBeNull()
    })

    it("should scope the commit list to a clicked ref and add refs with ctrl", async () => {
        // Arrange
        const { detectChanges } = await renderTree()

        // Act
        fireEvent.click(rowOf("refs/heads/main"))
        fireEvent.click(rowOf("refs/remotes/origin/main"), { ctrlKey: true })
        detectChanges()

        // Assert
        expect(scope()).toEqual({ kind: "refs", refNames: ["refs/heads/main", "refs/remotes/origin/main"] })
        expect(rowOf("refs/heads/main").classList).toContain("bg-primary/20")
        expect(rowOf("refs/heads/main").getAttribute("aria-selected")).toBe("true")
        expect(rowOf("all").classList).not.toContain("bg-primary/20")
    })

    it("should return to all branches from the first row", async () => {
        // Arrange
        const { detectChanges } = await renderTree()
        fireEvent.click(rowOf("refs/heads/main"))

        // Act
        fireEvent.click(rowOf("all"))
        detectChanges()

        // Assert
        expect(scope()).toEqual({ kind: "all" })
        expect(rowOf("all").classList).toContain("bg-primary/20")
    })

    it("should open a closed group on click and remember it", async () => {
        // Arrange
        const { detectChanges } = await renderTree()

        // Act
        fireEvent.click(rowOf("tags"))
        detectChanges()

        // Assert
        expect(rowOf("tags").getAttribute("aria-expanded")).toBe("true")
        expect(rowOf("refs/tags/v2.4.0").querySelector(".fa-tag")).not.toBeNull()
        expect(JSON.parse(localStorage.getItem("codeChartaHistoryLayout")).toggledGroups).toEqual(["tags"])
    })

    it("should filter the refs and say when nothing matches", async () => {
        // Arrange
        const { detectChanges } = await renderTree()
        const filter = screen.getByRole("textbox", { name: "Filter branches" })

        // Act
        fireEvent.input(filter, { target: { value: "EXPERIMENT" } })
        detectChanges()
        const shownRefs = [...document.querySelectorAll("[role=treeitem]")].map(row => row.getAttribute("data-row-id"))
        fireEvent.input(filter, { target: { value: "xyz" } })
        detectChanges()

        // Assert
        expect(shownRefs).toEqual(["all", "local", "refs/heads/old-experiment"])
        expect(screen.getByText("No branch matches 'xyz'.")).not.toBeNull()
    })

    it("should say that a fresh repository has no commits yet", async () => {
        // Arrange & Act
        await renderTree(aRefs({ localBranches: [] }))

        // Assert
        expect(screen.getByText("No commits yet.")).not.toBeNull()
    })

    it("should show all refs of a capped group on request", async () => {
        // Arrange
        const tags = Array.from({ length: GROUP_ROW_CAP + 3 }, (_, index) => aTag(`v${index}`))
        localStorage.setItem("codeChartaHistoryLayout", JSON.stringify({ toggledGroups: ["tags"] }))
        const { detectChanges } = await renderTree(aRefs({ tags }))

        // Act
        fireEvent.click(screen.getByRole("button", { name: `Show all ${GROUP_ROW_CAP + 3}` }))
        detectChanges()

        // Assert
        expect(document.querySelectorAll("[data-row-id^='refs/tags/']")).toHaveLength(GROUP_ROW_CAP + 3)
    })

    it("should explain a failed read of the refs and retry it", async () => {
        // Arrange
        const seed: FakeDesktopSeed = {
            git: {
                "f-api": {
                    info: aRepositoryInfo(),
                    status: aStatusOn("main"),
                    failures: { "git.branches": anErrorPayload("INDEX_LOCKED") }
                }
            }
        }
        const { bridge, detectChanges } = await renderTree(REFS, seed)
        const sentence = screen.getByTestId("branches-failure").textContent
        bridge.respondWith("git.branches", REFS)

        // Act
        fireEvent.click(screen.getByRole("button", { name: "Retry" }))
        await settleGit()
        detectChanges()

        // Assert
        expect(sentence).toContain("Another git process is using this repository. Wait for it to finish, then retry.")
        expect(screen.queryByTestId("branches-failure")).toBeNull()
        expect(rowOf("refs/heads/main")).not.toBeNull()
    })

    describe("keyboard", () => {
        function press(key: string) {
            const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })
            const stopPropagation = jest.spyOn(event, "stopPropagation")
            screen.getByRole("tree").dispatchEvent(event)
            return { event, stopPropagation }
        }

        it("should move down the rows and scope the active ref with Enter", async () => {
            // Arrange
            const { detectChanges } = await renderTree()

            // Act
            press("ArrowDown")
            press("ArrowDown")
            press("ArrowDown")
            press("ArrowUp")
            const { event, stopPropagation } = press("Enter")
            detectChanges()

            // Assert
            expect(scope()).toEqual({ kind: "refs", refNames: ["refs/heads/feature/invoice-rounding"] })
            expect(screen.getByRole("tree").getAttribute("aria-activedescendant")).toBe("cc-branch-row-refs/heads/feature/invoice-rounding")
            expect(event.defaultPrevented).toBe(true)
            expect(stopPropagation).toHaveBeenCalled()
        })

        it("should collapse a group with the left arrow and open it with the right arrow", async () => {
            // Arrange
            const { detectChanges } = await renderTree()
            press("ArrowDown")

            // Act
            press("ArrowLeft")
            detectChanges()
            const isCollapsed = rowOf("local").getAttribute("aria-expanded") === "false"
            press("ArrowRight")
            detectChanges()
            press("ArrowRight")
            detectChanges()

            // Assert
            expect(isCollapsed).toBe(true)
            expect(rowOf("local").getAttribute("aria-expanded")).toBe("true")
            expect(screen.getByRole("tree").getAttribute("aria-activedescendant")).toBe("cc-branch-row-refs/heads/feature/invoice-rounding")
        })

        it("should move from a ref to its group with the left arrow", async () => {
            // Arrange
            const { detectChanges } = await renderTree()
            press("ArrowDown")
            press("ArrowDown")

            // Act
            press("ArrowLeft")
            detectChanges()

            // Assert
            expect(screen.getByRole("tree").getAttribute("aria-activedescendant")).toBe("cc-branch-row-local")
        })

        it("should let keys it does not handle through", async () => {
            // Arrange
            await renderTree()

            // Act
            const { event, stopPropagation } = press("a")

            // Assert
            expect(event.defaultPrevented).toBe(false)
            expect(stopPropagation).not.toHaveBeenCalled()
        })

        it("should not open a ref with the right arrow", async () => {
            // Arrange
            await renderTree()
            press("ArrowDown")
            press("ArrowDown")

            // Act
            const { event } = press("ArrowRight")

            // Assert
            expect(event.defaultPrevented).toBe(false)
        })
    })
})
