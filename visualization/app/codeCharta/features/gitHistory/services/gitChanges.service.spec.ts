import { TestBed } from "@angular/core/testing"
import type { GitEntryKind } from "../../../model/coreApi/GitEntryKind"
import type { GitFileChange } from "../../../model/coreApi/GitFileChange"
import type { GitWorkingTreeEntry } from "../../../model/coreApi/GitWorkingTreeEntry"
import type { FakeDesktopBridge, FakeDesktopSeed } from "../../../util/desktop/desktopBridge.mocks"
import { aFolder, aProject } from "../../projects/projects.mocks"
import { ToastService } from "../../shared/facade"
import type { HistoryTab } from "../repos/historyTab.repo"
import { anErrorPayload, aRefs, aRepositoryInfo, aStatusOn } from "./gitApi.mocks"
import { GitChangesService, MAX_ROWS_PER_REQUEST } from "./gitChanges.service"
import { GitConfirmationService } from "./gitConfirmation.service"
import { GitHistoryTestBed, provideGitHistory, settleGit } from "./gitHistoryTestBed.mocks"
import { FOCUS_REFRESH_THROTTLE_MS } from "./gitRepository.service"
import { HistoryTabService } from "./historyTab.service"

const API = { projectId: "p-billing", folderId: "f-api" }
const BILLING = aProject("p-billing", [aFolder("f-api")])

function anEntry(path: string, kind: GitEntryKind, change: GitFileChange = "modified"): GitWorkingTreeEntry {
    return { path, previousPath: null, kind, change, conflict: kind === "conflicted" ? "UU" : null }
}

const CHANGES = [
    anEntry("src/billing/invoice.ts", "conflicted"),
    anEntry("src/billing/currency.ts", "staged"),
    anEntry("src/app.ts", "unstaged"),
    anEntry("src/old/legacy.ts", "unstaged", "deleted"),
    anEntry("notes.md", "untracked", "added")
]

function seedWith(extra: Partial<NonNullable<FakeDesktopSeed["git"]>[string]> = {}): FakeDesktopSeed {
    return { git: { "f-api": { info: aRepositoryInfo(), status: aStatusOn("main"), refs: aRefs(), changes: CHANGES, ...extra } } }
}

