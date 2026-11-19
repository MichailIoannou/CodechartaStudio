import type { ErrorCode } from "../../../model/coreApi/ErrorCode"
import type { GitError } from "../model/gitError"
import { gitErrorSentence, problemNoticeOf } from "./gitErrorText"

const FOLDER = { label: "billing-api", path: "C:\\work\\billing-api" }

function anError(code: ErrorCode, message = "Git said no.", repositoryPath: string | null = null): GitError {
    return { code, message, detail: null, repositoryPath }
}

describe("gitErrorText", () => {
    it("should explain a missing git and offer the desktop tools", () => {
        // Arrange & Act
        const notice = problemNoticeOf(anError("TOOL_NOT_FOUND"), FOLDER)

        // Assert
        expect(notice).toEqual({
            text: "Git was not found. CodeCharta uses the git installed on this computer.",
            command: null,
            action: "openDesktopTools"
        })
    })

    it("should name the version of a git that is too old", () => {
        // Arrange & Act
        const notice = problemNoticeOf(anError("GIT_TOO_OLD", "git 2.30.9 is older than the minimum 2.31.0."), FOLDER)

        // Assert
        expect(notice).toEqual({
            text: "Git 2.30.9 is too old. CodeCharta needs git 2.31 or newer.",
            command: null,
            action: "openDesktopTools"
        })
    })

    it("should keep the core's sentence when it names no version of a git that is too old", () => {
        // Arrange & Act
        const notice = problemNoticeOf(anError("GIT_TOO_OLD", "The installed git is too old."), FOLDER)

        // Assert
        expect(notice?.text).toBe("The installed git is too old.")
    })

    it("should say that the folder is not a git repository", () => {
        // Arrange & Act
        const notice = problemNoticeOf(anError("NOT_A_REPOSITORY"), FOLDER)

        // Assert
        expect(notice).toEqual({ text: "'billing-api' is not a git repository.", command: null, action: null })
    })

    it.each<ErrorCode>(["NOT_FOUND", "FOLDER_UNAVAILABLE"])("should offer to re-link a folder that is missing (%s)", code => {
        // Arrange & Act
        const notice = problemNoticeOf(anError(code), FOLDER)

        // Assert
        expect(notice).toEqual({ text: "'billing-api' was not found on disk.", command: null, action: "relinkFolder" })
    })

    it("should give the safe-directory command with the path git distrusts", () => {
        // Arrange & Act
        const notice = problemNoticeOf(anError("DUBIOUS_OWNERSHIP", "unsafe", "C:/work/billing-api"), FOLDER)

        // Assert
        expect(notice).toEqual({
            text: "Git does not trust 'C:/work/billing-api' because another user owns it. If you trust it, run this in a terminal:",
            command: "git config --global --add safe.directory C:/work/billing-api",
            action: null
        })
    })

    it("should fall back to the folder path for the safe-directory command", () => {
        // Arrange & Act
        const notice = problemNoticeOf(anError("DUBIOUS_OWNERSHIP"), FOLDER)

        // Assert
        expect(notice?.command).toBe("git config --global --add safe.directory C:\\work\\billing-api")
    })

    it("should say that bare repositories are not supported", () => {
        // Arrange & Act
        const notice = problemNoticeOf(anError("BARE_REPOSITORY"), FOLDER)

        // Assert
        expect(notice).toEqual({ text: "Bare repositories are not supported.", command: null, action: null })
    })

    it("should leave a failure that does not concern the whole repository to the panes", () => {
        // Arrange & Act
        const notices = (["INDEX_LOCKED", "TIMEOUT", "COMMAND_FAILED"] as ErrorCode[]).map(code => problemNoticeOf(anError(code), FOLDER))

        // Assert
        expect(notices).toEqual([null, null, null])
    })

    it("should word the read failures the panes show", () => {
        // Arrange & Act
        const sentences = [anError("INDEX_LOCKED"), anError("TIMEOUT"), anError("COMMAND_FAILED", "exit 128")].map(gitErrorSentence)

        // Assert
        expect(sentences).toEqual([
            "Another git process is using this repository. Wait for it to finish, then retry.",
            "Git did not answer in time.",
            "Git failed: exit 128"
        ])
    })
})
