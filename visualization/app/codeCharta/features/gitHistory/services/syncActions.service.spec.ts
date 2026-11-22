import { signal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import type { GitLocalBranch } from "../../../model/coreApi/GitLocalBranch"
import type { GitUpstream } from "../../../model/coreApi/GitUpstream"
import type { FakeDesktopBridge, FakeDesktopSeed } from "../../../util/desktop/desktopBridge.mocks"
import { aFolder, aProject } from "../../projects/projects.mocks"
import { ToastService } from "../../shared/facade"
import { aLocalBranch, aLogCommit, anErrorPayload, anUpstream, aRefs, aRemoteBranch, aRepositoryInfo, aStatusOn } from "./gitApi.mocks"
import { GitConfirmationService } from "./gitConfirmation.service"
import { provideGitHistory, settleGit } from "./gitHistoryTestBed.mocks"
import { HistoryNavigation } from "./historyNavigation.service"
import { SyncActionsService } from "./syncActions.service"

const API = { projectId: "p-billing", folderId: "f-api" }
const BILLING = aProject("p-billing", [aFolder("f-api", { label: "billing-api" })])
const LOCAL_SHA = "a".repeat(40)
const REMOTE_SHA = "c".repeat(40)
const COMMITS = [aLogCommit("c", "Fix rounding upstream", ["a"]), aLogCommit("a", "Start")]
const REMOTE = { ...aRemoteBranch("origin", "feature/x"), commit: REMOTE_SHA }

type RepositorySeed = Partial<NonNullable<FakeDesktopSeed["git"]>[string]>

function seedOn(upstream: GitUpstream | null, extra: RepositorySeed = {}): FakeDesktopSeed {
    const branch = aLocalBranch("feature/x", { isCurrent: true, commit: LOCAL_SHA, upstream })
    const head = { kind: "branch" as const, name: "feature/x", commit: LOCAL_SHA }
    const refs = aRefs({
        head,
        localBranches: [branch, aLocalBranch("main")],
        remoteBranches: [{ ...REMOTE }],
        remotes: [{ name: "origin", url: "https://example.com/acme/billing-api.git" }]
    })
    const status = aStatusOn("feature/x", { head, upstream })
    return { git: { "f-api": { info: aRepositoryInfo(), status, refs, commits: COMMITS, ...extra } } }
}

const tracking = (ahead: number, behind: number) => anUpstream("origin/feature/x", { ahead, behind })

describe("SyncActionsService", () => {
    let bridge: FakeDesktopBridge
    let confirmations: GitConfirmationService

    const history = { isShown: signal(false), open: jest.fn() }

    async function createService(seed: FakeDesktopSeed) {
        bridge = provideGitHistory(seed, BILLING).bridge
        TestBed.overrideProvider(HistoryNavigation, { useValue: history })
        confirmations = TestBed.inject(GitConfirmationService)
        const service = TestBed.inject(SyncActionsService)
        await settleGit()
        return service
    }

    /** Accepts the hooks notice of the first write, then answers what follows in order; answers the questions asked. */
    async function answerEach(...answers: (boolean | string)[]): Promise<string[]> {
        const questions: string[] = []
        for (const answer of [true, ...answers]) {
            await settleGit()
            questions.push(confirmations.current()?.title ?? confirmations.currentChoice()?.title ?? "")
            if (typeof answer === "string") {
                confirmations.pick(answer)
            } else {
                confirmations.answer(answer)
            }
        }
        await settleGit()
        return questions
    }

    async function asked(action: Promise<void>, ...answers: (boolean | string)[]): Promise<string[]> {
        const questions = await answerEach(...answers)
        await action
        return questions
    }

    const toasts = () => TestBed.inject(ToastService).messages()
    const writesOf = (method: string) =>
        bridge.calls.filter(call => call.name === "request" && call.args[0] === method).map(call => call.args[1])

    afterEach(() => {
        jest.clearAllTimers()
        history.isShown.set(false)
        history.open.mockClear()
    })

    describe("pull", () => {
        it("should pull fast-forward only by default and count the pulled commits", async () => {
            // Arrange
            const service = await createService(seedOn(tracking(0, 1)))

            // Act
            const questions = await asked(service.pull())

            // Assert
            expect(questions).toEqual(["Git Hooks"])
            expect(writesOf("git.pull")).toEqual([{ repo: API, mode: "ffOnly" }])
            expect(toasts()).toEqual([expect.objectContaining({ text: "Pulled 1 commit", severity: "success" })])
        })

        it("should say that the branch is up to date when the pull moved nothing", async () => {
            // Arrange
            const seed = seedOn(tracking(0, 1))
            seed.git["f-api"].refs.remoteBranches[0].commit = LOCAL_SHA
            const service = await createService(seed)

            // Act
            await asked(service.pull())

            // Assert
            expect(toasts()[0].text).toBe("Already up to date")
        })

        it("should offer rebase and merge only after git refused to fast-forward", async () => {
            // Arrange
            const refusal = anErrorPayload("NOT_FAST_FORWARD", "Not possible to fast-forward, aborting.")
            const service = await createService(seedOn(tracking(0, 1), { pullRefusals: { ffOnly: refusal } }))

            // Act
            const questions = await asked(service.pull(), "rebase")

            // Assert
            expect(questions).toEqual(["Git Hooks", "Branches Have Diverged"])
            expect(writesOf("git.pull").map(params => (params as { mode: string }).mode)).toEqual(["ffOnly", "rebase"])
            expect(toasts().map(toast => toast.severity)).toEqual(["success"])
        })

        it("should ask how to combine diverged branches before pulling and send nothing when cancelled", async () => {
            // Arrange
            const service = await createService(seedOn(tracking(2, 3)))
            const pulling = service.pull()
            await settleGit()

            // Act
            const choice = confirmations.currentChoice()
            confirmations.answer(false)
            await pulling

            // Assert
            expect(choice?.text).toBe(
                "'feature/x' and 'origin/feature/x' have diverged (2 local, 3 remote commits). Choose how to combine them:"
            )
            expect(writesOf("git.pull")).toEqual([])
        })

        it("should merge diverged branches when the user chooses Merge", async () => {
            // Arrange
            const service = await createService(seedOn(tracking(2, 3)))

            // Act
            const pulling = service.pull()
            await settleGit()
            confirmations.pick("merge")
            await answerEach()
            await pulling

            // Assert
            expect(writesOf("git.pull")).toEqual([{ repo: API, mode: "merge" }])
        })

        async function pullIntoConflicts(): Promise<void> {
            const service = await createService(seedOn(tracking(2, 3), { pullConflicts: ["src/a.ts", "src/b.ts"] }))
            const pulling = service.pull()
            await settleGit()
            confirmations.pick("merge")
            await answerEach()
            await pulling
        }

        it("should count the conflicted files and lead to the History when a pull outside it stops on conflicts", async () => {
            // Arrange
            await pullIntoConflicts()

            // Act
            toasts()[0].action?.run()

            // Assert
            expect(toasts()).toEqual([
                expect.objectContaining({
                    text: "Git stopped on conflicts in 2 files. Finish or abort the merge in the History.",
                    severity: "error"
                })
            ])
            expect(toasts()[0].action?.label).toBe("Open History")
            expect(history.open).toHaveBeenCalledTimes(1)
        })

        it("should raise no toast when a pull stops on conflicts while the History is shown", async () => {
            // Arrange
            history.isShown.set(true)

            // Act
            await pullIntoConflicts()

            // Assert
            expect(toasts()).toEqual([])
        })

        it("should not pull while a merge is unfinished", async () => {
            // Arrange
            const merging = aStatusOn("feature/x", { upstream: tracking(0, 1), operationInProgress: "merge" })
            const service = await createService(seedOn(tracking(0, 1), { status: merging }))

            // Act
            await service.pull()

            // Assert
            expect(writesOf("git.pull")).toEqual([])
        })

        it("should name the remote when a pull cannot reach it", async () => {
            // Arrange
            const failure = anErrorPayload("NETWORK_UNAVAILABLE", "Could not resolve host")
            const service = await createService(seedOn(tracking(0, 1), { failures: { "git.pull": failure } }))

            // Act
            await asked(service.pull())

            // Assert
            expect(toasts()[0].text).toBe("'origin' could not be reached. Check your connection.")
        })

        it("should not pull a branch without upstream", async () => {
            // Arrange
            const service = await createService(seedOn(null))

            // Act
            await service.pull()

            // Assert
            expect(writesOf("git.pull")).toEqual([])
        })
    })

    describe("push", () => {
        it("should push the current branch onto its upstream's remote and say how many commits went", async () => {
            // Arrange
            const service = await createService(seedOn(tracking(2, 0)))

            // Act
            await asked(service.push())

            // Assert
            expect(writesOf("git.push")).toEqual([
                { repo: API, branchRefName: "refs/heads/feature/x", remote: "origin", setUpstream: false, forceWithLeaseExpected: null }
            ])
            expect(toasts()).toEqual([expect.objectContaining({ text: "Pushed 2 commits to origin/feature/x", severity: "success" })])
        })

        it("should offer Pull after the remote rejected the push", async () => {
            // Arrange
            const failure = anErrorPayload("PUSH_REJECTED", "failed to push some refs")
            const service = await createService(seedOn(tracking(2, 0), { failures: { "git.push": failure } }))
            await asked(service.push())

            // Act
            toasts()[0].action?.run()
            await answerEach()

            // Assert
            expect(toasts()[0]).toEqual(
                expect.objectContaining({ text: "The remote has commits you do not have. Pull first, then push.", severity: "error" })
            )
            expect(toasts()[0].action?.label).toBe("Pull")
            expect(writesOf("git.pull")).toEqual([{ repo: API, mode: "ffOnly" }])
        })

        it("should push nothing when there is nothing to push", async () => {
            // Arrange
            const service = await createService(seedOn(tracking(0, 0)))

            // Act
            await service.push()

            // Assert
            expect(writesOf("git.push")).toEqual([])
        })

        it("should push another local branch it is given", async () => {
            // Arrange
            const other: GitLocalBranch = aLocalBranch("main", { upstream: anUpstream("origin/main", { ahead: 1 }) })
            const seed = seedOn(tracking(0, 0))
            seed.git["f-api"].refs.localBranches[1] = other
            const service = await createService(seed)

            // Act
            await asked(service.push(other))

            // Assert
            expect(writesOf("git.push")).toEqual([expect.objectContaining({ branchRefName: "refs/heads/main", remote: "origin" })])
        })
    })

    describe("publish", () => {
        it("should publish a branch without upstream to origin and track it", async () => {
            // Arrange
            const service = await createService(seedOn(null))

            // Act
            await asked(service.publish())

            // Assert
            expect(writesOf("git.push")).toEqual([
                { repo: API, branchRefName: "refs/heads/feature/x", remote: "origin", setUpstream: true, forceWithLeaseExpected: null }
            ])
            expect(toasts()[0].text).toBe("Published 'feature/x' to origin")
        })

        it("should publish nothing without a remote", async () => {
            // Arrange
            const seed = seedOn(null)
            seed.git["f-api"].refs.remotes = []
            const service = await createService(seed)

            // Act
            await service.publish()

            // Assert
            expect(writesOf("git.push")).toEqual([])
        })

        it("should offer Publish branch when git says the branch has no upstream", async () => {
            // Arrange
            const failure = anErrorPayload("NO_UPSTREAM", "has no upstream branch")
            const service = await createService(seedOn(tracking(2, 0), { failures: { "git.push": failure } }))

            // Act
            await asked(service.push())

            // Assert
            expect(toasts()[0]).toEqual(expect.objectContaining({ text: "'feature/x' has no upstream branch." }))
            expect(toasts()[0].action?.label).toBe("Publish branch")
        })
    })

    describe("force push", () => {
        it("should name both commits, ask separately and lease the remote commit it named", async () => {
            // Arrange
            const service = await createService(seedOn(tracking(2, 1)))
            const pushing = service.forcePush()
            await settleGit()

            // Act
            const confirmation = confirmations.current()
            confirmations.answer(true)
            await answerEach()
            await pushing

            // Assert
            expect(confirmation).toEqual({
                title: "Force Push",
                text:
                    "Replace 'origin/feature/x' (at ccccccc) with your 'feature/x' (at aaaaaaa)? 1 commit on the remote that is not in your " +
                    "branch is removed from it. The push fails if the remote moved since ccccccc.",
                verb: "Force push"
            })
            expect(writesOf("git.push")).toEqual([
                {
                    repo: API,
                    branchRefName: "refs/heads/feature/x",
                    remote: "origin",
                    setUpstream: false,
                    forceWithLeaseExpected: REMOTE_SHA
                }
            ])
        })

        it("should send nothing when the force push is declined", async () => {
            // Arrange
            const service = await createService(seedOn(tracking(2, 1)))
            const pushing = service.forcePush()
            await settleGit()

            // Act
            confirmations.answer(false)
            await pushing

            // Assert
            expect(writesOf("git.push")).toEqual([])
        })

        it("should offer Fetch when the remote moved since the lease", async () => {
            // Arrange
            const failure = anErrorPayload("STALE_PUSH_LEASE", "stale info")
            const service = await createService(seedOn(tracking(2, 1), { failures: { "git.push": failure } }))

            // Act
            const pushing = service.forcePush()
            await settleGit()
            confirmations.answer(true)
            await answerEach()
            await pushing
            toasts()[0].action?.run()
            await settleGit()

            // Assert
            expect(toasts()[0].text).toBe("The remote branch moved since you last fetched. Fetch, review, and try again.")
            expect(writesOf("git.fetch")).toEqual([{ repo: API, prune: false }])
        })

        it("should not force push without anything on the remote to replace", async () => {
            // Arrange
            const service = await createService(seedOn(tracking(2, 0)))

            // Act
            await service.forcePush()

            // Assert
            expect(confirmations.current()).toBe(null)
        })
    })

    describe("abort", () => {
        it("should abort a merge after its confirmation", async () => {
            // Arrange
            const seed = seedOn(tracking(1, 1))
            seed.git["f-api"].status.operationInProgress = "merge"
            const service = await createService(seed)
            const aborting = service.abort()
            await settleGit()

            // Act
            const confirmation = confirmations.current()
            confirmations.answer(true)
            await answerEach()
            await aborting

            // Assert
            expect(confirmation).toEqual({
                title: "Abort Merge",
                text: "Abort the merge and return 'feature/x' to the state before the pull? Changes made while resolving are lost.",
                verb: "Abort merge"
            })
            expect(writesOf("git.abortOperation")).toEqual([{ repo: API, operation: "merge" }])
        })

        it("should abort a rebase on a detached HEAD without naming a branch, and report a refusal", async () => {
            // Arrange
            const seed = seedOn(tracking(1, 1), {
                failures: { "git.abortOperation": anErrorPayload("NOT_ALLOWED", "No rebase is in progress.") }
            })
            Object.assign(seed.git["f-api"].status, { operationInProgress: "rebase", head: { kind: "detached", commit: LOCAL_SHA } })
            const service = await createService(seed)
            const aborting = service.abort()
            await settleGit()

            // Act
            const text = confirmations.current()?.text
            confirmations.answer(true)
            await answerEach()
            await aborting

            // Assert
            expect(text).toContain("return the branch to the state before the pull")
            expect(toasts()[0]).toEqual(expect.objectContaining({ text: "Git failed: No rebase is in progress.", severity: "error" }))
        })

        it("should abort nothing when no merge or rebase is in progress, or when declined", async () => {
            // Arrange
            const seed = seedOn(tracking(1, 1))
            const idle = await createService(seed)
            await idle.abort()
            seed.git["f-api"].status.operationInProgress = "merge"
            TestBed.resetTestingModule()
            const merging = await createService(seed)

            // Act
            const aborting = merging.abort()
            await settleGit()
            confirmations.answer(false)
            await aborting

            // Assert
            expect(writesOf("git.abortOperation")).toEqual([])
        })
    })
})
