import type { GitEntryKind } from "../../../model/coreApi/GitEntryKind"
import type { GitFileChange } from "../../../model/coreApi/GitFileChange"
import type { Project } from "../../../model/coreApi/Project"
import type { DesktopBridge } from "../desktopBridge"
import { createFakeDesktopBridge, FakeDesktopSeed, fakeDesktopBridgeSource } from "../desktopBridge.mocks"
import { answerValue, aPickedFolder, pickAndCreate } from "./fakeBridgeTestData.mocks"

describe("createFakeDesktopBridge", () => {
    describe("git writes", () => {
        const repo = { projectId: "p-1", folderId: "f-1" }
        const A = "a".repeat(40)
        const B = "b".repeat(40)
        const lastCommit = { subject: "Add billing", committedAt: 0 }

        function aBranch(name: string, commit: string, isCurrent = false) {
            return { refName: `refs/heads/${name}`, name, commit, isCurrent, upstream: null, checkedOutInOtherWorktree: null, lastCommit }
        }

        function writableSeed(extra: Partial<NonNullable<FakeDesktopSeed["git"]>[string]> = {}): FakeDesktopSeed {
            const head = { kind: "branch" as const, name: "main", commit: A }
            const remote = { refName: "refs/remotes/origin/x", remote: "origin", name: "origin/x", branchName: "x", commit: B, lastCommit }
            const refs = {
                fingerprint: "f1",
                head,
                localBranches: [aBranch("main", A, true), aBranch("old", B)],
                remoteBranches: [remote],
                tags: [],
                remotes: []
            }
            const status = {
                head,
                upstream: null,
                counts: { staged: 0, unstaged: 0, untracked: 0, conflicted: 0 },
                operationInProgress: null
            }
            return {
                projects: [{ id: "p-1", folders: [{ id: "f-1", label: "billing-api" }] } as unknown as Project],
                git: { "f-1": { info: { repositoryId: "/r/.git" } as never, refs, status, ...extra } }
            }
        }

        function errorCodeOf(answer: object) {
            return "error" in answer ? (answer.error as { code: string }).code : null
        }

        async function branchNames(bridge: DesktopBridge) {
            const answer = await bridge.request("git.branches", { repo })
            return answer.ok ? answer.value.localBranches.map(branch => `${branch.name}${branch.isCurrent ? "*" : ""}`) : []
        }

        it("should create, switch to, rename, track and delete branches and announce each change", async () => {
            // Arrange
            const bridge = createFakeDesktopBridge(writableSeed())
            const changed = jest.fn()
            bridge.subscribe("repository.changed", changed)

            // Act
            await bridge.request("git.branchCreate", { repo, name: "feature", startPoint: B, checkout: true })
            await bridge.request("git.branchRename", { repo, refName: "refs/heads/feature", newName: "renamed" })
            await bridge.request("git.switch", {
                repo,
                target: { kind: "trackRemote", remoteRefName: "refs/remotes/origin/x", localName: "x" }
            })
            await bridge.request("git.setUpstream", { repo, refName: "refs/heads/x", upstreamRefName: null })
            await bridge.request("git.branchDelete", { repo, target: { kind: "local", refName: "refs/heads/old", force: false } })
            await bridge.request("git.branchDelete", { repo, target: { kind: "remote", remoteRefName: "refs/remotes/origin/x" } })
            const status = await bridge.request("git.status", { repo })

            // Assert
            expect(await branchNames(bridge)).toEqual(["main", "renamed", "x*"])
            expect(status.ok && status.value.head).toEqual({ kind: "branch", name: "x", commit: B })
            expect(changed).toHaveBeenCalledTimes(6)
            expect(changed).toHaveBeenLastCalledWith(
                expect.objectContaining({ repo, parts: ["status", "refs", "workingTree"], fingerprint: "f1++++++" })
            )
        })

        it("should refuse an existing name and an unmerged branch unless forced", async () => {
            // Arrange
            const bridge = createFakeDesktopBridge(writableSeed({ unmergedBranches: ["old"] }))
            const deleteOld = (force: boolean) =>
                bridge.request("git.branchDelete", { repo, target: { kind: "local", refName: "refs/heads/old", force } })

            // Act
            const exists = await bridge.request("git.branchCreate", { repo, name: "old", startPoint: A, checkout: false })
            const unmerged = await deleteOld(false)
            const forced = await deleteOld(true)

            // Assert
            expect([exists, unmerged].map(answer => errorCodeOf(answer))).toEqual(["BRANCH_EXISTS", "BRANCH_NOT_FULLY_MERGED"])
            expect(forced.ok).toBe(true)
        })

        function anEntry(path: string, kind: GitEntryKind, change: GitFileChange = "modified") {
            return { path, previousPath: null, kind, change, conflict: kind === "conflicted" ? "UU" : null }
        }

        async function listedRows(bridge: DesktopBridge) {
            const answer = await bridge.request("git.workingTree", { repo })
            return answer.ok ? answer.value.entries.map(entry => `${entry.kind}:${entry.path}:${entry.change}`) : []
        }

        it("should stage, unstage and discard listed rows and keep the status counts in step", async () => {
            // Arrange
            const changes = [anEntry("a.ts", "unstaged"), anEntry("new.ts", "untracked", "added"), anEntry("old.ts", "unstaged", "deleted")]
            const bridge = createFakeDesktopBridge(writableSeed({ changes }))

            // Act
            await bridge.request("git.stage", { repo, target: { kind: "paths", paths: ["a.ts"] } })
            await bridge.request("git.stage", { repo, target: { kind: "all" } })
            await bridge.request("git.unstage", { repo, paths: ["new.ts", "a.ts"] })
            await bridge.request("git.discard", { repo, entries: [{ path: "new.ts", kind: "untracked", change: "added" }] })
            const status = await bridge.request("git.status", { repo })

            // Assert
            expect(await listedRows(bridge)).toEqual(["staged:old.ts:deleted", "unstaged:a.ts:modified"])
            expect(status.ok && status.value.counts).toEqual({ staged: 1, unstaged: 1, untracked: 0, conflicted: 0 })
        })

        it("should refuse rows that are no longer listed as named, a conflicted row, and answer a listed row's diff", async () => {
            // Arrange
            const diff = { path: "a.ts", text: "@@ -1 +1 @@\n-a\n+b\n", isBinary: false, isTruncated: false }
            const changes = [anEntry("a.ts", "unstaged"), anEntry("c.ts", "conflicted")]
            const bridge = createFakeDesktopBridge(writableSeed({ changes, diffs: { "unstaged:a.ts": diff } }))

            // Act
            const answers = [
                await bridge.request("git.stage", { repo, target: { kind: "paths", paths: ["gone.ts"] } }),
                await bridge.request("git.unstage", { repo, paths: ["a.ts"] }),
                await bridge.request("git.discard", { repo, entries: [{ path: "a.ts", kind: "unstaged", change: "deleted" }] }),
                await bridge.request("git.discard", { repo, entries: [{ path: "c.ts", kind: "conflicted", change: "modified" }] }),
                await bridge.request("git.diffFile", { repo, path: "a.ts", kind: "staged" })
            ]
            const shown = await bridge.request("git.diffFile", { repo, path: "a.ts", kind: "unstaged" })
            const empty = await bridge.request("git.diffFile", { repo, path: "c.ts", kind: "conflicted" })

            // Assert
            expect(answers.map(errorCodeOf)).toEqual([
                "CHANGED_SINCE_LISTED",
                "CHANGED_SINCE_LISTED",
                "CHANGED_SINCE_LISTED",
                "NOT_ALLOWED",
                "NOT_FOUND"
            ])
            expect(shown).toEqual({ ok: true, value: diff })
            expect(empty.ok && empty.value.text).toBe("")
        })

        it("should commit the staged rows onto the current branch, amend the last commit and answer ancestry", async () => {
            // Arrange
            const commits = [{ sha: A, parents: [], subject: "Start", authorName: "M", authorEmail: "m@x", authoredAt: 0, committedAt: 0 }]
            const changes = [anEntry("a.ts", "staged"), anEntry("b.ts", "unstaged")]
            const bridge = createFakeDesktopBridge(writableSeed({ changes, commits }))

            // Act
            await bridge.request("git.commit", { repo, subject: "Add a", body: "", amend: false })
            const first = await bridge.request("git.status", { repo })
            const nothing = await bridge.request("git.commit", { repo, subject: "Again", body: "", amend: false })
            await bridge.request("git.commit", { repo, subject: "Add a, amended", body: "", amend: true })
            const amended = await bridge.request("git.status", { repo })
            const amendedSha = amended.ok ? (amended.value.head.commit ?? "") : ""
            const ancestry = [
                await bridge.request("git.isAncestor", { repo, ancestor: A, descendant: amendedSha }),
                await bridge.request("git.isAncestor", { repo, ancestor: amendedSha, descendant: A })
            ]

            // Assert
            expect(first.ok && first.value.counts).toEqual({ staged: 0, unstaged: 1, untracked: 0, conflicted: 0 })
            expect(errorCodeOf(nothing)).toBe("NOTHING_TO_COMMIT")
            expect(await branchNames(bridge)).toEqual(["main*", "old"])
            expect(amendedSha).not.toBe(A)
            expect(ancestry.map(answer => answer.ok && answer.value)).toEqual([true, false])
        })

        it("should refuse to commit while files have conflicts", async () => {
            // Arrange
            const bridge = createFakeDesktopBridge(writableSeed({ changes: [anEntry("c.ts", "conflicted")] }))

            // Act
            const answer = await bridge.request("git.commit", { repo, subject: "Merge", body: "", amend: false })

            // Assert
            expect(errorCodeOf(answer)).toBe("CONFLICTS")
        })

        it("should fetch with the seeded number of updated refs", async () => {
            // Arrange
            const bridge = createFakeDesktopBridge(writableSeed({ fetchedRefs: 3 }))

            // Act
            const answer = await bridge.request("git.fetch", { repo, prune: false })

            // Assert
            expect(answer).toEqual({ ok: true, value: expect.objectContaining({ updatedRefs: 3 }) })
        })

        it("should hold a slow fetch with its progress until the operation is cancelled", async () => {
            // Arrange
            const progress = { message: "Receiving objects: 45%", done: 45, total: 100 }
            const bridge = createFakeDesktopBridge(writableSeed({ slow: { "git.fetch": { progress } } }))
            const reported = jest.fn()
            bridge.subscribe("core.progress", reported)

            // Act
            const answer = bridge.request("git.fetch", { repo, prune: false }, { operationId: "op-1" })
            await Promise.resolve()
            await bridge.cancel("op-1")

            // Assert
            expect(reported).toHaveBeenCalledWith({ requestId: "op-1", ...progress })
            expect(await answer).toEqual({ ok: false, error: expect.objectContaining({ code: "CANCELLED" }) })
        })

        it("should ask the prompts of a slow operation and finish it once every prompt is answered", async () => {
            // Arrange
            const prompts = [
                { kind: "text" as const, message: "Username for 'https://example.com': " },
                { kind: "secret" as const, message: "Password for 'https://ada@example.com': " }
            ]
            const bridge = createFakeDesktopBridge(writableSeed({ slow: { "git.fetch": { prompts } } }))
            const requested = jest.fn()
            const closed = jest.fn()
            bridge.subscribe("prompt.requested", requested)
            bridge.subscribe("prompt.closed", closed)

            // Act
            const answer = bridge.request("git.fetch", { repo, prune: false }, { operationId: "op-1" })
            await Promise.resolve()
            const ids = requested.mock.calls.map(([prompt]) => prompt.promptId)
            await bridge.request("prompt.answer", { promptId: ids[0], answer: "ada" })
            const late = await bridge.request("prompt.answer", { promptId: ids[0], answer: "ada" })
            await bridge.request("prompt.answer", { promptId: ids[1], answer: "secret" })

            // Assert
            expect(requested).toHaveBeenCalledWith({ promptId: ids[0], requestId: "op-1", repositoryLabel: "billing-api", ...prompts[0] })
            expect(closed.mock.calls.map(([event]) => event.promptId)).toEqual(ids)
            expect(errorCodeOf(late)).toBe("NOT_FOUND")
            expect((await answer).ok).toBe(true)
        })

        it("should fail a slow operation as cancelled sign-in when its prompt is cancelled", async () => {
            // Arrange
            const prompts = [{ kind: "confirm" as const, message: "Are you sure you want to continue connecting (yes/no)? " }]
            const bridge = createFakeDesktopBridge(writableSeed({ slow: { "git.fetch": { prompts } } }))
            const requested = jest.fn()
            bridge.subscribe("prompt.requested", requested)

            // Act
            const answer = bridge.request("git.fetch", { repo, prune: false }, { operationId: "op-1" })
            await Promise.resolve()
            await bridge.request("prompt.cancel", { promptId: requested.mock.calls[0][0].promptId })
            const unknown = await bridge.request("prompt.cancel", { promptId: "gone" })

            // Assert
            expect(await answer).toEqual({ ok: false, error: expect.objectContaining({ code: "AUTHENTICATION_CANCELLED" }) })
            expect(errorCodeOf(unknown)).toBe("NOT_FOUND")
        })
    })

    it("should work when rebuilt from its own source text", async () => {
        // Arrange
        const seed: FakeDesktopSeed = {
            protocolVersion: 7,
            responses: { "core.ping": { coreVersion: "0.1.0" } },
            pickedFolders: [aPickedFolder("billing")]
        }
        const rebuild = new Function(`return ${fakeDesktopBridgeSource(seed)}`)

        // Act
        const rebuilt = rebuild() as ReturnType<typeof createFakeDesktopBridge>
        const result = await rebuilt.request("core.ping", {})
        const created = await pickAndCreate(rebuilt, "Billing")
        const listed = await answerValue(rebuilt, "projects.list", {})

        // Assert
        expect(rebuilt.protocolVersion).toBe(7)
        expect(result).toEqual({ ok: true, value: { coreVersion: "0.1.0" } })
        expect(listed.projects.map(project => project.id)).toEqual([created.id])
        expect(rebuilt.calls).toHaveLength(4)
    })
})
