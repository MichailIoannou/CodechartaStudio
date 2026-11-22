import type { Provider } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { screen, within } from "@testing-library/angular"
import userEvent from "@testing-library/user-event"
import type { GitStatus } from "../../../../model/coreApi/GitStatus"
import type { FakeDesktopSeed } from "../../../../util/desktop/desktopBridge.mocks"
import { WORKING_FOLDER_SOURCE } from "../../../gitHistory/facade"
import { aLocalBranch, anUpstream, aRefs, aRepositoryInfo } from "../../../gitHistory/services/gitApi.mocks"
import { GitConfirmationService } from "../../../gitHistory/services/gitConfirmation.service"
import { ProjectsFacade } from "../../../projects/facade"
import { aFolder, aProject, aSnapshot } from "../../../projects/projects.mocks"
import { ProjectsTestBed, settle, setUpProjects } from "../../../projects/projectsTestBed.mocks"
import { BatchAnalysisDialogService, SnapshotsDialogService } from "../../../snapshots/facade"
import { aJob } from "../../../snapshots/snapshots.mocks"
import { WorkspaceStatusComponent } from "./workspaceStatus.component"

const BILLING = aProject(
    "p-billing",
    [aFolder("f-api", { label: "billing-api" }), aFolder("f-out", { label: "out", role: "helper", kind: "plain" })],
    { name: "billing" }
)
const SHOWN = aSnapshot("p-billing", "f-api", "s-1", { target: "commit", shortCommit: "9f8e7d6", subject: "Release 2.4.0" })
const STATUS: GitStatus = {
    head: { kind: "branch", name: "main", commit: "a".repeat(40) },
    upstream: { refName: "refs/remotes/origin/main", name: "origin/main", ahead: 0, behind: 2, isGone: false },
    counts: { staged: 1, unstaged: 2, untracked: 0, conflicted: 0 },
    operationInProgress: null
}
const REFS = aRefs({
    localBranches: [aLocalBranch("main", { isCurrent: true, upstream: anUpstream("origin/main", { behind: 2 }) })],
    remotes: [{ name: "origin", url: "https://example.com/acme/billing-api.git" }]
})
const GIT_OF_THE_WORKING_FOLDER: Provider[] = [{ provide: WORKING_FOLDER_SOURCE, useExisting: ProjectsFacade }]
const FAILURE = { code: "JAVA_TOO_OLD" as const, message: "Java 21 is too old.", hint: "CodeCharta needs Java 22 or newer." }