describe("GitChangesService", () => {
    let bridge: FakeDesktopBridge
    let confirmations: GitConfirmationService
    let activeProject: GitHistoryTestBed["activeProject"]

    beforeEach(() => {
        localStorage.clear()
    })

    async function createService(seed = seedWith(), { tab = "changes" as HistoryTab } = {}) {
        ;({ bridge, activeProject } = provideGitHistory(seed, BILLING))
        confirmations = TestBed.inject(GitConfirmationService)
        jest.spyOn(confirmations, "ask").mockResolvedValue(true)
        TestBed.inject(HistoryTabService).select(tab)
        const service = TestBed.inject(GitChangesService)
        await settleGit()
        return service
    }

    const requestsOf = (method: string) => bridge.calls.filter(call => call.name === "request" && call.args[0] === method)
    const paramsOf = (method: string) => requestsOf(method).map(call => call.args[1])

    function rowsOf(service: GitChangesService, ...keys: string[]) {
        return service.rows().filter(row => keys.includes(row.key))
    }

    it("should list the changes in four groups: conflicted, staged, changes and untracked", async () => {
        // Arrange & Act
        const service = await createService()

        // Assert
        expect(service.groups().map(group => [group.label, group.rows.map(row => row.entry.path)])).toEqual([
            ["Conflicted", ["src/billing/invoice.ts"]],
            ["Staged", ["src/billing/currency.ts"]],
            ["Changes", ["src/app.ts", "src/old/legacy.ts"]],
            ["Untracked", ["notes.md"]]
        ])
    })

    it("should read the working tree only while the Changes tab is shown", async () => {
        // Arrange
        const service = await createService(seedWith(), { tab: "log" })
        const readsOnLog = requestsOf("git.workingTree").length

        // Act
        TestBed.inject(HistoryTabService).select("changes")
        await settleGit()

        // Assert
        expect(readsOnLog).toBe(0)
        expect(service.rows()).toHaveLength(5)
    })

    it("should stage and unstage rows, and stage everything at once", async () => {
        // Arrange
        const service = await createService()

        // Act
        await service.stage(rowsOf(service, "unstaged:src/app.ts", "staged:src/billing/currency.ts"))
        await service.unstage(rowsOf(service, "staged:src/billing/currency.ts", "untracked:notes.md"))
        await service.stageAll()

        // Assert
        expect(paramsOf("git.stage")).toEqual([
            { repo: API, target: { kind: "paths", paths: ["src/app.ts"] } },
            { repo: API, target: { kind: "all" } }
        ])
        expect(paramsOf("git.unstage")).toEqual([{ repo: API, paths: ["src/billing/currency.ts"] }])
        expect(service.groups().map(group => group.label)).toEqual(["Staged"])
    })

    it("should send more than a thousand paths in chunks under one operation", async () => {
        // Arrange
        const many = Array.from({ length: MAX_ROWS_PER_REQUEST + 1 }, (_, index) =>
            anEntry(`f${String(index).padStart(4, "0")}.ts`, "unstaged")
        )
        const service = await createService(seedWith({ changes: many }))

        // Act
        await service.stage(service.rows())

        // Assert
        const stages = requestsOf("git.stage")
        expect(stages.map(call => (call.args[1] as { target: { paths: string[] } }).target.paths.length)).toEqual([MAX_ROWS_PER_REQUEST, 1])
        expect(stages.map(call => call.args[2])).toEqual([{ operationId: "git-operation-1" }, { operationId: "git-operation-1" }])
    })

    it("should name the files in the discard confirmation and send exactly those rows", async () => {
        // Arrange
        const service = await createService()
        const rows = rowsOf(service, "unstaged:src/old/legacy.ts", "untracked:notes.md", "staged:src/billing/currency.ts")

        // Act
        await service.discard(rows)

        // Assert
        expect(confirmations.ask).toHaveBeenCalledWith(
            expect.objectContaining({ title: "Discard Changes", text: expect.stringContaining("'src/old/legacy.ts' and 'notes.md'?") })
        )
        expect(paramsOf("git.discard")).toEqual([
            {
                repo: API,
                entries: [
                    { path: "src/old/legacy.ts", kind: "unstaged", change: "deleted" },
                    { path: "notes.md", kind: "untracked", change: "added" }
                ]
            }
        ])
    })

    it("should discard nothing when the confirmation is declined or no row can be discarded", async () => {
        // Arrange
        const service = await createService()
        jest.spyOn(confirmations, "ask").mockResolvedValue(false)

        // Act
        await service.discard(rowsOf(service, "unstaged:src/app.ts"))
        await service.discard(rowsOf(service, "conflicted:src/billing/invoice.ts"))

        // Assert
        expect(confirmations.ask).toHaveBeenCalledTimes(1)
        expect(requestsOf("git.discard")).toEqual([])
    })

    it("should refresh the list after each action and on window focus", async () => {
        // Arrange
        jest.spyOn(Date, "now").mockReturnValue(FOCUS_REFRESH_THROTTLE_MS * 10)
        const service = await createService()
        const readsBefore = requestsOf("git.workingTree").length

        // Act
        await service.stage(rowsOf(service, "unstaged:src/app.ts"))
        await settleGit()
        const readsAfterStage = requestsOf("git.workingTree").length
        globalThis.dispatchEvent(new Event("focus"))
        await settleGit()

        // Assert
        expect(readsAfterStage).toBeGreaterThan(readsBefore)
        expect(requestsOf("git.workingTree").length).toBeGreaterThan(readsAfterStage)
    })

    it("should toast the sentence when the files changed since they were listed", async () => {
        // Arrange
        const service = await createService(seedWith({ failures: { "git.discard": anErrorPayload("CHANGED_SINCE_LISTED") } }))

        // Act
        await service.discard(rowsOf(service, "untracked:notes.md"))

        // Assert
        expect(
            TestBed.inject(ToastService)
                .messages()
                .map(message => [message.text, message.severity])
        ).toEqual([["The files changed since they were listed. The list is refreshed — check it and try again.", "error"]])
    })

    it("should select one row, toggle rows and select a range, showing the clicked row's diff", async () => {
        // Arrange
        const diff = { path: "notes.md", text: "+hello\n", isBinary: false, isTruncated: false }
        const service = await createService(seedWith({ diffs: { "untracked:notes.md": diff } }))

        // Act
        service.select("staged:src/billing/currency.ts")
        service.select("unstaged:src/old/legacy.ts", "range")
        const range = [...service.selectedKeys()]
        service.select("unstaged:src/app.ts", "toggle")
        service.select("untracked:notes.md", "toggle")
        await settleGit()

        // Assert
        expect(range).toEqual(["staged:src/billing/currency.ts", "unstaged:src/app.ts", "unstaged:src/old/legacy.ts"])
        expect(service.selectedRows().map(row => row.key)).toEqual([
            "staged:src/billing/currency.ts",
            "unstaged:src/old/legacy.ts",
            "untracked:notes.md"
        ])
        expect(service.shownRow()?.key).toBe("untracked:notes.md")
        expect(service.diff()).toEqual({ kind: "ready", value: diff })
        expect(paramsOf("git.diffFile").at(-1)).toEqual({ repo: API, path: "notes.md", kind: "untracked" })
    })

    it("should follow a staged file's diff into its new group and drop a discarded one", async () => {
        // Arrange
        const service = await createService()
        service.select("unstaged:src/app.ts")
        await settleGit()

        // Act
        await service.stage(service.selectedRows())
        await settleGit()
        const followed = service.shownRow()?.key
        service.select("untracked:notes.md")
        await service.discard(service.selectedRows())
        await settleGit()

        // Assert
        expect(followed).toBe("staged:src/app.ts")
        expect(paramsOf("git.diffFile")).toContainEqual({ repo: API, path: "src/app.ts", kind: "staged" })
        expect(service.shownRow()).toBe(null)
        expect(service.diff()).toEqual({ kind: "idle" })
        expect(service.selectedKeys().size).toBe(0)
    })

    it("should show a diff that failed and load it again on retry", async () => {
        // Arrange
        const service = await createService(seedWith({ failures: { "git.diffFile": anErrorPayload("OUTPUT_TOO_LARGE") } }))
        service.select("unstaged:src/app.ts")
        await settleGit()
        const failed = service.diff().kind

        // Act
        service.retryDiff()
        await settleGit()

        // Assert
        expect(failed).toBe("failed")
        expect(requestsOf("git.diffFile")).toHaveLength(2)
    })

    it("should forget the list and the selection when the working folder changes", async () => {
        // Arrange
        const service = await createService()
        service.select("unstaged:src/app.ts")
        await settleGit()

        // Act
        activeProject.set(null)
        await settleGit()

        // Assert
        expect(service.workingTree()).toEqual({ kind: "idle" })
        expect(service.selectedKeys().size).toBe(0)
        expect(service.diff()).toEqual({ kind: "idle" })
    })
})
