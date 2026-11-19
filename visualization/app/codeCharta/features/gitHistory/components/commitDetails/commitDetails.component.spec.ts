import { TestBed } from "@angular/core/testing"
import { Router } from "@angular/router"
import { fireEvent, render, screen } from "@testing-library/angular"
import type { GitCommitDetails } from "../../../../model/coreApi/GitCommitDetails"
import type { GitCommitSummary } from "../../../../model/coreApi/GitCommitSummary"
import { ViewHandoffStore } from "../../../../routing/viewHandoff.store"
import type { FakeDesktopSeed } from "../../../../util/desktop/desktopBridge.mocks"
import { aFolder, aProject } from "../../../projects/projects.mocks"
import { LOADED_MAP_LOCATOR } from "../../ports/loadedMapLocator.port"
import { CommitSelectionService } from "../../services/commitSelection.service"
import { aLogCommit, anErrorPayload, aRefs, aRepositoryInfo, aStatusOn } from "../../services/gitApi.mocks"
import { provideGitHistory, settleGit } from "../../services/gitHistoryTestBed.mocks"
import { CommitDetailsComponent } from "./commitDetails.component"

const BILLING = aProject("p-billing", [aFolder("f-api", { label: "billing-api" })])
const THIRD_OF_NOVEMBER = Date.UTC(2026, 10, 3, 14, 3) / 1000
const BASE = aLogCommit("1", "Start the invoice module")
const RELEASE = aLogCommit("2", "Release 2.4.0", ["1"])
const MERGE = aLogCommit("3", "Merge branch 'main' into feature/invoice-rounding", ["4", "2"], {
    authorName: "Mia Chen",
    authorEmail: "mia@example.com",
    authoredAt: THIRD_OF_NOVEMBER,
    committedAt: THIRD_OF_NOVEMBER + 120
})

const MERGE_DETAILS: GitCommitDetails = {
    ...MERGE,
    committerName: "Carl Committer",
    committerEmail: "carl@example.test",
    message: "Merge branch 'main' into feature/invoice-rounding\n\nBrings the release in.\nSecond line.",
    comparedToParent: "4".repeat(40),
    files: [
        { change: "modified", path: "src/billing/invoice.ts", previousPath: null, insertions: 40, deletions: 8 },
        { change: "added", path: "src/billing/currency.ts", previousPath: null, insertions: 80, deletions: 0 },
        { change: "renamed", path: "src/billing/money.ts", previousPath: "src/billing/old.ts", insertions: 0, deletions: 0 },
        { change: "modified", path: "logo.png", previousPath: null, insertions: null, deletions: null }
    ],
    areFilesTruncated: true,
    totals: { filesChanged: 816, insertions: 120, deletions: 8 }
}

/** The texts of an element's innermost elements, one space apart. */
function leafTexts(element: Element): string {
    const children = [...element.children]
    return children.length === 0 ? (element.textContent?.trim() ?? "") : children.map(leafTexts).filter(Boolean).join(" ")
}

function seedOf(commits: GitCommitSummary[], details: Record<string, GitCommitDetails> = {}): FakeDesktopSeed {
    return { git: { "f-api": { info: aRepositoryInfo(), status: aStatusOn("main"), refs: aRefs(), commits, details } } }
}

