import { DIFF_LINE_CLASSES, diffLinesOf } from "./diffLines"

describe("diffLines", () => {
    it("should colour added, removed, hunk and header lines and number them from the hunk header", () => {
        // Arrange
        const text = [
            "diff --git a/src/app.ts b/src/app.ts",
            "index 1111111..2222222 100644",
            "--- a/src/app.ts",
            "+++ b/src/app.ts",
            "@@ -10,3 +10,3 @@ export function app() {",
            " const a = 1",
            "-const b = 2",
            "+const b = 3",
            " const c = 4",
            ""
        ].join("\n")

        // Act
        const lines = diffLinesOf(text)

        // Assert
        expect(lines.map(line => [line.kind, line.oldNumber, line.newNumber])).toEqual([
            ["header", null, null],
            ["header", null, null],
            ["header", null, null],
            ["header", null, null],
            ["hunk", null, null],
            ["context", 10, 10],
            ["removed", 11, null],
            ["added", null, 11],
            ["context", 12, 12]
        ])
        expect(lines[6].text).toBe("-const b = 2")
        expect(DIFF_LINE_CLASSES.added).toBe("bg-success/10 text-success")
        expect(DIFF_LINE_CLASSES.removed).toBe("bg-error/10 text-error")
        expect(DIFF_LINE_CLASSES.hunk).toBe("text-info")
        expect(DIFF_LINE_CLASSES.header).toBe("text-base-content/60")
    })

    it("should keep a removed line that looks like a file header inside a hunk", () => {
        // Arrange
        const text = "@@ -1,2 +1 @@\n--- not a header\n keep"

        // Act
        const lines = diffLinesOf(text)

        // Assert
        expect(lines.map(line => line.kind)).toEqual(["hunk", "removed", "context"])
    })

    it("should mark git's no-newline note and start over at the next file header", () => {
        // Arrange
        const text = ["@@ -1 +1 @@", "-a", "+b", "\\ No newline at end of file", "diff --git a/x b/x", "--- a/x"].join("\n")

        // Act
        const lines = diffLinesOf(text)

        // Assert
        expect(lines.map(line => line.kind)).toEqual(["hunk", "removed", "added", "note", "header", "header"])
    })

    it("should read a conflicted file's combined diff with two prefix columns and no old line numbers", () => {
        // Arrange
        const text = [
            "diff --cc src/invoice.ts",
            "@@@ -1,2 -1,2 +1,4 @@@",
            "++<<<<<<< HEAD",
            " +ours",
            "+ theirs",
            "- gone",
            "  same"
        ].join("\n")

        // Act
        const lines = diffLinesOf(text)

        // Assert
        expect(lines.map(line => [line.kind, line.oldNumber, line.newNumber])).toEqual([
            ["header", null, null],
            ["hunk", null, null],
            ["added", null, 1],
            ["added", null, 2],
            ["added", null, 3],
            ["removed", null, null],
            ["context", null, 4]
        ])
    })

    it("should give no lines for an empty diff", () => {
        // Act
        const lines = diffLinesOf("")

        // Assert
        expect(lines).toEqual([])
    })
})
