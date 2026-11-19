import { CORE_PROTOCOL_VERSION } from "../../model/coreApi/coreApi"
import type { PickedFolder } from "../../model/coreApi/PickedFolder"
import type { PickedImportFile } from "../../model/coreApi/PickedImportFile"
import type { Project } from "../../model/coreApi/Project"
import type { ProjectFolder } from "../../model/coreApi/ProjectFolder"
import type { SnapshotSummary } from "../../model/coreApi/SnapshotSummary"
import type { BridgeMethod, DesktopBridge } from "./desktopBridge"
import { createFakeDesktopBridge, FakeDesktopBridge, FakeDesktopSeed } from "./desktopBridge.mocks"

const TOOL_FAILURE = { code: "TOOL_FAILED" as const, message: "git failed", details: {} }
const NOW = "2026-11-19T08:00:00Z"

function aPickedFolder(name: string): PickedFolder {
    return { pickToken: name.padEnd(32, "0"), path: `/work/${name}`, suggestedLabel: name, kind: "git", git: null }
}

const HINTED_COMMIT = {
    commit: "a1b2c3d".padEnd(40, "0"),
    shortCommit: "a1b2c3d",
    subject: "Add billing",
    authorName: "Ada",
    authorDate: NOW
}

function aPickedImportFile(overrides: Partial<PickedImportFile> = {}): PickedImportFile {
    return {
        importToken: "c".repeat(32),
        fileName: "a1b2c3d.billing.cc.json",
        sizeBytes: 42,
        fileModifiedAt: NOW,
        commitHint: null,
        containingFolder: { pickToken: "d".repeat(32), path: "/downloads/out", suggestedName: "out", kind: "plain", git: null },
        hintCommit: null,
        existingTarget: null,
        duplicateOf: null,
        ...overrides
    }
}

async function pickImportFile(bridge: DesktopBridge) {
    const picked = await answerValue(bridge, "snapshots.pickImportFile", { title: "Open cc.json" })
    if (picked === null) {
        throw new Error("The fake picked no file")
    }
    return picked
}

function aFolder(id: string, overrides: Partial<ProjectFolder> = {}): ProjectFolder {
    return {
        id,
        path: `/work/${id}`,
        label: id,
        role: "primary",
        kind: "git",
        git: null,
        addedAt: NOW,
        status: "ok",
        relationships: [],
        snapshotCount: 0,
        ...overrides
    }
}

function aProject(id: string, folders: ProjectFolder[]): Project {
    return {
        id,
        name: id,
        description: null,
        createdAt: NOW,
        updatedAt: NOW,
        folders,
        analysisProfile: { exclude: [], without: [], parallel: true },
        view: { workingFolderId: folders[0]?.id ?? null, shownSnapshotIdByFolder: {} }
    }
}

function aSnapshot(projectId: string, folderId: string, snapshotId: string, createdAt: string): SnapshotSummary {
    return {
        ref: { projectId, folderId, snapshotId },
        source: "imported",
        createdAt,
        commit: null,
        shortCommit: null,
        subject: null,
        commitDate: null,
        dirty: false,
        originalFileName: `${snapshotId}.cc.json`,
        fileModifiedAt: null,
        mapBytes: 10,
        checksum: null,
        profileHash: null,
        target: null,
        finishedAt: null,
        durationMs: null,
        notInMap: []
    }
}

async function answerValue<Method extends BridgeMethod>(
    bridge: DesktopBridge,
    method: Method,
    params: Parameters<typeof bridge.request<Method>>[1]
) {
    const answer = await bridge.request(method, params)
    if (answer.ok) {
        return answer.value
    }
    throw new Error(`${method} failed: ${JSON.stringify(answer)}`)
}

async function pickFolder(bridge: DesktopBridge) {
    const picked = await answerValue(bridge, "projects.pickFolder", { title: "Add Folder" })
    if (picked === null) {
        throw new Error("The fake picked no folder")
    }
    return picked
}

async function pickAndCreate(bridge: DesktopBridge, name: string) {
    const picked = await pickFolder(bridge)
    return answerValue(bridge, "projects.create", {
        name,
        folders: [{ pickToken: picked.pickToken, label: picked.suggestedLabel, role: "helper" }]
    })
}