describe("WorkspaceStatusComponent", () => {
    let testBed: ProjectsTestBed

    async function renderStatus(seed: FakeDesktopSeed = {}, providers: Provider[] = []) {
        HTMLDialogElement.prototype.showModal = jest.fn()
        testBed = await setUpProjects(
            {
                projects: [BILLING],
                activeProjectId: "p-billing",
                snapshots: [SHOWN],
                gitStatuses: { "f-api": STATUS },
                ...seed
            },
            { providers }
        )
        await testBed.projects.showWorkingFolder()
        const fixture = TestBed.createComponent(WorkspaceStatusComponent)
        fixture.autoDetectChanges()
        await settle()
        return fixture
    }

    function trigger() {
        return screen.getByTestId("workspace-status-trigger")
    }

    async function openMenu() {
        await userEvent.click(trigger())
        await settle()
        return screen.getByTestId("workspace-status-menu")
    }

    it("should render nothing without an open project", async () => {
        // Arrange & Act
        await renderStatus({ activeProjectId: null })

        // Assert
        expect(screen.queryByTestId("workspace-status-trigger")).toBeNull()
    })

    it("should show the branch and the uncommitted changes, with the commit in the map only in the title", async () => {
        // Arrange & Act
        await renderStatus()

        // Assert
        expect(screen.getByTestId("workspace-status-branch").textContent).toBe("main")
        expect(screen.queryByTestId("workspace-status-map")).toBeNull()
        expect(trigger().getAttribute("aria-label")).toBe("Branch main")
        expect(trigger().title).toContain("Map shows 9f8e7d6 Release 2.4.0")
        expect(trigger().title).toContain("Branch main, 2 to pull, 3 uncommitted")
        expect(trigger().querySelector("[title='3 uncommitted changes']")).not.toBeNull()
    })

    it("should keep only the activity icon and the caret in its icon-only form", async () => {
        // Arrange
        const fixture = await renderStatus()

        // Act
        fixture.componentRef.setInput("iconOnly", true)
        await settle()

        // Assert
        expect(screen.queryByTestId("workspace-status-branch")).toBeNull()
        expect(screen.queryByTestId("workspace-status-map")).toBeNull()
        expect(screen.getByTestId("workspace-status-icon")).toBeTruthy()
        expect(trigger().style.width).toBe("3.25rem")
        expect(trigger().getAttribute("aria-label")).toBe("Branch main")
    })

    it("should keep its fixed 18rem width whatever it shows and tell the nav bar fit how far it can narrow", async () => {
        // Arrange & Act
        const fixture = await renderStatus()

        // Assert
        const host: HTMLElement = fixture.nativeElement
        expect(trigger().style.width).toBe("18rem")
        expect([host.dataset.fitFull, host.dataset.fitNarrowest, host.dataset.fitCompact]).toEqual(["18", "9", "3.25"])
        expect(screen.getByTestId("workspace-status-counts").textContent?.trim()).toBe("2")
    })

    it("should take the width the nav bar fit gives it and drop the ahead and behind counts first", async () => {
        // Arrange
        const fixture = await renderStatus()

        // Act
        fixture.componentRef.setInput("width", 200)
        await settle()

        // Assert
        expect(trigger().style.width).toBe("200px")
        expect(screen.queryByTestId("workspace-status-counts")).toBeNull()
        expect(screen.getByTestId("workspace-status-branch").textContent).toBe("main")
    })

    it("should show its badge as a dot on the icon in its icon-only form", async () => {
        // Arrange
        const fixture = await renderStatus({ snapshots: [] })

        // Act
        fixture.componentRef.setInput("iconOnly", true)
        await settle()

        // Assert
        const dot = screen.getByTestId("workspace-status-badge-dot")
        expect(dot.title).toBe("not analysed")
        expect(dot.classList).toContain("bg-base-content/50")
        expect(screen.queryByTestId("workspace-status-badge")).toBeNull()
    })

    it("should show analysis progress as its fill and percent", async () => {
        // Arrange
        await renderStatus({ analysisJobs: [aJob("job-1", { state: "running" })] })

        // Act
        testBed.bridge.reportProgress("job-1", { mode: "determinate", percent: 42 })
        await settle()

        // Assert
        expect(screen.getByTestId("workspace-status-spinner")).toBeTruthy()
        expect(screen.getByTestId("workspace-status-map").textContent).toMatch(/^\s*Analysing ·\s*42 %\s*$/)
        expect(screen.getByTestId("workspace-status-fill").style.width).toBe("42%")
        expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("42")
        expect(screen.getByRole("progressbar").getAttribute("aria-label")).toBe("Analysis of a1b2c3d")
    })

    it("should sweep while the analysis reports no percent", async () => {
        // Arrange & Act
        await renderStatus({ analysisJobs: [aJob("job-1")] })

        // Assert
        expect(screen.getByTestId("workspace-status-sweep")).toBeTruthy()
        expect(screen.getByTestId("workspace-status-map").textContent?.trim()).toBe("Analysing…")
        expect(screen.getByRole("progressbar").hasAttribute("aria-valuenow")).toBe(false)
    })

    it("should list progress and cancel a job", async () => {
        // Arrange
        await renderStatus({ analysisJobs: [aJob("job-1", { state: "running", progress: { mode: "determinate", percent: 42 } })] })
        const menu = await openMenu()

        // Act
        const running = within(menu).getByTestId("activity-running").textContent?.replaceAll(/\s+/g, " ")
        await userEvent.click(within(menu).getByTestId("activity-cancel"))
        await settle()

        // Assert
        expect(running).toContain("Analysing a1b2c3d")
        expect(running).toContain("42 %")
        expect(testBed.requestsOf("analysis.cancel")).toEqual([{ jobId: "job-1" }])
        expect(within(menu).getByTestId("activity-cancelled").textContent).toContain("Analysis of a1b2c3d cancelled")
    })

    it("should offer the log of a failed job and retry it", async () => {
        // Arrange
        await renderStatus({ analysisJobs: [aJob("job-1", { state: "running" })], failedJobLogs: {} })
        testBed.bridge.failJob("job-1", FAILURE, "java 21 found")
        await settle()
        const iconWhileFailed = screen.getByTestId("workspace-status-icon").className
        const menu = await openMenu()
        const toneAfterOpening = trigger().dataset.tone

        // Act
        await userEvent.click(within(menu).getByTestId("activity-show-log"))
        await settle()
        await userEvent.click(within(menu).getByTestId("activity-retry"))
        await settle()

        // Assert
        expect(iconWhileFailed).toContain("text-error")
        expect(within(menu).getByTestId("activity-failed").textContent).toContain("Java 21 is too old.")
        expect(within(menu).getByTestId("activity-failed").textContent).toContain("CodeCharta needs Java 22 or newer.")
        expect(screen.getByTestId("analysis-log-text").textContent).toBe("java 21 found")
        expect(testBed.requestsOf("analysis.enqueue")).toEqual([
            { projectId: "p-billing", folderId: "f-api", target: { kind: "commit", sha: "a1b2c3d".padEnd(40, "0") }, force: false }
        ])
        expect(toneAfterOpening).toBe("none")
    })

    it("should tint a finished analysis for a moment and open its snapshot", async () => {
        // Arrange
        await renderStatus({ analysisJobs: [aJob("job-1", { state: "running" })] })
        jest.useFakeTimers()

        // Act
        testBed.bridge.completeJob("job-1")
        TestBed.tick()
        const tone = trigger().dataset.tone
        jest.advanceTimersByTime(1500)
        TestBed.tick()
        jest.useRealTimers()
        await settle()
        const menu = await openMenu()
        await userEvent.click(within(menu).getByTestId("activity-open"))
        await settle()

        // Assert
        expect(tone).toBe("finished")
        expect(trigger().dataset.tone).toBe("none")
        const [[toLoad]] = testBed.loadFilesUseCase.loadProjectSnapshots.mock.calls.slice(-1)
        expect(toLoad[0].origin.snapshotId).toBe(`${"a1b2c3d".padEnd(40, "0")}-01234567`)
    })

    it("should say a folder is not analysed and analyse its current checkout from the dropdown", async () => {
        // Arrange
        await renderStatus({ snapshots: [] })
        const badge = screen.getByTestId("workspace-status-badge").textContent
        const menu = await openMenu()

        // Act
        const sentence = within(menu).getByTestId("workspace-status-no-analysis").textContent
        await userEvent.click(within(menu).getByTestId("workspace-status-analyse"))
        await settle()

        // Assert
        expect(badge).toBe("not analysed")
        expect(sentence).toBe("No analysis yet.")
        expect(testBed.requestsOf("analysis.enqueue")).toEqual([
            { projectId: "p-billing", folderId: "f-api", target: { kind: "workingTree" }, force: false }
        ])
        expect(within(menu).queryByTestId("workspace-status-analyse")).toBeNull()
        expect(within(menu).getByTestId("activity-queued").textContent).toContain("Queued: working tree")
    })

    it("should keep the staleness of the map visible and offer to analyse what was asked for", async () => {
        // Arrange
        const nearest = {
            kind: "nearest" as const,
            snapshot: SHOWN,
            isCurrentProfile: true,
            relation: "ancestor" as const,
            behind: 4,
            ahead: 0
        }
        await renderStatus({ resolutions: { "f-api/workingTree": nearest } })
        const before = within(await openMenu()).queryByTestId("workspace-status-analyse")

        // Act
        await userEvent.click(screen.getByTestId("workspace-status-current-checkout"))
        await settle()
        const badge = screen.getByTestId("workspace-status-badge").textContent
        const menu = await openMenu()
        const askedFor = within(menu).getByTestId("workspace-status-asked-for").textContent?.replaceAll(/\s+/g, " ").trim()
        await userEvent.click(within(menu).getByTestId("workspace-status-analyse"))
        await settle()

        // Assert
        expect(before).toBeNull()
        expect(badge).toBe("stale by 4")
        expect(trigger().title).toContain("Map shows 9f8e7d6 Release 2.4.0, 4 commits behind the current checkout")
        expect(askedFor).toMatch(/^Asked for ?aaaaaaa ?\(current checkout\)$/)
        expect(within(menu).queryByTestId("workspace-status-current-checkout")).toBeNull()
        expect(testBed.requestsOf("analysis.enqueue")).toEqual([
            { projectId: "p-billing", folderId: "f-api", target: { kind: "workingTree" }, force: false }
        ])
        expect(within(menu).queryByTestId("workspace-status-analyse")).toBeNull()
    })

    it("should show the preflight problems of an analysis it started", async () => {
        // Arrange
        await renderStatus({
            snapshots: [],
            responses: { "analysis.enqueue": { status: "rejected", problems: [{ ...FAILURE, severity: "error" }] } }
        })
        const menu = await openMenu()

        // Act
        await userEvent.click(within(menu).getByTestId("workspace-status-analyse"))
        await settle()

        // Assert
        expect(within(menu).getByTestId("preflight-problems").textContent).toContain("Java 21 is too old.")
    })

    it("should show the map, the git state and open the snapshots dialog", async () => {
        // Arrange
        await renderStatus()
        const menu = await openMenu()

        // Act
        const showing = within(menu).getByTestId("workspace-status-showing").textContent?.replaceAll(/\s+/g, " ").trim()
        const git = within(menu).getByTestId("workspace-status-git").textContent?.replaceAll(/\s+/g, " ").trim()
        await userEvent.click(within(menu).getByTestId("workspace-status-snapshots"))

        // Assert
        expect(showing).toMatch(/^Showing ?9f8e7d6 Release 2\.4\.0$/)
        expect(git).toMatch(/^main ?→ origin\/main ?0 2 3 uncommitted \(1 staged\)$/)
        expect(TestBed.inject(SnapshotsDialogService).isOpen()).toBe(true)
        expect(screen.queryByTestId("workspace-status-menu")).toBeNull()
    })

    it("should pull with the sync button of its git section", async () => {
        // Arrange
        await renderStatus({ git: { "f-api": { info: aRepositoryInfo(), refs: REFS } } }, GIT_OF_THE_WORKING_FOLDER)
        jest.spyOn(TestBed.inject(GitConfirmationService), "ask").mockResolvedValue(true)
        const menu = await openMenu()
        const main = within(within(menu).getByTestId("workspace-status-sync")).getByTestId("sync-button-main")
        const title = main.title

        // Act
        await userEvent.click(main)
        await settle()

        // Assert
        expect(title).toBe("Pull 2 commits from origin/main (fast-forward only)")
        expect(testBed.bridge.calls.filter(call => call.args[0] === "git.pull").map(call => call.args[1])).toEqual([
            expect.objectContaining({ repo: { projectId: "p-billing", folderId: "f-api" }, mode: "ffOnly" })
        ])
    })

    it("should keep its dropdown open while an action is chosen from the sync menu", async () => {
        // Arrange
        await renderStatus({ git: { "f-api": { info: aRepositoryInfo(), refs: REFS } } }, GIT_OF_THE_WORKING_FOLDER)
        jest.spyOn(TestBed.inject(GitConfirmationService), "ask").mockResolvedValue(true)
        const menu = await openMenu()

        // Act
        await userEvent.click(within(menu).getByTestId("sync-button-caret"))
        await settle()
        await userEvent.click(within(screen.getByTestId("sync-menu")).getByText("Fetch"))
        await settle()

        // Assert
        expect(testBed.bridge.calls.some(call => call.args[0] === "git.fetch")).toBe(true)
        expect(screen.getByTestId("workspace-status-menu")).toBeTruthy()
    })

    it("should word a plain working folder", async () => {
        // Arrange
        await renderStatus({ projects: [{ ...BILLING, view: { workingFolderId: "f-out", shownSnapshotIdByFolder: {} } }], snapshots: [] })

        // Act
        const menu = await openMenu()

        // Assert
        expect(screen.getByTestId("workspace-status-icon").className).toContain("fa-folder")
        expect(within(menu).getByTestId("workspace-status-git").textContent?.trim()).toBe("Plain folder — no git history.")
    })

    it("should show the message of git when it cannot answer", async () => {
        // Arrange
        await renderStatus({ gitStatuses: {} })

        // Act
        const menu = await openMenu()

        // Assert
        expect(within(menu).getByTestId("workspace-status-git").textContent).toContain("no repository for f-api")
    })

    it("should say the core is offline and restart it", async () => {
        // Arrange
        await renderStatus()
        testBed.bridge.emit("shell.coreState", { state: "unavailable", message: "crashed" })
        await settle()
        const menu = await openMenu()

        // Act
        await userEvent.click(within(menu).getByTestId("workspace-status-restart"))

        // Assert
        expect(screen.getByTestId("workspace-status-map").textContent?.trim()).toBe("Core offline")
        expect(testBed.bridge.calls.some(call => call.name === "restartCore")).toBe(true)
    })

    it("should open with the arrow key, close with Escape and on a click outside", async () => {
        // Arrange
        await renderStatus()
        trigger().focus()

        // Act
        await userEvent.keyboard("{ArrowDown}")
        await settle()
        await new Promise(resolve => setTimeout(resolve))
        const focused = document.activeElement?.getAttribute("data-testid")
        await userEvent.keyboard("{Escape}")
        const afterEscape = screen.queryByTestId("workspace-status-menu")
        const focusedAfterEscape = document.activeElement
        await openMenu()
        await userEvent.click(document.body)

        // Assert
        expect(focused).toBe("workspace-status-current-checkout")
        expect(afterEscape).toBeNull()
        expect(focusedAfterEscape).toBe(trigger())
        expect(screen.queryByTestId("workspace-status-menu")).toBeNull()
    })

    it("should open its activity when a batch was started, also while the starting click reaches the page", async () => {
        // Arrange
        await renderStatus({ analysisJobs: [aJob("job-1", { batchId: "batch-1" })] })

        // Act
        TestBed.inject(BatchAnalysisDialogService).announceStarted("batch-1")
        document.body.click()
        await settle()

        // Assert
        expect(within(screen.getByTestId("workspace-status-menu")).getByTestId("activity-batch")).toBeTruthy()
    })

    it("should keep its dropdown open behind a confirmation it opened", async () => {
        // Arrange
        await renderStatus()
        await openMenu()
        const dialog = document.createElement("dialog")
        const answer = document.createElement("button")
        dialog.appendChild(answer)
        document.body.appendChild(dialog)

        // Act
        await userEvent.click(answer)
        await userEvent.click(dialog)

        // Assert
        expect(screen.getByTestId("workspace-status-menu")).toBeTruthy()
        dialog.remove()
    })

    it("should open the History next to its sync button", async () => {
        // Arrange
        await renderStatus({ git: { "f-api": { info: aRepositoryInfo(), refs: REFS } } }, GIT_OF_THE_WORKING_FOLDER)
        const menu = await openMenu()

        // Act
        await userEvent.click(within(within(menu).getByTestId("workspace-status-sync")).getByTestId("workspace-status-open-history"))

        // Assert
        expect(testBed.router.navigateByUrl).toHaveBeenLastCalledWith("/history")
        expect(screen.queryByTestId("workspace-status-menu")).toBeNull()
    })

    it("should say that a merge is unfinished and where to finish it", async () => {
        // Arrange
        const merging: GitStatus = { ...STATUS, operationInProgress: "merge", counts: { ...STATUS.counts, conflicted: 2 } }
        await renderStatus({ gitStatuses: { "f-api": merging } })

        // Act
        const menu = await openMenu()

        // Assert
        expect(within(menu).getByTestId("workspace-status-operation").textContent?.trim()).toBe(
            "Merging — 2 files have conflicts. Finish or abort it in the History."
        )
        expect(within(menu).queryByTestId("history-operation-abort")).toBeNull()
    })

    it("should go to the project overview", async () => {
        // Arrange
        await renderStatus()
        const menu = await openMenu()

        // Act
        await userEvent.click(within(menu).getByTestId("workspace-status-overview"))

        // Assert
        expect(testBed.router.navigateByUrl).toHaveBeenLastCalledWith("/project")
    })
})
