import { commitListCommandOf, rowIndexAfter } from "./commitListKeys"

function keyOf(key: string, modifiers: Partial<Pick<KeyboardEvent, "ctrlKey" | "metaKey" | "shiftKey" | "altKey">> = {}) {
    return new KeyboardEvent("keydown", { key, ...modifiers })
}

describe("commitListKeys", () => {
    describe("commitListCommandOf", () => {
        it("should move with the arrow, Home, End and page keys", () => {
            // Arrange
            const keys = ["ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"]

            // Act
            const commands = keys.map(key => commitListCommandOf(keyOf(key)))

            // Assert
            expect(commands.map(command => (command?.kind === "move" ? command.target : null))).toEqual([
                "previous",
                "next",
                "first",
                "last",
                "pageUp",
                "pageDown"
            ])
        })

        it("should extend the selection only with Shift and an arrow", () => {
            // Arrange & Act
            const shiftDown = commitListCommandOf(keyOf("ArrowDown", { shiftKey: true }))
            const shiftEnd = commitListCommandOf(keyOf("End", { shiftKey: true }))

            // Assert
            expect(shiftDown).toEqual({ kind: "move", target: "next", isExtending: true })
            expect(shiftEnd).toEqual({ kind: "move", target: "last", isExtending: false })
        })

        it("should copy with Ctrl+C or Cmd+C and focus the search with Ctrl+F or slash", () => {
            // Arrange & Act
            const commands = [
                commitListCommandOf(keyOf("c", { ctrlKey: true })),
                commitListCommandOf(keyOf("C", { metaKey: true })),
                commitListCommandOf(keyOf("f", { ctrlKey: true })),
                commitListCommandOf(keyOf("/"))
            ]

            // Assert
            expect(commands.map(command => command?.kind)).toEqual(["copySha", "copySha", "focusSearch", "focusSearch"])
        })

        it("should open the menu with the Menu key or Shift+F10", () => {
            // Arrange & Act
            const menuKey = commitListCommandOf(keyOf("ContextMenu"))
            const shiftF10 = commitListCommandOf(keyOf("F10", { shiftKey: true }))
            const plainF10 = commitListCommandOf(keyOf("F10"))

            // Assert
            expect(menuKey).toEqual({ kind: "openMenu" })
            expect(shiftF10).toEqual({ kind: "openMenu" })
            expect(plainF10).toBeNull()
        })

        it("should run the primary action on Enter and drop the second selection on Escape", () => {
            // Arrange & Act
            const enter = commitListCommandOf(keyOf("Enter"))
            const escapeKey = commitListCommandOf(keyOf("Escape"))
            const shiftEnter = commitListCommandOf(keyOf("Enter", { shiftKey: true }))

            // Assert
            expect(enter).toEqual({ kind: "runPrimary" })
            expect(escapeKey).toEqual({ kind: "dropSecond" })
            expect(shiftEnter).toBeNull()
        })

        it("should leave other keys, F5 and modified arrows alone", () => {
            // Arrange & Act
            const commands = [
                commitListCommandOf(keyOf("F5")),
                commitListCommandOf(keyOf("a")),
                commitListCommandOf(keyOf("ArrowDown", { ctrlKey: true })),
                commitListCommandOf(keyOf("ArrowDown", { altKey: true })),
                commitListCommandOf(keyOf("x", { ctrlKey: true }))
            ]

            // Assert
            expect(commands).toEqual([null, null, null, null, null])
        })
    })

    describe("rowIndexAfter", () => {
        it("should step, jump and page within the rows", () => {
            // Arrange & Act
            const indices = [
                rowIndexAfter("previous", 5, 20, 8),
                rowIndexAfter("next", 5, 20, 8),
                rowIndexAfter("first", 5, 20, 8),
                rowIndexAfter("last", 5, 20, 8),
                rowIndexAfter("pageUp", 10, 20, 8),
                rowIndexAfter("pageDown", 10, 20, 8)
            ]

            // Assert
            expect(indices).toEqual([4, 6, 0, 19, 2, 18])
        })

        it("should stay inside the list at both ends", () => {
            // Arrange & Act
            const atTop = rowIndexAfter("pageUp", 3, 20, 8)
            const atBottom = rowIndexAfter("next", 19, 20, 8)

            // Assert
            expect(atTop).toBe(0)
            expect(atBottom).toBe(19)
        })

        it("should start at the first row while nothing is focused, or at the last for End", () => {
            // Arrange & Act
            const down = rowIndexAfter("next", null, 20, 8)
            const end = rowIndexAfter("last", null, 20, 8)

            // Assert
            expect(down).toBe(0)
            expect(end).toBe(19)
        })
    })
})
