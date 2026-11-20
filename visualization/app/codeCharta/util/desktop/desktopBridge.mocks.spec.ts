import { CORE_PROTOCOL_VERSION } from "../../model/coreApi/coreApi"
import type { GitEntryKind } from "../../model/coreApi/GitEntryKind"
import type { GitFileChange } from "../../model/coreApi/GitFileChange"
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

function aLogCommitOf(sha: string) {
    return { sha, parents: [], authorName: "Mia", authorEmail: "mia@example.com", authoredAt: 1, committedAt: 1, subject: sha.slice(0, 7) }
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

    it("should page, scope and filter the seeded history and answer commit details", async () => {
        // Arrange
        const commitOf = (index: number, parents: string[]) => ({
            sha: index.toString(16).padStart(40, "0"),
            parents,
            authorName: index % 2 === 0 ? "Mia" : "Jo",
            authorEmail: "dev@example.com",
            authoredAt: index,
            committedAt: index,
            subject: `Commit ${index}`
        })
        const commits = Array.from({ length: 1200 }, (_, index) =>
            commitOf(1200 - index, index < 1199 ? [(1199 - index).toString(16).padStart(40, "0")] : [])
        )
        const side = commitOf(5000, [commits[1199].sha])
        const refs = {
            fingerprint: "f1",
            head: { kind: "branch" as const, name: "main", commit: commits[0].sha },
            localBranches: [],
            remoteBranches: [],
            tags: [{ refName: "refs/tags/side", name: "side", commit: side.sha, isAnnotated: false, createdAt: 1 }],
            remotes: []
        }
        const file = { change: "added" as const, path: "src/app/a.ts", previousPath: null, insertions: 1, deletions: 0 }
        const details = {
            ...commits[3],
            committerName: "Mia",
            committerEmail: "dev@example.com",
            message: "Commit",
            comparedToParent: null
        }
        const seed: FakeDesktopSeed = {
            git: {
                "f-1": {
                    refs,
                    commits: [...commits, side],
                    details: {
                        [commits[3].sha]: {
                            ...details,
                            files: [file],
                            areFilesTruncated: false,
                            totals: { filesChanged: 1, insertions: 1, deletions: 0 }
                        }
                    }
                }
            }
        }
        const bridge = new Function(`return (${createFakeDesktopBridge.toString()})(${JSON.stringify(seed)})`)() as FakeDesktopBridge
        const repo = { projectId: "p-1", folderId: "f-1" }
        const all = { kind: "all" as const }

        // Act
        const first = await answerValue(bridge, "git.log", { repo, scope: all, filter: null, cursor: null })
        const last = await answerValue(bridge, "git.log", { repo, scope: all, filter: null, cursor: "page-1000" })
        const expired = await bridge.request("git.log", { repo, scope: all, filter: null, cursor: "gone" })
        const scoped = await answerValue(bridge, "git.log", {
            repo,
            scope: { kind: "refs", refNames: ["refs/tags/side"] },
            filter: null,
            cursor: null
        })
        const byAuthor = await answerValue(bridge, "git.log", {
            repo,
            scope: all,
            filter: { text: "commit 1", author: "jo", path: null },
            cursor: null
        })
        const byPath = await answerValue(bridge, "git.log", {
            repo,
            scope: all,
            filter: { text: null, author: null, path: "src/app" },
            cursor: null
        })
        const listed = await answerValue(bridge, "git.commitDetails", { repo, sha: commits[3].sha })
        const derived = await answerValue(bridge, "git.commitDetails", { repo, sha: side.sha })
        const unknown = await bridge.request("git.commitDetails", { repo, sha: "f".repeat(40) })

        // Assert
        expect([first.commits.length, first.nextCursor, first.isGraphAvailable]).toEqual([500, "page-500", true])
        expect([last.commits.length, last.nextCursor]).toEqual([201, null])
        expect(expired).toEqual({ ok: false, error: expect.objectContaining({ code: "LOG_SESSION_EXPIRED" }) })
        expect(scoped.commits.map(commit => commit.sha)).toEqual([commits[1199].sha, side.sha])
        expect(byAuthor.isGraphAvailable).toBe(false)
        expect(byAuthor.commits.every(commit => commit.authorName === "Jo" && commit.subject.startsWith("Commit 1"))).toBe(true)
        expect(byPath.commits.map(commit => commit.sha)).toEqual([commits[3].sha])
        expect(listed.files).toEqual([file])
        expect(derived).toEqual(
            expect.objectContaining({ sha: side.sha, files: [], message: "Commit 5000", comparedToParent: commits[1199].sha })
        )
        expect(unknown).toEqual({ ok: false, error: expect.objectContaining({ code: "UNKNOWN_REVISION" }) })
    })

    it("should measure how far commits are apart and leave out unknown candidates", async () => {
        // Arrange
        const repo = { projectId: "p-1", folderId: "f-1" }
        const commitOf = (seed: string, parentSeeds: string[]) => ({
            sha: seed.repeat(40),
            parents: parentSeeds.map(parent => parent.repeat(40)),
            authorName: "Mia",
            authorEmail: "mia@example.com",
            authoredAt: 0,
            committedAt: 0,
            subject: seed
        })
        const base = commitOf("1", [])
        const main = commitOf("2", ["1"])
        const side = commitOf("3", ["1"])
        const tip = commitOf("4", ["2"])
        const bridge = createFakeDesktopBridge({ git: { "f-1": { commits: [tip, side, main, base] } } })

        // Act
        const measured = await answerValue(bridge, "git.measureDistances", {
            repo,
            target: tip.sha,
            candidates: [side.sha, base.sha, "f".repeat(40)]
        })

        // Assert
        expect(measured.distances).toEqual([
            { sha: side.sha, onlyInCandidate: 1, onlyInTarget: 2 },
            { sha: base.sha, onlyInCandidate: 0, onlyInTarget: 2 }
        ])
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

    it("should plan a clean-up that keeps the newest, the shown, branch tips and imports, then prune it", async () => {
        // Arrange
        const project = aProject("p-1", [aFolder("f-1")])
        project.view.shownSnapshotIdByFolder = { "f-1": "s-shown" }
        const analysedAt = (snapshotId: string, finishedAt: string, overrides: Partial<SnapshotSummary> = {}): SnapshotSummary => ({
            ...aSnapshot("p-1", "f-1", snapshotId, finishedAt),
            source: "analysed",
            target: "commit",
            finishedAt,
            ...overrides
        })
        const snapshots = [
            analysedAt("s-newest", "2026-11-05T00:00:00Z"),
            analysedAt("s-old", "2026-11-04T00:00:00Z"),
            analysedAt("s-shown", "2026-11-03T00:00:00Z"),
            analysedAt("s-tip", "2026-11-02T00:00:00Z", { commit: "b".repeat(40) }),
            analysedAt("s-tree", "2026-11-01T00:00:00Z", { target: "workingTree" }),
            aSnapshot("p-1", "f-1", "s-imported", NOW)
        ]
        const main = {
            refName: "refs/heads/main",
            name: "main",
            commit: "b".repeat(40),
            isCurrent: true,
            upstream: null,
            checkedOutInOtherWorktree: null,
            lastCommit: { subject: "Release", committedAt: 1 }
        }
        const refs = {
            fingerprint: "1",
            head: { kind: "branch" as const, name: "main", commit: main.commit },
            localBranches: [main],
            remoteBranches: [],
            tags: [],
            remotes: []
        }
        const bridge = createFakeDesktopBridge({ projects: [project], snapshots, git: { "f-1": { refs } } })
        const changed = jest.fn()
        bridge.subscribe("snapshots.changed", changed)
        const policy = { keepNewestCommitSnapshots: 1, keepNewestWorkingTreeSnapshots: 0, keepBranchTipsAndTags: true }

        // Act
        const plan = await answerValue(bridge, "snapshots.planPrune", { projectId: "p-1", folderId: "f-1", policy })
        const snapshotIds = plan.delete.map(snapshot => snapshot.ref.snapshotId)
        const pruned = await answerValue(bridge, "snapshots.prune", { projectId: "p-1", folderId: "f-1", snapshotIds, permanently: false })
        const { snapshots: remaining } = await answerValue(bridge, "snapshots.list", { projectId: "p-1", folderId: "f-1" })

        // Assert
        expect(snapshotIds).toEqual(["s-old", "s-tree"])
        expect(plan).toMatchObject({ keep: 3, freedBytes: 20 })
        expect(pruned).toEqual({ deleted: 2, freedBytes: 20 })
        expect(remaining.map(snapshot => snapshot.ref.snapshotId).sort()).toEqual(["s-imported", "s-newest", "s-shown", "s-tip"])
        expect(changed).toHaveBeenCalledWith({ projectId: "p-1", folderId: "f-1" })
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

    it("should read the seeded source files of a folder and find no other file", async () => {
        // Arrange
        const bridge = createFakeDesktopBridge({ sourceFiles: { "f-1/src/app.ts": "export const app = 1" } })
        const folderRef = { projectId: "p-1", folderId: "f-1" }

        // Act
        const seeded = await answerValue(bridge, "projects.readSourceFile", { ...folderRef, relativePath: "src/app.ts" })
        const other = await answerValue(bridge, "projects.readSourceFile", { ...folderRef, relativePath: "src/other.ts" })

        // Assert
        expect(new TextDecoder().decode((seeded as { bytes: Uint8Array }).bytes)).toBe("export const app = 1")
        expect(other).toBeNull()
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

        function trackingSeed(
            tracking: { ahead: number; behind: number },
            extra: Partial<NonNullable<FakeDesktopSeed["git"]>[string]> = {}
        ) {
            const seed = writableSeed(extra)
            const repository = seed.git?.["f-1"]
            const upstream = { refName: "refs/remotes/origin/x", name: "origin/x", isGone: false, ...tracking }
            if (repository?.refs && repository.status) {
                repository.refs.localBranches[0].upstream = upstream
                repository.status.upstream = upstream
            }
            return seed
        }

        async function statusOf(bridge: DesktopBridge) {
            const answer = await bridge.request("git.status", { repo })
            return answer.ok ? answer.value : null
        }

        it("should fast-forward a pull onto the upstream and refuse the modes it was seeded to refuse", async () => {
            // Arrange
            const refusal = { code: "NOT_FAST_FORWARD" as const, message: "Not possible to fast-forward, aborting.", details: {} }
            const bridge = createFakeDesktopBridge(trackingSeed({ ahead: 0, behind: 1 }, { pullRefusals: { rebase: refusal } }))

            // Act
            const refused = await bridge.request("git.pull", { repo, mode: "rebase" })
            const pulled = await bridge.request("git.pull", { repo, mode: "ffOnly" })
            const status = await statusOf(bridge)

            // Assert
            expect(errorCodeOf(refused)).toBe("NOT_FAST_FORWARD")
            expect(pulled.ok).toBe(true)
            expect(status?.head.commit).toBe(B)
            expect(status?.upstream).toEqual(expect.objectContaining({ ahead: 0, behind: 0 }))
        })

        it("should refuse a pull without an upstream", async () => {
            // Arrange
            const bridge = createFakeDesktopBridge(writableSeed())

            // Act
            const answer = await bridge.request("git.pull", { repo, mode: "ffOnly" })

            // Assert
            expect(errorCodeOf(answer)).toBe("NO_UPSTREAM")
        })

        it("should stop a merge pull on the seeded conflicts and abort the merge", async () => {
            // Arrange
            const bridge = createFakeDesktopBridge(trackingSeed({ ahead: 1, behind: 1 }, { pullConflicts: ["src/a.ts"] }))

            // Act
            const stopped = await bridge.request("git.pull", { repo, mode: "merge" })
            const merging = await statusOf(bridge)
            const wrongAbort = await bridge.request("git.abortOperation", { repo, operation: "rebase" })
            const aborted = await bridge.request("git.abortOperation", { repo, operation: "merge" })
            const after = await statusOf(bridge)

            // Assert
            expect(errorCodeOf(stopped)).toBe("CONFLICTS")
            expect(merging).toEqual(
                expect.objectContaining({ operationInProgress: "merge", counts: expect.objectContaining({ conflicted: 1 }) })
            )
            expect(errorCodeOf(wrongAbort)).toBe("NOT_ALLOWED")
            expect(aborted.ok).toBe(true)
            expect(after).toEqual(
                expect.objectContaining({ operationInProgress: null, counts: expect.objectContaining({ conflicted: 0 }) })
            )
        })

        it("should stop a rebase pull on the seeded conflicts as a rebase", async () => {
            // Arrange
            const bridge = createFakeDesktopBridge(trackingSeed({ ahead: 1, behind: 1 }, { pullConflicts: ["src/a.ts"] }))

            // Act
            await bridge.request("git.pull", { repo, mode: "rebase" })

            // Assert
            expect((await statusOf(bridge))?.operationInProgress).toBe("rebase")
        })

        it("should push onto the upstream, reject a push the remote is ahead of and force it only with the right lease", async () => {
            // Arrange
            const bridge = createFakeDesktopBridge(trackingSeed({ ahead: 2, behind: 1 }))
            const push = { repo, branchRefName: "refs/heads/main", remote: "origin", setUpstream: false }

            // Act
            const rejected = await bridge.request("git.push", { ...push, forceWithLeaseExpected: null })
            const stale = await bridge.request("git.push", { ...push, forceWithLeaseExpected: A })
            const forced = await bridge.request("git.push", { ...push, forceWithLeaseExpected: B })
            const remote = await bridge.request("git.branches", { repo })

            // Assert
            expect([rejected, stale].map(errorCodeOf)).toEqual(["PUSH_REJECTED", "STALE_PUSH_LEASE"])
            expect(forced.ok).toBe(true)
            expect(remote.ok && remote.value.remoteBranches[0].commit).toBe(A)
            expect((await statusOf(bridge))?.upstream).toEqual(expect.objectContaining({ ahead: 0, behind: 0 }))
        })

        it("should publish a branch without upstream to the remote and track it", async () => {
            // Arrange
            const bridge = createFakeDesktopBridge(writableSeed())

            // Act
            const answer = await bridge.request("git.push", {
                repo,
                branchRefName: "refs/heads/main",
                remote: "origin",
                setUpstream: true,
                forceWithLeaseExpected: null
            })
            const branches = await bridge.request("git.branches", { repo })

            // Assert
            expect(answer.ok).toBe(true)
            expect(branches.ok && branches.value.remoteBranches.map(branch => branch.name)).toEqual(["origin/x", "origin/main"])
            expect((await statusOf(bridge))?.upstream).toEqual(expect.objectContaining({ name: "origin/main", ahead: 0, behind: 0 }))
        })

        it("should refuse to push a branch it does not know", async () => {
            // Arrange
            const bridge = createFakeDesktopBridge(writableSeed())

            // Act
            const answer = await bridge.request("git.push", {
                repo,
                branchRefName: "refs/heads/gone",
                remote: "origin",
                setUpstream: false,
                forceWithLeaseExpected: null
            })

            // Assert
            expect(errorCodeOf(answer)).toBe("NOT_FOUND")
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
