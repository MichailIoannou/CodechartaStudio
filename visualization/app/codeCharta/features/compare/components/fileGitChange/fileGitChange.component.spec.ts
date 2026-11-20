import { TestBed } from "@angular/core/testing"
import { Store, StoreModule } from "@ngrx/store"
import { render, screen } from "@testing-library/angular"
import { TEST_FILE_DATA, TEST_FILE_DATA_JAVA } from "../../../../mocks/dataMocks"
import { addFile, setDelta } from "../../../../stores/fileStore/store/files.actions"
import { appReducers, setStateMiddleware } from "../../../../stores/rootStore/store"
import { setSelectedNodePath } from "../../../../stores/sharedView/sharedView.write.facade"
import type { ChangedFilesState, LoadedSide } from "../../model/compare.model"
import { aCommitSnapshot, aComparedCommit, BASE_SHA, HEAD_SHA } from "../../ports/compareGateways.mocks"
import { CompareStore } from "../../stores/compare.store"
import { FileGitChangeComponent } from "./fileGitChange.component"

function aSide(sha: string, checksum: string): LoadedSide {
    return { requested: aComparedCommit(sha), snapshot: aCommitSnapshot(sha), relation: null, staleBy: 0, behind: 0, ahead: 0, checksum }
}

const GIT_LIST: ChangedFilesState = {
    source: "git",
    files: [
        { change: "renamed", path: "big/MyClass.ts", previousPath: "old/MyClass.ts" },
        { change: "modified", path: "small/SmallClass.ts", previousPath: null }
    ]
}

const wordsOf = (element: HTMLElement) =>
    Array.from(element.children)
        .map(child => child.textContent?.trim())
        .join(" ")

describe("FileGitChangeComponent", () => {
    async function renderWith(changedFiles: ChangedFilesState, selectedPath: string) {
        await render(FileGitChangeComponent, {
            imports: [StoreModule.forRoot(appReducers, { metaReducers: [setStateMiddleware] })]
        })
        const store = TestBed.inject(Store)
        store.dispatch(addFile({ file: TEST_FILE_DATA }))
        store.dispatch(addFile({ file: TEST_FILE_DATA_JAVA }))
        store.dispatch(setDelta({ referenceFile: TEST_FILE_DATA, comparisonFile: TEST_FILE_DATA_JAVA }))
        store.dispatch(setSelectedNodePath({ value: selectedPath }))
        TestBed.inject(CompareStore).set({
            phase: "active",
            resolved: null,
            base: aSide(BASE_SHA, TEST_FILE_DATA.fileMeta.fileChecksum),
            head: aSide(HEAD_SHA, TEST_FILE_DATA_JAVA.fileMeta.fileChecksum),
            error: null,
            analyses: [],
            changedFiles,
            changeRequest: null
        })
        TestBed.tick()
    }

    it("should say where a renamed file came from", async () => {
        // Act
        await renderWith(GIT_LIST, "/root/big/MyClass.ts")

        // Assert
        expect(wordsOf(screen.getByTestId("inspector-git-change"))).toBe("renamed from old/MyClass.ts")
    })

    it("should name the change of a modified file", async () => {
        // Act
        await renderWith(GIT_LIST, "/root/small/SmallClass.ts")

        // Assert
        expect(wordsOf(screen.getByTestId("inspector-git-change"))).toBe("modified in git")
    })

    it("should say nothing for a file git did not change or without a git list", async () => {
        // Act
        await renderWith({ source: "unavailable", files: [] }, "/root/big/MyClass.ts")

        // Assert
        expect(screen.queryByTestId("inspector-git-change")).toBeNull()
    })
})
