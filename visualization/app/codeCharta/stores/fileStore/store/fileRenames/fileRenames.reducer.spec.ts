import { setFileRenames } from "./fileRenames.actions"
import { defaultFileRenames, fileRenames } from "./fileRenames.reducer"

describe("fileRenames", () => {
    it("should set the renames", () => {
        // Arrange
        const renames = [{ from: "/root/old.ts", to: "/root/new.ts" }]

        // Act
        const result = fileRenames(defaultFileRenames, setFileRenames({ value: renames }))

        // Assert
        expect(result).toEqual(renames)
    })

    it("should start without renames", () => {
        // Arrange
        const initialAction = { type: "@ngrx/store/init" }

        // Act
        const result = fileRenames(undefined, initialAction)

        // Assert
        expect(result).toEqual([])
    })
})
