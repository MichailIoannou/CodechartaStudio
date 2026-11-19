import { render, screen } from "@testing-library/angular"
import type { PreflightProblem } from "../../../../model/coreApi/PreflightProblem"
import { LONG_PATHS_COMMAND, PreflightProblemsComponent } from "./preflightProblems.component"

const JAVA_MISSING: PreflightProblem = {
    code: "JAVA_NOT_FOUND",
    severity: "error",
    message: "Java was not found.",
    hint: "Install Java 22 or newer."
}
const WORKTREE: PreflightProblem = { code: "WORKTREE_FAILED", severity: "error", message: "The worktree could not be created.", hint: null }
const NOT_ROOT: PreflightProblem = {
    code: "NOT_REPO_ROOT",
    severity: "warning",
    message: "'billing-api' is not the root of its repository; git history metrics are skipped.",
    hint: null
}

describe("PreflightProblemsComponent", () => {
    it("should show preflight problems with hints", async () => {
        // Arrange & Act
        await render(PreflightProblemsComponent, { inputs: { problems: [JAVA_MISSING, WORKTREE, NOT_ROOT] } })

        // Assert
        const alert = screen.getByTestId("preflight-problems")
        expect(alert.classList).toContain("alert-error")
        expect(alert.textContent).toContain("The analysis cannot start:")
        expect(screen.getByTestId("preflight-problem-JAVA_NOT_FOUND").textContent).toContain("Install Java 22 or newer.")
        expect(screen.getByTestId("preflight-problem-WORKTREE_FAILED").textContent).toContain(LONG_PATHS_COMMAND)
        expect(screen.getByTestId("preflight-problem-NOT_REPO_ROOT").textContent).toContain("(warning)")
    })

    it("should warn when every problem is only a warning", async () => {
        // Arrange & Act
        await render(PreflightProblemsComponent, { inputs: { problems: [NOT_ROOT] } })

        // Assert
        expect(screen.getByTestId("preflight-problems").classList).toContain("alert-warning")
    })
})
