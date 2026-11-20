import { aSnapshot } from "../../projects/projects.mocks"
import { aJob, COMMIT_SHA } from "../snapshots.mocks"
import {
    isPendingJob,
    isToolProblem,
    isUnboundImport,
    jobDurationMs,
    progressPercent,
    reanalyseTarget,
    shortProfile,
    snapshotCommitLabel,
    targetLabel,
    targetName
} from "./analysisWording"

describe("analysisWording", () => {
    it("should name a commit by its short sha and the working tree in words", () => {
        // Arrange
        const commit = { kind: "commit" as const, sha: COMMIT_SHA }
        const workingTree = { kind: "workingTree" as const }

        // Act
        const names = [targetName(commit), targetName(workingTree), targetLabel(commit), targetLabel(workingTree)]

        // Assert
        expect(names).toEqual(["a1b2c3d", "the working tree", "a1b2c3d", "working tree"])
    })

    it("should give the percent of a determinate progress only", () => {
        // Act
        const percents = [progressPercent({ mode: "determinate", percent: 42 }), progressPercent({ mode: "indeterminate" })]

        // Assert
        expect(percents).toEqual([42, null])
    })

    it("should tell pending jobs and measure finished ones", () => {
        // Arrange
        const running = aJob("job-1", { state: "running", startedAt: "2026-11-19T08:00:00Z" })
        const done = aJob("job-2", { state: "done", startedAt: "2026-11-19T08:00:00Z", finishedAt: "2026-11-19T08:01:12Z" })

        // Act
        const pending = [isPendingJob(aJob("job-0")), isPendingJob(running), isPendingJob(done)]

        // Assert
        expect(pending).toEqual([true, true, false])
        expect([jobDurationMs(running), jobDurationMs(done)]).toEqual([null, 72_000])
    })

    it("should shorten a profile hash and say unknown without one", () => {
        // Act
        const profiles = [shortProfile("2f9c0123"), shortProfile(null)]

        // Assert
        expect(profiles).toEqual(["2f9c…", "unknown"])
    })

    it("should tell problems that a tool causes", () => {
        // Act
        const tools = [isToolProblem("JAVA_TOO_OLD"), isToolProblem("WORKTREE_FAILED")]

        // Assert
        expect(tools).toEqual([true, false])
    })

    it("should label snapshots and say what re-analysing them runs", () => {
        // Arrange
        const commit = aSnapshot("p", "f", "s-1", { target: "commit", commit: COMMIT_SHA, shortCommit: "a1b2c3d" })
        const workingTree = aSnapshot("p", "f", "s-2", { target: "workingTree", shortCommit: "9f8e7d6", dirty: true })
        const bareWorkingTree = aSnapshot("p", "f", "s-3", { target: "workingTree" })
        const unbound = aSnapshot("p", "f", "s-4", { source: "imported", originalFileName: "export.cc.json" })
        const bound = aSnapshot("p", "f", "s-5", { source: "imported", commit: COMMIT_SHA, shortCommit: "a1b2c3d" })

        // Act
        const labels = [commit, workingTree, bareWorkingTree, unbound, bound].map(snapshotCommitLabel)
        const targets = [commit, workingTree, unbound].map(reanalyseTarget)

        // Assert
        expect(labels).toEqual(["a1b2c3d", "working tree (on 9f8e7d6)", "working tree", "export.cc.json", "a1b2c3d"])
        expect(targets).toEqual([{ kind: "commit", sha: COMMIT_SHA }, { kind: "workingTree" }, null])
        expect([unbound, bound].map(isUnboundImport)).toEqual([true, false])
    })
})