describe("CommitDetailsComponent", () => {
    async function renderDetails(seed: FakeDesktopSeed, providers: unknown[] = []) {
        const testBed = provideGitHistory(seed, BILLING)
        TestBed.configureTestingModule({ providers: providers as never[] })
        const rendered = await render(CommitDetailsComponent)
        await settleGit()
        return { ...testBed, ...rendered, selection: TestBed.inject(CommitSelectionService) }
    }

    async function select(rendered: Awaited<ReturnType<typeof renderDetails>>, commit: GitCommitSummary) {
        rendered.selection.select({ kind: "commit", commit })
        await settleGit()
        rendered.detectChanges()
    }

    it("should ask to select a commit while nothing is selected", async () => {
        // Arrange & Act
        await renderDetails(seedOf([BASE]))

        // Assert
        expect(screen.getByText("Select a commit to see its details.")).not.toBeNull()
    })

    it("should show the message, author, committer, date and sha of a commit", async () => {
        // Arrange
        const rendered = await renderDetails(seedOf([MERGE, RELEASE, BASE], { [MERGE.sha]: MERGE_DETAILS }))

        // Act
        await select(rendered, MERGE)

        // Assert
        expect(screen.getByTestId("commit-details-subject").textContent).toBe("Merge branch 'main' into feature/invoice-rounding")
        expect(screen.getByTestId("commit-details-body").textContent).toBe("Brings the release in.\nSecond line.")
        expect(screen.getByTestId("commit-details-sha").textContent).toBe("3333333333")
        expect(screen.getByTestId("commit-details-sha").getAttribute("title")).toBe(MERGE.sha)
        expect(screen.getByTestId("commit-details-author").textContent).toMatch(/^Mia Chen <mia@example\.com> · 3 Nov 2026, \d\d:\d\d$/)
        expect(screen.getByTestId("commit-details-committer").textContent).toContain("Carl Committer <carl@example.test>")
    })

    it("should list the changed files with their change and counts", async () => {
        // Arrange
        const rendered = await renderDetails(seedOf([MERGE], { [MERGE.sha]: MERGE_DETAILS }))

        // Act
        await select(rendered, MERGE)

        // Assert
        const rows = screen.getAllByTestId("changed-file").map(leafTexts)
        expect(rows).toEqual([
            "modified invoice.ts src/billing +40 −8",
            "added currency.ts src/billing +80",
            "renamed old.ts → money.ts src/billing",
            "modified logo.png binary"
        ])
        expect(screen.getAllByTestId("changed-file")[0].querySelector(".badge")?.classList).toContain("badge-info")
        expect(leafTexts(screen.getByTestId("commit-details-totals"))).toBe("Changed files 816 files +120 −8")
    })

    it("should say a merge is compared with its first parent and that the list is truncated", async () => {
        // Arrange
        const rendered = await renderDetails(seedOf([MERGE], { [MERGE.sha]: MERGE_DETAILS }))

        // Act
        await select(rendered, MERGE)

        // Assert
        expect(screen.getByTestId("commit-details-first-parent-note").textContent).toBe("Changes compared with the first parent")
        expect(screen.getByTestId("commit-details-truncated").textContent).toBe("… and 812 more files (list truncated)")
    })

    it("should leave out the merge note, the committer and the truncation for an ordinary commit", async () => {
        // Arrange
        const rendered = await renderDetails(seedOf([RELEASE, BASE]))

        // Act
        await select(rendered, RELEASE)

        // Assert
        expect(screen.queryByTestId("commit-details-first-parent-note")).toBeNull()
        expect(screen.queryByTestId("commit-details-committer")).toBeNull()
        expect(screen.queryByTestId("commit-details-truncated")).toBeNull()
        expect(screen.queryByTestId("commit-details-body")).toBeNull()
    })

    it("should select a parent from its link", async () => {
        // Arrange
        const rendered = await renderDetails(seedOf([RELEASE, BASE]))
        await select(rendered, RELEASE)

        // Act
        fireEvent.click(screen.getByRole("button", { name: "1111111" }))
        await settleGit()
        rendered.detectChanges()

        // Assert
        expect(rendered.selection.selectedSha()).toBe(BASE.sha)
        expect(screen.getByTestId("commit-details-subject").textContent).toBe("Start the invoice module")
    })

    it("should copy the full sha", async () => {
        // Arrange
        const writeText = jest.fn().mockResolvedValue(undefined)
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
        const rendered = await renderDetails(seedOf([RELEASE, BASE]))
        await select(rendered, RELEASE)

        // Act
        fireEvent.click(screen.getByRole("button", { name: "Copy full SHA" }))

        // Assert
        expect(writeText).toHaveBeenCalledWith(RELEASE.sha)
    })

    it("should show plain file names without a map locator", async () => {
        // Arrange
        const rendered = await renderDetails(seedOf([MERGE], { [MERGE.sha]: MERGE_DETAILS }))

        // Act
        await select(rendered, MERGE)

        // Assert
        expect(screen.getAllByTestId("changed-file")[0].querySelector("button")).toBeNull()
    })

    it("should show a file that has a node in the map as a button that hands it over to the metrics view", async () => {
        // Arrange
        const locator = {
            nodePathOf: (_repo: unknown, path: string) => (path === "src/billing/invoice.ts" ? "/root/src/billing/invoice.ts" : null)
        }
        const rendered = await renderDetails(seedOf([MERGE], { [MERGE.sha]: MERGE_DETAILS }), [
            { provide: LOADED_MAP_LOCATOR, useValue: locator }
        ])
        await select(rendered, MERGE)
        const navigate = jest.spyOn(TestBed.inject(Router), "navigateByUrl").mockResolvedValue(true)

        // Act
        const button = screen.getByRole("button", { name: "invoice.ts" })
        fireEvent.click(button)

        // Assert
        expect(button.getAttribute("title")).toBe("Show src/billing/invoice.ts in the map")
        expect(TestBed.inject(ViewHandoffStore).takeNodeFor("metrics")).toBe("/root/src/billing/invoice.ts")
        expect(navigate).toHaveBeenCalledWith("/")
        expect(screen.getByText("currency.ts").getAttribute("title")).toBe("Not in the map shown now")
    })

    it("should count the uncommitted changes for the working tree", async () => {
        // Arrange
        const rendered = await renderDetails(seedOf([BASE]))

        // Act
        rendered.selection.select({
            kind: "workingTree",
            status: aStatusOn("main", { counts: { staged: 1, unstaged: 2, untracked: 0, conflicted: 0 } })
        })
        rendered.detectChanges()

        // Assert
        expect(screen.getByTestId("commit-details-working-tree").textContent.trim()).toBe("3 changed files: 1 staged, 2 unstaged")
    })

    it("should show a failure with its sentence and retry", async () => {
        // Arrange
        const seed = seedOf([BASE])
        const failing = { git: { "f-api": { ...seed.git?.["f-api"], failures: { "git.commitDetails": anErrorPayload("INDEX_LOCKED") } } } }
        const rendered = await renderDetails(failing)
        await select(rendered, BASE)

        // Act
        fireEvent.click(screen.getByRole("button", { name: "Retry" }))
        await settleGit()

        // Assert
        expect(screen.getByTestId("commit-details-failure").textContent).toContain("Another git process is using this repository.")
        expect(rendered.bridge.calls.filter(call => call.args[0] === "git.commitDetails")).toHaveLength(2)
    })

    it("should show skeleton lines while loading", async () => {
        // Arrange
        const rendered = await renderDetails(seedOf([BASE]))
        rendered.bridge.request = jest.fn().mockReturnValue(new Promise(() => undefined))

        // Act
        rendered.selection.select({ kind: "commit", commit: BASE })
        await settleGit()
        rendered.detectChanges()

        // Assert
        expect(screen.getByTestId("commit-details-loading").querySelectorAll(".skeleton")).toHaveLength(5)
    })
})
