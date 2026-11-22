import { TestBed } from "@angular/core/testing"
import { NavigationEnd } from "@angular/router"
import { screen } from "@testing-library/angular"
import userEvent from "@testing-library/user-event"
import type { SnapshotResolution } from "../../../../model/coreApi/SnapshotResolution"
import type { FakeDesktopSeed } from "../../../../util/desktop/desktopBridge.mocks"
import { aFolder, aProject, aSnapshot } from "../../../projects/projects.mocks"
import { ProjectsTestBed, settle, setUpProjects } from "../../../projects/projectsTestBed.mocks"
import { SnapshotViewService } from "../../services/snapshotView.service"
import { COMMIT_SHA } from "../../snapshots.mocks"
import { SnapshotNoticeComponent } from "./snapshotNotice.component"

const OTHER_SHA = "c0ffee1".padEnd(40, "0")
const BILLING = aProject("p-billing", [aFolder("f-api", { label: "billing-api" })], { name: "billing" })
const OLDER = aSnapshot("p-billing", "f-api", "s-older", {
    commit: "9f8e7d6".padEnd(40, "0"),
    shortCommit: "9f8e7d6",
    subject: "Release 2.4.0",
    target: "commit"
})
const FOLDER = { projectId: "p-billing", folderId: "f-api" }
const STALE_BY_3: SnapshotResolution = {
    kind: "nearest",
    snapshot: OLDER,
    isCurrentProfile: true,
    relation: "ancestor",
    behind: 3,
    ahead: 0
}
const FIRST_JOB = "job-0000000000000001"
const FAILURE = { code: "JAVA_TOO_OLD" as const, message: "Java 21 is too old.", hint: "CodeCharta needs Java 22 or newer." }
const JAVA_MISSING = { code: "JAVA_NOT_FOUND" as const, severity: "error" as const, message: "Java was not found.", hint: null }

