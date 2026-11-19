import type { GitStatus } from "../../../model/coreApi/GitStatus"
import { aFolder, aSnapshot } from "../../projects/projects.mocks"
import { aJob } from "../../snapshots/snapshots.mocks"
import { gitActivityOf, stalenessOf, TriggerInput, uncommittedTitle, workspaceTrigger } from "./workspaceTrigger"

const STATUS: GitStatus = {
    head: { kind: "branch", name: "feature/invoice-rounding", commit: "a".repeat(40) },
    upstream: {
        refName: "refs/remotes/origin/feature/invoice-rounding",
        name: "origin/feature/invoice-rounding",
        ahead: 2,
        behind: 1,
        isGone: false
    },
    counts: { staged: 1, unstaged: 1, untracked: 1, conflicted: 0 },
    operationInProgress: null
}
const SHOWN = aSnapshot("p", "f-api", "s-1", { target: "commit", shortCommit: "9f8e7d6", subject: "Release 2.4.0" })

function input(overrides: Partial<TriggerInput> = {}): TriggerInput {
    return {
        folder: aFolder("f-api", { label: "billing-api", path: "/work/billing-api" }),
        gitStatus: STATUS,
        shown: SHOWN,
        hasSnapshots: true,
        activeJob: null,
        outcome: "none",
        isCoreOffline: false,
        staleness: null,
        ...overrides
    }
}

