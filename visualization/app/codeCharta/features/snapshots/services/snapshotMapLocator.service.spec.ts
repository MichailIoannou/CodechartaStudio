import { signal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import type { FolderRef } from "../../../model/coreApi/FolderRef"
import type { GitRepositoryInfo } from "../../../model/coreApi/GitRepositoryInfo"
import type { SnapshotSummary } from "../../../model/coreApi/SnapshotSummary"
import { GitRepositoryService } from "../../gitHistory/facade"
import { ProjectsFacade } from "../../projects/facade"
import { aSnapshot } from "../../projects/projects.mocks"
import { LoadedMapReadStore } from "../stores/loadedMap.read.store"
import { SnapshotMapLocator } from "./snapshotMapLocator.service"

const API: FolderRef = { projectId: "p-billing", folderId: "f-api" }
const WEB: FolderRef = { projectId: "p-billing", folderId: "f-web" }

type InfoState = { kind: "ready"; value: Pick<GitRepositoryInfo, "folderPrefix"> } | { kind: "loading" }

describe("SnapshotMapLocator", () => {
    const shownSnapshot = signal<SnapshotSummary | null>(null)
    const activeRepository = signal<FolderRef | null>(API)
    const repository = signal<InfoState>({ kind: "ready", value: { folderPrefix: "" } })
    const pathToNode = signal<Map<string, unknown> | undefined>(new Map())

    function locatorWith({
        shown,
        folderPrefix = "",
        nodePaths = []
    }: {
        shown: SnapshotSummary | null
        folderPrefix?: string
        nodePaths?: string[]
    }) {
        shownSnapshot.set(shown)
        activeRepository.set(API)
        repository.set({ kind: "ready", value: { folderPrefix } })
        pathToNode.set(new Map(nodePaths.map(path => [path, {}])))
        TestBed.configureTestingModule({
            providers: [
                { provide: ProjectsFacade, useValue: { shownSnapshot } },
                { provide: GitRepositoryService, useValue: { activeRepository, repository } },
                { provide: LoadedMapReadStore, useValue: { pathToNode } }
            ]
        })
        return TestBed.inject(SnapshotMapLocator)
    }

    it("should resolve a repository-relative path to a node path and return null when no snapshot of the repository is loaded", () => {
        // Arrange
        const locator = locatorWith({ shown: aSnapshot("p-billing", "f-api", "s-1"), nodePaths: ["/root/src/invoice.ts"] })

        // Act
        const found = locator.nodePathOf(API, "src/invoice.ts")
        shownSnapshot.set(aSnapshot("p-billing", "f-web", "s-2"))
        const otherFolderShown = locator.nodePathOf(API, "src/invoice.ts")
        shownSnapshot.set(null)
        const nothingShown = locator.nodePathOf(API, "src/invoice.ts")

        // Assert
        expect(found).toBe("/root/src/invoice.ts")
        expect(otherFolderShown).toBeNull()
        expect(nothingShown).toBeNull()
    })

    it("should return null for a file the map has no node for", () => {
        // Arrange
        const locator = locatorWith({ shown: aSnapshot("p-billing", "f-api", "s-1"), nodePaths: ["/root/src/invoice.ts"] })

        // Act
        const missing = locator.nodePathOf(API, "src/deleted.ts")

        // Assert
        expect(missing).toBeNull()
    })

    it("should drop the folder's prefix for a folder inside its repository and refuse paths outside it", () => {
        // Arrange
        const locator = locatorWith({
            shown: aSnapshot("p-billing", "f-api", "s-1"),
            folderPrefix: "services/api",
            nodePaths: ["/root/src/invoice.ts"]
        })

        // Act
        const inside = locator.nodePathOf(API, "services/api/src/invoice.ts")
        const outside = locator.nodePathOf(API, "services/web/src/invoice.ts")

        // Assert
        expect(inside).toBe("/root/src/invoice.ts")
        expect(outside).toBeNull()
    })

    it("should return null while the repository of another folder is active or its place is not known", () => {
        // Arrange
        const locator = locatorWith({ shown: aSnapshot("p-billing", "f-api", "s-1"), nodePaths: ["/root/src/invoice.ts"] })

        // Act
        repository.set({ kind: "loading" })
        const unknownPlace = locator.nodePathOf(API, "src/invoice.ts")
        repository.set({ kind: "ready", value: { folderPrefix: "" } })
        activeRepository.set(WEB)
        const otherActive = locator.nodePathOf(API, "src/invoice.ts")

        // Assert
        expect(unknownPlace).toBeNull()
        expect(otherActive).toBeNull()
    })
})
