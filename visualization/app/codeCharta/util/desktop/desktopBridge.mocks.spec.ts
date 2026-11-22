import { CORE_PROTOCOL_VERSION } from "../../model/coreApi/coreApi"
import type { SnapshotSummary } from "../../model/coreApi/SnapshotSummary"
import { createFakeDesktopBridge, FakeDesktopBridge, FakeDesktopSeed, fakeDesktopBridgeSource } from "./desktopBridge.mocks"
import {
    aFolder,
    answerValue,
    aPickedFolder,
    aPickedImportFile,
    aProject,
    aSnapshot,
    HINTED_COMMIT,
    NOW,
    pickAndCreate,
    pickFolder,
    pickImportFile,
    TOOL_FAILURE
} from "./fakeBridge/fakeBridgeTestData.mocks"

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

    it("should follow the title bar setting and the maximize button in its window state", async () => {
        // Arrange
        const bridge = createFakeDesktopBridge({ windowState: { usesAppTitleBar: true } })
        const announced: unknown[] = []
        bridge.subscribe("shell.windowState", state => announced.push(state.isMaximized))

        // Act
        await bridge.setUseAppTitleBar(false)
        await bridge.controlWindow("toggleMaximize")
        const state = await bridge.windowState()

        // Assert
        expect(state).toEqual({
            ok: true,
            value: expect.objectContaining({ usesAppTitleBar: true, savedUseAppTitleBar: false, isMaximized: true })
        })
        expect(announced).toEqual([true])
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
        const rebuild = new Function(`return ${fakeDesktopBridgeSource(seed)}`)
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
        const bridge = new Function(`return ${fakeDesktopBridgeSource(seed)}`)() as FakeDesktopBridge
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
})
