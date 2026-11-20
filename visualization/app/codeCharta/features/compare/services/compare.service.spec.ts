import { TestBed } from "@angular/core/testing"
import { provideRouter, Router } from "@angular/router"
import { Action, State, Store, StoreModule } from "@ngrx/store"
import { TEST_FILE_DATA } from "../../../mocks/dataMocks"
import { CCFile, CcState, LayoutAlgorithm } from "../../../model/codeCharta.model"
import { FileSelectionState } from "../../../model/files/files"
import { addFile, setStandard } from "../../../stores/fileStore/store/files.actions"
import { layoutAlgorithmSelector } from "../../../stores/mapState/mapState.read.facade"
import { setLayoutAlgorithm } from "../../../stores/mapState/mapState.write.facade"
import { appReducers, setStateMiddleware } from "../../../stores/rootStore/store"
import { setChangedFilesFilter } from "../../../stores/sharedView/sharedView.write.facade"
import { DesktopBridgeError } from "../../../util/desktop/desktopResult"
import { ToastService } from "../../shared/facade"
import { ANALYSIS_GATEWAY, CORE_GATEWAY, SNAPSHOT_GATEWAY } from "../ports/compareGateways"
import {
    aCommitSnapshot,
    aComparedCommit,
    aResolvedComparison,
    BASE_SHA,
    FakeAnalysisGateway,
    FakeCoreGateway,
    FakeSnapshotGateway,
    FOLDER,
    FORK,
    HEAD_SHA
} from "../ports/compareGateways.mocks"
import { RecentComparisonsRepo } from "../repos/recentComparisons.repo"
import { CompareStore } from "../stores/compare.store"
import { CompareService } from "./compare.service"

const BASE_CHECKSUM = `checksum-${BASE_SHA.slice(0, 7)}`
const HEAD_CHECKSUM = `checksum-${HEAD_SHA.slice(0, 7)}`
const COMPARED_FOLDER = { ref: FOLDER, label: "billing-api" }

function aMap(fileName: string, checksum: string, rootName = "root"): CCFile {
    return {
        ...TEST_FILE_DATA,
        fileMeta: { ...TEST_FILE_DATA.fileMeta, fileName, fileChecksum: checksum },
        map: { ...TEST_FILE_DATA.map, name: rootName }
    }
}

