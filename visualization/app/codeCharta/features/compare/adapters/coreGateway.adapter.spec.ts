import { TestBed } from "@angular/core/testing"
import type { GitCommitSummary } from "../../../model/coreApi/GitCommitSummary"
import type { GitRefs } from "../../../model/coreApi/GitRefs"
import { createFakeDesktopBridge, FakeDesktopSeed } from "../../../util/desktop/desktopBridge.mocks"
import { DESKTOP_BRIDGE } from "../../../util/desktop/desktopBridge.token"
import { DesktopBridgeError } from "../../../util/desktop/desktopResult"
import { aProject } from "../../projects/projects.mocks"
import { CORE_GATEWAY } from "../ports/compareGateways"
import { aCommitSnapshot, BASE_SHA, FOLDER, HEAD_SHA } from "../ports/compareGateways.mocks"

const ROOT_SHA = "1234567".padEnd(40, "0")
const BRANCH = { isCurrent: false, upstream: null, checkedOutInOtherWorktree: null, lastCommit: { subject: "", committedAt: 0 } }

function aCommit(sha: string, parents: string[]): GitCommitSummary {
    return { sha, parents, authorName: "Mia", authorEmail: "mia@example.org", authoredAt: 0, committedAt: 0, subject: sha.slice(0, 7) }
}

const REFS = {
    fingerprint: "f",
    head: { kind: "branch", name: "feature/x", commit: HEAD_SHA },
    localBranches: [
        { ...BRANCH, refName: "refs/heads/main", name: "main", commit: BASE_SHA },
        { ...BRANCH, refName: "refs/heads/feature/x", name: "feature/x", commit: HEAD_SHA, isCurrent: true }
    ],
    remoteBranches: [],
    tags: [{ refName: "refs/tags/v1.0", name: "v1.0", commit: BASE_SHA, isAnnotated: false, createdAt: 0 }],
    remotes: []
} as unknown as GitRefs

describe("CoreGatewayAdapter", () => {
    function createGateway(seed: FakeDesktopSeed = {}) {
        const bridge = createFakeDesktopBridge({
            projects: [aProject(FOLDER.projectId, [])],
            snapshots: [aCommitSnapshot(BASE_SHA), aCommitSnapshot(HEAD_SHA)],
            git: {
                [FOLDER.folderId]: {
                    refs: REFS,
                    commits: [aCommit(HEAD_SHA, [BASE_SHA]), aCommit(BASE_SHA, [ROOT_SHA]), aCommit(ROOT_SHA, [])]
                }
            },
            commits: { [FOLDER.folderId]: [{ commit: HEAD_SHA, shortCommit: "a1b2c3d", subject: "", authorName: "", authorDate: "" }] },
            ...seed
        })
        TestBed.configureTestingModule({ providers: [{ provide: DESKTOP_BRIDGE, useValue: bridge }] })
        return TestBed.inject(CORE_GATEWAY)
    }

    it("should keep the typed base as base and name the sides by what was typed", async () => {
        // Arrange
        const gateway = createGateway()
        const side = (name: string) => ({ folder: FOLDER, rev: { kind: "rev" as const, name } })

        // Act
        const resolved = await gateway.resolve({ kind: "explicit", base: side("a1b2"), head: side("v1.0"), baseMode: "mergeBase" }, null)
        const unknown = gateway.resolve({ kind: "explicit", base: side("nowhere"), head: side("main"), baseMode: "tip" }, null)

        // Assert
        expect([resolved.base.requested.commit, resolved.head.requested.commit]).toEqual([HEAD_SHA, BASE_SHA])
        expect([resolved.origin, resolved.baseMode]).toEqual(["commits", "tip"])
        expect(resolved.head.requested.label).toEqual({ kind: "tag", name: "v1.0" })
        await expect(unknown).rejects.toEqual(
            new DesktopBridgeError({ code: "UNKNOWN_REVISION", message: "The revision is not in the repository." })
        )
    })

    it("should compare a branch from its merge base with the current branch and offer the nearest analysis", async () => {
        // Arrange
        const gateway = createGateway({ snapshots: [aCommitSnapshot(ROOT_SHA)] })

        // Act
        const resolved = await gateway.resolve(
            { kind: "branch", folder: FOLDER, branch: "refs/heads/main", target: null, baseMode: "mergeBase" },
            null
        )

        // Assert
        expect([resolved.origin, resolved.baseMode]).toEqual(["branches", "mergeBase"])
        expect([resolved.base.requested.commit, resolved.head.requested.commit]).toEqual([BASE_SHA, BASE_SHA])
        expect(resolved.baseTip?.label).toEqual({ kind: "branch", name: "feature/x" })
        expect(resolved.head.status).toEqual({
            status: "missing",
            nearest: expect.objectContaining({ relation: "ancestor", staleBy: 1, behind: 1, ahead: 0 })
        })
    })

    it("should resolve two commits with the older one as base", async () => {
        // Arrange
        const gateway = createGateway()

        // Act
        const resolved = await gateway.resolve({ kind: "commits", folder: FOLDER, a: "refs/heads/feature/x", b: "refs/heads/main" }, null)

        // Assert
        expect(resolved.status).toEqual({ kind: "ready" })
        expect([resolved.base.requested.label, resolved.head.requested.label]).toEqual([
            { kind: "branch", name: "main" },
            { kind: "branch", name: "feature/x" }
        ])
        expect(resolved.base.status.status).toBe("exact")
        expect(resolved.preflight.identicalChecksums).toBe(false)
    })

    it("should resolve a commit with its parent and with the shown commit", async () => {
        // Arrange
        const gateway = createGateway()

        // Act
        const withParent = await gateway.resolve({ kind: "withParent", folder: FOLDER, commit: BASE_SHA }, null)
        const withCurrent = await gateway.resolve({ kind: "withCurrent", folder: FOLDER, commit: BASE_SHA }, BASE_SHA)

        // Assert
        expect(withParent.base.requested.commit).toBe(ROOT_SHA)
        expect(withParent.base.status).toEqual({ status: "missing", nearest: null })
        expect(withCurrent.status).toEqual({ kind: "sameCommit" })
    })

    it("should fail like the core for the parent of a root commit", async () => {
        // Arrange
        const gateway = createGateway()

        // Act
        const resolving = gateway.resolve({ kind: "withParent", folder: FOLDER, commit: ROOT_SHA }, null)

        // Assert
        await expect(resolving).rejects.toEqual(
            new DesktopBridgeError({ code: "UNKNOWN_REVISION", message: "The commit has no parent to compare with." })
        )
    })
})
