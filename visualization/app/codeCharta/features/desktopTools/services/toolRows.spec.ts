import { aToolsReport } from "../desktopTools.mocks"
import { describeCoreState, summarize, toToolRows } from "./toolRows"

describe("toolRows", () => {
    describe("toToolRows", () => {
        it("should list the tools in a fixed order with names and purposes", () => {
            // Arrange
            const report = aToolsReport()
            report.tools.reverse()

            // Act
            const rows = toToolRows(report)

            // Assert
            expect(rows.map(row => [row.name, row.purpose])).toEqual([
                ["Git", "history, branches, analyses of commits"],
                ["ccsh", "runs the analyses"],
                ["Java", "runs ccsh"],
                ["GitHub CLI", "lists pull requests (optional)"],
                ["GitLab CLI", "lists merge requests (optional)"]
            ])
        })

        it.each([
            [{ state: "ok" }, true, "found", "success"],
            [{ state: "missing" }, true, "missing", "error"],
            [{ state: "tooOld" }, true, "too old", "error"],
            [{ state: "failed" }, true, "not working", "error"],
            [{ state: "missing" }, false, "not installed", "ghost"],
            [{ state: "failed" }, false, "not working", "warning"],
            [{ state: "tooOld" }, false, "too old", "warning"]
        ] as const)("should show %o of a tool required %s as %s", (change, isRequired, text, tone) => {
            // Arrange
            const report = aToolsReport({ git: { ...change, isRequired } })

            // Act
            const [gitRow] = toToolRows(report)

            // Assert
            expect(gitRow.badge).toEqual({ text, tone })
        })

        it("should explain each problem after the purpose", () => {
            // Arrange
            const report = aToolsReport({
                git: { state: "missing", path: null, version: null },
                ccsh: { state: "failed", problem: "exit 1\nmore detail" }
            })

            // Act
            const [git, ccsh, java, gh] = toToolRows(report)

            // Assert
            expect(git.problem).toBe("not found on PATH or in the usual folders. Install it, or choose the executable.")
            expect(ccsh.problem).toBe("found, but it did not report a version: exit 1")
            expect(java.problem).toBe("version 21.0.2 is older than 22.")
            expect(gh.problem).toBeNull()
        })

        it("should name the custom path when its file is missing", () => {
            // Arrange
            const report = aToolsReport({
                git: { state: "missing", path: "/opt/tools/git", source: "custom", version: null }
            })

            // Act
            const [git] = toToolRows(report)

            // Assert
            expect(git.problem).toBe("Custom path not found: /opt/tools/git")
        })

        it("should write a dash for an unknown version and mark a custom path", () => {
            // Arrange
            const report = aToolsReport()

            // Act
            const [git, ccsh, , , glab] = toToolRows(report)

            // Assert
            expect(glab.version).toBe("—")
            expect(git.isCustom).toBe(false)
            expect(ccsh.isCustom).toBe(true)
        })
    })

    describe("summarize", () => {
        it("should say that everything is available", () => {
            // Arrange
            const report = aToolsReport({ java: { state: "ok" } })

            // Act
            const summary = summarize(report)

            // Assert
            expect(summary).toEqual({ text: "Analyses and git history are available.", tone: "success" })
        })

        it("should name what analyses still need", () => {
            // Arrange
            const report = aToolsReport({ ccsh: { state: "missing" } })

            // Act
            const summary = summarize(report)

            // Assert
            expect(summary).toEqual({ text: "Git history is available; analyses need ccsh and Java.", tone: "warning" })
        })

        it("should name every missing tool when git is missing too", () => {
            // Arrange
            const report = aToolsReport({ git: { state: "missing" }, ccsh: { state: "failed" } })

            // Act
            const summary = summarize(report)

            // Assert
            expect(summary).toEqual({ text: "Git history and analyses need Git, ccsh and Java.", tone: "error" })
        })
    })

    describe("describeCoreState", () => {
        it("should say nothing while the core is ready", () => {
            // Act
            const notice = describeCoreState({ state: "ready", message: null })

            // Assert
            expect(notice).toBeNull()
        })

        it.each([
            ["starting", "Starting the CodeCharta core…", "info", false],
            ["restarting", "Restarting the CodeCharta core…", "info", false],
            ["unavailable", "The CodeCharta core is not running. Projects, git and analyses are paused until it is back.", "error", true],
            ["stopped", "The CodeCharta core is not running. Projects, git and analyses are paused until it is back.", "error", true]
        ] as const)("should describe the %s core", (state, text, tone, canRestart) => {
            // Act
            const notice = describeCoreState({ state, message: null })

            // Assert
            expect(notice).toEqual({ text, tone, canRestart })
        })
    })
})
