import { TestBed } from "@angular/core/testing"
import type { GitCommitDetails } from "../../../model/coreApi/GitCommitDetails"
import type { GitEntryKind } from "../../../model/coreApi/GitEntryKind"
import type { GitStatus } from "../../../model/coreApi/GitStatus"
import type { GitWorkingTreeEntry } from "../../../model/coreApi/GitWorkingTreeEntry"
import type { FakeDesktopBridge, FakeDesktopSeed } from "../../../util/desktop/desktopBridge.mocks"
import { aFolder, aProject } from "../../projects/projects.mocks"
import { ToastService } from "../../shared/facade"
import { CommitMessageService } from "./commitMessage.service"
import { aLocalBranch, aLogCommit, anErrorPayload, anUpstream, aRefs, aRemoteBranch, aRepositoryInfo, aStatusOn } from "./gitApi.mocks"
import { GitConfirmationService } from "./gitConfirmation.service"
import { GitHistoryTestBed, provideGitHistory, settleGit } from "./gitHistoryTestBed.mocks"
import { GitOperationService } from "./gitOperation.service"

const API = { projectId: "p-billing", folderId: "f-api" }
const BILLING = aProject("p-billing", [aFolder("f-api"), aFolder("f-web")])
const HEAD = "a".repeat(40)
const OLDER = "b".repeat(40)
const COMMITS = [aLogCommit("a", "Fix invoice rounding", ["b"]), aLogCommit("b", "Start the invoice module")]
const HEAD_DETAILS: GitCommitDetails = {
    ...COMMITS[0],
    committerName: "Mia Chen",
    committerEmail: "mia@example.com",
    message: "Fix invoice rounding\n\nRounds half-even.",
    comparedToParent: OLDER,
    files: [],
    areFilesTruncated: false,
    totals: { filesChanged: 0, insertions: 0, deletions: 0 }
}

function anEntry(path: string, kind: GitEntryKind): GitWorkingTreeEntry {
    return { path, previousPath: null, kind, change: "modified", conflict: null }
}

function stagedStatus(overrides: Partial<GitStatus> = {}): GitStatus {
    return aStatusOn("main", { counts: { staged: 1, unstaged: 0, untracked: 0, conflicted: 0 }, ...overrides })
}

function repositoryOf(status: GitStatus, extra: Partial<NonNullable<FakeDesktopSeed["git"]>[string]> = {}) {
    return {
        info: aRepositoryInfo(),
        status,
        refs: aRefs(),
        commits: COMMITS,
        details: { [HEAD]: HEAD_DETAILS },
        changes: [anEntry("src/a.ts", "staged")],
        ...extra
    }
}

function seedWith(status = stagedStatus(), extra: Partial<NonNullable<FakeDesktopSeed["git"]>[string]> = {}): FakeDesktopSeed {
    const web = { ...repositoryOf(stagedStatus()), info: aRepositoryInfo({ repositoryId: "/work/billing-web/.git" }) }
    return { git: { "f-api": repositoryOf(status, extra), "f-web": web } }
}

