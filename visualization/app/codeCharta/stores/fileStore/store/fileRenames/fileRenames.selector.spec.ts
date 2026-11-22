import { CcState } from "../../../../model/codeCharta.model"
import { FileSelectionState, FileState } from "../../../../model/files/files"
import { renamesOfTheDeltaSelector } from "./fileRenames.selector"

const renames = [{ from: "/root/old.ts", to: "/root/new.ts" }]

function stateWith(selections: FileSelectionState[]): CcState {
    const files = selections.map((selectedAs, index) => ({ selectedAs, file: { fileMeta: { fileName: `file${index}` } } }) as FileState)
    return { files, fileRenames: renames } as CcState
}

describe("renamesOfTheDeltaSelector", () => {
    it("should give the renames while two maps are compared", () => {
        // Arrange
        const state = stateWith([FileSelectionState.Reference, FileSelectionState.Comparison])

        // Act
        const result = renamesOfTheDeltaSelector(state)

        // Assert
        expect(result).toBe(renames)
    })

    it("should give no renames while no maps are compared", () => {
        // Arrange
        const state = stateWith([FileSelectionState.Partial])

        // Act
        const result = renamesOfTheDeltaSelector(state)

        // Assert
        expect(result).toEqual([])
    })

    it("should give the same empty list each time no maps are compared, so a selector reading it does not recompute", () => {
        // Arrange
        const firstState = stateWith([FileSelectionState.Partial])
        const secondState = { ...stateWith([FileSelectionState.Partial, FileSelectionState.None]), fileRenames: [] }

        // Act
        const first = renamesOfTheDeltaSelector(firstState)
        const second = renamesOfTheDeltaSelector(secondState)

        // Assert
        expect(second).toBe(first)
    })
})
