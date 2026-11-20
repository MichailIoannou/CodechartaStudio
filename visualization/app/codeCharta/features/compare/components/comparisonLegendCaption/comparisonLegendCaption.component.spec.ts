import { TestBed } from "@angular/core/testing"
import { Store, StoreModule } from "@ngrx/store"
import { render, screen } from "@testing-library/angular"
import { TEST_FILE_DATA, TEST_FILE_DATA_JAVA } from "../../../../mocks/dataMocks"
import { addFile, setDelta } from "../../../../stores/fileStore/store/files.actions"
import { appReducers, setStateMiddleware } from "../../../../stores/rootStore/store"
import { aCommitSnapshot, aComparedCommit, BASE_SHA, HEAD_SHA } from "../../ports/compareGateways.mocks"
import { CompareStore } from "../../stores/compare.store"
import { ComparisonLegendCaptionComponent } from "./comparisonLegendCaption.component"

describe("ComparisonLegendCaptionComponent", () => {
    async function renderCaption() {
        await render(ComparisonLegendCaptionComponent, {
            imports: [StoreModule.forRoot(appReducers, { metaReducers: [setStateMiddleware] })]
        })
        const store = TestBed.inject(Store)
        store.dispatch(addFile({ file: TEST_FILE_DATA }))
        store.dispatch(addFile({ file: TEST_FILE_DATA_JAVA }))
        store.dispatch(setDelta({ referenceFile: TEST_FILE_DATA, comparisonFile: TEST_FILE_DATA_JAVA }))
    }

    it("should say head minus base during a project comparison", async () => {
        // Arrange
        await renderCaption()

        // Act
        TestBed.inject(CompareStore).set({
            phase: "active",
            resolved: null,
            base: {
                requested: aComparedCommit(BASE_SHA),
                snapshot: aCommitSnapshot(BASE_SHA),
                relation: null,
                staleBy: 0,
                behind: 0,
                ahead: 0,
                checksum: TEST_FILE_DATA.fileMeta.fileChecksum
            },
            head: {
                requested: aComparedCommit(HEAD_SHA),
                snapshot: aCommitSnapshot(HEAD_SHA),
                relation: null,
                staleBy: 0,
                behind: 0,
                ahead: 0,
                checksum: TEST_FILE_DATA_JAVA.fileMeta.fileChecksum
            },
            error: null,
            analyses: [],
            changedFiles: null
        })

        // Assert
        const caption = await screen.findByTestId("comparison-legend-caption")
        expect(caption.textContent?.replace(/\s+/g, " ")).toBe("Δ = head a1b2c3d − base 9f8e7d6")
    })

    it("should say nothing in the delta of uploaded maps", async () => {
        // Act
        await renderCaption()

        // Assert
        expect(screen.queryByTestId("comparison-legend-caption")).toBeNull()
    })
})