describe("CommitMessageService", () => {
    let bridge: FakeDesktopBridge
    let activeProject: GitHistoryTestBed["activeProject"]
    let confirmations: GitConfirmationService

    beforeEach(() => {
        localStorage.clear()
    })

    async function createService(seed = seedWith()) {
        ;({ bridge, activeProject } = provideGitHistory(seed, BILLING))
        confirmations = TestBed.inject(GitConfirmationService)
        jest.spyOn(confirmations, "ask").mockResolvedValue(true)
        const service = TestBed.inject(CommitMessageService)
        await settleGit()
        return service
    }

    const paramsOf = (method: string) =>
        bridge.calls.filter(call => call.name === "request" && call.args[0] === method).map(call => call.args[1])
    const toasts = () => TestBed.inject(ToastService).messages()

    function switchTo(folderId: string) {
        const project = activeProject()
        activeProject.set(project ? { ...project, view: { ...project.view, workingFolderId: folderId } } : null)
    }

    it("should say why Commit is disabled: no staged files, no summary, conflicts or a running operation", async () => {
        // Arrange
        const service = await createService(seedWith(aStatusOn("main"), { changes: [] }))
        const reasons = [service.disabledReason()]

        // Act
        await service.setAmend(true)
        service.edit({ subject: "   " })
        reasons.push(service.disabledReason())
        service.edit({ subject: "Fix rounding" })
        reasons.push(service.disabledReason())

        // Assert
        expect(reasons).toEqual(["Stage files to commit", "Write a summary", null])
    })

    it("should ask to resolve conflicts first and wait for a running operation", async () => {
        // Arrange
        const changes = [anEntry("src/a.ts", "staged"), anEntry("src/b.ts", "conflicted")]
        const service = await createService(seedWith(stagedStatus(), { changes }))
        service.edit({ subject: "Merge" })
        const withConflicts = service.disabledReason()

        // Act
        void TestBed.inject(GitOperationService).run({ kind: "fetch", repo: API, send: () => new Promise(() => undefined) })
        await settleGit()

        // Assert
        expect(withConflicts).toBe("Resolve conflicts first")
        expect(service.disabledReason()).toBe("Waiting for the previous git operation…")
    })

    it("should allow concluding a merge without staged files and say so", async () => {
        // Arrange & Act
        const service = await createService(seedWith(aStatusOn("main", { operationInProgress: "merge" })))
        service.edit({ subject: "Merge branch 'main'" })

        // Assert
        expect(service.isMerging()).toBe(true)
        expect(service.disabledReason()).toBe(null)
    })

    it("should commit the summary and description, toast the new commit and clear the draft", async () => {
        // Arrange
        const service = await createService()
        service.edit({ subject: "  Fix rounding  ", body: "Half-even, as the tax office requires." })

        // Act
        await service.commit()

        // Assert
        expect(paramsOf("git.commit")).toEqual([
            { repo: API, subject: "Fix rounding", body: "Half-even, as the tax office requires.", amend: false }
        ])
        expect(toasts().map(toast => [toast.text, toast.severity])).toEqual([[expect.stringMatching(/^Committed [0-9a-c]{7}$/), "success"]])
        expect(service.message()).toEqual({ subject: "", body: "" })
        expect(JSON.parse(localStorage.getItem("codeChartaCommitDraft./work/billing-api/.git") ?? "null")).toEqual({
            subject: "",
            body: ""
        })
    })

    it("should send nothing while Commit is disabled", async () => {
        // Arrange
        const service = await createService()

        // Act
        await service.commit()

        // Assert
        expect(paramsOf("git.commit")).toEqual([])
    })

    it("should keep a draft per repository", async () => {
        // Arrange
        const service = await createService()
        service.edit({ subject: "Draft for the api" })

        // Act
        switchTo("f-web")
        await settleGit()
        const webMessage = service.message()
        service.edit({ subject: "Draft for the web" })
        switchTo("f-api")
        await settleGit()

        // Assert
        expect(webMessage).toEqual({ subject: "", body: "" })
        expect(service.message()).toEqual({ subject: "Draft for the api", body: "" })
        expect(JSON.parse(localStorage.getItem("codeChartaCommitDraft./work/billing-web/.git") ?? "null")).toEqual({
            subject: "Draft for the web",
            body: ""
        })
    })

    it("should fill the last message into an empty box when amending and restore the draft when switched off", async () => {
        // Arrange
        const service = await createService()

        // Act
        await service.setAmend(true)
        const filled = service.message()
        service.edit({ body: "Rounds half-even, always." })
        const edited = service.message()
        await service.setAmend(false)

        // Assert
        expect(filled).toEqual({ subject: "Fix invoice rounding", body: "Rounds half-even." })
        expect(edited.body).toBe("Rounds half-even, always.")
        expect(service.message()).toEqual({ subject: "", body: "" })
        expect(paramsOf("git.commitDetails")).toEqual([{ repo: API, sha: HEAD }])
    })

    it("should keep a written message when amend is switched on", async () => {
        // Arrange
        const service = await createService()
        service.edit({ subject: "Better words" })

        // Act
        await service.setAmend(true)
        await service.commit()

        // Assert
        expect(paramsOf("git.commitDetails")).toEqual([])
        expect(paramsOf("git.commit")).toEqual([{ repo: API, subject: "Better words", body: "", amend: true }])
    })

    it("should ask before amending a commit the upstream already has, and amend nothing when declined", async () => {
        // Arrange
        const upstream = anUpstream("origin/main")
        const refs = aRefs({
            localBranches: [aLocalBranch("main", { isCurrent: true, commit: HEAD, upstream })],
            remoteBranches: [{ ...aRemoteBranch("origin", "main"), commit: HEAD }]
        })
        const service = await createService(seedWith(stagedStatus({ upstream }), { refs }))
        jest.spyOn(confirmations, "ask").mockResolvedValueOnce(false)
        await service.setAmend(true)

        // Act
        await service.commit()

        // Assert
        expect(paramsOf("git.isAncestor")).toEqual([{ repo: API, ancestor: HEAD, descendant: HEAD }])
        expect(confirmations.ask).toHaveBeenCalledWith({
            title: "Amend Pushed Commit",
            text: "The last commit aaaaaaa 'Fix invoice rounding' is already on origin/main. Amending it rewrites it; pushing afterwards needs a force push.",
            verb: "Amend anyway"
        })
        expect(paramsOf("git.commit")).toEqual([])
    })

    it("should amend without asking when the upstream does not have the commit", async () => {
        // Arrange
        const upstream = anUpstream("origin/main", { ahead: 1 })
        const refs = aRefs({ remoteBranches: [{ ...aRemoteBranch("origin", "main"), commit: OLDER }] })
        const service = await createService(seedWith(stagedStatus({ upstream }), { refs }))
        await service.setAmend(true)

        // Act
        await service.commit()

        // Assert
        expect(confirmations.ask).not.toHaveBeenCalledWith(expect.objectContaining({ title: "Amend Pushed Commit" }))
        expect(paramsOf("git.commit")).toEqual([{ repo: API, subject: "Fix invoice rounding", body: "Rounds half-even.", amend: true }])
    })

    it("should give the identity instructions with both commands when git does not know the user", async () => {
        // Arrange
        const detail = "*** Please tell me who you are."
        const failures = { "git.commit": anErrorPayload("IDENTITY_UNKNOWN", "Author identity unknown", { detail }) }
        const service = await createService(seedWith(stagedStatus(), { failures }))
        service.edit({ subject: "Fix rounding" })

        // Act
        await service.commit()

        // Assert
        const [toast] = toasts()
        expect(toast.text).toBe("Git does not know who you are. Run these in a terminal, then commit again:")
        expect(toast.commands).toEqual(['git config --global user.name "Your Name"', 'git config --global user.email "you@example.com"'])
        expect(toast.details).toBe(detail)
        expect(service.message().subject).toBe("Fix rounding")
    })

    it("should show the hook's output after a failed hook", async () => {
        // Arrange
        const detail = "lint: 3 problems in src/a.ts"
        const failures = { "git.commit": anErrorPayload("HOOK_FAILED", "The pre-commit hook failed.", { detail }) }
        const service = await createService(seedWith(stagedStatus(), { failures }))
        service.edit({ subject: "Fix rounding" })

        // Act
        await service.commit()

        // Assert
        expect(toasts().map(toast => [toast.text, toast.severity, toast.details])).toEqual([
            ["A git hook stopped the commit.", "error", detail]
        ])
    })
})
