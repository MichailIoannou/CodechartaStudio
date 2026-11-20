import { TestBed } from "@angular/core/testing"
import { fireEvent, render, screen } from "@testing-library/angular"
import type { GitDiff } from "../../../../model/coreApi/GitDiff"
import type { GitWorkingTreeEntry } from "../../../../model/coreApi/GitWorkingTreeEntry"
import type { FakeDesktopSeed } from "../../../../util/desktop/desktopBridge.mocks"
import { aFolder, aProject } from "../../../projects/projects.mocks"
import { anErrorPayload, aRefs, aRepositoryInfo, aStatusOn } from "../../services/gitApi.mocks"
import { GitChangesService } from "../../services/gitChanges.service"
import { provideGitHistory, settleGit } from "../../services/gitHistoryTestBed.mocks"
import { DiffViewComponent } from "./diffView.component"

const BILLING = aProject("p-billing", [aFolder("f-api")])
const APP: GitWorkingTreeEntry = { path: "src/app.ts", previousPath: null, kind: "unstaged", change: "modified", conflict: null }
const INVOICE: GitWorkingTreeEntry = { path: "src/invoice.ts", previousPath: null, kind: "conflicted", change: "modified", conflict: "UU" }
const DIFF_TEXT = ["diff --git a/src/app.ts b/src/app.ts", "@@ -1,2 +1,2 @@", " keep", "-old", "+new", ""].join("\n")

function aDiff(overrides: Partial<GitDiff> = {}): GitDiff {
    return { path: APP.path, text: DIFF_TEXT, isBinary: false, isTruncated: false, ...overrides }
}

function seedWith(diff: GitDiff | null, extra: Partial<NonNullable<FakeDesktopSeed["git"]>[string]> = {}): FakeDesktopSeed {
    const diffs = diff ? { "unstaged:src/app.ts": diff } : {}
    return {
        git: { "f-api": { info: aRepositoryInfo(), status: aStatusOn("main"), refs: aRefs(), changes: [APP, INVOICE], diffs, ...extra } }
    }
}