describe("createFakeDesktopBridge", () => {
    it("should speak the protocol version of the contract by default", () => {
        // Arrange
        const bridge = createFakeDesktopBridge()

        // Act
        const { protocolVersion } = bridge

        // Assert
        expect(protocolVersion).toBe(CORE_PROTOCOL_VERSION)
    })

    it("should record each call", async () => {
        // Arrange
        const bridge = createFakeDesktopBridge({ responses: { "core.ping": { coreVersion: "0.1.0" } } })

        // Act
        await bridge.request("core.ping", {}, { operationId: "op-1" })
        await bridge.cancel("op-1")
        await bridge.reveal({ kind: "storeRoot" })

        // Assert
        expect(bridge.calls).toEqual([
            { name: "request", args: ["core.ping", {}, { operationId: "op-1" }] },
            { name: "cancel", args: ["op-1"] },
            { name: "reveal", args: [{ kind: "storeRoot" }] }
        ])
    })

    it("should answer a seeded method with its value", async () => {
        // Arrange
        const bridge = createFakeDesktopBridge({ responses: { "core.ping": { coreVersion: "0.1.0" } } })

        // Act
        const result = await bridge.request("core.ping", {})

        // Assert
        expect(result).toEqual({ ok: true, value: { coreVersion: "0.1.0" } })
    })

    it("should fail a seeded method", async () => {
        // Arrange
        const bridge = createFakeDesktopBridge({ failures: { "tools.doctor": TOOL_FAILURE } })

        // Act
        const result = await bridge.request("tools.doctor", { refresh: true })

        // Assert
        expect(result).toEqual({ ok: false, error: TOOL_FAILURE })
    })

    it("should fail a method nobody seeded with NOT_FOUND", async () => {
        // Arrange
        const bridge = createFakeDesktopBridge()

        // Act
        const result = await bridge.request("paths.get", {})

        // Assert
        expect(result).toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "NOT_FOUND" }) }))
    })

    it("should let a test change the answers after creation", async () => {
        // Arrange
        const bridge = createFakeDesktopBridge({ failures: { "core.ping": TOOL_FAILURE } })

        // Act
        bridge.respondWith("core.ping", { coreVersion: "1.0.0" })
        const answered = await bridge.request("core.ping", {})
        bridge.failWith("core.ping", TOOL_FAILURE)
        const failed = await bridge.request("core.ping", {})

        // Assert
        expect(answered).toEqual({ ok: true, value: { coreVersion: "1.0.0" } })
        expect(failed).toEqual({ ok: false, error: TOOL_FAILURE })
    })

    it("should answer the pickers and shell actions with seeds or cancelled defaults", async () => {
        // Arrange
        const bridge = createFakeDesktopBridge({ responses: { pickFolder: "/projects/app" } })

        // Act
        const folder = await bridge.pickFolder({ title: "Folder" })
        const file = await bridge.pickFile({ title: "File" })
        const chosen = await bridge.chooseStoreRoot({ title: "Store" })

        // Assert
        expect(folder).toBe("/projects/app")
        expect(file).toBeNull()
        expect(chosen).toEqual({ ok: true, value: null })
    })

    it("should create and list a project", async () => {
        // Arrange
        const bridge = createFakeDesktopBridge({ pickedFolders: [aPickedFolder("billing")], now: NOW })

        // Act
        const created = await pickAndCreate(bridge, "Billing")
        const listed = await answerValue(bridge, "projects.list", {})
        const fetched = await answerValue(bridge, "projects.get", { projectId: created.id })

        // Assert
        expect(created.folders).toEqual([
            expect.objectContaining({ path: "/work/billing", label: "billing", role: "primary", status: "ok", addedAt: NOW })
        ])
        expect(created.view.workingFolderId).toBe(created.folders[0].id)
        expect(listed.projects).toEqual([
            {
                id: created.id,
                name: "Billing",
                updatedAt: NOW,
                folders: [{ id: created.folders[0].id, label: "billing", role: "primary", kind: "git", status: "ok" }],
                folderCount: 1,
                missingFolderCount: 0,
                snapshotCount: 0,
                problem: null
            }
        ])
        expect(fetched).toEqual(created)
    })

    it("should report a seeded missing folder", async () => {
        // Arrange
        const project = aProject("p-1", [aFolder("f-1"), aFolder("f-2", { role: "helper", status: "missing" })])
        const bridge = createFakeDesktopBridge({ projects: [project], snapshots: [aSnapshot("p-1", "f-1", "s-1", NOW)] })

        // Act
        const listed = await answerValue(bridge, "projects.list", {})
        const fetched = await answerValue(bridge, "projects.get", { projectId: "p-1" })

        // Assert
        expect(listed.projects).toEqual([
            expect.objectContaining({ id: "p-1", name: "p-1", folderCount: 2, missingFolderCount: 1, snapshotCount: 1, problem: null })
        ])
        expect(listed.projects[0].folders.map(folder => [folder.id, folder.role, folder.status])).toEqual([
            ["f-1", "primary", "ok"],
            ["f-2", "helper", "missing"]
        ])
        expect(fetched.folders.map(folder => [folder.status, folder.snapshotCount])).toEqual([
            ["ok", 1],
            ["missing", 0]
        ])
    })

    it("should accept each pick token once", async () => {
        // Arrange
        const bridge = createFakeDesktopBridge({ pickedFolders: [aPickedFolder("billing")] })
        const picked = await pickFolder(bridge)
        const folders = [{ pickToken: picked.pickToken, label: "billing", role: "primary" as const }]
        await answerValue(bridge, "projects.create", { name: "First", folders })

        // Act
        const reused = await bridge.request("projects.create", { name: "Second", folders })
        const pickedAgain = await bridge.request("projects.pickFolder", { title: "Add Folder" })

        // Assert
        expect(reused).toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "TOKEN_EXPIRED" }) }))
        expect(pickedAgain).toEqual({ ok: true, value: null })
    })

    it("should keep one primary folder and unique labels", async () => {
        // Arrange
        const bridge = createFakeDesktopBridge({ pickedFolders: [aPickedFolder("api"), aPickedFolder("fork"), aPickedFolder("other")] })
        const project = await pickAndCreate(bridge, "Api")
        const fork = await pickFolder(bridge)
        const other = await pickFolder(bridge)

        // Act
        const added = await answerValue(bridge, "projects.addFolder", {
            projectId: project.id,
            folder: { pickToken: fork.pickToken, label: "fork", role: "primary" }
        })
        const duplicate = await bridge.request("projects.addFolder", {
            projectId: project.id,
            folder: { pickToken: other.pickToken, label: "API", role: "helper" }
        })

        // Assert
        expect(added.folders.map(folder => [folder.label, folder.role])).toEqual([
            ["api", "helper"],
            ["fork", "primary"]
        ])
        expect(duplicate).toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "DUPLICATE_LABEL" }) }))
    })

    it("should change, relink, refresh and remove folders", async () => {
        // Arrange
        const project = aProject("p-1", [aFolder("f-1"), aFolder("f-2", { role: "helper", status: "missing" })])
        const bridge = createFakeDesktopBridge({
            projects: [project],
            snapshots: [aSnapshot("p-1", "f-1", "s-1", NOW)],
            pickedFolders: [aPickedFolder("moved")]
        })
        const moved = await pickFolder(bridge)

        // Act
        await answerValue(bridge, "projects.updateFolder", { projectId: "p-1", folderId: "f-2", label: "renamed" })
        const relinked = await answerValue(bridge, "projects.relinkFolder", {
            projectId: "p-1",
            folderId: "f-2",
            pickToken: moved.pickToken
        })
        await answerValue(bridge, "projects.refreshFolder", { projectId: "p-1", folderId: "f-2" })
        const removed = await answerValue(bridge, "projects.removeFolder", { projectId: "p-1", folderId: "f-1", permanently: false })
        const snapshots = await answerValue(bridge, "snapshots.list", { projectId: "p-1", folderId: "f-1" })

        // Assert
        expect(relinked.folders[1]).toEqual(expect.objectContaining({ label: "renamed", path: "/work/moved", status: "ok" }))
        expect(removed.folders.map(folder => [folder.id, folder.role])).toEqual([["f-2", "primary"]])
        expect(removed.view.workingFolderId).toBe("f-2")
        expect(snapshots.snapshots).toEqual([])
    })

    it("should update and delete a project and forget it as the active one", async () => {
        // Arrange
        const bridge = createFakeDesktopBridge({ projects: [aProject("p-1", [aFolder("f-1")])], activeProjectId: "p-1" })
        const activeBefore = await answerValue(bridge, "projects.getActive", {})

        // Act
        const updated = await answerValue(bridge, "projects.update", { projectId: "p-1", name: "Renamed", description: "About" })
        await answerValue(bridge, "projects.delete", { projectId: "p-1", permanently: false })
        const activeAfter = await answerValue(bridge, "projects.getActive", {})
        const deleted = await bridge.request("projects.get", { projectId: "p-1" })

        // Assert
        expect(activeBefore).toEqual({ activeProjectId: "p-1" })
        expect([updated.name, updated.description]).toEqual(["Renamed", "About"])
        expect(activeAfter).toEqual({ activeProjectId: null })
        expect(deleted).toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "NOT_FOUND" }) }))
    })

    it("should remember the active project and the view", async () => {
        // Arrange
        const bridge = createFakeDesktopBridge({ projects: [aProject("p-1", [aFolder("f-1")])] })
        const view = { workingFolderId: "f-1", shownSnapshotIdByFolder: { "f-1": "s-1" } }

        // Act
        await answerValue(bridge, "projects.setActive", { projectId: "p-1" })
        await answerValue(bridge, "projects.setView", { projectId: "p-1", view })
        const unknown = await bridge.request("projects.setActive", { projectId: "p-2" })

        // Assert
        expect(await answerValue(bridge, "projects.getActive", {})).toEqual({ activeProjectId: "p-1" })
        expect((await answerValue(bridge, "projects.get", { projectId: "p-1" })).view).toEqual(view)
        expect(unknown).toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "NOT_FOUND" }) }))
    })

    it("should list snapshots newest first, record their map facts and delete them", async () => {
        // Arrange
        const older = aSnapshot("p-1", "f-1", "s-old", "2026-11-01T00:00:00Z")
        const newer = aSnapshot("p-1", "f-1", "s-new", "2026-11-02T00:00:00Z")
        const project = aProject("p-1", [aFolder("f-1")])
        project.view.shownSnapshotIdByFolder = { "f-1": "s-old" }
        const bridge = createFakeDesktopBridge({ projects: [project], snapshots: [older, newer] })

        // Act
        const listed = await answerValue(bridge, "snapshots.list", { projectId: "p-1", folderId: "f-1" })
        await answerValue(bridge, "snapshots.recordMapFacts", { ...newer.ref, checksum: "abc123", rootName: "root" })
        await answerValue(bridge, "snapshots.delete", { ...older.ref, permanently: false })
        const remaining = await answerValue(bridge, "snapshots.list", { projectId: "p-1", folderId: "f-1" })

        // Assert
        expect(listed.snapshots.map(snapshot => snapshot.ref.snapshotId)).toEqual(["s-new", "s-old"])
        expect(remaining.snapshots).toEqual([{ ...newer, checksum: "abc123" }])
        expect((await answerValue(bridge, "projects.get", { projectId: "p-1" })).view.shownSnapshotIdByFolder).toEqual({})
    })

    it("should open a picked file into a new project named after its folder and only once", async () => {
        // Arrange
        const bridge = createFakeDesktopBridge({ pickedImportFile: aPickedImportFile(), now: NOW })
        const firstPick = await pickImportFile(bridge)

        // Act
        const opened = await answerValue(bridge, "snapshots.openFile", {
            importToken: firstPick.importToken,
            target: null,
            bindToCommit: null
        })
        const secondPick = await pickImportFile(bridge)
        const openedAgain = await answerValue(bridge, "snapshots.openFile", {
            importToken: secondPick.importToken,
            target: null,
            bindToCommit: null
        })
        const listed = await answerValue(bridge, "snapshots.list", opened.snapshot.ref)

        // Assert
        expect(opened).toEqual(expect.objectContaining({ createdProject: true, wasAlreadyImported: false }))
        expect(opened.project).toEqual(expect.objectContaining({ name: "out" }))
        expect(opened.project.folders).toEqual([expect.objectContaining({ path: "/downloads/out", kind: "plain", role: "primary" })])
        expect(opened.snapshot).toEqual(
            expect.objectContaining({ source: "imported", originalFileName: "a1b2c3d.billing.cc.json", createdAt: NOW, commit: null })
        )
        expect(openedAgain).toEqual(expect.objectContaining({ createdProject: false, wasAlreadyImported: true, snapshot: opened.snapshot }))
        expect(listed.snapshots).toHaveLength(1)
    })

    it("should open a file into the project that already has its folder and bind it to the hinted commit", async () => {
        // Arrange
        const pickedImportFile = aPickedImportFile({
            hintCommit: HINTED_COMMIT,
            existingTarget: { projectId: "p-1", projectName: "p-1", folderId: "f-1" }
        })
        const bridge = createFakeDesktopBridge({ projects: [aProject("p-1", [aFolder("f-1")])], pickedImportFile })
        const picked = await pickImportFile(bridge)

        // Act
        const opened = await answerValue(bridge, "snapshots.openFile", {
            importToken: picked.importToken,
            target: null,
            bindToCommit: HINTED_COMMIT.commit
        })

        // Assert
        expect(opened).toEqual(expect.objectContaining({ createdProject: false, wasAlreadyImported: false }))
        expect(opened.snapshot.ref).toEqual(expect.objectContaining({ projectId: "p-1", folderId: "f-1" }))
        expect(opened.snapshot).toEqual(
            expect.objectContaining({ commit: HINTED_COMMIT.commit, shortCommit: "a1b2c3d", subject: "Add billing" })
        )
    })

    it("should import a picked file into a chosen folder and refuse a commit the folder does not have", async () => {
        // Arrange
        const bridge = createFakeDesktopBridge({ projects: [aProject("p-1", [aFolder("f-1")])], pickedImportFile: aPickedImportFile() })
        const picked = await pickImportFile(bridge)
        const target = { projectId: "p-1", folderId: "f-1", importToken: picked.importToken }

        // Act
        const unknownCommit = await bridge.request("snapshots.import", { ...target, bindToCommit: "f".repeat(40) })
        const imported = await answerValue(bridge, "snapshots.import", { ...target, bindToCommit: null })
        const reused = await bridge.request("snapshots.import", { ...target, bindToCommit: null })

        // Assert
        expect(unknownCommit).toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "NOT_A_COMMIT" }) }))
        expect(imported.ref).toEqual(expect.objectContaining({ projectId: "p-1", folderId: "f-1" }))
        expect(reused).toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "TOKEN_EXPIRED" }) }))
    })

    it("should resolve a seeded commit of a folder and bind a snapshot to it while moving it", async () => {
        // Arrange
        const project = aProject("p-1", [aFolder("f-1"), aFolder("f-2")])
        project.view.shownSnapshotIdByFolder = { "f-1": "s-1" }
        const bridge = createFakeDesktopBridge({
            projects: [project],
            snapshots: [aSnapshot("p-1", "f-1", "s-1", NOW)],
            commits: { "f-2": [HINTED_COMMIT] }
        })
        const ref = { projectId: "p-1", folderId: "f-1", snapshotId: "s-1" }

        // Act
        const found = await answerValue(bridge, "projects.resolveCommit", { projectId: "p-1", folderId: "f-2", hash: "a1b2c3d" })
        const notFound = await answerValue(bridge, "projects.resolveCommit", { projectId: "p-1", folderId: "f-1", hash: "a1b2c3d" })
        const refused = await bridge.request("snapshots.move", { ...ref, toFolderId: "f-1", bindToCommit: HINTED_COMMIT.commit })
        const unknown = await bridge.request("snapshots.move", { ...ref, toFolderId: "f-9", bindToCommit: null })
        const moved = await answerValue(bridge, "snapshots.move", { ...ref, toFolderId: "f-2", bindToCommit: HINTED_COMMIT.commit })
        const view = (await answerValue(bridge, "projects.get", { projectId: "p-1" })).view

        // Assert
        expect(found.commit).toEqual(HINTED_COMMIT)
        expect(notFound.commit).toBeNull()
        expect(refused).toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "NOT_A_COMMIT" }) }))
        expect(unknown).toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "NOT_FOUND" }) }))
        expect(moved).toEqual(expect.objectContaining({ shortCommit: "a1b2c3d", ref: expect.objectContaining({ folderId: "f-2" }) }))
        expect(view.shownSnapshotIdByFolder).toEqual({ "f-2": moved.ref.snapshotId })
    })

    it("should hand out the folder of a picked file for a new project", async () => {
        // Arrange
        const bridge = createFakeDesktopBridge({ pickedImportFile: aPickedImportFile() })
        const picked = await pickImportFile(bridge)

        // Act
        const created = await answerValue(bridge, "projects.create", {
            name: "Downloads",
            folders: [{ pickToken: picked.containingFolder.pickToken, label: "out", role: "primary" }]
        })

        // Assert
        expect(created.folders).toEqual([expect.objectContaining({ path: "/downloads/out", kind: "plain" })])
    })

    it("should answer the seeded git status and log of a folder and refuse an unseeded one", async () => {
        // Arrange
        const status = {
            head: { kind: "branch" as const, name: "main", commit: "a".repeat(40) },
            upstream: null,
            counts: { staged: 0, unstaged: 0, untracked: 0, conflicted: 0 },
            operationInProgress: null
        }
        const commit = {
            sha: "a".repeat(40),
            parents: [],
            authorName: "Mia",
            authorEmail: "mia@example.com",
            authoredAt: 1,
            committedAt: 1,
            subject: "Start"
        }
        const bridge = createFakeDesktopBridge({ gitStatuses: { "f-1": status }, gitLogs: { "f-1": [commit] } })
        const repo = { projectId: "p-1", folderId: "f-1" }

        // Act
        const answeredStatus = await answerValue(bridge, "git.status", { repo })
        const log = await answerValue(bridge, "git.log", { repo, scope: { kind: "head" }, filter: null, cursor: null })
        const unseeded = await bridge.request("git.status", { repo: { projectId: "p-1", folderId: "f-2" } })

        // Assert
        expect(answeredStatus).toEqual(status)
        expect(log).toEqual({ commits: [commit], nextCursor: null, isGraphAvailable: true })
        expect(unseeded).toEqual({ ok: false, error: expect.objectContaining({ code: "NOT_A_REPOSITORY" }) })
    })

    it("should answer the repository, refs and fingerprint of a seeded git folder and fail a seeded method", async () => {
        // Arrange
        const head = { kind: "branch" as const, name: "main", commit: "a".repeat(40) }
        const info = {
            repositoryId: "/work/api/.git",
            rootPath: "/work/api",
            folderPrefix: "",
            isShallow: false,
            isLinkedWorktree: false,
            gitVersion: "2.56.0"
        }
        const refs = { fingerprint: "f1", head, localBranches: [], remoteBranches: [], tags: [], remotes: [] }
        const failure = { code: "INDEX_LOCKED" as const, message: "locked", details: {} }
        const seed: FakeDesktopSeed = { git: { "f-1": { info, refs, failures: { "git.status": failure } } } }
        const rebuild = new Function(`return (${createFakeDesktopBridge.toString()})(${JSON.stringify(seed)})`)
        const repo = { projectId: "p-1", folderId: "f-1" }

        // Act
        const answers = await Promise.all(
            [createFakeDesktopBridge(seed), rebuild() as FakeDesktopBridge].map(bridge =>
                Promise.all([
                    bridge.request("git.repositoryInfo", { repo }),
                    bridge.request("git.branches", { repo }),
                    bridge.request("git.refsFingerprint", { repo }),
                    bridge.request("git.status", { repo }),
                    bridge.request("git.log", { repo, scope: { kind: "all" }, filter: null, cursor: null })
                ])
            )
        )

        // Assert
        const expected = [
            { ok: true, value: info },
            { ok: true, value: refs },
            { ok: true, value: "f1" },
            { ok: false, error: failure },
            { ok: false, error: expect.objectContaining({ code: "NOT_A_REPOSITORY" }) }
        ]
        expect(answers).toEqual([expected, expected])
    })

    it("should sum the map sizes of each folder as its store usage", async () => {
        // Arrange
        const project = aProject("p-1", [aFolder("f-1"), aFolder("f-2", { role: "helper" })])
        const snapshots = [aSnapshot("p-1", "f-1", "s-1", NOW), aSnapshot("p-1", "f-1", "s-2", NOW)]
        const bridge = createFakeDesktopBridge({ projects: [project], snapshots })

        // Act
        const usage = await answerValue(bridge, "snapshots.usage", { projectId: "p-1" })

        // Assert
        const bytes = snapshots[0].mapBytes
        expect(usage).toEqual({
            totalBytes: 2 * bytes,
            folders: [
                { folderId: "f-1", snapshotCount: 2, bytes: 2 * bytes },
                { folderId: "f-2", snapshotCount: 0, bytes: 0 }
            ]
        })
    })

    it("should read a seeded map in chunks", async () => {
        // Arrange
        const ref = { projectId: "p-1", folderId: "f-1", snapshotId: "s-1" }
        const bridge = createFakeDesktopBridge({ snapshotMaps: { "s-1": [31, 139, 8, 0, 1, 2] } })

        // Act
        const firstChunk = await answerValue(bridge, "snapshots.readMapChunk", { ...ref, offset: 0, length: 4 })
        const lastChunk = await answerValue(bridge, "snapshots.readMapChunk", { ...ref, offset: 4, length: 4 })
        const unknown = await bridge.request("snapshots.readMapChunk", { ...ref, snapshotId: "s-2", offset: 0, length: 4 })

        // Assert
        expect(firstChunk).toEqual({ bytes: new Uint8Array([31, 139, 8, 0]), offset: 0, totalBytes: 6 })
        expect(lastChunk).toEqual({ bytes: new Uint8Array([1, 2]), offset: 4, totalBytes: 6 })
        expect(unknown).toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "NOT_FOUND" }) }))
    })

    it("should prefer a seeded answer over its own projects", async () => {
        // Arrange
        const seededList = { projects: [] }
        const bridge = createFakeDesktopBridge({
            projects: [aProject("p-1", [aFolder("f-1")])],
            responses: { "projects.list": seededList }
        })

        // Act
        const listed = await answerValue(bridge, "projects.list", {})
        const status = await answerValue(bridge, "store.status", {})

        // Assert
        expect(listed).toBe(seededList)
        expect(status).toEqual({ problem: null })
    })

    it("should answer the methods of the shell as if nothing was picked or found", async () => {
        // Arrange
        const bridge = createFakeDesktopBridge()
        const folderRef = { projectId: "p-1", folderId: "f-1" }

        // Act
        const picked = await bridge.request("projects.pickFolder", { title: "Add Folder" })
        const sourceFile = await bridge.request("projects.readSourceFile", { ...folderRef, relativePath: "src/app.ts" })
        const revealed = await bridge.request("projects.revealFolder", folderRef)
        const pickedFile = await bridge.request("snapshots.pickImportFile", { title: "Open cc.json" })

        // Assert
        expect([picked, sourceFile, revealed, pickedFile]).toEqual([
            { ok: true, value: null },
            { ok: true, value: null },
            { ok: true, value: null },
            { ok: true, value: null }
        ])
    })

    it("should deliver emitted events", () => {
        // Arrange
        const bridge = createFakeDesktopBridge()
        const handler = jest.fn()
        bridge.subscribe("core.progress", handler)
        const progress = { requestId: "op-1", message: "git", done: 1, total: 5 }

        // Act
        bridge.emit("core.progress", progress)

        // Assert
        expect(handler).toHaveBeenCalledWith(progress)
    })

    it("should deliver the current core state first and then every change", async () => {
        // Arrange
        const bridge = createFakeDesktopBridge({ coreState: { state: "starting", message: null } })
        const states: string[] = []

        // Act
        bridge.subscribe("shell.coreState", coreState => states.push(coreState.state))
        await Promise.resolve()
        bridge.emit("shell.coreState", { state: "ready", message: null })

        // Assert
        expect(states).toEqual(["starting", "ready"])
    })

    it("should stop delivering after unsubscribing", () => {
        // Arrange
        const bridge = createFakeDesktopBridge()
        const handler = jest.fn()
        const unsubscribe = bridge.subscribe("core.progress", handler)

        // Act
        unsubscribe()
        bridge.emit("core.progress", { requestId: "op-1", message: "git", done: null, total: null })

        // Assert
        expect(handler).not.toHaveBeenCalled()
    })

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

    it("should work when rebuilt from its own source text", async () => {
        // Arrange
        const seed: FakeDesktopSeed = {
            protocolVersion: 7,
            responses: { "core.ping": { coreVersion: "0.1.0" } },
            pickedFolders: [aPickedFolder("billing")]
        }
        const rebuild = new Function(`return (${createFakeDesktopBridge.toString()})(${JSON.stringify(seed)})`)

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