describe("CompareService", () => {
    let service: CompareService
    let store: Store<CcState>
    let state: State<CcState>
    let snapshots: FakeSnapshotGateway
    let core: FakeCoreGateway
    let analyses: FakeAnalysisGateway
    let compareStore: CompareStore
    let dispatched: string[]
    let toast: jest.SpyInstance

    beforeEach(() => {
        localStorage.clear()
        snapshots = new FakeSnapshotGateway()
        core = new FakeCoreGateway()
        analyses = new FakeAnalysisGateway()
        TestBed.configureTestingModule({
            imports: [StoreModule.forRoot(appReducers, { metaReducers: [setStateMiddleware] })],
            providers: [
                provideRouter([]),
                { provide: SNAPSHOT_GATEWAY, useValue: snapshots },
                { provide: CORE_GATEWAY, useValue: core },
                { provide: ANALYSIS_GATEWAY, useValue: analyses }
            ]
        })
        store = TestBed.inject(Store)
        state = TestBed.inject(State)
        service = TestBed.inject(CompareService)
        compareStore = TestBed.inject(CompareStore)
        toast = jest.spyOn(TestBed.inject(ToastService), "show")
        dispatched = []
        const dispatch = store.dispatch.bind(store) as (action: Action) => void
        jest.spyOn(store, "dispatch").mockImplementation(((action: Action) => {
            dispatched.push(action.type)
            dispatch(action)
        }) as Store["dispatch"])
        loadMapsOnLoad([aMap("billing-api@9f8e7d6", BASE_CHECKSUM), aMap("billing-api@a1b2c3d", HEAD_CHECKSUM)])
    })

    function loadMapsOnLoad(maps: CCFile[]) {
        snapshots.beforeLoad = () => {
            for (const map of maps) {
                store.dispatch(addFile({ file: map }))
            }
            store.dispatch(setStandard({ files: maps }))
        }
    }

    function selectionByChecksum() {
        return Object.fromEntries(state.getValue().files.map(fileState => [fileState.file.fileMeta.fileChecksum, fileState.selectedAs]))
    }

    it("should dispatch setDelta with the base as reference and the head as comparison", async () => {
        // Act
        await service.compareSides(COMPARED_FOLDER, { base: "main", head: " feature/x ", baseMode: "tip", unresolved: [] })

        // Assert
        expect(core.intents).toEqual([
            {
                kind: "explicit",
                base: { folder: FOLDER, rev: { kind: "rev", name: "main" } },
                head: { folder: FOLDER, rev: { kind: "rev", name: "feature/x" } },
                baseMode: "tip"
            }
        ])
        expect(selectionByChecksum()).toEqual({
            [BASE_CHECKSUM]: FileSelectionState.Reference,
            [HEAD_CHECKSUM]: FileSelectionState.Comparison
        })
        expect(compareStore.state().phase).toBe("active")
        expect(compareStore.isActive()).toBe(true)
    })

    it("should ask for the files git changed between the two commits once the comparison shows", async () => {
        // Arrange
        core.changedFilesAnswer = { source: "git", files: [{ change: "modified", path: "a.ts", previousPath: null }] }

        // Act
        await service.start({ kind: "commits", folder: FOLDER, a: BASE_SHA, b: HEAD_SHA })
        await Promise.resolve()

        // Assert
        expect(core.changedFilesRequests).toEqual([{ baseFolder: FOLDER, headFolder: FOLDER, base: BASE_SHA, head: HEAD_SHA }])
        expect(compareStore.state().changedFiles).toEqual(core.changedFilesAnswer)
    })

    it("should treat a failed changed-files request as a list git cannot give", async () => {
        // Arrange
        core.changedFilesAnswer = new Error("git failed")

        // Act
        await service.start({ kind: "commits", folder: FOLDER, a: BASE_SHA, b: HEAD_SHA })
        await Promise.resolve()
        await Promise.resolve()

        // Assert
        expect(compareStore.state().changedFiles).toEqual({ source: "unavailable", files: [] })
    })

    it("should remember a merge-base comparison by the tip its base came from", async () => {
        // Arrange
        core.resolution = aResolvedComparison({
            baseMode: "mergeBase",
            baseTip: aComparedCommit("7777777".padEnd(40, "0"), { kind: "branch", name: "main" })
        })

        // Act
        await service.start({ kind: "branch", folder: FOLDER, branch: "refs/heads/feature/x", target: null, baseMode: "mergeBase" })

        // Assert
        expect(TestBed.inject(RecentComparisonsRepo).read(FOLDER.projectId)).toEqual([
            expect.objectContaining({ folderId: FOLDER.folderId, base: "main", head: "feature/x", baseMode: "mergeBase" })
        ])
    })

    it("should find the files by checksum when their names sort head first", async () => {
        // Arrange
        loadMapsOnLoad([aMap("z-base", BASE_CHECKSUM), aMap("a-head", HEAD_CHECKSUM)])

        // Act
        await service.start({ kind: "commits", folder: FOLDER, a: BASE_SHA, b: HEAD_SHA })

        // Assert
        expect(state.getValue().files.map(fileState => fileState.selectedAs)).toEqual([
            FileSelectionState.Comparison,
            FileSelectionState.Reference
        ])
    })

    it("should dispatch setDelta only after the pair is loaded", async () => {
        // Arrange
        const loadFiles = snapshots.beforeLoad
        snapshots.beforeLoad = () => {
            dispatched.push("loaded")
            loadFiles()
        }

        // Act
        await service.start({ kind: "commits", folder: FOLDER, a: BASE_SHA, b: HEAD_SHA })

        // Assert
        const setDeltaIndex = dispatched.findIndex(type => type === "SET_DELTA")
        expect(setDeltaIndex).toBeGreaterThan(dispatched.indexOf("loaded"))
        expect(snapshots.calls).toEqual(["holdMap", "loadPair s-9f8e7d6 s-a1b2c3d"])
    })

    it("should load only the head and report no differences when checksums are equal", async () => {
        // Arrange
        core.resolution = aResolvedComparison({
            preflight: { identicalChecksums: true, profilesDiffer: false, combinedBytes: 10, sizeVerdict: "ok" }
        })
        loadMapsOnLoad([aMap("billing-api@a1b2c3d", HEAD_CHECKSUM)])

        // Act
        await service.start({ kind: "commits", folder: FOLDER, a: BASE_SHA, b: HEAD_SHA })

        // Assert
        expect(snapshots.calls).toEqual(["holdMap", "loadAlone s-a1b2c3d"])
        expect(compareStore.state().phase).toBe("noDifferences")
        expect(compareStore.isShowingNoDifferences()).toBe(true)
    })

    it("should report no differences when the loader kept only the head of two equal maps", async () => {
        // Arrange
        snapshots.pairLoad = { base: null, head: HEAD_CHECKSUM }

        // Act
        await service.start({ kind: "commits", folder: FOLDER, a: BASE_SHA, b: HEAD_SHA })

        // Assert
        expect(compareStore.state().phase).toBe("noDifferences")
        expect(compareStore.state().base?.checksum).toBe(HEAD_CHECKSUM)
    })

    it("should fail with rootMismatch and show the head alone when root names differ", async () => {
        // Arrange
        loadMapsOnLoad([aMap("billing-api@9f8e7d6", BASE_CHECKSUM, "other"), aMap("billing-api@a1b2c3d", HEAD_CHECKSUM)])

        // Act
        await service.start({ kind: "commits", folder: FOLDER, a: BASE_SHA, b: HEAD_SHA })

        // Assert
        expect(compareStore.state().error?.kind).toBe("rootMismatch")
        expect(selectionByChecksum()).toEqual({ [HEAD_CHECKSUM]: FileSelectionState.Partial })
    })

    it("should fail with loadFailed when a map could not be read", async () => {
        // Arrange
        snapshots.pairLoad = { base: BASE_CHECKSUM, head: null }

        // Act
        await service.start({ kind: "commits", folder: FOLDER, a: BASE_SHA, b: HEAD_SHA })

        // Assert
        expect(compareStore.state().error).toEqual({ kind: "loadFailed", message: "the analysis of a1b2c3d could not be read." })
    })

    it("should fail with loadFailed when the loaded maps are not in the store", async () => {
        // Arrange
        snapshots.beforeLoad = () => undefined

        // Act
        await service.start({ kind: "commits", folder: FOLDER, a: BASE_SHA, b: HEAD_SHA })

        // Assert
        expect(compareStore.state().error?.kind).toBe("loadFailed")
    })

    it("should stop on a same-commit status", async () => {
        // Arrange
        core.resolution = aResolvedComparison({ status: { kind: "sameCommit" } })

        // Act
        await service.start({ kind: "commits", folder: FOLDER, a: HEAD_SHA, b: HEAD_SHA })

        // Assert
        expect(compareStore.state().phase).toBe("stopped")
        expect(snapshots.calls).toEqual([])
    })

    it("should ask for a decision when a side has no snapshot and go on with the nearest one", async () => {
        // Arrange
        const nearest = aCommitSnapshot("3c4d5e6".padEnd(40, "0"), BASE_CHECKSUM)
        core.resolution = aResolvedComparison({
            base: {
                requested: aComparedCommit(BASE_SHA),
                status: { status: "missing", nearest: { snapshot: nearest, relation: "ancestor", staleBy: 2, behind: 2, ahead: 0 } }
            }
        })
        await service.start({ kind: "commits", folder: FOLDER, a: BASE_SHA, b: HEAD_SHA })
        const phaseBefore = compareStore.state().phase

        // Act
        await service.continueWithShownSnapshots()

        // Assert
        expect(phaseBefore).toBe("needsDecision")
        expect(snapshots.calls).toEqual(["holdMap", "loadPair s-3c4d5e6 s-a1b2c3d"])
        expect(compareStore.state().base?.staleBy).toBe(2)
    })

    it("should stay undecided when a missing side has no nearest snapshot", async () => {
        // Arrange
        core.resolution = aResolvedComparison({
            head: { requested: aComparedCommit(HEAD_SHA), status: { status: "missing", nearest: null } }
        })
        await service.start({ kind: "commits", folder: FOLDER, a: BASE_SHA, b: HEAD_SHA })

        // Act
        await service.continueWithShownSnapshots()

        // Assert
        expect(compareStore.state().phase).toBe("needsDecision")
        expect(snapshots.calls).toEqual([])
    })

    it("should fail with refNotFound for an input the folder does not have", async () => {
        // Arrange
        core.resolution = new DesktopBridgeError({ code: "UNKNOWN_REVISION", message: "The revision is not in the repository." })

        // Act
        await service.compareSides(COMPARED_FOLDER, { base: "main", head: "nope", baseMode: "mergeBase", unresolved: ["nope"] })

        // Assert
        expect(compareStore.state().error).toEqual({ kind: "refNotFound", message: "", input: "nope", folderLabel: "billing-api" })
    })

    it("should tell a stopped core from other core errors", async () => {
        // Arrange
        core.resolution = new DesktopBridgeError({ code: "CORE_UNAVAILABLE", message: "down" })
        await service.start({ kind: "withParent", folder: FOLDER, commit: HEAD_SHA })
        const unavailable = compareStore.state().error?.kind
        core.resolution = new DesktopBridgeError({ code: "UNKNOWN_REVISION", message: "The commit has no parent to compare with." })

        // Act
        await service.start({ kind: "withParent", folder: FOLDER, commit: HEAD_SHA })

        // Assert
        expect(unavailable).toBe("coreUnavailable")
        expect(compareStore.state().error).toEqual({ kind: "coreError", message: "The commit has no parent to compare with." })
    })

    it("should fail with loadFailed when loading throws", async () => {
        // Arrange
        snapshots.beforeLoad = () => {
            throw new Error("disk full")
        }

        // Act
        await service.start({ kind: "commits", folder: FOLDER, a: BASE_SHA, b: HEAD_SHA })

        // Assert
        expect(compareStore.state().error).toEqual({ kind: "loadFailed", message: "disk full" })
    })

    it("should ask the core with the commit on the map", async () => {
        // Arrange
        snapshots.commitOnMap = BASE_SHA
        const resolve = jest.spyOn(core, "resolve")

        // Act
        await service.start({ kind: "withCurrent", folder: FOLDER, commit: HEAD_SHA })

        // Assert
        expect(resolve).toHaveBeenCalledWith({ kind: "withCurrent", folder: FOLDER, commit: HEAD_SHA }, BASE_SHA)
    })

    it("should navigate to the metric view", async () => {
        // Arrange
        const navigate = jest.spyOn(TestBed.inject(Router), "navigateByUrl")

        // Act
        await service.start({ kind: "commits", folder: FOLDER, a: BASE_SHA, b: HEAD_SHA })

        // Assert
        expect(navigate).toHaveBeenCalledWith("/")
        expect(toast).not.toHaveBeenCalled()
    })

    it("should tell the user when the comparison leaves the domain view", async () => {
        // Arrange
        jest.spyOn(TestBed.inject(Router), "url", "get").mockReturnValue("/domain")

        // Act
        await service.start({ kind: "commits", folder: FOLDER, a: BASE_SHA, b: HEAD_SHA })

        // Assert
        expect(toast).toHaveBeenCalledWith("Compare runs in the metric view — the domain and dependency views show a single map.")
    })

    it("should switch a radial layout to the treemap and tell the user", async () => {
        // Arrange
        store.dispatch(setLayoutAlgorithm({ value: LayoutAlgorithm.RadialTreeMap }))

        // Act
        await service.start({ kind: "commits", folder: FOLDER, a: BASE_SHA, b: HEAD_SHA })

        // Assert
        expect(layoutAlgorithmSelector(state.getValue())).toBe(LayoutAlgorithm.SquarifiedTreeMap)
        expect(toast).toHaveBeenCalledWith("Switched to the treemap layout — the radial layouts show a single map.")
    })

    it("should drop a resolution that arrives after the user cancelled", async () => {
        // Arrange
        const started = service.start({ kind: "commits", folder: FOLDER, a: BASE_SHA, b: HEAD_SHA })

        // Act
        service.cancel()
        await started

        // Assert
        expect(compareStore.state().phase).toBe("idle")
        expect(snapshots.calls).toEqual([])
    })

    describe("missing analyses", () => {
        const NEAREST_SHA = "3c4d5e6".padEnd(40, "0")
        const missingBase = {
            requested: aComparedCommit(BASE_SHA, { kind: "branch", name: "main" }),
            status: { status: "missing", nearest: null }
        } as const
        const nearestBase = {
            requested: aComparedCommit(BASE_SHA, { kind: "branch", name: "main" }),
            status: {
                status: "missing",
                nearest: { snapshot: aCommitSnapshot(NEAREST_SHA), relation: "ancestor", staleBy: 2, behind: 2, ahead: 0 }
            }
        } as const

        async function settle() {
            for (let round = 0; round < 4; round++) {
                TestBed.tick()
                await new Promise(resolve => setTimeout(resolve))
            }
        }

        async function startWithoutBase() {
            core.resolution = aResolvedComparison({ base: missingBase })
            await service.start({ kind: "commits", folder: FOLDER, a: BASE_SHA, b: HEAD_SHA })
        }

        it("should ask for a decision when the base has no snapshot", async () => {
            // Act
            await startWithoutBase()

            // Assert
            expect(compareStore.state().phase).toBe("needsDecision")
            expect(snapshots.calls).toEqual([])
            expect(analyses.enqueued).toEqual([])
        })

        it("should analyse only the missing side", async () => {
            // Arrange
            await startWithoutBase()

            // Act
            await service.analyseMissing()

            // Assert
            expect(analyses.enqueued).toEqual([BASE_SHA])
            expect(compareStore.state().phase).toBe("analysing")
            expect(compareStore.state().analyses).toEqual([
                { side: "base", commit: BASE_SHA, shortCommit: "9f8e7d6", jobId: "job-9f8e7d6", failure: null }
            ])
            expect(snapshots.calls).toEqual(["holdMap"])
        })

        it("should resolve again and load the pair after both analyses finish", async () => {
            // Arrange
            core.resolution = aResolvedComparison({ base: missingBase, head: { ...missingBase, requested: aComparedCommit(HEAD_SHA) } })
            await service.start({ kind: "commits", folder: FOLDER, a: BASE_SHA, b: HEAD_SHA })
            await service.analyseMissing()
            core.resolution = aResolvedComparison()

            // Act
            analyses.setJob("job-9f8e7d6", { state: "done" })
            await settle()
            const whileOneRuns = compareStore.state().phase
            analyses.setJob("job-a1b2c3d", { state: "done" })
            await settle()

            // Assert
            expect(analyses.enqueued).toEqual([BASE_SHA, HEAD_SHA])
            expect(whileOneRuns).toBe("analysing")
            expect(core.intents).toHaveLength(2)
            expect(compareStore.state().phase).toBe("active")
        })

        it("should offer the nearest snapshot when an analysis fails", async () => {
            // Arrange
            core.resolution = aResolvedComparison({ base: nearestBase })
            await service.start({ kind: "commits", folder: FOLDER, a: BASE_SHA, b: HEAD_SHA })
            await service.analyseMissing()

            // Act
            analyses.setJob("job-9f8e7d6", { state: "failed", error: { code: "JAVA_TOO_OLD", message: "Java is too old.", hint: null } })
            await settle()

            // Assert
            expect(compareStore.state().phase).toBe("needsDecision")
            expect(compareStore.state().analyses[0].failure).toBe("Java is too old.")
            expect(compareStore.state().resolved?.base.status.status).toBe("missing")
        })

        it("should report a refused analysis as a failure without waiting", async () => {
            // Arrange
            await startWithoutBase()
            analyses.answers[BASE_SHA] = {
                status: "rejected",
                problems: [{ code: "CCSH_NOT_FOUND", severity: "error", message: "ccsh was not found.", hint: null }]
            }

            // Act
            await service.analyseMissing()
            await settle()

            // Assert
            expect(compareStore.state().phase).toBe("needsDecision")
            expect(compareStore.state().analyses[0].failure).toBe("ccsh was not found.")
        })

        it("should stop without loading when the batch is cancelled", async () => {
            // Arrange
            await startWithoutBase()
            await service.analyseMissing()

            // Act
            await service.cancelAnalyses()
            analyses.setJob("job-9f8e7d6", { state: "cancelled" })
            await settle()

            // Assert
            expect(analyses.cancelled).toEqual(["job-9f8e7d6"])
            expect(compareStore.state().phase).toBe("failed")
            expect(compareStore.state().error?.kind).toBe("analysisCancelled")
            expect(snapshots.calls).toEqual(["holdMap"])
        })

        it("should stop when an analysis of the batch is cancelled elsewhere", async () => {
            // Arrange
            await startWithoutBase()
            await service.analyseMissing()

            // Act
            analyses.setJob("job-9f8e7d6", { state: "cancelled" })
            await settle()

            // Assert
            expect(compareStore.state().error).toEqual({ kind: "analysisCancelled", message: "" })
        })

        it("should record stale-by per side when the nearest snapshot is used", async () => {
            // Arrange
            core.resolution = aResolvedComparison({ base: nearestBase })
            await service.start({ kind: "commits", folder: FOLDER, a: BASE_SHA, b: HEAD_SHA })
            snapshots.pairLoad = { base: `checksum-${NEAREST_SHA.slice(0, 7)}`, head: HEAD_CHECKSUM }
            loadMapsOnLoad([aMap("billing-api@3c4d5e6", `checksum-${NEAREST_SHA.slice(0, 7)}`), aMap("billing-api@a1b2c3d", HEAD_CHECKSUM)])

            // Act
            await service.continueWithShownSnapshots()

            // Assert
            expect(compareStore.state().phase).toBe("active")
            expect([compareStore.state().base?.staleBy, compareStore.state().head?.staleBy]).toEqual([2, 0])
            expect(compareStore.state().base?.snapshot.commit).toBe(NEAREST_SHA)
        })

        it("should warn when the two analysis profiles differ", async () => {
            // Arrange
            core.resolution = aResolvedComparison({
                preflight: { identicalChecksums: false, profilesDiffer: true, combinedBytes: 1, sizeVerdict: "ok" }
            })

            // Act
            await service.start({ kind: "commits", folder: FOLDER, a: BASE_SHA, b: HEAD_SHA })

            // Assert
            expect(compareStore.state().phase).toBe("needsDecision")
        })
    })

    describe("across two folders", () => {
        const FORK_FOLDER = { ref: FORK, label: "billing-fork" }
        const acrossFolders = (overrides = {}) =>
            aResolvedComparison({
                origin: "folders",
                head: {
                    requested: aComparedCommit(HEAD_SHA, { kind: "branch", name: "main" }, FORK),
                    status: { status: "exact", snapshot: aCommitSnapshot(HEAD_SHA) }
                },
                ...overrides
            })

        it("should send the head side in its own folder", async () => {
            // Arrange
            core.resolution = acrossFolders()

            // Act
            await service.compareSides(COMPARED_FOLDER, {
                base: "main",
                head: "main",
                baseMode: "mergeBase",
                unresolved: [],
                headFolder: FORK_FOLDER
            })

            // Assert
            expect(core.intents).toEqual([
                {
                    kind: "explicit",
                    base: { folder: FOLDER, rev: { kind: "rev", name: "main" } },
                    head: { folder: FORK, rev: { kind: "rev", name: "main" } },
                    baseMode: "mergeBase"
                }
            ])
            expect(TestBed.inject(RecentComparisonsRepo).read(FOLDER.projectId)).toEqual([
                expect.objectContaining({ folderId: FOLDER.folderId, headFolderId: FORK.folderId })
            ])
        })

        it("should compare the same commit of two folders as identical", async () => {
            // Arrange
            core.resolution = acrossFolders({
                head: {
                    requested: aComparedCommit(BASE_SHA, { kind: "branch", name: "main" }, FORK),
                    status: { status: "exact", snapshot: aCommitSnapshot(BASE_SHA) }
                },
                preflight: { identicalChecksums: true, profilesDiffer: false, combinedBytes: 10, sizeVerdict: "ok" }
            })
            snapshots.aloneChecksum = BASE_CHECKSUM
            loadMapsOnLoad([aMap("billing-fork@9f8e7d6", BASE_CHECKSUM)])

            // Act
            await service.compareSides(COMPARED_FOLDER, {
                base: "main",
                head: "main",
                baseMode: "tip",
                unresolved: [],
                headFolder: FORK_FOLDER
            })

            // Assert
            expect(snapshots.calls).toEqual(["holdMap", "loadAlone s-9f8e7d6"])
            expect(compareStore.state().phase).toBe("noDifferences")
        })

        it("should fall back to metric changes when no clone has both commits", async () => {
            // Arrange
            core.resolution = acrossFolders()
            core.changedFilesAnswer = { source: "unavailable", files: [] }

            // Act
            await service.compareSides(COMPARED_FOLDER, {
                base: "main",
                head: "main",
                baseMode: "tip",
                unresolved: [],
                headFolder: FORK_FOLDER
            })
            await Promise.resolve()

            // Assert
            expect(core.changedFilesRequests).toEqual([{ baseFolder: FOLDER, headFolder: FORK, base: BASE_SHA, head: HEAD_SHA }])
            expect(compareStore.state().changedFiles).toEqual({ source: "unavailable", files: [] })
        })

        it("should analyse each missing side in its own folder", async () => {
            // Arrange
            const missing = { status: "missing", nearest: null } as const
            core.resolution = acrossFolders({
                base: { requested: aComparedCommit(BASE_SHA), status: missing },
                head: { requested: aComparedCommit(BASE_SHA, { kind: "commit", name: "9f8e7d6" }, FORK), status: missing }
            })
            await service.compareSides(COMPARED_FOLDER, {
                base: "main",
                head: "main",
                baseMode: "tip",
                unresolved: [],
                headFolder: FORK_FOLDER
            })

            // Act
            await service.analyseMissing()

            // Assert
            expect(analyses.enqueued).toEqual([BASE_SHA, BASE_SHA])
            expect(analyses.enqueuedIn).toEqual([FOLDER.folderId, FORK.folderId])
        })

        it("should blame an unknown head on the head folder", async () => {
            // Arrange
            core.resolution = new DesktopBridgeError({ code: "UNKNOWN_REVISION", message: "unknown" })

            // Act
            await service.compareSides(COMPARED_FOLDER, {
                base: "main",
                head: "nope",
                baseMode: "tip",
                unresolved: ["nope"],
                headFolder: FORK_FOLDER
            })

            // Assert
            expect(compareStore.state().error).toEqual({ kind: "refNotFound", message: "", input: "nope", folderLabel: "billing-fork" })
        })
    })

    describe("against a snapshot without a commit", () => {
        it("should send a picked snapshot as that snapshot and not remember the comparison", async () => {
            // Arrange
            const resolved = aResolvedComparison()
            const workingTree = {
                ...resolved.head.requested,
                kind: "workingTree" as const,
                commit: null,
                shortCommit: null,
                snapshotId: "s-wt"
            }
            core.resolution = { ...resolved, head: { ...resolved.head, requested: workingTree } }

            // Act
            await service.compareSides(COMPARED_FOLDER, {
                base: "main",
                head: "Working tree (4 Nov 09:12)",
                baseMode: "tip",
                unresolved: [],
                headSnapshot: { kind: "workingTree", snapshotId: "s-wt" }
            })

            // Assert
            expect(core.intents).toEqual([
                {
                    kind: "explicit",
                    base: { folder: FOLDER, rev: { kind: "rev", name: "main" } },
                    head: { folder: FOLDER, rev: { kind: "workingTree", snapshotId: "s-wt" } },
                    baseMode: "tip"
                }
            ])
            expect(compareStore.state().phase).toBe("active")
            expect(TestBed.inject(RecentComparisonsRepo).read(FOLDER.projectId)).toEqual([])
        })
    })

    describe("swap and exit", () => {
        beforeEach(async () => {
            await service.start({ kind: "commits", folder: FOLDER, a: BASE_SHA, b: HEAD_SHA })
        })

        it("should switch reference and comparison and swap the sides", () => {
            // Act
            service.swap()

            // Assert
            expect(selectionByChecksum()).toEqual({
                [BASE_CHECKSUM]: FileSelectionState.Comparison,
                [HEAD_CHECKSUM]: FileSelectionState.Reference
            })
            expect(compareStore.state().base?.checksum).toBe(HEAD_CHECKSUM)
            expect(compareStore.isActive()).toBe(true)
        })

        it("should not swap a comparison that is no longer shown", () => {
            // Arrange
            store.dispatch(setStandard({ files: [state.getValue().files[0].file] }))

            // Act
            service.swap()

            // Assert
            expect(compareStore.state().base?.checksum).toBe(BASE_CHECKSUM)
        })

        it("should select the head before removing the base when leaving", () => {
            // Arrange
            dispatched = []

            // Act
            service.exit()

            // Assert
            expect(dispatched).toEqual(["SET_STANDARD", "REMOVE_FILES"])
            expect(selectionByChecksum()).toEqual({ [HEAD_CHECKSUM]: FileSelectionState.Partial })
        })

        it("should clear the filter when the comparison ends", () => {
            // Arrange
            store.dispatch(setChangedFilesFilter({ value: { source: "metrics" } }))

            // Act
            service.exit()

            // Assert
            expect(state.getValue().sharedView.changedFilesFilter).toBeNull()
        })

        it("should clear the comparison when leaving", () => {
            // Act
            service.exit()

            // Assert
            expect(compareStore.state().phase).toBe("idle")
            expect(compareStore.isActive()).toBe(false)
        })

        it("should leave the maps alone when the comparison is no longer shown", () => {
            // Arrange
            store.dispatch(setStandard({ files: [state.getValue().files[0].file] }))
            dispatched = []

            // Act
            service.exit()

            // Assert
            expect(dispatched).toEqual([])
            expect(state.getValue().files).toHaveLength(2)
        })
    })
})
