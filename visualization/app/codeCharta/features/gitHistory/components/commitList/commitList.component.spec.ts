import { signal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { fireEvent, render, screen } from "@testing-library/angular"
import type { GitCommitSummary } from "../../../../model/coreApi/GitCommitSummary"
import type { GitStatus } from "../../../../model/coreApi/GitStatus"
import type { FakeDesktopSeed } from "../../../../util/desktop/desktopBridge.mocks"
import { aFolder, aProject } from "../../../projects/projects.mocks"
import { ANALYSED_COMMITS, AnalysedCommitMarker } from "../../ports/analysedCommits.port"
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
    async function renderList(seed: FakeDesktopSeed, markers?: ReadonlyMap<string, AnalysedCommitMarker>) {
        const testBed = provideGitHistory(seed, BILLING)
        if (markers) {
            TestBed.configureTestingModule({ providers: [{ provide: ANALYSED_COMMITS, useValue: { markersFor: () => signal(markers) } }] })
        }
        const rendered = await render(CommitListComponent)
        await settleGit()
        rendered.detectChanges()
        return { ...testBed, ...rendered }
    }

    beforeEach(() => {
        jest.spyOn(globalThis, "requestAnimationFrame").mockImplementation(callback => Number(setTimeout(() => callback(0))))
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
        expect(release.className).toContain("border-l-2 border-primary")
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