describe("SnapshotNoticeComponent", () => {
    let testBed: ProjectsTestBed
    let view: SnapshotViewService

    async function renderNotice(seed: FakeDesktopSeed = {}) {
        HTMLDialogElement.prototype.showModal = jest.fn()
        testBed = await setUpProjects({
            projects: [BILLING],
            activeProjectId: "p-billing",
            snapshots: [OLDER],
            resolutions: { [`f-api/${COMMIT_SHA}`]: STALE_BY_3, [`f-api/${OTHER_SHA}`]: STALE_BY_3 },
            ...seed
        })
        view = TestBed.inject(SnapshotViewService)
        const fixture = TestBed.createComponent(SnapshotNoticeComponent)
        fixture.autoDetectChanges()
        await settle()
        return fixture
    }

    async function showCommit(sha = COMMIT_SHA) {
        view.showCommit(sha)
        await settle()
    }

    function notice() {
        return screen.queryByTestId("snapshot-notice")
    }

    it("should show the stale text and action", async () => {
        // Arrange
        await renderNotice()

        // Act
        await showCommit()

        // Assert
        expect(screen.getByTestId("snapshot-notice-text").textContent).toBe(
            "No analysis for a1b2c3d — showing 9f8e7d6 (Release 2.4.0), stale by 3 commits."
        )
        expect(notice()?.classList).toContain("alert-warning")
        expect(screen.getByTestId("snapshot-notice-analyse").textContent?.trim()).toBe("Analyse a1b2c3d now")
    })

    it("should hide after dismiss and return for another target", async () => {
        // Arrange
        await renderNotice()
        await showCommit()

        // Act
        await userEvent.click(screen.getByTestId("snapshot-notice-dismiss"))
        await settle()
        const afterDismiss = notice()
        await showCommit(OTHER_SHA)

        // Assert
        expect(afterDismiss).toBeNull()
        expect(screen.getByTestId("snapshot-notice-text").textContent).toContain("No analysis for c0ffee1")
    })

    it("should not offer dismiss in the empty state", async () => {
        // Arrange & Act
        await renderNotice({ snapshots: [] })

        // Assert
        expect(screen.getByTestId("snapshot-notice-text").textContent).toBe("No analysis yet for 'billing-api'.")
        expect(screen.queryByTestId("snapshot-notice-dismiss")).toBeNull()
        expect(screen.getByTestId("snapshot-notice-analyse").textContent?.trim()).toBe("Analyse now")
    })

    it("should show progress and cancel while analysing", async () => {
        // Arrange
        await renderNotice()
        await showCommit()

        // Act
        await userEvent.click(screen.getByTestId("snapshot-notice-analyse"))
        await settle()
        const running = screen.getByTestId("snapshot-notice-text").textContent
        const hint = screen.getByTestId("snapshot-notice-hint").textContent
        await userEvent.click(screen.getByTestId("snapshot-notice-cancel"))
        await settle()

        // Assert
        expect(running).toBe("Analysing a1b2c3d…")
        expect(hint).toBe("Progress shows in the status at the top.")
        expect(testBed.requestsOf("analysis.cancel")).toEqual([{ jobId: FIRST_JOB }])
    })

    it("should show failure with retry", async () => {
        // Arrange
        await renderNotice()
        await showCommit()
        await view.analyseTarget("notice")
        testBed.bridge.failJob(FIRST_JOB, FAILURE, "ccsh: Java 21")
        await settle()

        // Act
        await userEvent.click(screen.getByTestId("snapshot-notice-log"))
        await userEvent.click(screen.getByTestId("snapshot-notice-retry"))
        await settle()

        // Assert
        expect(testBed.requestsOf("analysis.readLog")).toEqual([{ jobId: FIRST_JOB }])
        expect(testBed.requestsOf("analysis.enqueue")).toHaveLength(2)
    })

    it("should word a failure with its hint in the error tone", async () => {
        // Arrange
        await renderNotice()
        await showCommit()
        await view.analyseTarget("notice")

        // Act
        testBed.bridge.failJob(FIRST_JOB, FAILURE)
        await settle()

        // Assert
        expect(screen.getByTestId("snapshot-notice-text").textContent).toBe("Analysis of a1b2c3d failed: Java 21 is too old.")
        expect(screen.getByTestId("snapshot-notice-hint").textContent).toBe("CodeCharta needs Java 22 or newer.")
        expect(notice()?.classList).toContain("alert-error")
    })

    it("should list the problems of a refused analysis inside the notice", async () => {
        // Arrange
        await renderNotice()
        await showCommit()
        testBed.bridge.respondWith("analysis.enqueue", { status: "rejected", problems: [JAVA_MISSING] })

        // Act
        await userEvent.click(screen.getByTestId("snapshot-notice-analyse"))
        await settle()

        // Assert
        expect(screen.getByTestId("preflight-problem-JAVA_NOT_FOUND").textContent).toContain("Java was not found.")
        expect(notice()?.classList).toContain("alert-error")
    })

    it("should stay away from the project overview and the history view", async () => {
        // Arrange
        await renderNotice({ snapshots: [] })

        // Act
        testBed.router.events.next(new NavigationEnd(1, "/project", "/project"))
        await settle()
        const overOverview = notice()
        testBed.router.events.next(new NavigationEnd(2, "/history", "/history"))
        await settle()
        const overHistory = notice()
        testBed.router.events.next(new NavigationEnd(3, "/domain?file=a", "/domain?file=a"))
        await settle()

        // Assert
        expect([overOverview, overHistory]).toEqual([null, null])
        expect(notice()).not.toBeNull()
    })

    it("should say nothing while the map shows the exact snapshot", async () => {
        // Arrange
        await renderNotice({ resolutions: {} })

        // Act
        await view.open(OLDER.ref)
        await settle()

        // Assert
        expect(view.target()).toEqual({ kind: "snapshot", ref: OLDER.ref })
        expect(notice()).toBeNull()
    })

    it("should resolve the folder of the working folder only", async () => {
        // Arrange & Act
        await renderNotice()

        // Assert
        expect(testBed.requestsOf("snapshots.resolveForCommit")).toEqual([{ ...FOLDER, target: { kind: "workingTree" } }])
    })
})
