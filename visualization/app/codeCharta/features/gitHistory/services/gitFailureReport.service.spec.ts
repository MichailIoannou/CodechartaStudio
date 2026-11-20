import { TestBed } from "@angular/core/testing"
import type { ErrorCode } from "../../../model/coreApi/ErrorCode"
import type { GitStatus } from "../../../model/coreApi/GitStatus"
import { aFolder, aProject } from "../../projects/projects.mocks"
import { ToastService } from "../../shared/facade"
import type { GitError } from "../model/gitError"
import { aRefs, aRepositoryInfo, aStatusOn } from "./gitApi.mocks"
import { GitFailureReport } from "./gitFailureReport.service"
import { provideGitHistory, settleGit } from "./gitHistoryTestBed.mocks"
import { GitRepositoryService } from "./gitRepository.service"

const BILLING = aProject("p-billing", [aFolder("f-api", { label: "billing-api" })])

function anError(code: ErrorCode, detail: string | null = null): GitError {
    return { code, message: "Git said no.", detail, repositoryPath: null }
}

describe("GitFailureReport", () => {
    async function createReport(status: GitStatus = aStatusOn("main")) {
        provideGitHistory({ git: { "f-api": { info: aRepositoryInfo(), status, refs: aRefs() } } }, BILLING)
        TestBed.inject(GitRepositoryService)
        await settleGit()
        return TestBed.inject(GitFailureReport)
    }

    const toasts = () => TestBed.inject(ToastService).messages()

    it("should show the sentence as an error toast with git's text behind Details", async () => {
        // Arrange
        const report = await createReport()

        // Act
        report.report(anError("INDEX_LOCKED", "fatal: Unable to create 'index.lock'"))

        // Assert
        expect(toasts()).toEqual([
            expect.objectContaining({
                text: "Another git process is using this repository. Wait for it to finish, then retry.",
                severity: "error",
                details: "fatal: Unable to create 'index.lock'"
            })
        ])
    })

    it("should hand the identity commands to the toast as copy blocks", async () => {
        // Arrange
        const report = await createReport()

        // Act
        report.report(anError("IDENTITY_UNKNOWN"), { operation: "commit" })

        // Assert
        expect(toasts()[0].commands).toEqual([
            'git config --global user.name "Your Name"',
            'git config --global user.email "you@example.com"'
        ])
        expect(toasts()[0].details).toBeUndefined()
    })

    it("should name the operation in progress from the repository's status", async () => {
        // Arrange
        const report = await createReport(aStatusOn("main", { operationInProgress: "rebase" }))

        // Act
        report.report(anError("OPERATION_IN_PROGRESS"))

        // Assert
        expect(toasts()[0].text).toBe("A rebase is in progress. Finish or abort it first.")
    })

    it("should show nothing for a cancel the user asked for", async () => {
        // Arrange
        const report = await createReport()

        // Act
        report.report(anError("CANCELLED"))

        // Assert
        expect(toasts()).toEqual([])
    })
})
