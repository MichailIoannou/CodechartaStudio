import type { ErrorCode } from "../../../model/coreApi/ErrorCode"
import type { GitError } from "../model/gitError"
import { gitErrorCommands, gitErrorFollowUp, gitErrorSentence, problemNoticeOf } from "./gitErrorText"

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

    it("should say that the folder is not a git repository and offer nothing without another git folder", () => {
        // Arrange & Act
        const notice = problemNoticeOf(anError("NOT_A_REPOSITORY"), FOLDER)

        // Assert
        expect(notice).toEqual({ text: "'billing-api' is not a git repository.", command: null, action: null })
    })

    it("should offer to work in the one other git folder of the project", () => {
        // Arrange
        const web = { id: "f-web", label: "billing-web" }

        // Act
        const notice = problemNoticeOf(anError("NOT_A_REPOSITORY"), FOLDER, [web])

        // Assert
        expect(notice).toEqual({ text: "'billing-api' is not a git repository.", command: null, action: "workInFolder", workInFolder: web })
    })

    it("should offer to choose a working folder when the project has several other git folders", () => {
        // Arrange
        const others = [
            { id: "f-web", label: "billing-web" },
            { id: "f-docs", label: "billing-docs" }
        ]

        // Act
        const notice = problemNoticeOf(anError("NOT_A_REPOSITORY"), FOLDER, others)

        // Assert
        expect(notice).toEqual({ text: "'billing-api' is not a git repository.", command: null, action: "chooseWorkingFolder" })
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
        const sentences = [anError("INDEX_LOCKED"), anError("TIMEOUT"), anError("COMMAND_FAILED", "exit 128")].map(error =>
            gitErrorSentence(error)
        )

        // Assert
        expect(sentences).toEqual([
            "Another git process is using this repository. Wait for it to finish, then retry.",
            "Git did not answer in time.",
            "Git failed: exit 128"
        ])
    })

    it("should word the failures of branch operations with the branch, the worktree and the remote", () => {
        // Arrange
        const context = { branch: "feature/x", worktreePath: "/work/billing-api-x", remote: "origin" }

        // Act
        const sentences = (
            ["BRANCH_CHECKED_OUT_ELSEWHERE", "BRANCH_EXISTS", "AUTHENTICATION_REQUIRED", "NETWORK_UNAVAILABLE"] as const
        ).map(code => gitErrorSentence(anError(code), context))

        // Assert
        expect(sentences).toEqual([
            "'feature/x' is checked out in another worktree (/work/billing-api-x).",
            "A branch named 'feature/x' already exists.",
            "Git could not sign in to 'origin'. Check your credential helper or ssh key; CodeCharta asks only when git asks.",
            "'origin' could not be reached. Check your connection."
        ])
    })

    it("should fall back to git's message when the context lacks what the sentence names", () => {
        // Arrange & Act
        const sentence = gitErrorSentence(anError("NETWORK_UNAVAILABLE", "git could not reach the remote."), { remote: null })

        // Assert
        expect(sentence).toBe("Git failed: git could not reach the remote.")
    })

    it("should say that a cancelled sign-in changed nothing", () => {
        // Arrange & Act
        const sentence = gitErrorSentence(anError("AUTHENTICATION_CANCELLED"))

        // Assert
        expect(sentence).toBe("Sign-in cancelled. Nothing was changed.")
    })

    it("should give the identity instructions as a sentence and both commands apart", () => {
        // Arrange
        const error = anError("IDENTITY_UNKNOWN")

        // Act
        const sentence = gitErrorSentence(error, { operation: "commit" })
        const commands = gitErrorCommands(error)

        // Assert
        expect(sentence).toBe("Git does not know who you are. Run these in a terminal, then commit again:")
        expect(commands).toEqual(['git config --global user.name "Your Name"', 'git config --global user.email "you@example.com"'])
    })

    it("should give no commands for a failure the user cannot fix with one", () => {
        // Arrange & Act
        const commands = gitErrorCommands(anError("INDEX_LOCKED"))

        // Assert
        expect(commands).toEqual([])
    })

    it("should say that a commit stopped on files that still have conflicts", () => {
        // Arrange & Act
        const sentence = gitErrorSentence(anError("CONFLICTS"), { operation: "commit" })

        // Assert
        expect(sentence).toBe("Git did not commit: some files still have conflicts. Resolve them in your editor, stage them, then commit.")
    })

    it("should count the conflicted files of a pull and a merge, name the History and keep the stash of a pop", () => {
        // Arrange & Act
        const sentences = [
            gitErrorSentence(anError("CONFLICTS"), { operation: "pull", conflictedFiles: 2 }),
            gitErrorSentence(anError("CONFLICTS"), { operation: "pull", conflictedFiles: 2, inProgress: "rebase" }),
            gitErrorSentence(anError("CONFLICTS"), { operation: "merge", conflictedFiles: 1 }),
            gitErrorSentence(anError("CONFLICTS"), { operation: "stashPop", conflictedFiles: 3 })
        ]

        // Assert
        expect(sentences).toEqual([
            "Git stopped on conflicts in 2 files. Finish or abort the merge in the History.",
            "Git stopped on conflicts in 2 files. Finish or abort the rebase in the History.",
            "Git stopped on conflicts in 1 file. Finish or abort the merge in the History.",
            "Git stopped on conflicts in 3 files. Finish or abort the merge in the History. The stash was kept."
        ])
    })

    it("should fall back to git's message for conflicts it cannot place", () => {
        // Arrange & Act
        const sentences = [
            gitErrorSentence(anError("CONFLICTS", "Some files have conflicts.")),
            gitErrorSentence(anError("CONFLICTS", "Some files have conflicts."), { operation: "pull" })
        ]

        // Assert
        expect(sentences).toEqual(["Git failed: Some files have conflicts.", "Git failed: Some files have conflicts."])
    })

    it.each([
        ["merge", "A merge is in progress. Finish or abort it first."],
        ["rebase", "A rebase is in progress. Finish or abort it first."],
        ["cherryPick", "A cherry-pick is in progress. Finish or abort it first."],
        ["revert", "A revert is in progress. Finish or abort it first."],
        ["bisect", "A bisect is in progress. Finish or abort it first."]
    ] as const)("should name the %s that is in progress", (inProgress, expected) => {
        // Arrange & Act
        const sentence = gitErrorSentence(anError("OPERATION_IN_PROGRESS"), { inProgress })

        // Assert
        expect(sentence).toBe(expected)
    })

    it("should fall back to git's message when it is unknown which operation is in progress", () => {
        // Arrange & Act
        const sentence = gitErrorSentence(anError("OPERATION_IN_PROGRESS", "An operation is in progress."), { inProgress: null })

        // Assert
        expect(sentence).toBe("Git failed: An operation is in progress.")
    })

    it("should word a rejected push, a moved remote branch and a branch without upstream", () => {
        // Arrange & Act
        const sentences = [
            gitErrorSentence(anError("PUSH_REJECTED")),
            gitErrorSentence(anError("STALE_PUSH_LEASE")),
            gitErrorSentence(anError("NO_UPSTREAM"), { branch: "feature/x" })
        ]

        // Assert
        expect(sentences).toEqual([
            "The remote has commits you do not have. Pull first, then push.",
            "The remote branch moved since you last fetched. Fetch, review, and try again.",
            "'feature/x' has no upstream branch."
        ])
    })

    it("should fall back to git's message for a branch without upstream when the branch is unknown", () => {
        // Arrange & Act
        const sentence = gitErrorSentence(anError("NO_UPSTREAM", "There is no tracking information."))

        // Assert
        expect(sentence).toBe("Git failed: There is no tracking information.")
    })

    it("should name the follow-up each sync failure offers", () => {
        // Arrange & Act
        const followUps = (["PUSH_REJECTED", "STALE_PUSH_LEASE", "NO_UPSTREAM", "CONFLICTS", "INDEX_LOCKED"] as const).map(code =>
            gitErrorFollowUp(anError(code))
        )

        // Assert
        expect(followUps).toEqual([
            { kind: "pull", label: "Pull" },
            { kind: "fetch", label: "Fetch" },
            { kind: "publish", label: "Publish branch" },
            { kind: "openHistory", label: "Open History" },
            null
        ])
    })

    it("should word nothing to commit and a failed hook, naming the commit where it stopped one", () => {
        // Arrange & Act
        const sentences = [
            gitErrorSentence(anError("NOTHING_TO_COMMIT"), { operation: "commit" }),
            gitErrorSentence(anError("HOOK_FAILED"), { operation: "commit" }),
            gitErrorSentence(anError("HOOK_FAILED"))
        ]

        // Assert
        expect(sentences).toEqual([
            "Nothing to commit. Stage files first.",
            "A git hook stopped the commit.",
            "A git hook stopped the operation."
        ])
    })

    it("should say that the list is refreshed when the files changed since they were listed", () => {
        // Arrange & Act
        const sentence = gitErrorSentence(anError("CHANGED_SINCE_LISTED"))

        // Assert
        expect(sentence).toBe("The files changed since they were listed. The list is refreshed — check it and try again.")
    })

    it("should list git's files when a switch would overwrite local changes, at most ten", () => {
        // Arrange
        const files = Array.from({ length: 12 }, (_, index) => `\tsrc/file${index}.ts`)
        const detail = [
            "error: Your local changes to the following files would be overwritten by checkout:",
            ...files,
            "Please commit your changes or stash them before you switch branches.",
            "Aborting"
        ].join("\n")

        // Act
        const sentence = gitErrorSentence({ ...anError("LOCAL_CHANGES_WOULD_BE_OVERWRITTEN"), detail })

        // Assert
        expect(sentence.split("\n")).toEqual([
            "Git did not switch: your changes to these files would be overwritten:",
            ...files.slice(0, 10).map(file => file.trim()),
            "and 2 more"
        ])
    })
})