describe("DiffViewComponent", () => {
    beforeEach(() => {
        localStorage.clear()
    })

    async function renderDiff(seed: FakeDesktopSeed, shownKey: string | null = "unstaged:src/app.ts") {
        provideGitHistory(seed, BILLING)
        localStorage.setItem("codeChartaHistoryTab.p-billing", "changes")
        const rendered = await render(DiffViewComponent)
        await settleGit()
        if (shownKey) {
            TestBed.inject(GitChangesService).show(shownKey)
            await settleGit()
        }
        rendered.detectChanges()
        return rendered
    }

    const lineTexts = () => screen.getAllByTestId("diff-line").map(line => line.lastElementChild?.textContent)
    const lineNumbers = () =>
        screen
            .getAllByTestId("diff-line")
            .map(line => [...line.querySelectorAll("span.w-8")].map(number => number.textContent.trim()).join("/"))

    it("should ask to select a file while none is shown", async () => {
        // Arrange & Act
        await renderDiff(seedWith(aDiff()), null)

        // Assert
        expect(screen.getByTestId("diff-nothing-selected").textContent.trim()).toBe("Select a file to see its changes.")
    })

    it("should colour the diff lines and number them in the gutter", async () => {
        // Arrange & Act
        await renderDiff(seedWith(aDiff()))

        // Assert
        expect(screen.getByTestId("diff-path").textContent.trim()).toBe("src/app.ts")
        expect(screen.getByTestId("diff-kind").textContent.trim()).toBe("unstaged")
        const lines = screen.getAllByTestId("diff-line")
        expect(lineTexts()).toEqual(["diff --git a/src/app.ts b/src/app.ts", "@@ -1,2 +1,2 @@", " keep", "-old", "+new"])
        expect(lineNumbers()).toEqual(["/", "/", "1/1", "2/", "/2"])
        expect(lines[0].className).toContain("text-base-content/60")
        expect(lines[1].className).toContain("text-info")
        expect(lines[3].className).toContain("bg-error/10")
        expect(lines[3].className).toContain("text-error")
        expect(lines[4].className).toContain("bg-success/10")
        expect(lines[4].className).toContain("text-success")
    })

    it("should render the diff through interpolation only", async () => {
        // Arrange
        const text = ["@@ -0,0 +1 @@", '+<img src="x" onerror="globalThis.injected = true"><b>bold</b>', ""].join("\n")

        // Act
        await renderDiff(seedWith(aDiff({ text })))

        // Assert
        const view = screen.getByTestId("diff-view")
        expect(view.querySelector("img")).toBeNull()
        expect(view.querySelector("b")).toBeNull()
        expect(lineTexts()[1]).toBe('+<img src="x" onerror="globalThis.injected = true"><b>bold</b>')
        expect((globalThis as { injected?: boolean }).injected).toBeUndefined()
    })

    it("should say that a binary file has no text diff", async () => {
        // Arrange & Act
        await renderDiff(seedWith(aDiff({ text: "", isBinary: true })))

        // Assert
        expect(screen.getByTestId("diff-binary").textContent.trim()).toBe("Binary file — no text diff.")
        expect(screen.queryAllByTestId("diff-line")).toHaveLength(0)
    })

    it("should say where a long diff was cut", async () => {
        // Arrange & Act
        await renderDiff(seedWith(aDiff({ isTruncated: true })))

        // Assert
        expect(screen.getByTestId("diff-truncated").textContent.trim()).toBe("Diff cut at 2 MB.")
    })

    it("should render only the lines in view of a long diff", async () => {
        // Arrange
        const text = ["@@ -0,0 +1,5000 @@", ...Array.from({ length: 5000 }, (_, index) => `+line ${index}`)].join("\n")

        // Act
        await renderDiff(seedWith(aDiff({ text })))

        // Assert
        const rendered = screen.getAllByTestId("diff-line").length
        expect(rendered).toBeGreaterThan(0)
        expect(rendered).toBeLessThan(100)
        expect((screen.getByTestId("diff-lines").firstElementChild as HTMLElement).style.height).toBe(`${5001 * 20}px`)
    })

    it("should mark a conflicted file's kind", async () => {
        // Arrange & Act
        await renderDiff(seedWith(null), "conflicted:src/invoice.ts")

        // Assert
        expect(screen.getByTestId("diff-kind").className).toContain("badge-warning")
    })

    it("should show a failed diff with its sentence and load it again on retry", async () => {
        // Arrange
        const rendered = await renderDiff(seedWith(aDiff(), { failures: { "git.diffFile": anErrorPayload("TIMEOUT") } }))

        // Act
        fireEvent.click(screen.getByRole("button", { name: "Retry" }))
        rendered.detectChanges()
        const isLoading = screen.queryAllByTestId("diff-loading").length > 0

        // Assert
        expect(isLoading).toBe(true)
        await settleGit()
        rendered.detectChanges()
        expect(screen.getByTestId("diff-failure").textContent).toContain("Git did not answer in time.")
    })

    it("should say that a diff is too large to show and give the command for a terminal", async () => {
        // Arrange & Act
        await renderDiff(seedWith(aDiff(), { failures: { "git.diffFile": anErrorPayload("OUTPUT_TOO_LARGE") } }))

        // Assert
        expect(screen.getByTestId("diff-too-large").textContent).toContain(
            "This diff is too large to show (over 4 MB). Run this in a terminal to see it:"
        )
        expect(screen.getByTestId("copy-command").textContent.trim()).toBe("git diff -- src/app.ts")
        expect(screen.queryByTestId("diff-failure")).toBeNull()
    })

    it("should give the command for the staged changes of a staged file that is too large", async () => {
        // Arrange
        const staged: GitWorkingTreeEntry = { ...APP, path: "src/big file.ts", kind: "staged" }
        const failures = { "git.diffFile": anErrorPayload("OUTPUT_TOO_LARGE") }

        // Act
        await renderDiff(seedWith(null, { changes: [staged], failures }), "staged:src/big file.ts")

        // Assert
        expect(screen.getByTestId("copy-command").textContent.trim()).toBe('git diff --cached -- "src/big file.ts"')
    })
})