describe("workspaceTrigger", () => {
    describe("git activity", () => {
        const FOLDER = { projectId: "p", folderId: "f-api" }
        const FETCHING = {
            label: "Fetching",
            icon: "fa-solid fa-cloud-arrow-down motion-safe:animate-pulse",
            percent: 45,
            message: "Receiving objects: 45%"
        }

        it("should word a fetch of the working folder with its percent, and only that", () => {
            // Arrange
            const running = {
                repo: FOLDER,
                kind: "fetch" as const,
                operationId: "git-operation-1",
                progress: { message: "Receiving objects: 45%", done: 45, total: 100 }
            }

            // Act
            const activities = [
                gitActivityOf(running, FOLDER),
                gitActivityOf({ ...running, progress: null }, FOLDER),
                gitActivityOf({ ...running, kind: "switch" }, FOLDER),
                gitActivityOf(running, { ...FOLDER, folderId: "f-web" }),
                gitActivityOf(null, FOLDER)
            ]

            // Assert
            expect(activities).toEqual([FETCHING, { ...FETCHING, percent: null, message: null }, null, null, null])
        })

        it("should show a fetch instead of a running analysis, with a +1 badge", () => {
            // Arrange
            const job = aJob("job-1", { state: "running", progress: { mode: "determinate", percent: 42 } })

            // Act
            const view = workspaceTrigger(input({ gitActivity: FETCHING, activeJob: job }))
            const sweeping = workspaceTrigger(input({ gitActivity: { ...FETCHING, percent: null, message: null } }))

            // Assert
            expect(view).toMatchObject({
                icon: FETCHING.icon,
                isSpinning: false,
                mapPart: { activity: "Fetching", percent: 45 },
                badge: { text: "+1", tone: "ghost" },
                fill: "determinate",
                fillPercent: 45
            })
            expect(view.title).toContain("Fetching — Receiving objects: 45%")
            expect(view.ariaLabel).toBe("Branch feature/invoice-rounding, fetching 45 percent, +1")
            expect(sweeping).toMatchObject({ fill: "indeterminate", fillPercent: null })
            expect(sweeping.title).toContain("Fetching…")
            expect(sweeping.ariaLabel).toBe("Branch feature/invoice-rounding, fetching")
        })
    })

    it("should show the branch, its counts and the commit in the map while idle", () => {
        // Act
        const view = workspaceTrigger(input())

        // Assert
        expect(view).toMatchObject({
            icon: "fa-solid fa-code-branch",
            isSpinning: false,
            branch: "feature/invoice-rounding",
            mapPart: { sha: "9f8e7d6" },
            badge: null,
            fill: "none",
            ahead: 2,
            behind: 1,
            uncommitted: 3
        })
        expect(view.title.split("\n")).toEqual([
            "Working folder billing-api (/work/billing-api)",
            "Branch feature/invoice-rounding, 2 to push, 1 to pull, 3 uncommitted",
            "Map shows 9f8e7d6 Release 2.4.0"
        ])
        expect(view.ariaLabel).toBe("Branch feature/invoice-rounding, map shows 9f8e7d6")
    })

    it("should show a determinate analysis with its percent and an indeterminate one as a sweep", () => {
        // Arrange
        const determinate = aJob("job-1", { state: "running", progress: { mode: "determinate", percent: 42 } })
        const indeterminate = aJob("job-2", { state: "running" })

        // Act
        const counting = workspaceTrigger(input({ activeJob: determinate }))
        const sweeping = workspaceTrigger(input({ activeJob: indeterminate }))

        // Assert
        expect(counting).toMatchObject({
            isSpinning: true,
            mapPart: { isAnalysing: true, percent: 42 },
            fill: "determinate",
            fillPercent: 42
        })
        expect(counting.title).toContain("Analysing a1b2c3d — 42 %")
        expect(counting.ariaLabel).toBe("Branch feature/invoice-rounding, analysing a1b2c3d 42 percent")
        expect(sweeping).toMatchObject({ mapPart: { isAnalysing: true, percent: null }, fill: "indeterminate", fillPercent: null })
        expect(sweeping.title).toContain("Analysing a1b2c3d")
        expect(sweeping.ariaLabel).toBe("Branch feature/invoice-rounding, analysing a1b2c3d")
    })

    it("should tint a finished analysis and mark a failed one", () => {
        // Act
        const finished = workspaceTrigger(input({ outcome: "finished" }))
        const failed = workspaceTrigger(input({ outcome: "failed" }))

        // Assert
        expect(finished).toMatchObject({ icon: "fa-solid fa-check text-success", fill: "finished" })
        expect(failed).toMatchObject({
            icon: "fa-solid fa-triangle-exclamation text-error",
            fill: "failed",
            mapPart: { text: "Analysis failed" },
            badge: { text: "failed", tone: "error" }
        })
    })

    it("should say a folder is not analysed yet", () => {
        // Act
        const view = workspaceTrigger(input({ shown: null, hasSnapshots: false }))

        // Assert
        expect(view).toMatchObject({ mapPart: null, badge: { text: "not analysed", tone: "ghost" } })
        expect(view.title).toContain("No analysis yet.")
    })

    it("should word a plain folder, an unbound import and a bound import", () => {
        // Arrange
        const plainFolder = aFolder("f-out", { label: "out", kind: "plain" })
        const plainSnapshot = aSnapshot("p", "f-out", "s-2", { createdAt: "2026-11-03T08:00:00Z" })
        const unbound = aSnapshot("p", "f-out", "s-3", {
            source: "imported",
            createdAt: "2026-11-12T08:00:00Z",
            fileModifiedAt: "2026-11-10T08:00:00Z"
        })
        const bound = aSnapshot("p", "f-api", "s-4", { source: "imported", commit: "9".repeat(40), shortCommit: "9999999" })

        // Act
        const plain = workspaceTrigger(input({ folder: plainFolder, gitStatus: undefined, shown: plainSnapshot }))
        const imported = workspaceTrigger(input({ folder: plainFolder, gitStatus: undefined, shown: unbound }))
        const boundView = workspaceTrigger(input({ shown: bound }))

        // Assert
        expect(plain).toMatchObject({
            icon: "fa-solid fa-folder",
            branch: "out",
            isBranchLoading: false,
            mapPart: { text: "snapshot from 3 Nov" }
        })
        expect(imported).toMatchObject({ icon: "fa-solid fa-file-import", mapPart: { text: "imported · analysis time unknown" } })
        expect(imported.title).toContain("Imported snapshot — analysis time unknown\nFile date: 10 Nov 2026, ")
        expect(imported.title).toContain("\nImported 12 Nov 2026")
        expect(boundView).toMatchObject({ mapPart: { sha: "9999999" }, badge: { text: "imported", tone: "ghost" } })
    })

    it("should flag an analysis of uncommitted changes", () => {
        // Act
        const view = workspaceTrigger(input({ shown: { ...SHOWN, dirty: true, target: "workingTree" } }))

        // Assert
        expect(view.badge).toEqual({ text: "dirty", tone: "warning" })
    })

    it("should show the folder while git is loading or cannot answer and while the core is offline", () => {
        // Act
        const loading = workspaceTrigger(input({ gitStatus: undefined }))
        const broken = workspaceTrigger(input({ gitStatus: "git is not installed" }))
        const offline = workspaceTrigger(input({ isCoreOffline: true, activeJob: aJob("job-1", { state: "running" }) }))

        // Assert
        expect(loading).toMatchObject({ isBranchLoading: true, branch: "billing-api" })
        expect(broken).toMatchObject({ icon: "fa-solid fa-triangle-exclamation text-warning", branch: "billing-api" })
        expect(offline).toMatchObject({ icon: "fa-solid fa-plug-circle-xmark", isSpinning: false, mapPart: { text: "Core offline" } })
    })

    it("should badge how stale the map is and say it in the title", () => {
        // Arrange
        const nearest = {
            kind: "nearest" as const,
            snapshot: SHOWN,
            isCurrentProfile: true,
            relation: "ancestor" as const,
            behind: 4,
            ahead: 0
        }
        const staleness = stalenessOf(nearest, { text: "stale by 4", tone: "warning" }, "the current checkout")

        // Act
        const view = workspaceTrigger(input({ staleness, shown: { ...SHOWN, dirty: true } }))

        // Assert
        expect(view.badge).toEqual({ text: "stale by 4", tone: "warning" })
        expect(view.title).toContain("Map shows 9f8e7d6 Release 2.4.0, 4 commits behind the current checkout")
    })

    it("should word each distance and a different profile", () => {
        // Arrange
        const badge = { text: "badge", tone: "warning" as const }
        const base = { kind: "nearest" as const, snapshot: SHOWN, isCurrentProfile: true }

        // Act
        const phrases = [
            stalenessOf({ ...base, relation: "descendant", behind: 0, ahead: 1 }, badge, "a1b2c3d"),
            stalenessOf({ ...base, relation: "diverged", behind: 3, ahead: 2 }, badge, "a1b2c3d"),
            stalenessOf({ kind: "exact", snapshot: SHOWN, isCurrentProfile: false }, badge, "a1b2c3d")
        ].map(staleness => staleness?.phrase)
        const withoutBadge = stalenessOf({ kind: "exact", snapshot: SHOWN, isCurrentProfile: true }, null, "a1b2c3d")

        // Assert
        expect(phrases).toEqual([
            "1 commit ahead of a1b2c3d",
            "3 commits behind and 2 ahead of a1b2c3d",
            "analysed with a different profile"
        ])
        expect(withoutBadge).toBeNull()
    })

    it("should count uncommitted changes in words", () => {
        // Act
        const titles = [uncommittedTitle(1), uncommittedTitle(3)]

        // Assert
        expect(titles).toEqual(["1 uncommitted change", "3 uncommitted changes"])
    })
})
