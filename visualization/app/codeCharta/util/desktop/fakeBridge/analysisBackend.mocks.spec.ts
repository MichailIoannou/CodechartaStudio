import type { DesktopBridge } from "../desktopBridge"
import { createFakeDesktopBridge } from "../desktopBridge.mocks"
import { aFolder, aLogCommitOf, answerValue, aProject, aSnapshot, NOW } from "./fakeBridgeTestData.mocks"

describe("createFakeDesktopBridge", () => {
    describe("analyses", () => {
        const FOLDER = { projectId: "p-1", folderId: "f-1" }
        const COMMIT = "a1b2c3d".padEnd(40, "0")
        const FAILURE = { code: "JAVA_TOO_OLD" as const, message: "Java 21 is too old.", hint: "Install Java 22." }

        async function enqueueCommit(bridge: DesktopBridge) {
            const result = await answerValue(bridge, "analysis.enqueue", {
                ...FOLDER,
                target: { kind: "commit", sha: COMMIT },
                force: false
            })
            if (result.status !== "queued") {
                throw new Error(`Expected a queued job, got ${result.status}`)
            }
            return result.job
        }

        it("should deliver notifications to subscribers", async () => {
            // Arrange
            const bridge = createFakeDesktopBridge()
            const events: string[] = []
            for (const event of [
                "analysis.queued",
                "analysis.started",
                "analysis.progress",
                "analysis.finished",
                "snapshots.changed"
            ] as const) {
                bridge.subscribe(event, () => events.push(event))
            }

            // Act
            const job = await enqueueCommit(bridge)
            bridge.startJob(job.id)
            bridge.reportProgress(job.id, { mode: "determinate", percent: 42 })
            bridge.completeJob(job.id)
            const { jobs } = await answerValue(bridge, "analysis.list", {})
            const { snapshots } = await answerValue(bridge, "snapshots.list", FOLDER)

            // Assert
            expect(events).toEqual(["analysis.queued", "analysis.started", "analysis.progress", "analysis.finished", "snapshots.changed"])
            expect(jobs[0]).toMatchObject({ id: job.id, state: "done", snapshotId: `${COMMIT}-01234567` })
            expect(snapshots.map(snapshot => snapshot.shortCommit)).toEqual(["a1b2c3d"])
        })

        it("should queue a batch of the last commits, skip analysed ones and only estimate on a dry run", async () => {
            // Arrange
            const shas = ["c", "b", "a"].map(seed => seed.repeat(40))
            const commits = shas.map((sha, index) => ({ ...aLogCommitOf(sha), parents: shas.slice(index + 1, index + 2) }))
            const analysed = { ...aSnapshot("p-1", "f-1", "s-a", NOW), source: "analysed" as const, target: "commit" as const }
            const bridge = createFakeDesktopBridge({
                gitLogs: { "f-1": commits },
                snapshots: [{ ...analysed, commit: shas[2], durationMs: 60_000 }]
            })
            const selection = { kind: "lastCommits" as const, tipSha: shas[0], count: 3, firstParentOnly: true }

            // Act
            const preview = await answerValue(bridge, "analysis.enqueueBatch", { ...FOLDER, selection, dryRun: true })
            const queuedBeforeRun = (await answerValue(bridge, "analysis.list", {})).jobs.length
            const started = await answerValue(bridge, "analysis.enqueueBatch", { ...FOLDER, selection, dryRun: false })
            const tooMany = await bridge.request("analysis.enqueueBatch", {
                ...FOLDER,
                selection: { ...selection, count: 201 },
                dryRun: true
            })

            // Assert
            expect(preview).toEqual({
                batchId: null,
                toAnalyse: shas.slice(0, 2),
                alreadyAnalysed: [shas[2]],
                leftOut: 0,
                jobs: [],
                estimatedDurationMs: 120_000,
                problems: []
            })
            expect(queuedBeforeRun).toBe(0)
            expect(started.jobs.map(job => [job.batchId, job.target])).toEqual(
                shas.slice(0, 2).map(sha => [started.batchId, { kind: "commit", sha }])
            )
            expect(tooMany).toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "BAD_REQUEST" }) }))
        })

        it("should queue every tagged commit and cancel all jobs of a batch", async () => {
            // Arrange
            const tags = ["d", "e"].map(seed => ({
                refName: `refs/tags/${seed}`,
                name: seed,
                commit: seed.repeat(40),
                isAnnotated: true,
                createdAt: 1
            }))
            const refs = {
                fingerprint: "1",
                head: { kind: "detached" as const, commit: "d".repeat(40) },
                localBranches: [],
                remoteBranches: [],
                tags,
                remotes: []
            }
            const bridge = createFakeDesktopBridge({ git: { "f-1": { refs } } })
            const started = await answerValue(bridge, "analysis.enqueueBatch", { ...FOLDER, selection: { kind: "tags" }, dryRun: false })

            // Act
            await answerValue(bridge, "analysis.cancelBatch", { batchId: started.batchId ?? "" })
            const unknown = await bridge.request("analysis.cancelBatch", { batchId: "batch-unknown" })
            const { jobs } = await answerValue(bridge, "analysis.list", {})

            // Assert
            expect(started.toAnalyse).toEqual(tags.map(tag => tag.commit))
            expect(jobs.map(job => job.state)).toEqual(["cancelled", "cancelled"])
            expect(unknown).toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "NOT_FOUND" }) }))
        })

        it("should stop after unsubscribe", async () => {
            // Arrange
            const bridge = createFakeDesktopBridge()
            const handler = jest.fn()
            const unsubscribe = bridge.subscribe("analysis.queued", handler)

            // Act
            unsubscribe()
            await enqueueCommit(bridge)

            // Assert
            expect(handler).not.toHaveBeenCalled()
        })

        it("should answer an already queued target and a working tree job", async () => {
            // Arrange
            const bridge = createFakeDesktopBridge()
            await enqueueCommit(bridge)

            // Act
            const again = await answerValue(bridge, "analysis.enqueue", {
                ...FOLDER,
                target: { kind: "commit", sha: COMMIT },
                force: false
            })
            const workingTree = await answerValue(bridge, "analysis.enqueue", { ...FOLDER, target: { kind: "workingTree" }, force: false })
            if (workingTree.status === "queued") {
                bridge.completeJob(workingTree.job.id)
            }
            const { snapshots } = await answerValue(bridge, "snapshots.list", FOLDER)

            // Assert
            expect(again.status).toBe("alreadyQueued")
            expect(snapshots[0]).toMatchObject({ target: "workingTree", dirty: true, commit: null })
        })

        it("should fail a job, keep its log until cleared and cancel a pending one", async () => {
            // Arrange
            const bridge = createFakeDesktopBridge()
            const failed = await enqueueCommit(bridge)
            const failures = jest.fn()
            bridge.subscribe("analysis.failed", failures)
            bridge.failJob(failed.id, FAILURE, "ccsh: Java 21")
            const pending = await answerValue(bridge, "analysis.enqueue", { ...FOLDER, target: { kind: "workingTree" }, force: false })
            const pendingId = pending.status === "queued" ? pending.job.id : ""

            // Act
            const log = await bridge.request("analysis.readLog", { jobId: failed.id })
            await bridge.request("analysis.cancel", { jobId: pendingId })
            const unknown = await bridge.request("analysis.cancel", { jobId: "job-unknown" })
            await bridge.request("analysis.clearFinished", {})
            const cleared = await bridge.request("analysis.readLog", { jobId: failed.id })
            const { jobs } = await answerValue(bridge, "analysis.list", {})

            // Assert
            expect(failures).toHaveBeenCalledWith({ job: expect.objectContaining({ state: "failed", error: FAILURE }) })
            expect(log).toEqual({ ok: true, value: { log: "ccsh: Java 21" } })
            expect(unknown).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } })
            expect(cleared).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } })
            expect(jobs).toEqual([])
        })

        it("should resolve a target to its own snapshot, else through HEAD, else to none", async () => {
            // Arrange
            const analysed = {
                ...aSnapshot("p-1", "f-1", "s-1", NOW),
                source: "analysed" as const,
                commit: COMMIT,
                target: "commit" as const
            }
            const head = { kind: "branch" as const, name: "main", commit: COMMIT }
            const status = {
                head,
                upstream: null,
                counts: { staged: 0, unstaged: 0, untracked: 0, conflicted: 0 },
                operationInProgress: null
            }
            const bridge = createFakeDesktopBridge({ snapshots: [analysed], gitStatuses: { "f-1": status } })

            // Act
            const commit = await answerValue(bridge, "snapshots.resolveForCommit", { ...FOLDER, target: { kind: "commit", sha: COMMIT } })
            const workingTree = await answerValue(bridge, "snapshots.resolveForCommit", { ...FOLDER, target: { kind: "workingTree" } })
            const other = await answerValue(bridge, "snapshots.resolveForCommit", {
                ...FOLDER,
                target: { kind: "commit", sha: "f".repeat(40) }
            })
            const empty = await answerValue(bridge, "snapshots.resolveForCommit", {
                ...FOLDER,
                folderId: "f-2",
                target: { kind: "workingTree" }
            })

            // Assert
            expect(commit).toEqual({ kind: "exact", snapshot: analysed, isCurrentProfile: true })
            expect(workingTree).toEqual({ kind: "exact", snapshot: analysed, isCurrentProfile: true })
            expect(other).toEqual({ kind: "none", reason: "UNRELATED" })
            expect(empty).toEqual({ kind: "none", reason: "NO_SNAPSHOTS" })
        })

        it("should answer a scripted resolution until the job for its target finishes", async () => {
            // Arrange
            const bridge = createFakeDesktopBridge({ resolutions: { "f-1/workingTree": { kind: "none", reason: "NO_COMMITS" } } })
            const nearest = { kind: "none" as const, reason: "UNKNOWN_COMMIT" as const }
            bridge.setResolution(FOLDER, { kind: "commit", sha: COMMIT }, nearest)
            const seeded = await answerValue(bridge, "snapshots.resolveForCommit", { ...FOLDER, target: { kind: "workingTree" } })
            const job = await enqueueCommit(bridge)

            // Act
            const scripted = await answerValue(bridge, "snapshots.resolveForCommit", { ...FOLDER, target: { kind: "commit", sha: COMMIT } })
            bridge.completeJob(job.id)
            const afterwards = await answerValue(bridge, "snapshots.resolveForCommit", {
                ...FOLDER,
                target: { kind: "commit", sha: COMMIT }
            })

            // Assert
            expect(seeded).toEqual({ kind: "none", reason: "NO_COMMITS" })
            expect(scripted).toEqual(nearest)
            expect(afterwards).toMatchObject({ kind: "exact", snapshot: { commit: COMMIT }, isCurrentProfile: true })
        })

        it("should answer the newest snapshot of a plain folder as the latest", async () => {
            // Arrange
            const plain = aProject("p-1", [aFolder("f-1", { kind: "plain", git: null })])
            const older = aSnapshot("p-1", "f-1", "s-old", "2026-01-01T00:00:00Z")
            const newer = aSnapshot("p-1", "f-1", "s-new", "2026-02-01T00:00:00Z")
            const bridge = createFakeDesktopBridge({ projects: [plain], snapshots: [older, newer] })

            // Act
            const resolution = await answerValue(bridge, "snapshots.resolveForCommit", { ...FOLDER, target: { kind: "workingTree" } })

            // Assert
            expect(resolution).toEqual({ kind: "latest", snapshot: newer, reason: "PLAIN_FOLDER" })
        })

        it("should answer seeded jobs, a seeded snapshot log and a clean preflight", async () => {
            // Arrange
            const bridge = createFakeDesktopBridge({ snapshotLogs: { "s-1": "Map: out.cc.json.gz" } })

            // Act
            const log = await bridge.request("snapshots.readLog", { ...FOLDER, snapshotId: "s-1" })
            const missing = await bridge.request("snapshots.readLog", { ...FOLDER, snapshotId: "s-2" })
            const preflight = await bridge.request("analysis.preflight", { ...FOLDER, target: { kind: "workingTree" } })

            // Assert
            expect(log).toEqual({ ok: true, value: { log: "Map: out.cc.json.gz" } })
            expect(missing).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } })
            expect(preflight).toEqual({ ok: true, value: { ok: true, problems: [] } })
        })
    })
})
